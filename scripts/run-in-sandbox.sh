#!/usr/bin/env bash
# Re-exec a command (normally ./harness.sh) inside the Docker/Podman jail.
#
# Usage:
#   ./scripts/run-in-sandbox.sh [--print-command] [--smoke] -- ./harness.sh "prompt" [rounds]
#
# Requires docker or podman. Bare --sandbox maps here.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRINT_COMMAND=0
SMOKE=0
CMD=()

while [ $# -gt 0 ]; do
  case "$1" in
    --print-command)
      PRINT_COMMAND=1
      shift
      ;;
    --smoke)
      SMOKE=1
      shift
      ;;
    --)
      shift
      CMD=("$@")
      break
      ;;
    --*)
      echo "ERROR: unknown flag '$1' (supported: --print-command, --smoke)" >&2
      exit 1
      ;;
    *)
      CMD=("$@")
      break
      ;;
  esac
done

if [ ${#CMD[@]} -eq 0 ]; then
  CMD=("$ROOT/harness.sh")
fi

find_engine() {
  # HARNESS_SANDBOX_ENGINE=none forces the missing-engine path (tests, or a
  # host that has docker but should not use it).
  if [ "${HARNESS_SANDBOX_ENGINE:-}" = "none" ]; then
    :
  elif [ -n "${HARNESS_SANDBOX_ENGINE:-}" ]; then
    if command -v "$HARNESS_SANDBOX_ENGINE" >/dev/null 2>&1; then
      echo "$HARNESS_SANDBOX_ENGINE"
      return 0
    fi
    echo "ERROR: HARNESS_SANDBOX_ENGINE=$HARNESS_SANDBOX_ENGINE is not on PATH." >&2
    return 1
  elif command -v docker >/dev/null 2>&1; then
    echo docker
    return 0
  elif command -v podman >/dev/null 2>&1; then
    echo podman
    return 0
  fi
  echo "ERROR: Docker or Podman is required for HARNESS_ISOLATION=docker / --sandbox." >&2
  echo "  Install Docker: https://docs.docker.com/get-docker/" >&2
  echo "  Or Podman:      https://podman.io/docs/installation" >&2
  echo "  Lighter option: ./harness.sh --sandbox=claude   (Claude Code sandbox, no container)" >&2
  return 1
}

ENGINE="$(find_engine)" || exit 1

if [ "$SMOKE" = "1" ]; then
  CMD=(node "$ROOT/scripts/sandbox-playwright-smoke.mjs")
fi

PLAN_JSON="$(node "$ROOT/harness-runtime/isolation.mjs" plan --root "$ROOT")"
IMAGE="$(node -e "const p=JSON.parse(process.argv[1]); process.stdout.write(p.image)" "$PLAN_JSON")"
DOCKERFILE="$ROOT/$(node -e "const p=JSON.parse(process.argv[1]); process.stdout.write(p.dockerfile)" "$PLAN_JSON")"
SHM="$(node -e "const p=JSON.parse(process.argv[1]); process.stdout.write(p.shmSize)" "$PLAN_JSON")"

RUN_ARGS=(
  run --rm --init
  --shm-size="$SHM"
  -w "$ROOT"
  -v "$ROOT:$ROOT"
  -e HARNESS_SANDBOX_INNER=1
  -e HARNESS_ISOLATION=docker
  -e "HARNESS_SANDBOX_REAL_GIT=${HARNESS_SANDBOX_REAL_GIT:-/usr/bin/git}"
  -e "PATH=$ROOT/harness/sandbox/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
)

# Pass through every harness env knob the inner process may need.
for name in \
  ANTHROPIC_API_KEY \
  HARNESS_MODEL HARNESS_PLANNER_MODEL HARNESS_GENERATOR_MODEL \
  HARNESS_EVALUATOR_MODEL HARNESS_RETRO_MODEL \
  HARNESS_PAUSE HARNESS_YES HARNESS_MAX_SPRINTS_PER_RUN \
  HARNESS_ON_MAX_ROUNDS HARNESS_RETRO HARNESS_PREFLIGHT \
  HARNESS_MAX_QA_ROUNDS HARNESS_USAGE_CHECK HARNESS_USAGE_CMD
do
  RUN_ARGS+=(-e "$name")
done

while IFS= read -r bind; do
  [ -n "$bind" ] || continue
  [ -e "$bind" ] || continue
  RUN_ARGS+=(-v "$bind:$bind:ro")
done < <(node -e "const p=JSON.parse(process.argv[1]); for (const b of p.readOnlyBinds) process.stdout.write(b+'\n')" "$PLAN_JSON")

while IFS= read -r bind; do
  [ -n "$bind" ] || continue
  if [ ! -e "$bind" ]; then
    mkdir -p "$(dirname "$bind")"
    : > "$bind"
  fi
  RUN_ARGS+=(-v "$bind:$bind")
done < <(node -e "const p=JSON.parse(process.argv[1]); for (const b of p.writableOverlays) process.stdout.write(b+'\n')" "$PLAN_JSON")

GIT_WRAPPER="$ROOT/harness/sandbox/git-wrapper.sh"
RUN_ARGS+=(-v "$GIT_WRAPPER:$ROOT/harness/sandbox/bin/git:ro")

if [ -t 0 ] && [ -t 1 ]; then
  RUN_ARGS+=(-it)
fi

RUN_ARGS+=("$IMAGE")
RUN_ARGS+=("${CMD[@]}")

if [ "$PRINT_COMMAND" = "1" ]; then
  printf '%q ' "$ENGINE" "${RUN_ARGS[@]}"
  printf '\n'
  exit 0
fi

if ! "$ENGINE" image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "▶ Building sandbox image $IMAGE (first run)..."
  "$ENGINE" build -t "$IMAGE" -f "$DOCKERFILE" "$ROOT/harness/sandbox"
fi

echo "▶ Isolation: docker ($ENGINE)"
echo "  TCB paths are read-only. Host home / SSH / Claude creds are not mounted."
exec "$ENGINE" "${RUN_ARGS[@]}"
