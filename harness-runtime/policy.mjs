import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONFIG_PATH = path.join("harness-runtime.config.json");

const DEFAULT_POLICY = {
  maxQaRounds: 3,
  onMaxRoundsReached: "halt",
  models: {
    planner: "opus",
    generator: "opus",
    evaluator: "opus",
  },
  runtime: {
    mode: "local",
    runner: "cli",
    approveMcps: true,
  },
  budgets: {
    maxPhasesPerRun: null,
  },
};

function mergePolicy(base, override) {
  return {
    ...base,
    ...override,
    models: { ...base.models, ...override?.models },
    runtime: { ...base.runtime, ...override?.runtime },
    budgets: { ...base.budgets, ...override?.budgets },
  };
}

export async function loadPolicy(configPath = DEFAULT_CONFIG_PATH) {
  let filePolicy = {};

  let raw = null;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    // Only a missing config file falls back to defaults.
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  if (raw !== null) {
    // A malformed config must fail loudly, not silently use DEFAULT_POLICY.
    filePolicy = JSON.parse(raw);
    if (
      filePolicy
      && typeof filePolicy === "object"
      && (Object.prototype.hasOwnProperty.call(filePolicy, "maxSprintsPerRun")
        || Object.prototype.hasOwnProperty.call(filePolicy, "retro"))
    ) {
      throw new Error(
        "Set HARNESS_MAX_SPRINTS_PER_RUN and HARNESS_RETRO in the environment. harness-runtime.config.json cannot set maxSprintsPerRun or retro.",
      );
    }
  }

  const policy = mergePolicy(DEFAULT_POLICY, filePolicy);

  const harnessModel = process.env.HARNESS_MODEL?.trim();
  if (harnessModel) {
    policy.models = {
      planner: harnessModel,
      generator: harnessModel,
      evaluator: harnessModel,
    };
  }

  if (process.env.HARNESS_RUNNER === "cli") {
    policy.runtime.runner = "cli";
  }

  if (process.env.HARNESS_ON_MAX_ROUNDS === "advance") {
    policy.onMaxRoundsReached = "advance-with-warning";
  }

  const maxRounds = process.env.HARNESS_MAX_QA_ROUNDS;
  if (maxRounds) {
    const parsed = Number.parseInt(maxRounds, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      policy.maxQaRounds = parsed;
    }
  }

  policy.maxSprintsPerRun = null;
  policy.retro = "on";

  if (process.env.HARNESS_RETRO === "off") {
    policy.retro = "off";
  }

  const maxSprints = process.env.HARNESS_MAX_SPRINTS_PER_RUN;
  if (maxSprints) {
    policy.maxSprintsPerRun = parsePositiveInt("HARNESS_MAX_SPRINTS_PER_RUN", maxSprints);
  }

  return policy;
}

function parsePositiveInt(name, raw) {
  const value = raw.trim();
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${name} must be a positive integer, got '${raw}'.`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, got '${raw}'.`);
  }
  return parsed;
}

export function getModelForPhase(policy, phase) {
  return policy.models[phase] ?? policy.models.generator;
}
