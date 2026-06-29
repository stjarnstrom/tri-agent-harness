# Three Agent Harness

Orchestration and guardrails in one harness: **Planner → Generator → Pre-QA Gate → Evaluator**, with hooks, lints, sandbox, and an anti-slop improvement loop.

This repo is a **harness scaffold**, not a finished application. You provide a product prompt; the harness creates `docs/` planning artifacts and application code sprint by sprint.

Built by merging:
- `_ref/cursor-claude-harness-main/` — three-agent sprint loop
- `_ref/agent-harness-main/` — professional dev environment constraints

## Architecture

```
Layer 3: Phase gates     pre-qa-gate.sh (lints, artifacts, secrets)
Layer 2: Orchestration   Planner → Generator ↔ Evaluator (sprint loop)
Layer 1: Environment     hooks, ESLint plugin, sandbox, review personas
```

**Environment defines the rails. Orchestration drives the train.**

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Git repo** | `git init` before setup — hooks install into `.git/hooks/` |
| **Bun or Node ≥ 20** | `bun install` preferred; `npm install` works as fallback |
| **Claude Code CLI** (`claude`) | For `./harness.sh` autonomous mode |
| **Cursor CLI** | For `./cursor-harness.sh` autonomous mode |
| **`.env.local`** | Copy from `.env.example`; never commit real secrets |

Optional:
- **gitleaks** — `brew install gitleaks` for full secret scan in pre-commit (regex fallback without it)
- **Playwright** — installed by the Generator when it scaffolds your app; required for Evaluator E2E testing

## Quick start

```bash
# 1. Initialize repo and install harness
git init
bun install && bun run setup
cp .env.example .env.local   # fill in values locally

# 2. Run autonomous build (pick one CLI)
./harness.sh "Build a project management tool with kanban boards"
# or
./cursor-harness.sh "Build a project management tool with kanban boards"

# 3. Resume after interruption — re-run the same command
./harness.sh "Build a project management tool with kanban boards"
```

The harness reads `docs/spec.md` and `docs/sprint-status.md` and resumes from the first sprint not in `Pass` state.

## Usage modes

Pick the mode that matches how much control you want. All modes share the same artifacts and state machine — see [`docs/runtime-contract.md`](docs/runtime-contract.md) for file ownership and mode switching.

### 1. Autonomous (recommended for hands-off builds)

Full loop with no human checkpoints (unless you set `HARNESS_PAUSE`):

```bash
./harness.sh "your product prompt"              # Claude Code
./cursor-harness.sh "your product prompt"       # Cursor CLI
./harness.sh "your product prompt" 5            # max 5 QA rounds per sprint
```

### 2. Interactive — Claude Code

Run one phase at a time using slash commands defined in [`.claude/commands/`](.claude/commands/):

| Command | Phase | When to use |
|---------|-------|-------------|
| `/plan` | Planner | Expand a prompt into spec + sprint plan |
| `/build` | Generator | Implement the current sprint |
| `/qa` | Evaluator | Test and grade the sprint marked `Ready for QA` |

Typical flow: `/plan "Build a kanban app"` → `/build` → `/qa` → repeat `/build` until all sprints pass.

Claude Code loads [`.claude/settings.json`](.claude/settings.json) for sandbox permissions. Agents also follow [`.cursorrules`](.cursorrules) and [`.cursor/rules/`](.cursor/rules/) when run in Cursor.

### 3. Interactive — Cursor Agent Manager

Generate a handoff prompt, then paste it into Cursor Agent Manager:

```bash
# Phase 1: Planning (requires product prompt)
scripts/cursor-plan.sh "Build a kanban app"

# Phase 2: Build (after planning artifacts exist)
scripts/cursor-build.sh
scripts/cursor-build.sh "fix checkout validation"   # optional extra context

# Phase 3: QA (after sprint status is Ready for QA)
scripts/cursor-qa.sh
```

Each script writes [`docs/cursor-handoff.md`](docs/cursor-handoff.md) listing required reads and expected outputs. Phase prompt templates live in [`cursor/prompts/`](cursor/prompts/).

