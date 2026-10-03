import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  compareConstraints,
  inspectUnifiedDiff,
  runFloorGuard,
} from "../scripts/floor-guard.mjs";

const execFileAsync = promisify(execFile);

const CONSTRAINTS = `# Constraints

## Thresholds

| Metric | Operator | Value | Direction |
| --- | --- | --- | --- |
| coverage | >= | 80 | tighten-up |
| lcp-ms | <= | 2500 | tighten-down |
`;

test("inspectUnifiedDiff flags suppressions, skips, stubs, and deleted tests", () => {
  const diff = [
    "diff --git a/app/src/pay.ts b/app/src/pay.ts",
    "--- a/app/src/pay.ts",
    "+++ b/app/src/pay.ts",
    "@@ -1,3 +1,6 @@",
    "+// eslint-disable-next-line no-eval",
    "+eval(input)",
    "+throw new Error('Not implemented')",
    "+catch (error) {}",
    "diff --git a/app/src/pay.test.ts b/app/src/pay.test.ts",
    "deleted file mode 100644",
    "--- a/app/src/pay.test.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-expect(paid).toBe(true)",
    "diff --git a/app/src/keep.test.ts b/app/src/keep.test.ts",
    "--- a/app/src/keep.test.ts",
    "+++ b/app/src/keep.test.ts",
    "@@ -1,2 +1,2 @@",
    "-expect(one).toBe(1)",
    "-expect(two).toBe(2)",
    "+it.skip('later', () => {})",
    "+expect(one).toBe(1)",
  ].join("\n");

  const findings = inspectUnifiedDiff(diff);
  assert.ok(findings.some((line) => /suppression/.test(line)));
  assert.ok(findings.some((line) => /stub/.test(line)));
  assert.ok(findings.some((line) => /empty catch/.test(line)));
  assert.ok(findings.some((line) => /deleted test file/.test(line)));
  assert.ok(findings.some((line) => /skipped test/.test(line)));
  assert.ok(findings.some((line) => /assertions removed from app\/src\/keep.test.ts/.test(line)));
});

test("compareConstraints flags a lowered coverage bar and a raised LCP bar", () => {
  const loosened = CONSTRAINTS.replace("| coverage | >= | 80 |", "| coverage | >= | 60 |").replace(
    "| lcp-ms | <= | 2500 |",
    "| lcp-ms | <= | 4000 |",
  );
  const findings = compareConstraints(CONSTRAINTS, loosened);
  assert.equal(findings.length, 2);
  assert.match(findings[0], /coverage/);
  assert.match(findings[1], /lcp-ms/);
});

test("compareConstraints ignores a newly added constraints file", () => {
  assert.deepEqual(compareConstraints("", CONSTRAINTS), []);
});

test("compareConstraints flags a removed threshold row", () => {
  const stripped = CONSTRAINTS.replace("| coverage | >= | 80 | tighten-up |\n", "");
  const findings = compareConstraints(CONSTRAINTS, stripped);
  assert.ok(findings.some((line) => /threshold removed/.test(line) && /coverage/.test(line)));
});

test("runFloorGuard catches a suppression committed on the default branch", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "floor-git-"));
  await mkdir(path.join(dir, "app", "src"), { recursive: true });
  await mkdir(path.join(dir, "docs"), { recursive: true });
  await writeFile(
    path.join(dir, "docs", "sprint-1-contract.md"),
    [
      "# Contract",
      "",
      "## Acceptance criteria",
      "- [ ] boots",
      "",
      "## Acceptance tests",
      "- [x] boots — app/src/main.test.ts",
      "",
      "## Stack APIs",
      "- No framework APIs",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(dir, "app", "package.json"), JSON.stringify({ name: "product" }));
  await writeFile(path.join(dir, "app", "src", "main.test.ts"), "export {};\n");
  await writeFile(path.join(dir, "app", "src", "main.ts"), "// eslint-disable-next-line no-eval\neval('1')\n");
  await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: dir });
  await execFileAsync("git", ["add", "app", "docs"], { cwd: dir });
  await execFileAsync("git", ["commit", "-q", "-m", "add app"], { cwd: dir });

  const findings = await runFloorGuard(dir, 1);
  assert.ok(
    findings.some((line) => /suppression/.test(line)),
    `expected a suppression finding, got:\n${findings.join("\n")}`,
  );
});
