import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_POLICY_PATH = path.join(HERE, "..", "harness", "isolation-policy.json");

export const ISOLATION_BACKENDS = ["off", "claude", "docker"];

export async function loadIsolationPolicy(policyPath = DEFAULT_POLICY_PATH) {
  const raw = await readFile(policyPath, "utf8");
  const policy = JSON.parse(raw);
  if (!Array.isArray(policy.backends) || policy.backends.length === 0) {
    throw new Error("isolation policy is missing backends[]");
  }
  return policy;
}

export function parseIsolationFlag(token) {
  if (token === "--sandbox") {
    return { isolation: "docker" };
  }
  if (token.startsWith("--sandbox=")) {
    const isolation = token.slice("--sandbox=".length).trim();
    if (!isolation) {
      throw new Error("--sandbox= requires a backend (docker or claude)");
    }
    return { isolation };
  }
  return null;
}

export function parseHarnessArgv(argv) {
  const positional = [];
  let isolationFromFlag;

  for (const token of argv) {
    if (token === "--") {
      continue;
    }
    const parsed = parseIsolationFlag(token);
    if (parsed) {
      isolationFromFlag = parsed.isolation;
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`unknown flag '${token}' (supported: --sandbox, --sandbox=docker|claude)`);
    }
    positional.push(token);
  }

  return { isolationFromFlag, positional };
}

export function resolveIsolation({
  envValue,
  flagValue,
  inner = false,
  defaultBackend = "off",
} = {}) {
  if (inner) {
    return "docker";
  }
  const raw = flagValue ?? envValue ?? defaultBackend;
  const value = String(raw).trim() || defaultBackend;
  if (!ISOLATION_BACKENDS.includes(value)) {
    throw new Error(`HARNESS_ISOLATION must be off|claude|docker, got '${value}'`);
  }
  return value;
}

export function shouldSkipPermissions(isolation) {
  return isolation !== "claude";
}

export function buildSandboxPlan({
  root,
  isolation,
  policy,
  inner = false,
} = {}) {
  const resolved = resolveIsolation({ envValue: isolation, inner });
  const docker = policy.docker ?? {};
  const tcb = policy.tcbReadOnly ?? [];
  const writable = policy.writable ?? [];
  const passEnv = policy.credentials?.passEnv ?? ["ANTHROPIC_API_KEY"];

  return {
    isolation: resolved,
    skipPermissions: shouldSkipPermissions(resolved),
    image: docker.image ?? "harness-sandbox:local",
    dockerfile: docker.dockerfile ?? "harness/sandbox/Dockerfile",
    shmSize: docker.shmSize ?? "1g",
    workdir: root,
    envPass: passEnv,
    neverMount: policy.credentials?.neverMount ?? [],
    allowedDomains: policy.network?.allowedDomains ?? [],
    allowLocalBinding: policy.network?.allowLocalBinding !== false,
    readOnlyBinds: tcb.map((rel) => path.join(root, rel)),
    writableOverlays: writable
      .filter((rel) => rel.startsWith("harness/"))
      .map((rel) => path.join(root, rel)),
    gitWrapper: path.join(root, "harness", "sandbox", "git-wrapper.sh"),
  };
}

export function formatDockerRunArgs(plan, { command = ["./harness.sh"] } = {}) {
  const args = [
    "run",
    "--rm",
    "--init",
    `--shm-size=${plan.shmSize}`,
    "-w",
    plan.workdir,
    "-v",
    `${plan.workdir}:${plan.workdir}`,
    "-e",
    "HARNESS_SANDBOX_INNER=1",
    "-e",
    "HARNESS_ISOLATION=docker",
    "-e",
    `HARNESS_SANDBOX_REAL_GIT=${process.env.HARNESS_SANDBOX_REAL_GIT || "/usr/bin/git"}`,
    "-e",
    `PATH=${path.join(plan.workdir, "harness", "sandbox", "bin")}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
  ];

  for (const name of plan.envPass) {
    args.push("-e", name);
  }
  for (const bind of plan.readOnlyBinds) {
    args.push("-v", `${bind}:${bind}:ro`);
  }
  for (const bind of plan.writableOverlays) {
    args.push("-v", `${bind}:${bind}`);
  }
  args.push(
    "-v",
    `${plan.gitWrapper}:${path.join(plan.workdir, "harness", "sandbox", "bin", "git")}:ro`,
  );
  args.push(plan.image, ...command);
  return args;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(argv) {
  const command = argv[0] ?? "resolve";
  const rest = argv.slice(1);

  if (command === "resolve") {
    const parsed = parseHarnessArgv(rest);
    const isolation = resolveIsolation({
      envValue: process.env.HARNESS_ISOLATION,
      flagValue: parsed.isolationFromFlag,
      inner: process.env.HARNESS_SANDBOX_INNER === "1",
    });
    printJson({ isolation, positional: parsed.positional, skipPermissions: shouldSkipPermissions(isolation) });
    return;
  }

  if (command === "parse") {
    printJson(parseHarnessArgv(rest));
    return;
  }

  if (command === "plan") {
    let root = process.cwd();
    const leftover = [];
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === "--root") {
        root = rest[i + 1];
        i += 1;
        continue;
      }
      leftover.push(rest[i]);
    }
    const policy = await loadIsolationPolicy();
    const parsed = parseHarnessArgv(leftover);
    const isolation = resolveIsolation({
      envValue: process.env.HARNESS_ISOLATION,
      flagValue: parsed.isolationFromFlag,
      inner: process.env.HARNESS_SANDBOX_INNER === "1",
    });
    const plan = buildSandboxPlan({ root, isolation, policy });
    printJson({ ...plan, dockerArgs: formatDockerRunArgs(plan, { command: parsed.positional }) });
    return;
  }

  throw new Error(`unknown isolation command '${command}'`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exit(1);
  });
}
