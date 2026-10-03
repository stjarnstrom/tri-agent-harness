// contract-prep.mjs — one adversarial look at a sprint contract before code.
//
// The Generator writes the contract. A different context reviews it. This
// module only decides which of those is next; it does not review anything.
// Disk is the success signal (acceptance criteria, then a fresh review file).
// Dispatch counters bound a missing file to one attempt so a silent reviewer
// cannot stall the sprint.

import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { readOrchestratorState } from "./state-store.mjs";

export const CONTRACT_PREP_ACTIONS = new Set(["write-contract", "review", "implement"]);

export function contractPath(sprint) {
  return path.join("docs", `sprint-${sprint}-contract.md`);
}

export function contractReviewPath(sprint) {
  return path.join("docs", `sprint-${sprint}-contract-review.md`);
}

function sectionBody(markdown, heading) {
  if (!markdown) {
    return null;
  }
  const lines = markdown.split(/\r?\n/);
  const wanted = heading.toLowerCase();
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().toLowerCase() === wanted) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) {
    return null;
  }
  const body = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      break;
    }
    body.push(lines[index]);
  }
  return body.join("\n");
}

export function contractHasAcceptanceCriteria(markdown) {
  const body = sectionBody(markdown, "## acceptance criteria");
  if (body == null) {
    return false;
  }
  return /^\s*-\s+\[[ xX]\]/m.test(body);
}

export function stripSelfEvaluation(markdown) {
  if (!markdown || !markdown.trim()) {
    return "(no sprint contract on disk)";
  }
  const lines = markdown.split(/\r?\n/);
  const cut = lines.findIndex((line) =>
    /^##\s+(generator self-evaluation|claim)\s*$/i.test(line.trim()),
  );
  const kept = (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
  return kept.length ? kept : "(sprint contract is empty)";
}

export function reviewIsFresh({ reviewText, reviewMtimeMs, contractMtimeMs }) {
  if (!reviewText || reviewMtimeMs == null || contractMtimeMs == null) {
    return false;
  }
  if (reviewMtimeMs < contractMtimeMs) {
    return false;
  }
  if (!/^Stop:\s*reviewed\s*$/m.test(reviewText)) {
    return false;
  }
  return /^Cross-model:\s*skipped \(autonomous\)\s*$/m.test(reviewText);
}

/**
 * @returns {"write-contract" | "review" | "implement"}
 */
export function decideContractPrep({
  qaRetry = false,
  contractText = "",
  reviewText = "",
  contractMtimeMs = null,
  reviewMtimeMs = null,
  draftDispatches = 0,
  reviewDispatches = 0,
}) {
  if (qaRetry) {
    return "implement";
  }

  const criteria = contractHasAcceptanceCriteria(contractText);
  const fresh = reviewIsFresh({ reviewText, reviewMtimeMs, contractMtimeMs });

  if (!criteria && draftDispatches < 1) {
    return "write-contract";
  }
  if (!fresh && reviewDispatches < 1) {
    return "review";
  }
  return "implement";
}

async function readText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function mtimeMs(filePath) {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function prepCounts(state, sprint) {
  const entry = state?.contractPrep?.[String(sprint)] ?? {};
  return {
    draftDispatches: Number.isInteger(entry.draftDispatches) ? entry.draftDispatches : 0,
    reviewDispatches: Number.isInteger(entry.reviewDispatches) ? entry.reviewDispatches : 0,
  };
}

async function qaRetryFor(sprint) {
  const qaReport = await readText(path.join("docs", `qa-report-sprint-${sprint}.md`));
  if (qaReport.trim()) {
    return true;
  }
  const gate = await readText(path.join("docs", `mechanical-checks-sprint-${sprint}.md`));
  return /Result[^a-z0-9]*FAIL/i.test(gate);
}

export async function loadContractPrep(sprint, { state } = {}) {
  const resolved = state === undefined ? await readOrchestratorState() : state;
  const contractFile = contractPath(sprint);
  const reviewFile = contractReviewPath(sprint);
  const counts = prepCounts(resolved, sprint);

  return {
    sprint,
    contractFile,
    reviewFile,
    contractText: await readText(contractFile),
    reviewText: await readText(reviewFile),
    contractMtimeMs: await mtimeMs(contractFile),
    reviewMtimeMs: await mtimeMs(reviewFile),
    qaRetry: await qaRetryFor(sprint),
    ...counts,
  };
}

export async function contractPrepAction(sprint, options) {
  const loaded = await loadContractPrep(sprint, options);
  return decideContractPrep(loaded);
}
