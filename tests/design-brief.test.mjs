import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectDesignBriefContext,
  hasDesignBriefInput,
  isPlanningComplete,
  needsPlanning,
} from "../harness-runtime/design-brief.mjs";
import { buildPlannerPrompt } from "../harness-runtime/prompts.mjs";
import { getNextDecision } from "../harness-runtime/orchestrator.mjs";

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "design-brief-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("hasDesignBriefInput detects brief markdown", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(path.join(cwd, "design"), { recursive: true });
    await writeFile(path.join(cwd, "design", "brief.md"), "Editorial dark aesthetic\n");

    assert.equal(await hasDesignBriefInput(cwd), true);
  });
});

test("needsPlanning is true when planning artifacts are missing", async () => {
  await withTempDir(async (cwd) => {
    assert.equal(await needsPlanning(cwd), true);
  });
});

test("isPlanningComplete when spec and sprint status exist", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(path.join(cwd, "docs"), { recursive: true });
    await writeFile(path.join(cwd, "docs", "spec.md"), "# Spec\n");
    await writeFile(path.join(cwd, "docs", "sprint-status.md"), "| 1 | A | Not started |\n");

    assert.equal(await isPlanningComplete(cwd), true);
    assert.equal(await needsPlanning(cwd), false);
  });
});

test("collectDesignBriefContext includes brief text and reference paths", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(path.join(cwd, "design", "references"), { recursive: true });
    await writeFile(path.join(cwd, "design", "brief.md"), "Warm brutalist palette\n");
    await writeFile(path.join(cwd, "design", "references", "mood.png"), "fake");

    const context = await collectDesignBriefContext(cwd);
    assert.match(context, /authoritative — do not override/);
    assert.match(context, /Warm brutalist palette/);
    assert.match(context, /design\/references\/mood\.png/);
  });
});

test("buildPlannerPrompt injects brief and full plan instructions", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(path.join(cwd, "agents"), { recursive: true });
    await mkdir(path.join(cwd, "design"), { recursive: true });
    await writeFile(path.join(cwd, "agents", "planner.md"), "# Planner\n");
    await writeFile(path.join(cwd, "design", "brief.md"), "Neon terminal green\n");

    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      const prompt = await buildPlannerPrompt({ productPrompt: "Build a DAW" });
      assert.match(prompt, /Neon terminal green/);
      assert.match(prompt, /FULL PLAN MODE/);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

test("buildPlannerPrompt uses full plan instructions when no brief", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(path.join(cwd, "agents"), { recursive: true });
    await writeFile(path.join(cwd, "agents", "planner.md"), "# Planner\n");

    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      const prompt = await buildPlannerPrompt({ productPrompt: "Build a DAW" });
      assert.match(prompt, /FULL PLAN MODE/);
      assert.match(prompt, /docs\/spec\.md/);
      assert.doesNotMatch(prompt, /DESIGN SCOUT MODE/);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

test("getNextDecision returns run-planner when planning is incomplete", async () => {
  await withTempDir(async (cwd) => {
    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      const decision = await getNextDecision();
      assert.equal(decision.action, "run-planner");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