To switch from Claude CLI to Cursor mid-run: stop after any completed phase, ensure `docs/sprint-status.md` is up to date, then run the matching `scripts/cursor-*.sh`. Details in [`docs/runtime-contract.md`](docs/runtime-contract.md#mode-switching-rules).

### 4. SDK orchestrator (bash-free option)

Alternative to shell loops; same artifacts, resumable state in `docs/workflow-handoff.json`:

```bash
# Full autonomous loop
npm run harness:sdk -- run-loop --prompt "Build X"

# Resume after interruption
npm run harness:sdk -- resume

# Single phases
npm run harness:sdk -- plan --prompt "Build X"
npm run harness:sdk -- build --sprint 1
npm run harness:sdk -- qa --sprint 1

# Inspect state without running agents
npm run harness:sdk -- status
npm run harness:sdk -- dry-run --prompt "Build X"
npm run harness:sdk -- validate --phase generator --sprint 1
```

Architecture and roadmap: [`docs/cursor-sdk-orchestrator-design.md`](docs/cursor-sdk-orchestrator-design.md).

## What happens during a run

1. **Planner** (once) — writes `docs/spec.md`, `docs/sprint-plan.md`, `docs/sprint-status.md`, updates `CLAUDE.md`
2. **Per sprint:**
   - **Generator** — writes sprint contract, implements scope, commits (pre-commit hook enforces lints/secrets)
   - **Pre-QA Gate** — mechanical checks via `scripts/pre-qa-gate.sh`; failures return to Generator without consuming a QA round
   - **Evaluator** — Playwright testing + rubric grading + review personas → `docs/qa-report-sprint-[N].md`
   - On **FAIL**: Generator fixes and retries (default max 3 rounds per sprint)
3. **Anti-slop** — QA failures logged to `.gc-cache/` for weekly guardrail review

Sprint status progression: `Not started` → `In progress` → `Ready for QA` → `Pass` or `Fail`.

## Documentation map

| If you want to… | Read |
|-----------------|------|
| Understand phase boundaries and file ownership | [`docs/runtime-contract.md`](docs/runtime-contract.md) |
| See agent sandbox, lint, and anti-slop rules | [`harness/AGENT-INSTRUCTIONS.md`](harness/AGENT-INSTRUCTIONS.md) |
| Customize Planner / Generator / Evaluator behavior | [`agents/planner.md`](agents/planner.md), [`agents/generator.md`](agents/generator.md), [`agents/evaluator.md`](agents/evaluator.md) |
| Change QA grading rubrics | [`agents/criteria/`](agents/criteria/) |
| Add security / frontend / reliability review checks | [`review-personas/`](review-personas/) |
| Adopt domain-scoped monorepo layout | [`harness/workspace-template.md`](harness/workspace-template.md) |
| Write sprint contracts | [`docs/templates/sprint-contract.md`](docs/templates/sprint-contract.md) |
| Extend lints, personas, or guardrails | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Understand SDK orchestrator internals | [`docs/cursor-sdk-orchestrator-design.md`](docs/cursor-sdk-orchestrator-design.md) |
| See stack defaults and project context | [`CLAUDE.md`](CLAUDE.md) |

## Extending the harness

The harness improves when recurring agent mistakes become permanent constraints — not repeated chat corrections.

**Two-strike rule:** same mistake twice → open a harness PR instead of fixing it manually again. Full workflow in [`CONTRIBUTING.md`](CONTRIBUTING.md).

| Extension point | Location | Best for |
|-----------------|----------|----------|
| **Lint rules** | `harness/eslint-plugin-harness/rules/` | Detectable patterns (imports, APIs, file size) — runs on every commit |
| **Review personas** | `review-personas/*.md` | Judgment-based checks (a11y, error handling, auth) — used by Evaluator |
| **Phase personas** | `agents/*.md` | How Planner / Generator / Evaluator think and write |
| **QA rubrics** | `agents/criteria/*.md` | Weighted grading criteria |
| **Pre-QA gate** | `scripts/pre-qa-gate.sh` | Mechanical checks before Evaluator runs |
| **Domain instructions** | `packages/<domain>/CLAUDE.md` | Package-specific rules in monorepo layout |
| **Workspace layout** | `harness/workspace-template.md` | Repo structure and package boundaries |

After adding guardrails:

```bash
bun lint:harness    # verify lint rules pass
npm test            # run harness unit tests (tests/*.test.mjs)
bun run setup       # verify hooks still install
```

Log friction as you hit it: append entries to `.gc-cache/weekly-report.jsonl`, then run `bun gc:weekly` in a Friday review.

## Key files

| Path | Purpose |
|------|---------|
| `harness.sh` | Autonomous loop via Claude Code CLI |
| `cursor-harness.sh` | Autonomous loop via Cursor CLI |
| `sdk-orchestrator/` | SDK-based orchestrator (alternative to bash loops) |
| `scripts/pre-qa-gate.sh` | Mechanical gate between Generator and Evaluator |
| `scripts/cursor-*.sh` | Cursor Agent Manager handoff generators |
| `.claude/commands/` | Claude Code slash commands (`/plan`, `/build`, `/qa`) |
| `cursor/prompts/` | Cursor phase prompt templates |
| `harness/AGENT-INSTRUCTIONS.md` | Universal agent rules |
| `agents/*.md` | Planner, Generator, Evaluator personas |
| `agents/criteria/*.md` | QA scoring rubrics |
| `review-personas/*.md` | Security, frontend, reliability checklists |
| `docs/runtime-contract.md` | File ownership and phase boundaries |
| `docs/templates/sprint-contract.md` | Sprint contract template |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HARNESS_MODEL` | `claude-opus-4-6` / `composer-2.5` | Model override |
| `HARNESS_ON_MAX_ROUNDS` | `halt` | `advance` to move on with known failures |
| `HARNESS_MAX_QA_ROUNDS` | `3` | Max Generator↔Evaluator retries per sprint |
| `HARNESS_PAUSE` | `off` | `sprint` = confirm before each sprint; `phase` = confirm before every agent |
| `HARNESS_YES` | `0` | Set to `1` to skip pause prompts (fully autonomous) |
| `HARNESS_MAX_SPRINTS_PER_RUN` | unlimited | Stop after N sprints; re-run same prompt to resume |
| `HARNESS_USAGE_CHECK` | `0` | Run `scripts/usage-check.sh` at sprint boundaries |
| `HARNESS_USAGE_CMD` | — | Custom probe; exit 1 when budget is low |
| `HARNESS_SANDBOX` | git root | Pre-commit filesystem boundary |

### Token / cost control

Neither Claude Code nor Cursor CLI expose remaining usage in a stable shell API. Use these patterns instead:

```bash
# Ask before each sprint (recommended)
HARNESS_PAUSE=sprint ./harness.sh "Build a kanban app"

# One sprint per run, then stop cleanly
HARNESS_MAX_SPRINTS_PER_RUN=1 ./harness.sh "Build a kanban app"

# Confirm before every Generator/Evaluator call
HARNESS_PAUSE=phase ./cursor-harness.sh "Build a kanban app"

# Custom usage probe (your script exits 1 when low)
HARNESS_USAGE_CHECK=1 HARNESS_USAGE_CMD='./my-usage-probe.sh' ./harness.sh "..."
```

At each checkpoint you can answer:
- `y` — continue
- `a` — continue all remaining sprints without asking again
- Enter / `n` — pause cleanly (state saved; re-run same command to resume)

## Guardrails

```bash
bun lint:harness          # ESLint rules with agent-prompt error messages
bun gc:weekly             # Review recurring failures → new rules
bun run setup             # Install pre-commit hook + .cursorignore
```

Pre-commit hook checks:
1. Filesystem sandbox (staged paths within project)
2. Harness lints on staged JS/TS
3. Blocks staging `.env` / credential files
4. Secret scan (gitleaks or regex fallback)

## Reference implementations

The `_ref/` directory contains the original separate harnesses for comparison. The combined harness at the repo root is the canonical version.
