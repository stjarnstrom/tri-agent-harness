#!/usr/bin/env node
// floor-guard.mjs — diff-scoped bar for the pre-QA gate.
//
// Agents take the cheapest road to a green check. This looks at the sprint
// diff for new suppressions, skipped or deleted tests, stubs, stripped
// assertions, and a CONSTRAINTS.md threshold that moved the wrong way.
// It also checks that an app sprint's contract names real test files and
// cites stack APIs (or marks them unverified).

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkContractEvidence, compareConstraints, truncate } from "./floor-constraints.mjs";

export { checkContractEvidence, compareConstraints };

const TEST_PATH =
  /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$|[^/]+_test\.py$|\/test_[^/]+\.py$/;

const ADDED_RULES = [
  { name: "suppression", pattern: /@ts-ignore\b|@ts-expect-error\b|@ts-nocheck\b|eslint-disable|istanbul ignore|\bc8 ignore\b|v8 ignore|nosemgrep|gitleaks:allow|#\s*noqa\b|#\s*type:\s*ignore|#\s*pyright:\s*ignore/ },
  { name: "skipped test", pattern: /\b(?:it|test|describe)\.(?:skip|todo)\b|\bxit\s*\(|\bxtest\s*\(|\bxdescribe\s*\(|pytest\.mark\.skip/ },
  { name: "stub", pattern: /not implemented|unimplemented|throw new Error\(\s*["']TODO/i },
  { name: "empty catch", pattern: /catch\s*(\([^)]*\))?\s*\{\s*\}/ },
];

const ASSERTION = /^\s*(?:expect|assert)\s*\(|\bassert[A-Z]\w*\s*\(/;

function isIgnoredPath(filePath) {
  return /(^|\/)(node_modules|dist|build|coverage|\.next)(\/|$)/.test(filePath);
}

export function isTestPath(filePath) {
  return TEST_PATH.test(filePath);
}

export function splitUnifiedDiff(diffText) {
  const files = [];
  let current = null;
  for (const line of diffText.split("\n")) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (header) {
      const oldPath = header[1];
      const newPath = header[2] === "dev/null" ? oldPath : header[2];
      current = { path: newPath, added: [], removed: [], deleted: false };
      files.push(current);
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.deleted = true;
    }
    if (line.startsWith("rename to ")) {
      current.path = line.slice("rename to ".length);
      current.deleted = false;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.added.push(line.slice(1));
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.removed.push(line.slice(1));
    }
  }
  return files;
}

export function inspectUnifiedDiff(diffText) {
  const findings = [];
  for (const file of splitUnifiedDiff(diffText)) {
    if (isIgnoredPath(file.path)) {
      continue;
    }
    if (file.deleted && isTestPath(file.path)) {
      findings.push(`floor: deleted test file ${file.path}`);
    }
    for (const line of file.added) {
      for (const rule of ADDED_RULES) {
        if (rule.pattern.test(line)) {
          findings.push(`floor: ${rule.name} added in ${file.path}: ${truncate(line)}`);
        }
      }
    }
    if (isTestPath(file.path) && !file.deleted) {
      const removed = file.removed.filter((line) => ASSERTION.test(line)).length;
      const added = file.added.filter((line) => ASSERTION.test(line)).length;
      if (removed > added) {
        findings.push(
          `floor: assertions removed from ${file.path} (removed ${removed}, added ${added})`,
        );
      }
    }
  }
  return findings;
}

function git(cwd, args, input = null) {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout, stderr });
    });
    child.on("error", () => {
      resolve({ ok: false, stdout: "", stderr: "" });
    });
    child.stdin.end(input ?? undefined);
  });
}

async function collectDiffFindings(root) {
  const inside = await git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return [];
  }

  const pathspec = [
    "--",
    "app",
    "CONSTRAINTS.md",
    ":(exclude)app/node_modules",
    ":(exclude)app/dist",
    ":(exclude)app/build",
    ":(exclude)app/coverage",
  ];
  const chunks = [];
  const head = await git(root, ["rev-parse", "--verify", "HEAD"]);
  if (head.ok) {
    let base = null;
    for (const ref of ["origin/main", "origin/master", "main", "master"]) {
      const merged = await git(root, ["merge-base", "HEAD", ref]);
      if (merged.ok && merged.stdout.trim() && merged.stdout.trim() !== head.stdout.trim()) {
        base = merged.stdout.trim();
        break;
      }
    }
    if (base) {
      const ranged = await git(root, ["diff", "-M", "--unified=3", base, "HEAD", ...pathspec]);
      if (ranged.stdout) {
        chunks.push(ranged.stdout);
      }
    } else {
      const empty = await git(root, ["hash-object", "-t", "tree", "--stdin"], "");
      if (empty.ok && empty.stdout.trim()) {
        const ranged = await git(root, [
          "diff",
          "-M",
          "--unified=3",
          empty.stdout.trim(),
          "HEAD",
          ...pathspec,
        ]);
        if (ranged.stdout) {
          chunks.push(ranged.stdout);
        }
      }
    }

    const before = await git(root, ["show", `${base ?? "HEAD"}:CONSTRAINTS.md`]);
    let after = "";
    try {
      after = await readFile(path.join(root, "CONSTRAINTS.md"), "utf8");
    } catch {
      after = "";
    }
    // On the default branch, base is null and HEAD already includes the
    // current file. Compare against the parent when one exists so a loosened
    // threshold in the latest commit is visible; otherwise the empty-tree
    // diff above already treats a brand-new file as an addition, not a loosening.
    let previousText = "";
    if (base) {
      previousText = before.ok ? before.stdout : "";
    } else {
      const parent = await git(root, ["show", "HEAD~1:CONSTRAINTS.md"]);
      previousText = parent.ok ? parent.stdout : "";
    }
    const constraintFindings = compareConstraints(previousText, after);
    const diffFindings = await diffChunks(root, pathspec, chunks);
    return [...new Set([...diffFindings, ...constraintFindings])];
  }

  return diffChunks(root, pathspec, []);
}

