import { access, readFile } from "node:fs/promises";
import {
  buildPlannerModeInstructions,
  collectDesignBriefContext,
  getPlannerMode,
} from "./design-brief.mjs";

export const AUTONOMOUS_SUFFIX = `
AUTONOMOUS MODE: Do not ask for confirmation or pause for human review. After writing the sprint contract, implement it immediately in the same session. Complete all required artifacts and status updates before finishing.`;

async function readAgentPersona(phase) {
  return readFile(`agents/${phase}.md`, "utf8");
}

async function qaReportExists(sprint) {
  try {
    await access(`docs/qa-report-sprint-${sprint}.md`);
    return true;
  } catch {
    return false;
  }
}

export async function buildPlannerPrompt({ productPrompt, harnessYes = false, cwd = process.cwd() }) {
  const persona = await readAgentPersona("planner");
  const mode = await getPlannerMode(cwd, { harnessYes });
  const modeInstructions = buildPlannerModeInstructions(mode);
  const briefContext = await collectDesignBriefContext(cwd);

  return `${persona}

Read all criteria files in agents/criteria/ to understand what the evaluator will grade.
Read harness/workspace-template.md for optional domain-scoped monorepo layout.
Read docs/templates/design-options.md when in design-scout mode.
If design/references/ contains images, read/view them before defining the design language.

${modeInstructions}
${briefContext}

Prompt: ${productPrompt}
${AUTONOMOUS_SUFFIX}`;
}

export async function buildGeneratorPrompt({ sprint }) {
  const persona = await readAgentPersona("generator");
  let qaContext = "";

  if (await qaReportExists(sprint)) {
    qaContext = `

IMPORTANT: The evaluator found issues in the last round. Read docs/qa-report-sprint-${sprint}.md and fix ALL failures before proceeding to new features.`;
  }

  return `${persona}

Read docs/spec.md for the full spec.
Read docs/sprint-plan.md for the sprint breakdown.
Read docs/sprint-status.md to find the current sprint.
Read all criteria files in agents/criteria/.
Read CLAUDE.md for the design language and stack.
Check git log for what's already built.
${qaContext}

You are building Sprint ${sprint}. Write the sprint contract to docs/sprint-${sprint}-contract.md if it doesn't exist, then implement it. Commit to git after each meaningful unit of work.

After building, write your self-evaluation to the end of docs/sprint-${sprint}-contract.md and update docs/sprint-status.md to 'Ready for QA'.
${AUTONOMOUS_SUFFIX}`;
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
${AUTONOMOUS_SUFFIX}`;
}

export { getPlannerMode, getPlanningState, collectDesignBriefContext, isDesignScoutComplete, isPlanningComplete, needsPlanning } from "./design-brief.mjs";
