import { access } from "node:fs/promises";
import path from "node:path";
import { logEvent } from "./event-log.mjs";
import {
  buildEvaluatorPrompt,
  buildGeneratorPrompt,
  buildPlannerPrompt,
} from "./prompts.mjs";
import { runPhase } from "./phase-runners.mjs";
import {
  computeNextActionFromRows,
  markSprintSkipped,
  readSprintRows,
  SPRINT_STATUS_FILE,
} from "./sprint-status.mjs";
import {
  createInitialState,
  readOrchestratorState,
  resolveQaRound,
  updateOrchestratorState,
} from "./state-store.mjs";
import { assertPhaseOutputs, sprintPassed } from "./validate.mjs";
import { readWorkflowHandoff, writeWorkflowHandoff, HANDOFF_FILE } from "./workflow-handoff.mjs";

const SOURCE = "sdk-orchestrator";

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function needsPlanning() {
  const hasSpec = await fileExists("docs/spec.md");
  const hasStatus = await fileExists(SPRINT_STATUS_FILE);
  return !(hasSpec && hasStatus);
}

export async function getNextDecision() {
  if (await needsPlanning()) {
    return {
      action: "run-planner",
      reason: "Planning artifacts are missing.",
    };
  }

  const rows = await readSprintRows(SPRINT_STATUS_FILE);
  return computeNextActionFromRows(rows);
}

async function writePhaseHandoff({
  phase,
  sprint,
  qaRound,
  next,
  artifacts,
  runtime = {},
}) {
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sourceWorkflow: SOURCE,
    lastCompletedPhase: phase,
    targetSprint: sprint,
    qaRound,
    expectedNextAction: next,
    artifactsWritten: artifacts,
    ...(Object.keys(runtime).length ? { runtime } : {}),
  };

  await writeWorkflowHandoff(payload, HANDOFF_FILE);
}

async function writePostQaHandoff({ sprint, qaRound, nextAction }) {
  await writePhaseHandoff({
    phase: "evaluator",
    sprint,
    qaRound,
    next: nextAction,
    artifacts: ["docs/sprint-status.md", `docs/qa-report-sprint-${sprint}.md`],
  });
}

export async function runSinglePhase({
  action,
  sprint = 1,
  qaRound = 1,
  productPrompt,
  policy,
  cwd = process.cwd(),
  dryRun = false,
}) {
  if (dryRun) {
    return { action, sprint, qaRound, dryRun: true };
  }

  await logEvent({ event: "phase.start", action, sprint, qaRound });

  let phase;
  let prompt;
  let handoffNext;
  let artifacts;

  if (action === "run-planner") {
    if (!productPrompt) {
      throw new Error("productPrompt is required for run-planner.");
    }

    phase = "planner";
    prompt = await buildPlannerPrompt({ productPrompt });
    handoffNext = "run-generator";
    artifacts = [
      "docs/spec.md",
      "docs/sprint-plan.md",
      "docs/sprint-status.md",
      "CLAUDE.md",
    ];
    sprint = 1;
    qaRound = 1;
  } else if (action === "run-generator") {
    phase = "generator";
    prompt = await buildGeneratorPrompt({ sprint });
    handoffNext = "run-evaluator";
    artifacts = [`docs/sprint-${sprint}-contract.md`, "docs/sprint-status.md"];
  } else if (action === "run-evaluator") {
    phase = "evaluator";
    prompt = await buildEvaluatorPrompt({ sprint });
    handoffNext = "manual-review";
    artifacts = [`docs/qa-report-sprint-${sprint}.md`, "docs/sprint-status.md"];
  } else if (action === "done") {
    return { action: "done" };
  } else {
    throw new Error(`Cannot execute action '${action}'.`);
  }

  const runResult = await runPhase({ phase, prompt, policy, cwd });
  await assertPhaseOutputs(phase, sprint);

  await writePhaseHandoff({
    phase,
    sprint,
    qaRound,
    next: handoffNext,
    artifacts,
    runtime: {
      mode: policy.runtime.mode,
      ...(runResult.agentId ? { agentId: runResult.agentId } : {}),
      ...(runResult.runId ? { runId: runResult.runId } : {}),
    },
  });

  await updateOrchestratorState({
    productPrompt: productPrompt ?? undefined,
    currentSprint: sprint,
    qaRounds: { [String(sprint)]: qaRound },
    lastCompletedPhase: phase,
    lastRun: {
      phase,
      sprint,
      qaRound,
      status: runResult.status,
      runner: runResult.runner,
      agentId: runResult.agentId ?? null,
      runId: runResult.runId ?? null,
      startedAt: runResult.startedAt,
      endedAt: runResult.endedAt,
      durationMs: runResult.durationMs,
    },
    phaseHistory: [
      {
        phase,
        sprint,
        qaRound,
        status: runResult.status,
        at: runResult.endedAt,
      },
    ],
  });

  await logEvent({
    event: "phase.end",
    phase,
    sprint,
    qaRound,
    status: runResult.status,
    durationMs: runResult.durationMs,
    runner: runResult.runner,
  });

  let postQa = null;
  if (phase === "evaluator") {
    const passed = await sprintPassed(sprint);
    const decision = await getNextDecision();
    await writePostQaHandoff({
      sprint,
      qaRound,
      nextAction: decision.action,
    });

    postQa = { passed, nextAction: decision.action };
    await logEvent({
      event: "sprint.result",
      sprint,
      qaRound,
      passed,
      nextAction: decision.action,
    });
  }

  return {
    action,
    phase,
    sprint,
    qaRound,
    runResult,
    postQa,
  };
}

