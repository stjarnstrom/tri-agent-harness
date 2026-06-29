import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { computeNextActionFromRows, readSprintRows } from "../sdk-orchestrator/sprint-status.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function rowsFromFixture(name) {
  const filePath = path.join(__dirname, "fixtures", name, "sprint-status.md");
  return readSprintRows(filePath);
}

test("missing rows resolves to run-planner", () => {
  const decision = computeNextActionFromRows([]);
  assert.equal(decision.action, "run-planner");
});

test("first not-started sprint resolves to run-generator", async () => {
  const rows = await rowsFromFixture("sprint-1-not-started");
  const decision = computeNextActionFromRows(rows);
  assert.equal(decision.action, "run-generator");
  assert.equal(decision.sprint, 1);
});

test("ready-for-qa sprint resolves to run-evaluator", async () => {
  const rows = await rowsFromFixture("sprint-2-ready-for-qa");
  const decision = computeNextActionFromRows(rows);
  assert.equal(decision.action, "run-evaluator");
  assert.equal(decision.sprint, 2);
});

test("failed sprint resolves to run-generator retry", async () => {
  const rows = await rowsFromFixture("sprint-2-fail");
  const decision = computeNextActionFromRows(rows);
  assert.equal(decision.action, "run-generator");
  assert.equal(decision.sprint, 2);
});

test("all pass resolves to done", async () => {
  const rows = await rowsFromFixture("all-pass");
  const decision = computeNextActionFromRows(rows);
  assert.equal(decision.action, "done");
});
