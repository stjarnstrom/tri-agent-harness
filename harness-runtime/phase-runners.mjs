import { getModelForPhase } from "./policy.mjs";

/**
 * Try each runner in order until one succeeds. A runner "fails" both when it
 * throws AND when it soft-fails by resolving with status "error" — either way
 * the next runner gets a chance. When every runner fails, the thrown error
 * aggregates each runner's message so the primary failure isn't lost.
 *
 * Kept for unit tests and shared orchestration helpers. This Claude Code repo
 * does not execute Cursor CLI/SDK agents — use ./harness.sh instead.
 */
export async function runWithFallback({ runners, attempt, phase, warn = console.warn }) {
  const failures = [];

  for (const runner of runners) {
    try {
      const outcome = await attempt(runner);
      if (outcome?.status === "error") {
        throw new Error(`runner returned status 'error'`);
      }
      return outcome;
    } catch (error) {
      failures.push(`${runner}: ${error.message}`);
      if (runner !== runners[runners.length - 1]) {
        warn(`Runner '${runner}' failed, trying fallback: ${error.message}`);
      }
    }
  }

  throw new Error(`All runners failed for ${phase} — ${failures.join("; ")}`);
}

/**
 * Cursor CLI/SDK agent execution lives in tri-agent-harness-cursor.
 * This repo runs phases via ./harness.sh (Claude Code).
 */
export async function runPhase({ phase, prompt, policy, cwd = process.cwd() }) {
  const model = getModelForPhase(policy, phase);
  void prompt;
  void cwd;
  void policy;

  throw new Error(
    `runPhase(${phase}, model=${model}) is not available in tri-agent-harness (Claude Code). ` +
      `Use ./harness.sh for autonomous runs, or the tri-agent-harness-cursor repo for Cursor SDK/CLI orchestration.`,
  );
}
