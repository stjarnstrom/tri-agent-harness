// cycle-state.mjs — shared reads for the chat-driven build cycle.
//
// Primitives used by both next-step.mjs (which decides the next step) and
// cycle-record.mjs (which records a finished phase): where artifacts live,
// whether the pre-QA gate's verdict is still trustworthy, which round a sprint
// is on, and whether the Retrospector still owes this run a pass.

import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileExists } from "./fs-utils.mjs";
import { readSprintRows, SPRINT_STATUS_FILE } from "./sprint-status.mjs";
import { resolveQaRound } from "./state-store.mjs";

export const CYCLE_SOURCE = "harness-cycle-skill";
export const DOCS_DIR = "docs";

export function contractPath(sprint) {
  return path.join(DOCS_DIR, `sprint-${sprint}-contract.md`);
}

export function qaReportPath(sprint) {
  return path.join(DOCS_DIR, `qa-report-sprint-${sprint}.md`);
}

export function mechanicalReportPath(sprint) {
  return path.join(DOCS_DIR, `mechanical-checks-sprint-${sprint}.md`);
}

async function mtimeMs(filePath) {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch {
    return null;
  }
}

export async function existingFiles(candidates) {
  const present = [];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      present.push(candidate);
    }
  }
  return present;
}

/**
 * Read the pre-QA gate's verdict for a sprint, and decide whether it still
 * describes the current working tree.
 *
 * Staleness matters more than the verdict: a PASS left over from round 1 must
 * not wave round 2's generator output straight through to the Evaluator. The
 * generator always touches the sprint contract (self-evaluation) and
 * sprint-status.md (Ready for QA), so a report older than either was written
 * before the code it claims to have checked.
 */
export async function readGateState(sprint, { docsDir = DOCS_DIR } = {}) {
  const report = path.join(docsDir, `mechanical-checks-sprint-${sprint}.md`);
  const reportMtime = await mtimeMs(report);

  if (reportMtime === null) {
    return { report, present: false, fresh: false, result: null };
  }

  const raw = await readFile(report, "utf8");
  let result = null;
  if (/Result[^a-z0-9]*PASS/i.test(raw)) {
    result = "pass";
  } else if (/Result[^a-z0-9]*FAIL/i.test(raw)) {
    result = "fail";
  }

  const statusMtime = await mtimeMs(path.join(docsDir, "sprint-status.md"));
  const contractMtime = await mtimeMs(path.join(docsDir, `sprint-${sprint}-contract.md`));
  const newestGeneratorOutput = Math.max(statusMtime ?? 0, contractMtime ?? 0);

  return {
    report,
    present: true,
    fresh: reportMtime >= newestGeneratorOutput,
    result,
  };
}

export function recordedAttempts(state, sprint) {
  const value = state?.cycleAttempts?.[String(sprint)];
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * Which attempt number the *next* generator dispatch would be.
 *
 * A round is one generator dispatch, matching the shell loop where a pre-QA
 * gate failure consumes a round just as a QA failure does. `cycleAttempts` is
 * the chat orchestrator's own counter; resolveQaRound() derives a round from
 * the canonical docs, and taking the max means a dropped record call can never
 * silently hand the sprint extra rounds.
 */
export async function nextAttemptNumber({ state, handoff, sprint }) {
  const rows = await readSprintRows(SPRINT_STATUS_FILE).catch(() => []);
  const sprintStatus = rows.find((row) => row.sprint === sprint)?.status ?? null;
  const qaReportExists = await fileExists(qaReportPath(sprint));

  const derived = resolveQaRound({
    state,
    handoff,
    sprint,
    action: "run-generator",
    sprintStatus,
    qaReportExists,
  });

  return Math.max(recordedAttempts(state, sprint) + 1, derived);
}

async function qaReportFiles(docsDir = DOCS_DIR) {
  let entries;
  try {
    entries = await readdir(docsDir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => /^qa-report-sprint-\d+\.md$/.test(name))
    .map((name) => path.join(docsDir, name));
}

/** Newest mtime among QA reports, or null when none exist. */
export async function newestQaReportMtimeMs(docsDir = DOCS_DIR) {
  const reports = await qaReportFiles(docsDir);
  let max = null;
  for (const report of reports) {
    const mtime = await mtimeMs(report);
    if (mtime !== null && (max === null || mtime > max)) {
      max = mtime;
    }
  }
  return max;
}

export async function listQaReportPaths(docsDir = DOCS_DIR) {
  return qaReportFiles(docsDir);
}

/**
 * Has the Retrospector already learned from the newest QA report?
 *
 * Comparing against report mtimes (rather than a "did retro run" boolean)
 * keeps the step idempotent across runs: a second cycle over new sprints
 * re-triggers retro, a re-invocation over unchanged reports does not.
 */
export async function retroIsPending(state, docsDir = DOCS_DIR) {
  const reports = await qaReportFiles(docsDir);
  if (!reports.length) {
    return false;
  }

  const processed = state?.retro?.processedReports;
  if (!Array.isArray(processed) || processed.length === 0) {
    return true;
  }

  const processedSet = new Set(processed);
  for (const report of reports) {
    if (!processedSet.has(report)) {
      return true;
    }
  }

  const completedAt = state?.retro?.completedAt;
  if (!completedAt) {
    return true;
  }

  const completedMs = Date.parse(completedAt);
  if (!Number.isFinite(completedMs)) {
    return true;
  }

  for (const report of reports) {
    const reportMtime = await mtimeMs(report);
    if (reportMtime !== null && Math.floor(reportMtime) > completedMs) {
      return true;
    }
  }

  return false;
}
