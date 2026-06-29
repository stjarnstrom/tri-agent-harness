import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const STATE_FILE = path.join("docs", "orchestrator-state.json");

export async function readOrchestratorState(filePath = STATE_FILE) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeOrchestratorState(state, filePath = STATE_FILE) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function createInitialState({ productPrompt }) {
  return {
    version: 1,
    startedAt: new Date().toISOString(),
    productPrompt: productPrompt ?? null,
    currentSprint: null,
    qaRounds: {},
    lastCompletedPhase: null,
    lastRun: null,
    phaseHistory: [],
  };
}

export async function updateOrchestratorState(patch, filePath = STATE_FILE) {
  const existing = (await readOrchestratorState(filePath)) ?? createInitialState({});
  const phaseHistory = patch.phaseHistory
    ? [...(existing.phaseHistory ?? []), ...patch.phaseHistory]
    : existing.phaseHistory;

  const next = {
    ...existing,
    ...patch,
    qaRounds: { ...existing.qaRounds, ...patch.qaRounds },
    phaseHistory,
    updatedAt: new Date().toISOString(),
  };
  await writeOrchestratorState(next, filePath);
  return next;
}

export function resolveQaRound({ state, handoff, sprint, action }) {
  const fromState = state?.qaRounds?.[String(sprint)];
  const fromHandoff = handoff?.targetSprint === sprint ? handoff.qaRound : null;

  if (action === "run-evaluator") {
    return fromHandoff ?? fromState ?? 1;
  }

  if (action === "run-generator") {
    if (handoff?.targetSprint === sprint && handoff.lastCompletedPhase === "evaluator") {
      return (handoff.qaRound ?? 0) + 1;
    }
    return fromHandoff ?? fromState ?? 1;
  }

  return fromHandoff ?? fromState ?? 1;
}
