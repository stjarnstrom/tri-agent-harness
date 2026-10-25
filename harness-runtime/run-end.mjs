// When a chat run stops, the retrospector runs once, then the terminal step.
// The shell does this in harness_run_retro_hook. HARNESS_RETRO=off skips it.

import { isTerminalStatus, readSprintRows, SPRINT_STATUS_FILE } from "./sprint-status.mjs";
import { updateOrchestratorState } from "./state-store.mjs";
import { existingFiles, retroIsPending } from "./cycle-state.mjs";

function terminalSprintIds(rows) {
  return rows.filter((row) => isTerminalStatus(row.status)).map((row) => row.sprint);
}

function terminalAtRunStart(state) {
  const ids = state?.sprintCap?.terminalAtRunStart;
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) {
    return null;
  }
  return ids;
}

async function resolveSprintCap({ maxSprintsPerRun, newRun, state }) {
  if (!Number.isInteger(maxSprintsPerRun) || maxSprintsPerRun < 1) {
    return null;
  }

  const rows = await readSprintRows(SPRINT_STATUS_FILE).catch(() => []);
  const terminalIds = terminalSprintIds(rows);
  const started = newRun ? null : terminalAtRunStart(state);
  const terminalAtStart = started ?? terminalIds;

  if (!started) {
    await updateOrchestratorState({
      sprintCap: { terminalAtRunStart: terminalAtStart },
    });
  }

  const seen = new Set(terminalAtStart);
  const finishedThisRun = terminalIds.filter((id) => !seen.has(id)).length;
  return {
    max: maxSprintsPerRun,
    finished: finishedThisRun,
    reached: finishedThisRun >= maxSprintsPerRun,
  };
}

async function shouldDispatchRetro({ retro, state, docsDir }) {
  if (retro === "off") {
    return false;
  }
  return retroIsPending(state, docsDir);
}

async function retroStep(base, { reason, instruction }) {
  return {
    ...base,
    step: "run-retro",
    agent: "retrospector",
    instruction,
    context: await existingFiles(["agents/retrospector.md", "harness/lessons.jsonl"]),
    reason,
  };
}

async function sprintCapStep(base, cap) {
  return {
    ...base,
    step: "sprint-cap",
    agent: null,
    instruction: `Stop. Reached the sprint cap of ${cap.max} for this invocation. Completed ${cap.finished} sprint(s) this run. Re-run with the same prompt to continue. Do not report the cycle complete.`,
    context: await existingFiles([SPRINT_STATUS_FILE]),
    reason: `Reached the sprint cap of ${cap.max} for this invocation.`,
  };
}

export async function cappedRunStep({ maxSprintsPerRun, retro, newRun, state, docsDir, base }) {
  const cap = await resolveSprintCap({ maxSprintsPerRun, newRun, state });
  if (!cap?.reached) {
    return null;
  }
  if (await shouldDispatchRetro({ retro, state, docsDir })) {
    return retroStep(base, {
      reason: `Sprint cap reached (${cap.finished} of ${cap.max}) and QA reports are not yet distilled.`,
      instruction:
        "Dispatch the retrospector subagent to distill this run's QA reports into the lessons ledger and draft guardrail proposals. Then call next-step again. Do not report the cycle complete.",
    });
  }
  return sprintCapStep(base, cap);
}

export async function doneRetroStep({ retro, state, docsDir, base }) {
  if (!(await shouldDispatchRetro({ retro, state, docsDir }))) {
    return null;
  }
  return retroStep(base, {
    reason: "All sprints complete; QA reports not yet distilled into lessons.",
    instruction:
      "All sprints are terminal. Dispatch the retrospector subagent to distill this run's QA reports into the lessons ledger and draft guardrail proposals.",
  });
}

export async function haltWithRetro(step, { retro, state, docsDir }) {
  if (step.step !== "halt" || !(await shouldDispatchRetro({ retro, state, docsDir }))) {
    return step;
  }
  return retroStep(
    { maxQaRounds: step.maxQaRounds, onMaxRounds: step.onMaxRounds, reason: step.reason },
    {
      reason: step.reason,
      instruction:
        "This run is halting. Dispatch the retrospector subagent once to distill this run's QA reports into the lessons ledger and draft guardrail proposals. Then call next-step again.",
    },
  );
}
