# Advanced runners

The **canonical** harness path is Claude Code at the repo root:

```bash
./harness.sh "your product prompt"
```

Everything in this directory is optional. Same `docs/` artifacts and sprint
state machine — **not** full feature parity. Prefer `./harness.sh` for
greenfield products unless you already live in Cursor or OpenCode.

## Parity

| Capability | `./harness.sh` (Claude) | `./runners/cursor-harness.sh` | `./runners/opencode-harness.sh` | SDK (`npm run harness:sdk`) |
|------------|-------------------------|-------------------------------|----------------------------------|-----------------------------|
| Planner → Generator → Pre-QA → Evaluator | Yes | Yes | Yes | Yes |
| Retrospector / lessons loop | Yes | No | No | No |
| Model policy (Fable + Sonnet) | Yes | Own defaults (`composer-2.5`) | Own defaults (Anthropic Sonnet) | Config-driven |
| Interactive slash commands | Yes (`/plan` `/build` `/qa`) | Handoff scripts below | — | Phase CLIs |
| Artifact watchdog (hung CLI) | N/A | Yes (default on) | Yes (default on) | N/A |

**Pick one runner and stay with it.** Switching mid-project mostly works via
`docs/sprint-status.md`, but QA-round counting restarts on every resume.

## Autonomous runners

```bash
./runners/cursor-harness.sh "Build a kanban app"
./runners/opencode-harness.sh "Build a kanban app"
```

Root stubs `./cursor-harness.sh` and `./opencode-harness.sh` still work; they
print a move notice and exec these scripts.

## Cursor interactive handoffs

Generate a handoff prompt, then paste into Cursor Agent Manager:

```bash
./runners/cursor/plan.sh "Build a kanban app"
./runners/cursor/build.sh
./runners/cursor/qa.sh
```

Phase prompt templates: `runners/cursor/prompts/`. Compatibility stubs remain
at `scripts/cursor-*.sh`.

## SDK orchestrator

Bash-free alternative; lives at repo root (`sdk-orchestrator/`), not under
`runners/`, because the shell loops also call it for validation and handoff
writes.

```bash
npm run harness:sdk -- run-loop --prompt "Build X"
npm run harness:sdk -- resume
npm run harness:sdk -- status
```

Design notes: [`docs/cursor-sdk-orchestrator-design.md`](../docs/cursor-sdk-orchestrator-design.md).

## When to use what

- **New product / template user** → `./harness.sh` only
- **Team already on Cursor CLI** → `./runners/cursor-harness.sh` (accept missing Retrospector)
- **OpenCode** → `./runners/opencode-harness.sh` (same caveats)
- **Integrating the loop into another process** → SDK orchestrator
