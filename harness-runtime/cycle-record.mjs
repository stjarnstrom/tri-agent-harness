// cycle-record.mjs — bookkeeping between phases of a chat-driven cycle.
//
// harness.sh writes the handoff manifest and state between phases with plain
// shell calls. In chat-driven runs the orchestrator is a model, so it reports
// only *which* phase it finished and this module does the arithmetic: advance
// the round counter, write the handoff manifest, append the event.

import { getNextDecision } from "./orchestrator.mjs";
import { readSprintRows, SPRINT_STATUS_FILE } from "./sprint-status.mjs";
import { HANDOFF_FILE, readWorkflowHandoff, writeWorkflowHandoff } from "./workflow-handoff.mjs";
import { readOrchestratorState, updateOrchestratorState } from "./state-store.mjs";
import { logEvent } from "./event-log.mjs";
import {
  contractPath,
  CYCLE_SOURCE,
  DOCS_DIR,
  existingFiles,
  nextAttemptNumber,
  qaReportPath,
  recordedAttempts,
} from "./cycle-state.mjs";
import path from "node:path";

const RECORDABLE_PHASES = new Set([
  "planner",
  "generator",
  "pre-qa-gate",
  "evaluator",
  "retrospector",
]);
// Phases the handoff manifest schema accepts as lastCompletedPhase.
const HANDOFF_PHASES = new Set(["planner", "generator", "evaluator"]);

async function writeHandoffFor({ phase, sprint, qaRound, next, artifacts, source }) {
  if (!HANDOFF_PHASES.has(phase)) {
    return;
  }

  await writeWorkflowHandoff(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      sourceWorkflow: source,
      lastCompletedPhase: phase,
      targetSprint: sprint,
      qaRound,
      expectedNextAction: next,
      artifactsWritten: artifacts,
      notes: `Recorded by ${source} (chat-driven cycle).`,
    },
    HANDOFF_FILE,
  );
}

async function resolveRecordSprint({ sprint, phase, handoff, state }) {
  if (Number.isInteger(sprint) && sprint > 0) {
    return sprint;
  }

  const rows = await readSprintRows(SPRINT_STATUS_FILE).catch(() => []);

  if (phase === "generator") {
    // The generator just marked its sprint Ready for QA.
    const ready = rows.find((row) => row.status === "Ready for QA");
    if (ready) {
      return ready.sprint;
    }
  }

  if (phase === "evaluator") {
    // The evaluator just wrote a Pass/Fail verdict; take the highest such row.
    const evaluated = rows
      .filter((row) => row.status === "Pass" || row.status === "Fail")
      .sort((a, b) => b.sprint - a.sprint);
    if (evaluated.length) {
      return evaluated[0].sprint;
    }
  }

  return handoff?.targetSprint ?? state?.currentSprint ?? null;
}

async function recordPlanner(source) {
  const decision = await getNextDecision();
  const targetSprint = decision.sprint ?? 1;

  await writeHandoffFor({
    phase: "planner",
    sprint: targetSprint,
    qaRound: 1,
    next: decision.action,
    artifacts: await existingFiles([
      path.join(DOCS_DIR, "spec.md"),
      path.join(DOCS_DIR, "sprint-plan.md"),
      SPRINT_STATUS_FILE,
    ]),
    source,
  });
  await logEvent({ event: "phase.done", phase: "planner", sprint: targetSprint, source });

  return { phase: "planner", sprint: targetSprint, nextAction: decision.action, recorded: true };
}

async function recordGenerator({ state, handoff, sprint, source }) {
  const attempt = await nextAttemptNumber({ state, handoff, sprint });

  await updateOrchestratorState({
    currentSprint: sprint,
    cycleAttempts: {
      ...(state?.cycleAttempts ?? {}),
      [String(sprint)]: attempt,
    },
    qaRounds: { [String(sprint)]: attempt },
    lastCompletedPhase: "generator",
    lastRun: { phase: "generator", sprint, qaRound: attempt, source },
  });
  await writeHandoffFor({
    phase: "generator",
    sprint,
    qaRound: attempt,
    next: "run-evaluator",
    artifacts: await existingFiles([contractPath(sprint), SPRINT_STATUS_FILE]),
    source,
  });
  await logEvent({ event: "phase.done", phase: "generator", sprint, qaRound: attempt, source });

  return { phase: "generator", sprint, qaRound: attempt, recorded: true };
}

async function recordEvaluator({ state, sprint, source }) {
  const decision = await getNextDecision();
  const qaRound = Math.max(1, recordedAttempts(state, sprint));

  await updateOrchestratorState({
    currentSprint: sprint,
    lastCompletedPhase: "evaluator",
    lastRun: { phase: "evaluator", sprint, qaRound, source },
  });
  await writeHandoffFor({
    phase: "evaluator",
    sprint,
    qaRound,
    next: decision.action,
    artifacts: await existingFiles([qaReportPath(sprint), SPRINT_STATUS_FILE]),
    source,
  });
  await logEvent({ event: "phase.done", phase: "evaluator", sprint, qaRound, source });

  return { phase: "evaluator", sprint, qaRound, nextAction: decision.action, recorded: true };
}

/**
 * Record that a phase finished, so the round budget survives across calls.
 *
 * The chat orchestrator never does this arithmetic itself — it reports which
 * phase it just ran and this function moves the counters, writes the handoff
 * manifest, and logs the event, mirroring what harness.sh does between phases.
 */
export async function recordPhase({ phase, sprint, result, source = CYCLE_SOURCE }) {
  if (!RECORDABLE_PHASES.has(phase)) {
    throw new Error(
      `Invalid phase '${phase}'. Expected one of: ${[...RECORDABLE_PHASES].join(", ")}.`,
    );
  }

  const state = await readOrchestratorState();
  const handoff = await readWorkflowHandoff(HANDOFF_FILE);

  if (phase === "retrospector") {
    await updateOrchestratorState({ retro: { completedAt: new Date().toISOString() } });
    await logEvent({ event: "phase.done", phase, source });
    return { phase, recorded: true };
  }

  // The gate's verdict lives in its own report on disk, so there is nothing to
  // count here — log it for the event trail and move on.
  if (phase === "pre-qa-gate") {
    await logEvent({
      event: "gate.done",
      phase,
      sprint: sprint ?? null,
      result: result ?? null,
      source,
    });
    return { phase, sprint: sprint ?? null, recorded: true };
  }

  if (phase === "planner") {
    return recordPlanner(source);
  }

  const targetSprint = await resolveRecordSprint({ sprint, phase, handoff, state });
  if (!Number.isInteger(targetSprint) || targetSprint < 1) {
    throw new Error(`Could not determine the sprint for '${phase}'. Pass --sprint <N>.`);
  }

  if (phase === "generator") {
    return recordGenerator({ state, handoff, sprint: targetSprint, source });
  }

  return recordEvaluator({ state, sprint: targetSprint, source });
}
