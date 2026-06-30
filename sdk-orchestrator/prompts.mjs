import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import path from "node:path";

export const AUTONOMOUS_SUFFIX = `
AUTONOMOUS MODE: Do not ask for confirmation or pause for human review. After writing the sprint contract, implement it immediately in the same session. Complete all required artifacts and status updates before finishing.`;

async function readAgentPersona(phase) {
  return readFile(path.join("agents", `${phase}.md`), "utf8");
}

async function qaReportExists(sprint) {
  try {
    await access(path.join("docs", `qa-report-sprint-${sprint}.md`));
    return true;
  } catch {
    return false;
  }
}

export async function buildPlannerPrompt({ productPrompt }) {
  const persona = await readAgentPersona("planner");
  return `${persona}

Read all criteria files in agents/criteria/ to understand what the evaluator will grade.
Then expand this prompt into a comprehensive product spec.

Write docs/spec.md, docs/sprint-plan.md, and docs/sprint-status.md.
Update CLAUDE.md with the product context.

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
