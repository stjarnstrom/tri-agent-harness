#!/usr/bin/env bash
# Blocks `git commit --no-verify` / `git commit -n` inside the harness jail.
# The real git binary is HARNESS_SANDBOX_REAL_GIT (default /usr/bin/git).

set -euo pipefail

REAL_GIT="${HARNESS_SANDBOX_REAL_GIT:-/usr/bin/git}"

is_commit=0
for arg in "$@"; do
  if [ "$arg" = "commit" ]; then
    is_commit=1
    continue
  fi
  if [ "$is_commit" = "1" ] && { [ "$arg" = "--no-verify" ] || [ "$arg" = "-n" ]; }; then
    echo "ERROR [harness-sandbox]: git commit --no-verify is blocked inside the sandbox." >&2
    echo "  The pre-commit hook is part of the trusted computing base." >&2
    exit 1
  fi
done

exec "$REAL_GIT" "$@"
