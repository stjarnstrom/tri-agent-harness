import { readFile } from "node:fs/promises";
import {
  buildPlannerModeInstructions,
  collectDesignBriefContext,
} from "./design-brief.mjs";
import { getSprintStatus } from "./validate.mjs";

const AUTONOMOUS_PREAMBLE =
  "AUTONOMOUS MODE: Do not ask for confirmation or pause for human review.";

export const PHASE_AUTONOMOUS_SUFFIX = {
  planner: `
${AUTONOMOUS_PREAMBLE} Complete every planning artifact before finishing.`,
  generator: `
${AUTONOMOUS_PREAMBLE} After writing the sprint contract, implement it immediately in the same session. Complete all required artifacts and status updates before finishing.`,
  evaluator: `
${AUTONOMOUS_PREAMBLE} Run the tests, write the QA report, and update docs/sprint-status.md before finishing.`,
};

async function readAgentPersona(phase) {
  return readFile(`agents/${phase}.md`, "utf8");
}

const QA_REPORT_FAIL_PATTERN = /Result[^a-z0-9]*FAIL/i;

async function lastQaFailed(sprint) {
  let report;
  try {
    report = await readFile(`docs/qa-report-sprint-${sprint}.md`, "utf8");
  } catch {
    return false;
  }

  if (QA_REPORT_FAIL_PATTERN.test(report)) {
    return true;
  }

  const status = await getSprintStatus(sprint).catch(() => null);
  return status === "Fail";
}

export async function buildPlannerPrompt({ productPrompt, cwd = process.cwd() }) {
  const persona = await readAgentPersona("planner");
  const modeInstructions = buildPlannerModeInstructions();
  const briefContext = await collectDesignBriefContext(cwd);

  return `${persona}

Read all criteria files in agents/criteria/ to understand what the evaluator will grade.
If design/references/ contains images, read/view them before defining the design language.

${modeInstructions}
${briefContext}

Prompt: ${productPrompt}
${PHASE_AUTONOMOUS_SUFFIX.planner}`;
}

export async function buildGeneratorPrompt({ sprint }) {
  const persona = await readAgentPersona("generator");
  let qaContext = "";

  if (await lastQaFailed(sprint)) {
    qaContext = `

IMPORTANT: The evaluator found issues in the last round. Read docs/qa-report-sprint-${sprint}.md and fix ALL failures before proceeding to new features.`;
  }

  return `${persona}

Read docs/spec.md for the full spec.
Read docs/sprint-plan.md for the sprint breakdown.
Read docs/sprint-status.md to find the current sprint.
Read all criteria files in agents/criteria/.
Read AGENTS.md for the design language and stack.
Check git log for what's already built.
${qaContext}

You are building Sprint ${sprint}. Write the sprint contract to docs/sprint-${sprint}-contract.md if it doesn't exist, then implement it. Commit to git after each meaningful unit of work.

After building, write your self-evaluation to the end of docs/sprint-${sprint}-contract.md and update docs/sprint-status.md to 'Ready for QA'.
${PHASE_AUTONOMOUS_SUFFIX.generator}`;
}

export async function buildEvaluatorPrompt({ sprint }) {
  const persona = await readAgentPersona("evaluator");
  return `${persona}

Read docs/spec.md for the product context and design language.
Read docs/sprint-${sprint}-contract.md for the acceptance criteria.
Read all criteria files in agents/criteria/.
Read the Generator's self-evaluation at the bottom of the contract.

Start the application and test it thoroughly using Playwright.
Grade using the weighted scoring formula in your instructions.
Write your full report to docs/qa-report-sprint-${sprint}.md.
Update docs/sprint-status.md with the result.

Be skeptical. Find problems. Do not praise mediocre work.
${PHASE_AUTONOMOUS_SUFFIX.evaluator}`;
}

export { collectDesignBriefContext, isPlanningComplete, needsPlanning } from "./design-brief.mjs";
