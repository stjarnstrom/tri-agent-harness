import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyFile, cp, mkdir, symlink } from "node:fs/promises";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function installLintHarness(dir) {
  await mkdir(path.join(dir, "harness"), { recursive: true });
  await copyFile(
    path.join(ROOT, ".eslintrc.harness.cjs"),
    path.join(dir, ".eslintrc.harness.cjs"),
  );
  await copyFile(path.join(ROOT, "package.json"), path.join(dir, "package.json"));
  await cp(
    path.join(ROOT, "harness", "eslint-plugin-harness"),
    path.join(dir, "harness", "eslint-plugin-harness"),
    { recursive: true },
  );
  await symlink(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
}

export function leakedSecretSource({ typed = false } = {}) {
  const value = JSON.stringify("hunter22xx");
  const url = JSON.stringify("https://example.com/secret");
  const declaration = typed
    ? `const password: string = ${value};`
    : `const password = ${value};`;
  const lines = [declaration, "console.log(password);", `fetch(${url});`];
  if (typed) {
    lines.push("export function Widget() { return <span>{password}</span>; }");
  }
  return `${lines.join("\n")}\n`;
}

export function warningsOnlySource({ typed = false } = {}) {
  const calls = 'console.log("hi");\nfetch("https://example.com/ok");\n';
  if (!typed) {
    return calls;
  }
  return `const label: string = "hi";\n${calls}`;
}
