import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { computeNextStep } from "../harness-runtime/next-step.mjs";
import { readGateState } from "../harness-runtime/cycle-state.mjs";
import { recordPhase } from "../harness-runtime/cycle-record.mjs";
import { readOrchestratorState } from "../harness-runtime/state-store.mjs";
import { readWorkflowHandoff } from "../harness-runtime/workflow-handoff.mjs";

const haltPolicy = { maxQaRounds: 3, onMaxRoundsReached: "halt" };
const advancePolicy = { maxQaRounds: 3, onMaxRoundsReached: "advance-with-warning" };

// computeNextStep resolves docs/ paths relative to cwd, like the orchestrator.
async function inTempProject(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "next-step-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(dir);
    await run(dir);
  } finally {
    process.chdir(prevCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeSprintStatus(rows) {
  await mkdir("docs", { recursive: true });
  const body = rows
    .map(({ sprint, status }) => `| ${sprint} | Sprint ${sprint} | ${status} | - |`)
    .join("\n");
  await writeFile(
    path.join("docs", "sprint-status.md"),
    `# Sprint Status\n\n| Sprint | Name | Status | Notes |\n|---|---|---|---|\n${body}\n`,
    "utf8",
  );
}

// Planning counts as complete once spec.md and sprint-status.md both exist.
async function writePlanningArtifacts(rows) {
  await mkdir("docs", { recursive: true });
  await writeFile(path.join("docs", "spec.md"), "# Spec\n", "utf8");
  await writeFile(path.join("docs", "sprint-plan.md"), "# Sprint plan\n", "utf8");
  await writeSprintStatus(rows);
}

async function writeGateReport(sprint, result) {
  await mkdir("docs", { recursive: true });
  await writeFile(
    path.join("docs", `mechanical-checks-sprint-${sprint}.md`),
    `# Mechanical Checks — Sprint ${sprint}\n\n## Result: ${result}\n`,
    "utf8",
  );
}

async function writeQaReport(sprint, result = "FAIL") {
  await mkdir("docs", { recursive: true });
  await writeFile(
    path.join("docs", `qa-report-sprint-${sprint}.md`),
    `# QA Report — Sprint ${sprint}\n\n## Result: ${result}\n`,
    "utf8",
  );
}

async function makeOlder(filePath, secondsBack = 60) {
  const when = new Date(Date.now() - secondsBack * 1000);
  await utimes(filePath, when, when);
}

test("missing planning artifacts resolve to run-planner", async () => {
  await inTempProject(async () => {
    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "run-planner");
    assert.equal(step.agent, "planner");
  });
});

test("not-started sprint dispatches the generator on round 1", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Not started" }]);
    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "run-generator");
    assert.equal(step.agent, "generator");
    assert.equal(step.sprint, 1);
    assert.equal(step.qaRound, 1);
    assert.equal(step.focus, "build");
    assert.ok(step.context.includes("docs/spec.md"));
  });
});

test("ready-for-QA sprint runs the pre-QA gate before the evaluator", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Ready for QA" }]);
    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "run-pre-qa-gate");
    assert.equal(step.agent, null);
    assert.equal(step.command, "bash scripts/pre-qa-gate.sh 1");
  });
});

test("a fresh gate PASS dispatches the evaluator", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Ready for QA" }]);
    await writeGateReport(1, "PASS");
    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "run-evaluator");
    assert.equal(step.agent, "evaluator");
    assert.equal(step.sprint, 1);
  });
});

test("a stale gate PASS re-runs the gate instead of trusting it", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Ready for QA" }]);
    await writeGateReport(1, "PASS");
    // The generator ran again after this report was written.
    await makeOlder(path.join("docs", "mechanical-checks-sprint-1.md"), 120);

    const gate = await readGateState(1);
    assert.equal(gate.present, true);
    assert.equal(gate.result, "pass");
    assert.equal(gate.fresh, false);

    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "run-pre-qa-gate");
    assert.match(step.reason, /stale/);
  });
});

test("a fresh gate FAIL sends the sprint back to the generator", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Ready for QA" }]);
    await writeGateReport(1, "FAIL");
    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "run-generator");
    assert.equal(step.focus, "fix-mechanical-checks");
    assert.ok(step.context.includes("docs/mechanical-checks-sprint-1.md"));
  });
});