export async function evaluateMaxRoundsPolicy({
  sprint,
  qaRound,
  passed,
  policy,
}) {
  if (passed) {
    return { continue: true, reason: "Sprint passed." };
  }

  if (qaRound < policy.maxQaRounds) {
    return { continue: true, reason: "Retrying generator after QA failure." };
  }

  if (policy.onMaxRoundsReached === "advance-with-warning") {
    return {
      continue: true,
      reason: `Max QA rounds (${policy.maxQaRounds}) reached; advancing with warning.`,
      warning: true,
    };
  }

  return {
    continue: false,
    reason: `Max QA rounds (${policy.maxQaRounds}) reached for sprint ${sprint}.`,
    exitCode: 1,
  };
}

export async function dryRunSequence({ productPrompt, policy, maxSteps = 20 }) {
  const steps = [];

  if (await needsPlanning()) {
    return [
      {
        action: "run-planner",
        reason: "Planning artifacts are missing.",
        ...(productPrompt ? { productPrompt } : {}),
      },
      {
        action: "pending",
        reason: "Further dry-run steps require docs/sprint-status.md after planning.",
      },
    ];
  }

  for (let step = 0; step < maxSteps; step += 1) {
    const rows = await readSprintRows(SPRINT_STATUS_FILE);
    const decision = computeNextActionFromRows(rows);

    if (decision.action === "done") {
      steps.push(decision);
      break;
    }

    if (decision.action === "manual-review") {
      steps.push(decision);
      break;
    }

    steps.push(decision);

    if (decision.action === "run-evaluator") {
      break;
    }
  }

  return steps;
}

export async function resume({
  productPrompt,
  policy,
  cwd = process.cwd(),
  dryRun = false,
  continueLoop = false,
}) {
  if (continueLoop) {
    return runLoop({ productPrompt, policy, cwd, dryRun, continueOnly: true });
  }

  const decision = await getNextDecision();
  if (decision.action === "done") {
    console.log("✅ All sprints complete.");
    return { action: "done" };
  }

  if (decision.action === "manual-review") {
    throw new Error(decision.reason);
  }

  const handoff = await readWorkflowHandoff(HANDOFF_FILE);
  const state = await readOrchestratorState();

  const sprint = decision.sprint ?? 1;
  const qaRound = resolveQaRound({
    state,
    handoff,
    sprint,
    action: decision.action,
  });

  return runSinglePhase({
    action: decision.action,
    sprint,
    qaRound,
    productPrompt,
    policy,
    cwd,
    dryRun,
  });
}

