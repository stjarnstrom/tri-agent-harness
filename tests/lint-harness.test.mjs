import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { installLintHarness, leakedSecretSource, warningsOnlySource } from "./lint-fixture.mjs";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function lintProject() {
  const dir = await mkdtemp(path.join(tmpdir(), "lint-harness-"));
  await installLintHarness(dir);
  await mkdir(path.join(dir, "app", "src"), { recursive: true });
  return dir;
}

async function runLint(dir, target) {
  try {
    const { stdout, stderr } = await execFileAsync(
      "bun",
      ["run", "lint:harness", "--", target],
      { cwd: dir },
    );
    return { code: 0, output: `${stdout ?? ""}\n${stderr ?? ""}` };
  } catch (error) {
    if (typeof error.code === "number") {
      return {
        code: error.code,
        output: `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
      };
    }
    throw error;
  }
}

test("a .tsx file with a hardcoded password fails bun lint:harness on the password", async () => {
  const dir = await lintProject();
  const file = path.join(dir, "app", "src", "leak.tsx");
  await writeFile(file, leakedSecretSource());
  const result = await runLint(dir, "app/src/leak.tsx");
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /no-leaked-secrets/);
  assert.doesNotMatch(result.output, /Parsing error/);
  assert.match(result.output, /no-console-in-prod/);
  assert.match(result.output, /fetch-needs-timeout/);
});

test("the same secret text in a .js file fails bun lint:harness on the password", async () => {
  const dir = await lintProject();
  const file = path.join(dir, "app", "src", "leak.js");
  await writeFile(file, leakedSecretSource());
  const result = await runLint(dir, "app/src/leak.js");
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /no-leaked-secrets/);
});

test("a typed .tsx secret fails on the password, not on a parse error", async () => {
  const dir = await lintProject();
  const file = path.join(dir, "app", "src", "Widget.tsx");
  await writeFile(file, leakedSecretSource({ typed: true }));
  const result = await runLint(dir, "app/src/Widget.tsx");
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /no-leaked-secrets/);
  assert.doesNotMatch(result.output, /Parsing error/);
});

test("console.log and a bare fetch stay warnings and a warnings-only file exits 0", async () => {
  const dir = await lintProject();
  await writeFile(path.join(dir, "app", "src", "warn.tsx"), warningsOnlySource({ typed: true }));
  await writeFile(path.join(dir, "app", "src", "warn.js"), warningsOnlySource());
  const tsx = await runLint(dir, "app/src/warn.tsx");
  const js = await runLint(dir, "app/src/warn.js");
  assert.equal(tsx.code, 0, tsx.output);
  assert.equal(js.code, 0, js.output);
  assert.match(tsx.output, /no-console-in-prod/);
  assert.match(tsx.output, /fetch-needs-timeout/);
  assert.match(tsx.output, /0 errors/);
  assert.doesNotMatch(tsx.output, /File ignored/);
  assert.match(js.output, /0 errors/);
});

test("no-leaked-secrets is the only harness rule at error", () => {
  const config = require(path.join(ROOT, ".eslintrc.harness.cjs"));
  const rules = config.find((entry) => entry.rules).rules;
  const severities = Object.fromEntries(
    Object.entries(rules).map(([name, value]) => [name, Array.isArray(value) ? value[0] : value]),
  );
  assert.deepEqual(severities, {
    "harness/no-leaked-secrets": "error",
    "harness/fetch-needs-timeout": "warn",
    "harness/component-too-large": "warn",
    "harness/file-too-large": "warn",
    "harness/no-console-in-prod": "warn",
  });
});
