# Three Agent Harness

Orchestration and guardrails in one harness: **Planner → Generator → Pre-QA Gate → Evaluator**, with hooks, lints, sandbox, and an anti-slop improvement loop.

This repo is a **harness scaffold**, not a finished application. You provide a product prompt; the harness creates `docs/` planning artifacts and application code sprint by sprint.

> **Claude Code only?** See the [`examples/claude-only`](examples/claude-only) branch for a stripped-down teaching example without Cursor, OpenCode, or SDK paths.

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
| **OpenCode CLI** (`opencode`) | For `./opencode-harness.sh` autonomous mode |
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
# or
./opencode-harness.sh "Build a project management tool with kanban boards"

# 3. Resume after interruption — re-run the same command
./harness.sh "Build a project management tool with kanban boards"
```

The harness reads `docs/spec.md` and `docs/sprint-status.md` and resumes from the first sprint not in terminal `Pass` or `Skipped` state.

## Usage modes

Pick the mode that matches how much control you want. All modes share the same artifacts and state machine — see [`docs/runtime-contract.md`](docs/runtime-contract.md) for file ownership and mode switching.

### 1. Autonomous (recommended for hands-off builds)

Full loop with no human checkpoints (unless you set `HARNESS_PAUSE`):

```bash
./harness.sh "your product prompt"              # Claude Code
./cursor-harness.sh "your product prompt"       # Cursor CLI
./opencode-harness.sh "your product prompt"     # OpenCode CLI
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

High-level flow:

1. **Planner** (once) — product spec and sprint plan
2. **Per sprint:** Generator → Pre-QA Gate → Evaluator (retry loop on failure)
3. **Anti-slop** — QA failures logged to `.gc-cache/` for weekly guardrail review

Sprint status progression: `Not started` → `In progress` → `Ready for QA` → `Pass` or `Fail` (or `Skipped` when advancing after max QA rounds).

### Phase guide — what each step does

| Phase | Who runs it | What it does | Key outputs |
|-------|-------------|--------------|-------------|
| **Planner** | AI agent (once) | Reads your prompt + criteria; defines product vision, design language, sprint breakdown | `docs/spec.md`, `docs/sprint-plan.md`, `docs/sprint-status.md`, `CLAUDE.md` |
| **Generator** | AI agent (per sprint, per retry) | Writes sprint contract, implements features, commits, self-evaluates | `docs/sprint-[N]-contract.md`, app source, git commits, status → `Ready for QA` |
| **Pre-QA Gate** | Shell script (not an agent) | Mechanical checks: artifacts, lints, build, `test:unit`, `test:e2e`, secrets | `docs/mechanical-checks-sprint-[N].md` (`PASS` or `FAIL`) |
| **Evaluator** | AI agent (per sprint, per retry) | Live app testing (Playwright), rubric grading, review personas, QA report | `docs/qa-report-sprint-[N].md`, status → `Pass` or `Fail` |

On **FAIL**, the Generator fixes issues and retries (default max 3 QA rounds per sprint). On **PASS**, the harness moves to the next sprint.

### Design input (optional)

Steer visual direction before the Planner runs:

```bash
cp docs/templates/design-brief.md design/brief.md
# Edit brief.md; add mood images to design/references/
./harness.sh "Build a kanban app for film editors"
```

When `design/` is empty, the Planner writes three options to `docs/design-options.md` and the harness pauses. Pick one:

```bash
echo "Option B — Momentum Dark. Prefer amber accents." > design/selected-direction.md
./harness.sh "Build a kanban app for film editors"   # same prompt — finalize + build
```

See [`design/README.md`](design/README.md) and [`docs/templates/design-brief.md`](docs/templates/design-brief.md).

#### Planner

- Expands your one-line prompt into a full spec (features, design language, stack, AI integration).
- Initializes all sprints as `Not started` in `docs/sprint-status.md`.
- **Terminal:** prints `▶ PHASE 1: PLANNER`, then may go quiet while Claude/Cursor runs (no streaming progress).

#### Generator

- Writes `docs/sprint-[N]-contract.md` (acceptance criteria the Evaluator will test against).
- In **autonomous mode**, implements immediately — no waiting for contract approval.
- Scaffolds or extends the app (`src/`, Playwright, `test:unit`, `test:e2e` — see [`docs/templates/app-package-scripts.md`](docs/templates/app-package-scripts.md)).
- Runs `bun lint:harness`, commits via pre-commit hook, marks sprint `Ready for QA`.
- **Terminal:** prints `▶ GENERATOR (Sprint N, Round M)`; quiet during agent work; file changes appear in the repo.

#### Pre-QA Gate

- Runs **deterministic scripts** — you get verbose output (build, typecheck, tests).
- Blocks Evaluator if anything fails; sends work back to Generator **without consuming a QA round**.
- Checks include: contract + status, harness lints, generator self-eval, `npm run build`, `test:unit`, `test:e2e` (never `test:harness`).
- **Terminal:** prints `=== Pre-QA Gate (Sprint N) ===` and step-by-step results; ends with `✓ Pre-QA gate PASSED` or failure list.

#### Evaluator

- Reads spec, contract, mechanical checks, criteria, and review personas.
- Starts or confirms `npm run dev`, then tests the **live app** via Playwright (navigate, click, forms, edge cases, screenshots).
- Grades six weighted criteria; writes a detailed QA report; updates sprint status.
- **Terminal:** prints `▶ EVALUATOR (Sprint N, Round M)`, then often **goes quiet for a long time** — this is normal (see below).

### What to expect in the terminal

