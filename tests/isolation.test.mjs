import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  buildSandboxPlan,
  formatDockerRunArgs,
  loadIsolationPolicy,
  parseHarnessArgv,
  resolveIsolation,
  shouldSkipPermissions,
} from "../harness-runtime/isolation.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFile(path.join(ROOT, relPath), "utf8");
}

test("bare --sandbox means docker; flag wins over env", () => {
  assert.deepEqual(parseHarnessArgv(["--sandbox", "Build it", "5"]), {
    isolationFromFlag: "docker",
    positional: ["Build it", "5"],
  });
  assert.equal(
    resolveIsolation({ envValue: "claude", flagValue: "docker" }),
    "docker",
  );
  assert.equal(resolveIsolation({}), "off");
  assert.equal(resolveIsolation({ inner: true }), "docker");
});

test("unknown flags and invalid backends fail loudly", () => {
  assert.throws(() => parseHarnessArgv(["--nope", "prompt"]), /unknown flag/);
  assert.throws(() => resolveIsolation({ envValue: "yes" }), /off\|claude\|docker/);
});

test("claude isolation drops skip-permissions; off and docker keep it", () => {
  assert.equal(shouldSkipPermissions("off"), true);
  assert.equal(shouldSkipPermissions("docker"), true);
  assert.equal(shouldSkipPermissions("claude"), false);
});

test("sandbox plan remounts the TCB read-only and does not mount host home", async () => {
  const policy = await loadIsolationPolicy();
  const plan = buildSandboxPlan({ root: ROOT, isolation: "docker", policy });
  const args = formatDockerRunArgs(plan, { command: ["./harness.sh", "prompt"] });
  const joined = args.join(" ");

  assert.match(joined, /--shm-size=1g/);
  assert.match(joined, /HARNESS_SANDBOX_INNER=1/);
  assert.ok(plan.readOnlyBinds.some((bind) => bind.endsWith(`${path.sep}agents`)));
  assert.ok(plan.readOnlyBinds.some((bind) => bind.endsWith(`${path.sep}harness-runtime`)));
  assert.ok(plan.readOnlyBinds.some((bind) => bind.endsWith(`${path.sep}scripts`)));
  assert.ok(plan.readOnlyBinds.some((bind) => bind.includes(`${path.sep}.claude`)));
  assert.ok(args.some((item) => item.endsWith(":ro") && item.includes("agents")));
  assert.ok(!joined.includes(`${process.env.HOME}/.ssh`));
  assert.ok(!joined.includes(`${process.env.HOME}/.claude`));
  assert.ok(plan.envPass.includes("ANTHROPIC_API_KEY"));
  assert.ok(policy.network.allowedDomains.includes("pypi.org"));
});

test("settings.json allowlist stays aligned with isolation-policy.json", async () => {
  const policy = await loadIsolationPolicy();
  const settings = JSON.parse(await read(".claude/settings.json"));
  const fromSettings = settings.sandbox.network.allowedDomains;
  const fromPolicy = policy.network.allowedDomains;
  for (const domain of fromSettings) {
    assert.ok(fromPolicy.includes(domain), `policy missing settings domain ${domain}`);
  }
  for (const domain of fromPolicy) {
    assert.ok(fromSettings.includes(domain), `settings.json missing policy domain ${domain}`);
  }
});

test("README and HTML guide document the opt-in sandbox", async () => {
  const readme = await read("README.md");
  const guide = await read("docs/guide/index.html");
  const cheatsheet = await read("docs/CHEATSHEET.md");
  const agents = await read("AGENTS.md");

  for (const body of [readme, guide, cheatsheet, agents]) {
    assert.match(body, /--sandbox/);
    assert.match(body, /HARNESS_ISOLATION/);
  }
  assert.match(readme, /## Isolation \(optional\)/);
  assert.match(guide, /Optional: jail the cycle/);
});

test("harness.sh --sandbox without Docker/Podman fails with an install hint", async () => {
  const { stdout, stderr } = await execFileAsync(
    "bash",
    [path.join(ROOT, "harness.sh"), "--sandbox", "Build a kanban board"],
    { cwd: ROOT, env: { ...process.env, PATH: "/usr/bin:/bin" } },
  ).catch((error) => error);
  const text = `${stdout ?? ""}\n${stderr ?? ""}`;
  assert.match(text, /Docker or Podman is required/);
  assert.match(text, /--sandbox=claude/);
});

test("harness.sh --sandbox=yes is rejected before launch", async () => {
  const { stderr } = await execFileAsync(
    "bash",
    [path.join(ROOT, "harness.sh"), "--sandbox=yes", "prompt"],
    { cwd: ROOT },
  ).catch((error) => error);
  assert.match(stderr, /off\|claude\|docker/);
});

test("run-in-sandbox.sh --smoke --print-command runs the Playwright localhost proof", async () => {
  const { stdout } = await execFileAsync(
    "bash",
    [path.join(ROOT, "scripts", "run-in-sandbox.sh"), "--print-command", "--smoke"],
    { cwd: ROOT, env: { ...process.env, HARNESS_SANDBOX_ENGINE: "true" } },
  );
  assert.match(stdout, /sandbox-playwright-smoke\.mjs/);
  assert.match(stdout, /--shm-size=1g/);
});

test("run-in-sandbox.sh --print-command includes TCB mounts and shm", async () => {
  const { stdout } = await execFileAsync(
    "bash",
    [path.join(ROOT, "scripts", "run-in-sandbox.sh"), "--print-command", "--", "./harness.sh", "prompt"],
    { cwd: ROOT, env: { ...process.env, HARNESS_SANDBOX_ENGINE: "true" } },
  );
  assert.match(stdout, /--shm-size=1g/);
  assert.match(stdout, /HARNESS_SANDBOX_INNER=1/);
  assert.match(stdout, /agents:.*:ro/);
  assert.match(stdout, /git-wrapper\.sh/);
});

test("git wrapper blocks commit --no-verify and -n", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sandbox-git-"));
  const recorder = path.join(dir, "real-git");
  const log = path.join(dir, "log");
  await writeFile(
    recorder,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> "${log}"\n`,
    { mode: 0o755 },
  );
  await chmod(recorder, 0o755);
  const wrapper = path.join(ROOT, "harness", "sandbox", "git-wrapper.sh");

  const blocked = await execFileAsync("bash", [wrapper, "commit", "--no-verify", "-m", "x"], {
    env: { ...process.env, HARNESS_SANDBOX_REAL_GIT: recorder },
  }).catch((error) => error);
  assert.notEqual(blocked.code ?? 0, 0);
  assert.match(blocked.stderr, /--no-verify is blocked/);

  const blockedShort = await execFileAsync("bash", [wrapper, "commit", "-n", "-m", "x"], {
    env: { ...process.env, HARNESS_SANDBOX_REAL_GIT: recorder },
  }).catch((error) => error);
  assert.notEqual(blockedShort.code ?? 0, 0);

  await execFileAsync("bash", [wrapper, "status"], {
    env: { ...process.env, HARNESS_SANDBOX_REAL_GIT: recorder },
  });
  const recorded = await readFile(log, "utf8");
  assert.match(recorded, /^status$/m);
});

test("localhost smoke server is reachable", async () => {
  const { stdout } = await execFileAsync(
    "node",
    [path.join(ROOT, "scripts", "sandbox-playwright-smoke.mjs")],
    { cwd: ROOT, env: { ...process.env, HARNESS_SANDBOX_SMOKE_FETCH_ONLY: "1" } },
  );
  assert.match(stdout, /fetch smoke passed http:\/\/127\.0\.0\.1:/);
});
