#!/usr/bin/env bash
# Install harness git hooks and dependencies into the current repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# `[ -d .git ]` is false in git worktrees (.git is a file there); resolve the
# real hooks directory through git instead.
if ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  echo "ERROR: Not a git repository. Run 'git init' first." >&2
  exit 1
fi

HOOKS_DIR="$(git -C "$ROOT" rev-parse --git-path hooks)"
case "$HOOKS_DIR" in
  /*) ;;
  *) HOOKS_DIR="$ROOT/$HOOKS_DIR" ;;
esac

mkdir -p "$HOOKS_DIR"

for hook in pre-commit post-merge; do
  src="$ROOT/harness/hooks/$hook"
  dest="$HOOKS_DIR/$hook"
  cp "$src" "$dest"
  chmod +x "$dest"
  echo "Installed $hook → $dest"
done

# Canonical skills live in `.agents/skills/` (Agent Skills open standard).
# Claude Code only scans `.claude/skills/`, so that path is a symlink.
# Git on Windows with `core.symlinks=false` checks the link out as a text file.
ensure_claude_skills_symlink() {
  local canonical=".agents/skills"
  local adapter=".claude/skills"
  cd "$ROOT"
  if [[ ! -d "$canonical" ]]; then
    return 0
  fi
  if [[ -L "$adapter" ]]; then
    return 0
  fi
  if [[ -d "$adapter" ]]; then
    echo "WARNING: $adapter is a real directory; expected a symlink to $canonical" >&2
    return 0
  fi
  rm -f "$adapter"
  ln -s "../$canonical" "$adapter"
  echo "Linked $adapter → $canonical"
}

ensure_claude_skills_symlink

echo ""
echo "Installing dependencies..."
cd "$ROOT"
if command -v bun >/dev/null 2>&1; then
  bun install
else
  npm install
fi

echo ""
echo "Combined harness installed. Next steps:"
echo "  1. Run 'bun lint:harness' to verify lint rules work"
echo "  2. Copy .env.example → .env.local and fill in real values (never commit .env.local)"
echo "  3. Optional: brew install gitleaks — enables full secret scan in pre-commit"
echo "  4. Read harness/AGENT-INSTRUCTIONS.md and docs/runtime-contract.md"
echo "  5. Run autonomous build: ./harness.sh \"your product prompt\""