async function diffChunks(root, pathspec, chunks) {
  const worktree = await git(root, ["diff", "-M", "--unified=3", ...pathspec]);
  const staged = await git(root, ["diff", "-M", "--cached", "--unified=3", ...pathspec]);
  const untracked = await untrackedDiff(root);
  const all = [...chunks, worktree.stdout, staged.stdout, untracked].filter((chunk) => chunk && chunk.trim());
  return all.flatMap((chunk) => inspectUnifiedDiff(chunk));
}

async function untrackedDiff(root) {
  const listed = await git(root, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    "app",
    "CONSTRAINTS.md",
  ]);
  if (!listed.stdout.trim()) {
    return "";
  }
  const parts = [];
  for (const rel of listed.stdout.split("\n").map((line) => line.trim()).filter(Boolean)) {
    if (isIgnoredPath(rel)) {
      continue;
    }
    const shown = await git(root, ["diff", "--no-index", "--unified=3", "/dev/null", rel]);
    if (shown.stdout) {
      parts.push(shown.stdout);
    }
  }
  return parts.join("\n");
}

export async function runFloorGuard(root, sprint) {
  const diffFindings = await collectDiffFindings(root);
  const contractFindings = await checkContractEvidence(root, sprint);
  return [...diffFindings, ...contractFindings];
}

async function main() {
  const args = process.argv.slice(2);
  const sprintIndex = args.indexOf("--sprint");
  const sprint = sprintIndex >= 0 ? Number(args[sprintIndex + 1]) : NaN;
  if (!Number.isInteger(sprint) || sprint < 1) {
    process.stderr.write("Usage: node scripts/floor-guard.mjs --sprint <N>\n");
    process.exit(2);
  }
  const root = process.cwd();
  const findings = await runFloorGuard(root, sprint);
  if (findings.length === 0) {
    process.exit(0);
  }
  process.stdout.write(`${findings.join("\n")}\n`);
  process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`floor-guard: ${error.message}\n`);
    process.exit(1);
  });
}