test("a failed sprint with a QA report retries with fix-qa-failures focus", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Fail" }]);
    await writeQaReport(1);
    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "run-generator");
    assert.equal(step.focus, "fix-qa-failures");
    // A recorded evaluator verdict proves round 1 is spent.
    assert.equal(step.qaRound, 2);
    assert.ok(step.context.includes("docs/qa-report-sprint-1.md"));
  });
});

test("exhausting the round budget halts under the halt policy", async () => {
  await inTempProject(async () => {
    // A Fail row plus a QA report means round 1 is already spent, so rounds 2
    // and 3 exhaust a 3-round budget.
    await writePlanningArtifacts([{ sprint: 1, status: "Fail" }]);
    await writeQaReport(1);
    await recordPhase({ phase: "generator", sprint: 1 });
    await recordPhase({ phase: "generator", sprint: 1 });

    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "halt");
    assert.equal(step.sprint, 1);
    assert.equal(step.qaRound, 3);
    assert.match(step.reason, /exhausted/);
  });
});

test("exhausting the round budget advances under the advance policy", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Fail" }]);
    await writeQaReport(1);
    await recordPhase({ phase: "generator", sprint: 1 });
    await recordPhase({ phase: "generator", sprint: 1 });

    const step = await computeNextStep({ policy: advancePolicy });
    assert.equal(step.step, "advance-sprint");
    assert.equal(
      step.command,
      "node harness-runtime/cli.mjs sprint-mark-skipped --sprint 1",
    );
  });
});

test("recording a generator run increments the attempt counter and writes the handoff", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Ready for QA" }]);
    await writeFile(path.join("docs", "sprint-1-contract.md"), "# Contract\n", "utf8");

    const first = await recordPhase({ phase: "generator", sprint: 1 });
    assert.equal(first.qaRound, 1);

    const state = await readOrchestratorState();
    assert.equal(state.cycleAttempts["1"], 1);

    const handoff = await readWorkflowHandoff();
    assert.equal(handoff.lastCompletedPhase, "generator");
    assert.equal(handoff.targetSprint, 1);
    assert.equal(handoff.qaRound, 1);
    assert.equal(handoff.expectedNextAction, "run-evaluator");

    const second = await recordPhase({ phase: "generator", sprint: 1 });
    assert.equal(second.qaRound, 2);
  });
});

test("recording a generator run infers the ready-for-QA sprint without --sprint", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([
      { sprint: 1, status: "Pass" },
      { sprint: 2, status: "Ready for QA" },
    ]);
    const outcome = await recordPhase({ phase: "generator" });
    assert.equal(outcome.sprint, 2);
  });
});

test("all sprints terminal with QA reports runs retro, then reports done", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Pass" }]);
    await writeQaReport(1, "PASS");

    const retroStep = await computeNextStep({ policy: haltPolicy });
    assert.equal(retroStep.step, "run-retro");
    assert.equal(retroStep.agent, "retrospector");

    await recordPhase({ phase: "retrospector" });

    const doneStep = await computeNextStep({ policy: haltPolicy });
    assert.equal(doneStep.step, "done");
    assert.equal(doneStep.agent, null);
  });
});

test("all sprints terminal with no QA reports skips retro", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Skipped" }]);
    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "done");
  });
});

test("a QA report newer than the last retro re-triggers retro", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Pass" }]);
    await writeQaReport(1, "PASS");
    await recordPhase({ phase: "retrospector" });
    assert.equal((await computeNextStep({ policy: haltPolicy })).step, "done");

    // A later sprint gets evaluated in a subsequent cycle.
    await writeQaReport(2, "PASS");
    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "run-retro");
  });
});

test("an unknown sprint status stops for manual review", async () => {
  await inTempProject(async () => {
    await writePlanningArtifacts([{ sprint: 1, status: "Blocked on design" }]);
    const step = await computeNextStep({ policy: haltPolicy });
    assert.equal(step.step, "manual-review");
    assert.equal(step.sprint, 1);
  });
});

test("recordPhase rejects an unknown phase", async () => {
  await inTempProject(async () => {
    await assert.rejects(
      () => recordPhase({ phase: "reviewer", sprint: 1 }),
      /Invalid phase 'reviewer'/,
    );
  });
});
