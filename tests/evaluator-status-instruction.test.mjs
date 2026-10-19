import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildEvaluatorPrompt } from "../harness-runtime/prompts.mjs";
import { assertPhaseOutputs } from "../harness-runtime/validate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STATUS_CELL = /Set this sprint's status cell to `Pass` or `Fail`/;

async function inTempProject(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evaluator-status-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(prevCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeEvaluatorFixture(status) {
  await mkdir("docs", { recursive: true });
  await writeFile("docs/qa-report-sprint-1.md", "# QA\n\n## Result: PASS\n", "utf8");
  await writeFile(
    "docs/sprint-status.md",
    `| Sprint | Name | Status | Notes |\n|---|---|---|---|\n| 1 | Foundation | ${status} | |\n`,
    "utf8",
  );
}

describe("evaluator status cell", { concurrency: false }, () => {
test("evaluator instructions name Pass and Fail for the status cell", async () => {
  const persona = await readFile(path.join(root, "agents/evaluator.md"), "utf8");
  const adapter = await readFile(path.join(root, ".claude/agents/evaluator.md"), "utf8");
  const prevCwd = process.cwd();
  process.chdir(root);
  let prompt;
  try {
    prompt = await buildEvaluatorPrompt({ sprint: 1 });
  } finally {
    process.chdir(prevCwd);
  }

  assert.match(persona, STATUS_CELL);
  assert.match(adapter, STATUS_CELL);
  assert.match(prompt, STATUS_CELL);
  assert.doesNotMatch(adapter, /sprint-status\.md` with the result \(PASS or FAIL\)/);
});

test("evaluator validation rejects an uppercase PASS status cell", async () => {
  await inTempProject(async () => {
    await writeEvaluatorFixture("PASS");
    await assert.rejects(
      () => assertPhaseOutputs("evaluator", 1),
      /Expected sprint status 'Pass' or 'Fail', got 'PASS'/,
    );
  });
});

test("evaluator validation accepts a Pass status cell", async () => {
  await inTempProject(async () => {
    await writeEvaluatorFixture("Pass");
    const result = await assertPhaseOutputs("evaluator", 1);
    assert.equal(result.ok, true);
  });
});
});
