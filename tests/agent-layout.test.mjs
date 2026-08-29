import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildPlannerModeInstructions } from "../harness-runtime/design-brief.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

test("AGENTS.md is the canonical instructions file", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /## Required reading/);
  assert.match(agents, /\.agents\/skills\//);
  assert.match(agents, /\.agents`\*\* \(plural\)/);
  assert.ok(agents.split("\n").length > 80, "AGENTS.md should hold the real instructions");
});

test("CLAUDE.md is a loader that imports AGENTS.md", () => {
  const claude = read("CLAUDE.md");
  assert.match(claude, /@AGENTS\.md/);
  assert.ok(
    claude.split("\n").length < 40,
    "CLAUDE.md should stay a thin loader, not a second copy",
  );
  assert.ok(
    claude.length < read("AGENTS.md").length / 4,
    "CLAUDE.md must not duplicate AGENTS.md",
  );
});

test(".claude/skills is a symlink to .agents/skills", () => {
  const adapter = path.join(ROOT, ".claude", "skills");
  const canonical = path.join(ROOT, ".agents", "skills");
  const stat = lstatSync(adapter);
  assert.ok(stat.isSymbolicLink(), ".claude/skills must be a symlink, not a directory");
  assert.equal(realpathSync(adapter), realpathSync(canonical));
  assert.ok(
    lstatSync(path.join(canonical, "harness-cycle", "SKILL.md")).isFile(),
    "canonical SKILL.md must exist under .agents/skills",
  );
});

test("domain packages use AGENTS.md plus a CLAUDE.md loader", () => {
  const dir = "harness/workspace-template/packages/billing";
  const agents = read(`${dir}/AGENTS.md`);
  const claude = read(`${dir}/CLAUDE.md`);
  assert.match(agents, /Billing Domain/);
  assert.match(claude, /@AGENTS\.md/);
  assert.ok(claude.split("\n").length < 20);
});

test("planner writes AGENTS.md, not the CLAUDE.md loader", () => {
  const instructions = buildPlannerModeInstructions();
  assert.match(instructions, /update AGENTS\.md/);
  assert.doesNotMatch(instructions, /update CLAUDE\.md/);
});

test("git stores .claude/skills as a symlink", () => {
  const listing = execFileSync("git", ["ls-files", "-s", ".claude/skills"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.match(listing, /^120000 /);
});

test("setup repairs a plain-file .claude/skills checkout", () => {
  const script = read("scripts/install-harness.sh");
  const fn = script.match(/ensure_claude_skills_symlink\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "install-harness.sh must define ensure_claude_skills_symlink");

  const dir = mkdtempSync(path.join(os.tmpdir(), "skills-symlink-"));
  try {
    mkdirSync(path.join(dir, ".agents", "skills", "demo"), { recursive: true });
    writeFileSync(path.join(dir, ".agents", "skills", "demo", "SKILL.md"), "# demo\n");
    mkdirSync(path.join(dir, ".claude"), { recursive: true });
    writeFileSync(path.join(dir, ".claude", "skills"), "../.agents/skills\n");

    execFileSync("bash", ["-c", `ROOT="${dir}"\n${fn[0]}\nensure_claude_skills_symlink`], {
      cwd: dir,
    });

    const adapter = path.join(dir, ".claude", "skills");
    assert.ok(lstatSync(adapter).isSymbolicLink());
    assert.equal(realpathSync(adapter), realpathSync(path.join(dir, ".agents", "skills")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