| Phase | Output style | If it looks "stuck" |
|-------|--------------|---------------------|
| Planner / Generator / Evaluator | **Mostly silent** while the AI agent runs (`claude -p` / `cursor agent` / `opencode run` do not stream tool steps to the shell) | Watch for new files in `docs/`; `cursor-harness.sh` and `opencode-harness.sh` auto-stop when phase artifacts are complete |
| Pre-QA Gate | **Verbose** — each check prints pass/fail | Fails fast with a clear error list |

**CLI hang after Evaluator:** `cursor agent` and `opencode run` sometimes finish writing
`docs/qa-report-sprint-[N].md` but never exit (MCP/dev child processes stay
alive). `cursor-harness.sh` and `opencode-harness.sh` run an **artifact watchdog** (on by default) that
polls for canonical phase outputs and stops the agent process group when they
are stable. You will see `▶ Agent watchdog: phase artifacts complete` in the
terminal, then the harness continues to the next sprint.

```bash
# Tune or disable (defaults shown)
HARNESS_AGENT_WATCHDOG=1          # set 0 to wait for the CLI agent to exit on its own
HARNESS_AGENT_POLL_SEC=15         # seconds between artifact checks
HARNESS_AGENT_STABLE_POLLS=2      # consecutive ready polls before stopping agent
HARNESS_PHASE_TIMEOUT=7200        # wall-clock seconds per agent run (0 = no limit)
```

### Typical duration (rough)

Depends on prompt size, model, and app complexity. First sprint is usually the longest.

| Phase | Ballpark | Why |
|-------|----------|-----|
| Planner | 5–15 min | Large spec + many sprints to plan |
| Generator | 10–30+ min | Scaffolding app + first features + commits |
| Pre-QA Gate | 1–5 min | Deterministic build/tests |
| Evaluator | **15–45+ min** | Many Playwright MCP round-trips, rubric scoring, long QA report |

The Evaluator is slowest because it is instructed to **exercise every acceptance criterion**, test edge cases, screenshot screens, check the console, score six criteria, and write a formal report — not because the shell script is hanging.

### Artifacts to watch during a run

```
docs/spec.md                          ← Planner done
docs/sprint-plan.md
docs/sprint-status.md                 ← source of truth for resume
docs/sprint-[N]-contract.md           ← Generator scoped the sprint
docs/mechanical-checks-sprint-[N].md  ← Pre-QA gate result
docs/qa-report-sprint-[N].md          ← Evaluator done
docs/workflow-handoff.json            ← cross-runner resume metadata
```

Check progress without stopping the run:

```bash
ls -lt docs/
pgrep -fl 'harness|claude|cursor|opencode'    # process still alive?
```

### Dogfood without polluting the harness template

Copy this repo to a sibling folder before your first full run — the loop creates app code and product docs in the same tree:

```bash
cp -R agent-harness-loops ../my-product-dogfood
cd ../my-product-dogfood && rm -rf .git _ref && git init && bun install && bun run setup
```

Re-run the same harness command to resume; state lives in `docs/sprint-status.md`.

## Documentation map

| If you want to… | Read |
|-----------------|------|
| Understand what each phase does and how long it takes | [What happens during a run](#what-happens-during-a-run) (this README) |
| Understand phase boundaries and file ownership | [`docs/runtime-contract.md`](docs/runtime-contract.md) |
| See agent sandbox, lint, and anti-slop rules | [`harness/AGENT-INSTRUCTIONS.md`](harness/AGENT-INSTRUCTIONS.md) |
| Customize Planner / Generator / Evaluator behavior | [`agents/planner.md`](agents/planner.md), [`agents/generator.md`](agents/generator.md), [`agents/evaluator.md`](agents/evaluator.md) |
| Change QA grading rubrics | [`agents/criteria/`](agents/criteria/) |
| Add security / frontend / reliability review checks | [`review-personas/`](review-personas/) |
| Adopt domain-scoped monorepo layout | [`harness/workspace-template.md`](harness/workspace-template.md) |
| Write sprint contracts | [`docs/templates/sprint-contract.md`](docs/templates/sprint-contract.md) |
| Configure app vs harness test scripts | [`docs/templates/app-package-scripts.md`](docs/templates/app-package-scripts.md) |
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
npm run test:harness # run harness unit tests (tests/*.test.mjs) — not app tests
bun run setup       # verify hooks still install
```

Log friction as you hit it: append entries to `.gc-cache/weekly-report.jsonl`, then run `bun gc:weekly` in a Friday review.

## Key files

| Path | Purpose |
|------|---------|
| `harness.sh` | Autonomous loop via Claude Code CLI |
| `cursor-harness.sh` | Autonomous loop via Cursor CLI |
| `opencode-harness.sh` | Autonomous loop via OpenCode CLI |
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
| `design/` | Optional user design brief and reference assets |
| `docs/templates/design-brief.md` | Copy to `design/brief.md` before a run |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HARNESS_MODEL` | `claude-opus-4-6` / `composer-2.5` / `anthropic/claude-sonnet-4-5` | Model override (Claude / Cursor / OpenCode) |
| `HARNESS_OPENCODE_ATTACH` | — | Attach to `opencode serve` URL (avoids MCP cold start) |
| `HARNESS_ON_MAX_ROUNDS` | `halt` | `advance` to move on with known failures |
| `HARNESS_MAX_QA_ROUNDS` | `3` | Max Generator↔Evaluator retries per sprint |
| `HARNESS_PAUSE` | `off` | `sprint` = confirm before each sprint; `phase` = confirm before every agent; `design` = confirm after design-scout |
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
HARNESS_PAUSE=phase ./opencode-harness.sh "Build a kanban app"

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
