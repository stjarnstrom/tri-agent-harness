// next-step.mjs — deterministic control flow for chat-driven harness runs.
//
// ./harness.sh owns the loop in bash (harness_run_sprint_loop). When the cycle
// runs from a single Claude Code conversation instead, the orchestrator is a
// model, and a model re-deriving "which phase now, which round, has the gate
// run" from prose will eventually skip the gate or miscount rounds. This module
// answers that question the same way the shell loop does, so the chat
// orchestrator only has to *execute* steps, never decide them.
//
// Read-only: computeNextStep() is safe to call repeatedly. Bookkeeping after a
// phase finishes lives in cycle-record.mjs.

import path from "node:path";
import { getNextDecision } from "./orchestrator.mjs";
import { fileExists } from "./fs-utils.mjs";
import { SPRINT_STATUS_FILE } from "./sprint-status.mjs";
import { HANDOFF_FILE, readWorkflowHandoff } from "./workflow-handoff.mjs";
import { readOrchestratorState } from "./state-store.mjs";
import {
  contractPath,
  DOCS_DIR,
  existingFiles,
  mechanicalReportPath,
  nextAttemptNumber,
  qaReportPath,
  readGateState,
  retroIsPending,
} from "./cycle-state.mjs";

async function generatorContext(sprint, gate) {
  const candidates = [
    "agents/generator.md",
    "harness/AGENT-INSTRUCTIONS.md",
    "harness/LESSONS.md",
    path.join(DOCS_DIR, "spec.md"),
    path.join(DOCS_DIR, "sprint-plan.md"),
    SPRINT_STATUS_FILE,
    contractPath(sprint),
    qaReportPath(sprint),
  ];
  if (gate?.present && gate.result === "fail") {
    candidates.push(mechanicalReportPath(sprint));
  }
  return existingFiles(candidates);
}

async function evaluatorContext(sprint) {
  return existingFiles([
    "agents/evaluator.md",
    path.join(DOCS_DIR, "spec.md"),
    contractPath(sprint),
    mechanicalReportPath(sprint),
    SPRINT_STATUS_FILE,
  ]);
}

function exhausted({ base, sprint, attempt, onMaxRounds, docsDir }) {
  const report = path.join(docsDir, `qa-report-sprint-${sprint}.md`);

  if (onMaxRounds === "advance" || onMaxRounds === "advance-with-warning") {
    return {
      ...base,
      step: "advance-sprint",
      agent: null,
      sprint,
      qaRound: attempt - 1,
      command: `node harness-runtime/cli.mjs sprint-mark-skipped --sprint ${sprint}`,
      instruction: `Sprint ${sprint} used all ${base.maxQaRounds} rounds without passing and the policy is advance-with-warning. Run the command to mark it Skipped, tell the user what remains broken (see ${report}), then call next-step again.`,
      context: [report],
      reason: `Sprint ${sprint} exhausted its ${base.maxQaRounds}-round budget.`,
    };
  }

  return {
    ...base,
    step: "halt",
    agent: null,
    sprint,
    qaRound: attempt - 1,
    instruction: `Stop the cycle and report to the user: sprint ${sprint} used all ${base.maxQaRounds} QA rounds without passing. Summarize the blocking issues from ${report} and offer either another round (with an explicit round budget) or advancing with known issues.`,
    context: [report],
    reason: `Sprint ${sprint} exhausted its ${base.maxQaRounds}-round budget.`,
  };
}

/**
 * Resolve the single next step in the build cycle.
 *
 * Steps map 1:1 onto what the chat orchestrator does:
 *   run-planner / run-generator / run-evaluator / run-retro → dispatch a subagent
 *   run-pre-qa-gate / advance-sprint                        → run a shell command
 *   await-design-selection / halt / manual-review / done    → stop and report
 */