export async function runLoop({
  productPrompt,
  policy,
  cwd = process.cwd(),
  dryRun = false,
  continueOnly = false,
}) {
  if (!continueOnly && productPrompt) {
    await updateOrchestratorState(createInitialState({ productPrompt }));
  }

  let phasesRun = 0;

  while (true) {
    const decision = await getNextDecision();

    if (decision.action === "done") {
      console.log("");
      console.log("✅ All sprints complete!");
      await logEvent({ event: "loop.complete", reason: decision.reason });
      return { action: "done", phasesRun };
    }

    if (decision.action === "manual-review") {
      throw new Error(decision.reason);
    }

    if (policy.budgets.maxPhasesPerRun && phasesRun >= policy.budgets.maxPhasesPerRun) {
      throw new Error(`Reached maxPhasesPerRun budget (${policy.budgets.maxPhasesPerRun}).`);
    }

    const handoff = await readWorkflowHandoff(HANDOFF_FILE);
    const state = await readOrchestratorState();
    const sprint = decision.sprint ?? 1;
    const qaRound = resolveQaRound({
      state,
      handoff,
      sprint,
      action: decision.action,
    });

    if (decision.action === "run-planner" && !productPrompt) {
      throw new Error("productPrompt is required to start a new run-loop.");
    }

    const rows = await readSprintRows(SPRINT_STATUS_FILE).catch(() => []);
    const totalSprints = rows.length;

    if (decision.action !== "run-planner") {
      console.log("");
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  Sprint ${sprint}${totalSprints ? ` / ${totalSprints}` : ""}, QA round ${qaRound}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    const result = await runSinglePhase({
      action: decision.action,
      sprint,
      qaRound,
      productPrompt,
      policy,
      cwd,
      dryRun,
    });

    phasesRun += 1;

    if (result.postQa) {
      const policyResult = await evaluateMaxRoundsPolicy({
        sprint,
        qaRound,
        passed: result.postQa.passed,
        policy,
      });

      if (result.postQa.passed) {
        console.log(`✅ Sprint ${sprint} PASSED on round ${qaRound}`);
      } else {
        console.log(`❌ Sprint ${sprint} FAILED on round ${qaRound}`);
      }

      if (!policyResult.continue) {
        console.error(policyResult.reason);
        await logEvent({
          event: "loop.halt",
          sprint,
          qaRound,
          reason: policyResult.reason,
        });
        throw new Error(policyResult.reason);
      }

      if (policyResult.warning) {
        console.warn(policyResult.reason);
        await markSprintSkipped({
          sprint,
          notes: `Max QA rounds (${policy.maxQaRounds}) reached; advanced with known issues`,
        });
        await logEvent({
          event: "loop.advance-warning",
          sprint,
          qaRound,
          reason: policyResult.reason,
        });
      } else if (!result.postQa.passed) {
        console.log("  → Sending back to Generator for fixes...");
      }
    }
  }
}

export async function runPlan({ productPrompt, policy, cwd, dryRun }) {
  return runSinglePhase({
    action: "run-planner",
    sprint: 1,
    qaRound: 1,
    productPrompt,
    policy,
    cwd,
    dryRun,
  });
}

export async function runBuild({ sprint, policy, cwd, dryRun }) {
  const decision = await getNextDecision();
  const targetSprint = sprint ?? decision.sprint ?? 1;
  const handoff = await readWorkflowHandoff(HANDOFF_FILE);
  const state = await readOrchestratorState();
  const qaRound = resolveQaRound({
    state,
    handoff,
    sprint: targetSprint,
    action: "run-generator",
  });

  return runSinglePhase({
    action: "run-generator",
    sprint: targetSprint,
    qaRound,
    policy,
    cwd,
    dryRun,
  });
}

export async function runQa({ sprint, policy, cwd, dryRun }) {
  const decision = await getNextDecision();
  const targetSprint = sprint ?? decision.sprint ?? 1;
  const handoff = await readWorkflowHandoff(HANDOFF_FILE);
  const state = await readOrchestratorState();
  const qaRound = resolveQaRound({
    state,
    handoff,
    sprint: targetSprint,
    action: "run-evaluator",
  });

  return runSinglePhase({
    action: "run-evaluator",
    sprint: targetSprint,
    qaRound,
    policy,
    cwd,
    dryRun,
  });
}
