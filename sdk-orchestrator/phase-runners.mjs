import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { getModelForPhase } from "./policy.mjs";

async function loadMcpConfig(cwd) {
  try {
    const raw = await readFile(path.join(cwd, ".mcp.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed.mcpServers ?? null;
  } catch {
    return null;
  }
}

function runCliAgent({ prompt, model, cwd, approveMcps }) {
  return new Promise((resolve, reject) => {
    const args = [
      "agent",
      "-p",
      "--force",
      "--workspace",
      cwd,
      "--model",
      model,
    ];

    if (approveMcps) {
      args.push("--approve-mcps");
    }

    args.push(prompt);

    const child = spawn("cursor", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          status: "finished",
          runner: "cli",
          result: stdout,
        });
        return;
      }

      reject(
        new Error(
          `cursor agent exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

async function runSdkAgent({ prompt, model, cwd, mcpServers }) {
  const { Agent, CursorAgentError } = await import("@cursor/sdk");

  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "CURSOR_API_KEY is required for SDK runner. Set it or use HARNESS_RUNNER=cli.",
    );
  }

  const options = {
    apiKey,
    model: { id: model },
    local: { cwd, settingSources: [] },
  };

  if (mcpServers) {
    options.mcpServers = mcpServers;
  }

  try {
    const result = await Agent.prompt(prompt, options);
    return {
      status: result.status,
      runner: "sdk",
      agentId: result.agentId ?? null,
      runId: result.id ?? null,
      result: result.result ?? null,
    };
  } catch (error) {
    if (error instanceof CursorAgentError) {
      throw new Error(`SDK startup failed: ${error.message}`);
    }
    throw error;
  }
}

export async function runPhase({ phase, prompt, policy, cwd = process.cwd() }) {
  const model = getModelForPhase(policy, phase);
  const mcpServers = await loadMcpConfig(cwd);
  const startedAt = Date.now();

  console.log(`▶ Running ${phase} (model: ${model}, runner: ${policy.runtime.runner})`);

  let outcome;
  const runners = policy.runtime.runner === "cli" ? ["cli", "sdk"] : ["sdk", "cli"];

  let lastError = null;
  for (const runner of runners) {
    try {
      if (runner === "sdk") {
        outcome = await runSdkAgent({ prompt, model, cwd, mcpServers });
      } else {
        outcome = await runCliAgent({
          prompt,
          model,
          cwd,
          approveMcps: policy.runtime.approveMcps,
        });
      }
      break;
    } catch (error) {
      lastError = error;
      if (runners.indexOf(runner) < runners.length - 1) {
        console.warn(`Runner '${runner}' failed, trying fallback: ${error.message}`);
      }
    }
  }

  if (!outcome) {
    throw lastError ?? new Error(`Failed to run ${phase}.`);
  }

  if (outcome.status === "error") {
    throw new Error(`${phase} run failed with status 'error'.`);
  }

  return {
    ...outcome,
    phase,
    model,
    durationMs: Date.now() - startedAt,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date().toISOString(),
  };
}
