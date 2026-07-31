# Tri-Agent Harness (Claude Code)

Orchestration and guardrails in one harness: **Planner → Generator → Pre-QA Gate → Evaluator → Retrospector**, with hooks, lints, sandbox, and an anti-slop improvement loop.

This repo is a **Claude Code harness scaffold**, not a finished application. You provide a product prompt; the harness creates `docs/` planning artifacts and application code under `app/` sprint by sprint.

> **Claude Code only.** For Cursor, see [tri-agent-harness-cursor](https://github.com/stjarnstrom/tri-agent-harness-cursor). For OpenCode, see [tri-agent-harness-opencode](https://github.com/stjarnstrom/tri-agent-harness-opencode). Those siblings share the same loop idea but do **not** include the Retrospector in v1.

## Architecture

```
Layer 3: Phase gates     pre-qa-gate.sh (lints, artifacts, secrets)
Layer 2: Orchestration   Planner → Generator ↔ Evaluator (sprint loop) → Retrospector
Layer 1: Environment     hooks, ESLint plugin, sandbox, review personas
```

**Environment defines the rails. Orchestration drives the train.**

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Git repo** | `git init` before setup — hooks install into `.git/hooks/`. Without one the harness runs but **warns that guardrails are OFF** |
| **Bun or Node ≥ 20** | `bun install` preferred; `npm install` works as fallback. `node` must be on PATH |
| **Claude Code CLI** (`claude`) | Required for `./harness.sh`. Must be **logged in** (run `claude` once interactively) |
| **`.env.local`** | Copy from `.env.example`; never commit real secrets |

`./harness.sh` verifies the Claude CLI at startup and pings each configured model once before planning (skip with `HARNESS_PREFLIGHT=off`).

Optional:
- **gitleaks** — `brew install gitleaks` for full secret scan in pre-commit
- **Playwright** — installed by the Generator under `app/` when it scaffolds your app

## Quick start

```bash
git init
bun install && bun run setup
cp .env.example .env.local

./harness.sh "Build a project management tool with kanban boards"
```

Resume after interruption by re-running the same command. State lives in `docs/sprint-status.md`.

Visual walkthrough: [`docs/guide.html`](docs/guide.html).

## Product layout

| Path | Purpose |
|------|---------|
| Repo root | Harness: `harness.sh`, `scripts/`, `harness/`, `docs/`, `agents/` |
| `app/` | **Product root** — Generator scaffolds here (`app/package.json`, `app/src/`, etc.) |

From sprint 2 onward, the pre-QA gate requires `app/package.json` and application source under `app/`. See [`app/README.md`](app/README.md).

## Before your first run

**First runs pause by default.** On a fresh project the harness sets `HARNESS_PAUSE=sprint`. Answer `a` for the rest of the run, or set `HARNESS_PAUSE=off` / `HARNESS_YES=1`.

**Cost is real.** Cap with `HARNESS_MAX_SPRINTS_PER_RUN=1`. Vague prompts often plan 8–10 sprints.

**Model access.** All phases default to `opus` (the alias for the latest Opus, currently Opus 5). To run planning on Fable instead: `HARNESS_PLANNER_MODEL=claude-fable-5 ./harness.sh "..."`.

**QA needs a runnable app.** Evaluator starts the dev server from `app/` and drives Playwright. First-run failures are often `cd app && npx playwright install` or a busy port.

**Autonomy means real permissions.** Agents use `--dangerously-skip-permissions`; hooks catch bad commits, not bad commands.

## Planning with another agent

The prompt you pass to `./harness.sh` (or `/plan`) does not have to be a one-liner. A product plan drafted in Claude chat or another agent usually **helps** the Planner — richer intent means fewer invented requirements.

It does **not** change the harness architecture. The Planner still writes the canonical `docs/spec.md` and sprint plan; your pre-plan is input, not a replacement for those artifacts.

| In your pre-plan | Effect |
|------------------|--------|
| Product goals, users, features, UX flows | Helps — better input for the spec |
| Design direction / brand rules | Prefer `design/brief.md` (authoritative) over burying it in the prompt |
| Non-negotiable constraints | Prefer `design/constraints.md`, or say explicitly “do not expand beyond this scope” |
| Stack, file layouts, “implement X with Y” | Risk — Planner stays high-level; wrong implementation detail cascades to Generator |
| Pre-cut sprints | Hints only — Planner re-slices into the harness shape (typically 4–8 sprints; Sprint 1 = skeleton) |

**Practical recipe:** keep the other agent’s output as a product brief, strip implementation prescriptions, park visuals in `design/brief.md`, then run the harness. The Planner may still ambition-expand unless you constrain it.

Visual walkthrough of the same guidance: [`docs/guide.html#preplan`](docs/guide.html#preplan).

## Usage modes

### 1. Autonomous (recommended)

```bash
./harness.sh "your product prompt"
./harness.sh "your product prompt" 5    # max QA rounds per sprint
```

### 2. Chat-driven cycle — one conversation, no terminal

```
/cycle build a habit tracker with streak analytics
/cycle                      # continue from wherever sprint-status stands
/cycle sprints=1            # one sprint, then stop
/cycle rounds=5 advance     # 5 QA rounds per sprint, advance on persistent failure
```

The [`harness-cycle`](.claude/skills/harness-cycle/SKILL.md) skill runs the whole
loop — Planner → Generator → Pre-QA Gate → Evaluator → Retrospector — from a
single Claude Code session (terminal, desktop app, or mobile). Claude
orchestrates; each phase still runs in its own isolated subagent, so the
Evaluator's judgment stays independent of the Generator's.

Control flow is **not** improvised. The orchestrator asks a deterministic oracle
what to do next and does exactly that:

```bash
node harness-runtime/cli.mjs next-step          # what runs next, and why
node harness-runtime/cli.mjs next-step --json   # same, machine-readable
node harness-runtime/cli.mjs next-step --record generator --sprint 3
```

`next-step` owns everything a model would eventually get wrong: round counting,
the pre-QA gate's position between Generator and Evaluator, gate-report
staleness (a PASS from round 1 never clears round 2's code), the per-sprint round
budget, and the halt-vs-advance policy. It reads the same canonical files as
`./harness.sh` and is safe to call repeatedly — it has no side effects until you
`--record` a finished phase.

| Step | Orchestrator does |
|------|-------------------|
| `run-planner` / `run-generator` / `run-evaluator` / `run-retro` | Dispatch that subagent |
| `run-pre-qa-gate` | Run `scripts/pre-qa-gate.sh N` |
| `advance-sprint` | Mark the sprint Skipped and continue |
| `await-design-selection` / `halt` / `manual-review` / `done` | Stop and report |

### 3. Interactive — one phase at a time

| Skill | Phase | Subagent |
|-------|-------|----------|
| `/plan` | Planner | [`planner`](.claude/agents/planner.md) |
| `/build` | Generator | [`generator`](.claude/agents/generator.md) |
| `/qa` | Evaluator | [`evaluator`](.claude/agents/evaluator.md) |
| `/retro` | Retrospector | [`retrospector`](.claude/agents/retrospector.md) |
| `/cycle` | All of the above, looped | (orchestrates the rest) |

Typical flow: `/plan "…"` → `/build` → `/qa` → repeat. Reach for these when you want a checkpoint between phases; reach for `/cycle` when you want the loop driven for you.

Each phase lives in [`.claude/skills/`](.claude/skills/) and declares `context: fork` with its `agent:`, so Claude Code runs it in the named isolated subagent rather than relying on the model to remember to delegate. They also set `disable-model-invocation: true` — Claude will not fire a build or a QA pass at you unprompted; you invoke them, or `/cycle` drives them. `/cycle` itself does **not** fork: it stays in the conversation to orchestrate, and dispatches each phase as a subagent.

#### Model policy

Every phase defaults to `opus` — the alias for the latest Opus (currently Opus 5), so defaults track new releases automatically. Override per phase with `HARNESS_PLANNER_MODEL` / `HARNESS_GENERATOR_MODEL` / `HARNESS_EVALUATOR_MODEL` / `HARNESS_RETRO_MODEL`, or all phases at once with `HARNESS_MODEL`.

**Recommended when you have Fable access** — Fable for planning, Opus for the rest:

```bash
HARNESS_PLANNER_MODEL=claude-fable-5 ./harness.sh "your product prompt"

# Or Fable for all reasoning-heavy phases (planning, QA, retro):
HARNESS_PLANNER_MODEL=claude-fable-5 \
HARNESS_EVALUATOR_MODEL=claude-fable-5 \
HARNESS_RETRO_MODEL=claude-fable-5 \
./harness.sh "your product prompt"
```

For the chat-driven cycle and the per-phase skills, the model comes from the `model:` field in [`.claude/agents/`](.claude/agents/) — edit it there to change a phase's model. The phase skills name the subagent, so they inherit its model and tool restrictions.

## Learning loop (Retrospector)

End of every `./harness.sh` run, the Retrospector mines `LESSON-CANDIDATES` from QA reports into `harness/lessons.jsonl` and regenerates `harness/LESSONS.md`. Disable with `HARNESS_RETRO=off`.

```bash
bun lessons:validate
bun lessons:render
bun lessons:sync <template-repo-path>
```

## Other tools

| Repo | Entry | Notes |
|------|-------|-------|
| [tri-agent-harness-cursor](https://github.com/stjarnstrom/tri-agent-harness-cursor) | `./cursor-harness.sh` | No Retrospector in v1 |
| [tri-agent-harness-opencode](https://github.com/stjarnstrom/tri-agent-harness-opencode) | `./opencode-harness.sh` | No Retrospector in v1 |

## Documentation map

| If you want to… | Read |
|-----------------|------|
| Start a product (visual) | [`docs/guide.html`](docs/guide.html) |
| Feed a plan from another agent | [README § Planning with another agent](#planning-with-another-agent) · [`guide.html#preplan`](docs/guide.html#preplan) |
| Run the whole cycle in one chat | [`.claude/skills/harness-cycle/SKILL.md`](.claude/skills/harness-cycle/SKILL.md) · [README § Chat-driven cycle](#2-chat-driven-cycle--one-conversation-no-terminal) |
| Run or edit a single phase | [`.claude/skills/`](.claude/skills/) — `plan`, `build`, `qa`, `retro` |
| Phase file ownership | [`docs/runtime-contract.md`](docs/runtime-contract.md) |
| Agent sandbox rules | [`harness/AGENT-INSTRUCTIONS.md`](harness/AGENT-INSTRUCTIONS.md) |
| Product npm scripts | [`docs/templates/app-package-scripts.md`](docs/templates/app-package-scripts.md) |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HARNESS_MODEL` | *(unset)* | Force one model for all phases |
| `HARNESS_PLANNER_MODEL` etc. | `opus` | Per-phase model (`PLANNER`/`GENERATOR`/`EVALUATOR`/`RETRO`), e.g. `claude-fable-5` for planning |
| `HARNESS_PAUSE` | `off` (`sprint` on fresh project) | Checkpoint before sprint/phase |
| `HARNESS_MAX_SPRINTS_PER_RUN` | unlimited | Stop after N sprints |
| `HARNESS_ON_MAX_ROUNDS` | `halt` | Or `advance` to skip stuck sprints |
| `HARNESS_RETRO` | `on` | `off` skips Retrospector |
| `HARNESS_YES` | `0` | `1` skips pause prompts |

## Guardrails

```bash
bun lint:harness
bun run setup
```
