import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMaxRoundsPolicy } from "../sdk-orchestrator/orchestrator.mjs";
import { resolveQaRound } from "../sdk-orchestrator/state-store.mjs";

const basePolicy = {
  maxQaRounds: 3,
  onMaxRoundsReached: "halt",
};

test("resolveQaRound increments after evaluator failure handoff", () => {
  const qaRound = resolveQaRound({
    state: null,
    handoff: {
      targetSprint: 2,
      qaRound: 1,
      lastCompletedPhase: "evaluator",
    },
    sprint: 2,
    action: "run-generator",
  });

  assert.equal(qaRound, 2);
});

test("evaluateMaxRoundsPolicy continues when rounds remain", async () => {
  const result = await evaluateMaxRoundsPolicy({
    sprint: 2,
    qaRound: 1,
    passed: false,
    policy: basePolicy,
  });

  assert.equal(result.continue, true);
});

test("evaluateMaxRoundsPolicy halts at max rounds by default", async () => {
  const result = await evaluateMaxRoundsPolicy({
    sprint: 2,
    qaRound: 3,
    passed: false,
    policy: basePolicy,
  });

  assert.equal(result.continue, false);
  assert.equal(result.exitCode, 1);
});

test("evaluateMaxRoundsPolicy can advance with warning", async () => {
  const result = await evaluateMaxRoundsPolicy({
    sprint: 2,
    qaRound: 3,
    passed: false,
    policy: {
      ...basePolicy,
      onMaxRoundsReached: "advance-with-warning",
    },
  });

  assert.equal(result.continue, true);
  assert.equal(result.warning, true);
});
