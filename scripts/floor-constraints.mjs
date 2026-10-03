// floor-constraints.mjs — threshold comparison and sprint-contract evidence.
// Split from floor-guard.mjs so each file stays a single concern.

import { access, readFile } from "node:fs/promises";
import path from "node:path";

const TEST_FILE_IN_ITEM =
  /(app\/[A-Za-z0-9_./-]+\.(?:test|spec)\.[cm]?[jt]sx?|app\/[A-Za-z0-9_./-]+_test\.py|app\/[A-Za-z0-9_./-]+\/test_[A-Za-z0-9_.-]+\.py)/;

const UP_RANK = { ">": 5, ">=": 4, "==": 3, "<=": 2, "<": 1 };
const DOWN_RANK = { "<": 5, "<=": 4, "==": 3, ">=": 2, ">": 1 };

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

export function truncate(text) {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}

function normalizeOp(raw) {
  return raw.trim().replaceAll("≥", ">=").replaceAll("≤", "<=");
}

export function parseThresholds(markdown) {
  const body = sectionBody(markdown ?? "", "## thresholds");
  const rows = new Map();
  if (body == null) {
    return rows;
  }
  for (const line of body.split("\n")) {
    if (!line.trim().startsWith("|")) {
      continue;
    }
    const cells = line.split("|").map((cell) => cell.trim()).filter((cell) => cell.length > 0);
    if (cells.length < 4) {
      continue;
    }
    const [metric, opRaw, valueRaw, directionRaw] = cells;
    if (metric.toLowerCase() === "metric" || /^-+$/.test(metric)) {
      continue;
    }
    const value = Number(valueRaw);
    if (!Number.isFinite(value)) {
      continue;
    }
    rows.set(metric, {
      op: normalizeOp(opRaw),
      value,
      direction: directionRaw.trim().toLowerCase(),
    });
  }
  return rows;
}

function isLooser(before, after) {
  if (before.direction !== after.direction) {
    return true;
  }
  if (before.direction === "tighten-up") {
    if (after.value < before.value) {
      return true;
    }
    return after.value === before.value && (UP_RANK[after.op] ?? 0) < (UP_RANK[before.op] ?? 0);
  }
  if (before.direction === "tighten-down") {
    if (after.value > before.value) {
      return true;
    }
    return after.value === before.value && (DOWN_RANK[after.op] ?? 0) < (DOWN_RANK[before.op] ?? 0);
  }
  return after.value !== before.value;
}

export function compareConstraints(before, after) {
  if (!before || !before.trim()) {
    return [];
  }
  const previous = parseThresholds(before);
  const next = parseThresholds(after ?? "");
  const findings = [];
  for (const [metric, oldRow] of previous) {
    const newRow = next.get(metric);
    if (!newRow) {
      findings.push(`floor: threshold removed from CONSTRAINTS.md: ${metric}`);
      continue;
    }
    if (isLooser(oldRow, newRow)) {
      findings.push(
        `floor: threshold loosened in CONSTRAINTS.md: ${metric} ${oldRow.op} ${oldRow.value} -> ${newRow.op} ${newRow.value}`,
      );
    }
  }
  return findings;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasAppSource(root) {
  const pkg = path.join(root, "app", "package.json");
  if (!(await exists(pkg))) {
    return false;
  }
  for (const dir of ["src", "app", "packages", "frontend", "backend"]) {
    if (await exists(path.join(root, "app", dir))) {
      return true;
    }
  }
  return false;
}

export async function checkContractEvidence(root, sprint) {
  if (!(await hasAppSource(root))) {
    return [];
  }
  const contractPath = path.join(root, "docs", `sprint-${sprint}-contract.md`);
  let contract = "";
  try {
    contract = await readFile(contractPath, "utf8");
  } catch {
    return [`contract: missing docs/sprint-${sprint}-contract.md`];
  }

  const findings = [];
  const tests = sectionBody(contract, "## acceptance tests");
  if (tests == null) {
    findings.push(`contract: docs/sprint-${sprint}-contract.md is missing ## Acceptance tests`);
  } else {
    const items = [...tests.matchAll(/^\s*-\s+\[[ xX]\]\s+(.+)$/gm)].map((match) => match[1]);
    if (items.length === 0) {
      findings.push("contract: ## Acceptance tests has no checklist items");
    }
    for (const item of items) {
      const found = item.match(TEST_FILE_IN_ITEM);
      if (!found) {
        findings.push(`contract: acceptance test item names no test file: ${truncate(item)}`);
        continue;
      }
      const rel = found[1];
      if (!(await exists(path.join(root, rel)))) {
        findings.push(`contract: acceptance test file does not exist: ${rel}`);
      }
    }
  }

  const apis = sectionBody(contract, "## stack apis");
  if (apis == null) {
    findings.push(`contract: docs/sprint-${sprint}-contract.md is missing ## Stack APIs`);
  } else if (!/UNVERIFIED|https?:\/\/|No framework APIs/i.test(apis)) {
    findings.push(
      "contract: ## Stack APIs needs a doc URL, the word UNVERIFIED, or 'No framework APIs'",
    );
  }
  return findings;
}
