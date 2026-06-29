import { readFile } from "node:fs/promises";
import path from "node:path";

export const SPRINT_STATUS_FILE = path.join("docs", "sprint-status.md");

const TERMINAL_PASS = "Pass";
const GENERATOR_STATUSES = new Set(["Not started", "In progress", "Fail"]);
const EVALUATOR_STATUS = "Ready for QA";

function parseStatusFromRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) {
    return null;
  }

  const cells = trimmed
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell, idx, arr) => !(idx === 0 || idx === arr.length - 1));

  if (cells.length < 4) {
    return null;
  }

  const sprintNum = Number.parseInt(cells[0], 10);
  if (!Number.isInteger(sprintNum)) {
    return null;
  }

  const status = cells[2];
  if (!status) {
    return null;
  }

  return { sprint: sprintNum, status };
}

export async function readSprintRows(filePath = SPRINT_STATUS_FILE) {
  const raw = await readFile(filePath, "utf8");
  const rows = [];

  for (const line of raw.split("\n")) {
    const parsed = parseStatusFromRow(line);
    if (parsed) {
      rows.push(parsed);
    }
  }

  return rows.sort((a, b) => a.sprint - b.sprint);
}

export function computeNextActionFromRows(rows) {
  if (!rows.length) {
    return {
      action: "run-planner",
      reason: "No sprint rows found in sprint-status.",
    };
  }

  for (const row of rows) {
    if (row.status === TERMINAL_PASS) {
      continue;
    }

    if (GENERATOR_STATUSES.has(row.status)) {
      return {
        action: "run-generator",
        sprint: row.sprint,
        reason: `Sprint ${row.sprint} is '${row.status}'.`,
      };
    }

    if (row.status === EVALUATOR_STATUS) {
      return {
        action: "run-evaluator",
        sprint: row.sprint,
        reason: `Sprint ${row.sprint} is ready for QA.`,
      };
    }

    return {
      action: "manual-review",
      sprint: row.sprint,
      reason: `Sprint ${row.sprint} has unknown status '${row.status}'.`,
    };
  }

  return {
    action: "done",
    reason: "All sprints are in Pass state.",
  };
}