export async function computeNextStep({ policy, docsDir = DOCS_DIR } = {}) {
  const maxQaRounds = policy?.maxQaRounds ?? 3;
  const onMaxRounds = policy?.onMaxRoundsReached ?? "halt";

  const state = await readOrchestratorState();
  const handoff = await readWorkflowHandoff(HANDOFF_FILE);
  const decision = await getNextDecision();

  const base = { maxQaRounds, onMaxRounds, reason: decision.reason };

  if (decision.action === "await-design-selection") {
    return {
      ...base,
      step: "await-design-selection",
      agent: null,
      instruction:
        "Stop and ask the user to pick a direction: the Planner wrote docs/design-options.md and is waiting for design/selected-direction.md.",
      context: await existingFiles([path.join(docsDir, "design-options.md")]),
    };
  }

  if (decision.action === "run-planner") {
    return {
      ...base,
      step: "run-planner",
      agent: "planner",
      instruction:
        "Dispatch the planner subagent to expand the product prompt into docs/spec.md, docs/sprint-plan.md, and docs/sprint-status.md.",
      context: await existingFiles(["agents/planner.md", "CLAUDE.md"]),
    };
  }

  if (decision.action === "manual-review") {
    return {
      ...base,
      step: "manual-review",
      agent: null,
      sprint: decision.sprint ?? null,
      instruction: `Stop and report: sprint ${decision.sprint} has an unrecognized status in docs/sprint-status.md. A human must fix the row.`,
      context: await existingFiles([SPRINT_STATUS_FILE]),
    };
  }

  if (decision.action === "done") {
    if (await retroIsPending(state, docsDir)) {
      return {
        ...base,
        step: "run-retro",
        agent: "retrospector",
        instruction:
          "All sprints are terminal. Dispatch the retrospector subagent to distill this run's QA reports into the lessons ledger and draft guardrail proposals.",
        context: await existingFiles(["agents/retrospector.md", "harness/lessons.jsonl"]),
        reason: "All sprints complete; QA reports not yet distilled into lessons.",
      };
    }

    return {
      ...base,
      step: "done",
      agent: null,
      instruction:
        "The cycle is complete. Report the final sprint statuses and QA results to the user.",
      context: await existingFiles([SPRINT_STATUS_FILE]),
    };
  }

  const sprint = decision.sprint;

  // Sprint is Ready for QA: the mechanical gate stands between the Generator
  // and the Evaluator, exactly as in harness_run_sprint_loop.
  if (decision.action === "run-evaluator") {
    const gate = await readGateState(sprint, { docsDir });

    if (!gate.present || !gate.fresh) {
      return {
        ...base,
        step: "run-pre-qa-gate",
        agent: null,
        sprint,
        command: `bash scripts/pre-qa-gate.sh ${sprint}`,
        instruction: `Run the pre-QA mechanical gate for sprint ${sprint} with Bash, then call next-step again. Do not dispatch the evaluator until the gate passes.`,
        context: [],
        reason: gate.present
          ? `Sprint ${sprint} is ready for QA but ${gate.report} predates the current generator output (stale).`
          : `Sprint ${sprint} is ready for QA but the mechanical gate has not run.`,
      };
    }

    if (gate.result === "fail") {
      const attempt = await nextAttemptNumber({ state, handoff, sprint });
      if (attempt > maxQaRounds) {
        return exhausted({ base, sprint, attempt, onMaxRounds, docsDir });
      }

      return {
        ...base,
        step: "run-generator",
        agent: "generator",
        sprint,
        qaRound: attempt,
        focus: "fix-mechanical-checks",
        instruction: `Dispatch the generator subagent for sprint ${sprint} (round ${attempt} of ${maxQaRounds}) to fix every failure listed in ${gate.report}. The evaluator must not run until the gate passes.`,
        context: await generatorContext(sprint, gate),
        reason: `Pre-QA gate FAILED for sprint ${sprint}.`,
      };
    }

    const attempt = await nextAttemptNumber({ state, handoff, sprint });

    return {
      ...base,
      step: "run-evaluator",
      agent: "evaluator",
      sprint,
      qaRound: Math.max(1, attempt - 1),
      command: null,
      instruction: `Dispatch the evaluator subagent to test sprint ${sprint} end-to-end with Playwright, grade it against the contract, and write docs/qa-report-sprint-${sprint}.md.`,
      context: await evaluatorContext(sprint),
      reason: `Sprint ${sprint} is ready for QA and the mechanical gate passed.`,
    };
  }

  // decision.action === "run-generator": fresh build, QA-failure retry, or
  // a sprint whose status regressed to In progress.
  const attempt = await nextAttemptNumber({ state, handoff, sprint });
  if (attempt > maxQaRounds) {
    return exhausted({ base, sprint, attempt, onMaxRounds, docsDir });
  }

  const gate = await readGateState(sprint, { docsDir });
  const hadQaFailure = await fileExists(qaReportPath(sprint));
  const focus = hadQaFailure && attempt > 1 ? "fix-qa-failures" : "build";

  return {
    ...base,
    step: "run-generator",
    agent: "generator",
    sprint,
    qaRound: attempt,
    focus,
    instruction:
      focus === "fix-qa-failures"
        ? `Dispatch the generator subagent for sprint ${sprint} (round ${attempt} of ${maxQaRounds}) to fix every failure in docs/qa-report-sprint-${sprint}.md before adding new work.`
        : `Dispatch the generator subagent to build sprint ${sprint} (round ${attempt} of ${maxQaRounds}): write the contract if missing, implement it, commit, and mark the sprint Ready for QA.`,
    context: await generatorContext(sprint, gate),
  };
}

export function formatNextStep(step) {
  const lines = [`Step: ${step.step}`];
  if (step.sprint) {
    lines.push(`Sprint: ${step.sprint}`);
  }
  if (step.qaRound) {
    lines.push(`Round: ${step.qaRound} / ${step.maxQaRounds}`);
  }
  if (step.agent) {
    lines.push(`Subagent: ${step.agent}`);
  }
  if (step.focus) {
    lines.push(`Focus: ${step.focus}`);
  }
  if (step.command) {
    lines.push(`Command: ${step.command}`);
  }
  lines.push(`Reason: ${step.reason}`);
  lines.push(`Instruction: ${step.instruction}`);
  if (step.context?.length) {
    lines.push(`Context files: ${step.context.join(", ")}`);
  }
  return lines.join("\n");
}
