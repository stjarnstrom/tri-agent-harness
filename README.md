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

**Model access.** Defaults: Planner/Evaluator `claude-fable-5`, Generator `claude-sonnet-5`. Without Fable: `HARNESS_PLANNER_MODEL=claude-opus-4-8 HARNESS_EVALUATOR_MODEL=claude-opus-4-8`.

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

### 2. Interactive — Claude Code slash commands

| Command | Phase |
|---------|-------|
| `/plan` | Planner |
| `/build` | Generator |
| `/qa` | Evaluator |
| `/retro` | Retrospector |

Each command dispatches an isolated subagent in [`.claude/agents/`](.claude/agents/). Typical flow: `/plan "…"` → `/build` → `/qa` → repeat.

#### Model policy

| Agent | Model | Why |
|-------|-------|-----|
| Planner | `claude-fable-5` | Spec and sprint design |
| Generator | `claude-sonnet-5` | Implementation volume |
| Evaluator | `claude-fable-5` | Skeptical grading + review personas |
| Retrospector | `claude-fable-5` | Lessons from QA failures |

Overrides: `HARNESS_MODEL` or per-phase `HARNESS_*_MODEL`.

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
| Phase file ownership | [`docs/runtime-contract.md`](docs/runtime-contract.md) |
| Agent sandbox rules | [`harness/AGENT-INSTRUCTIONS.md`](harness/AGENT-INSTRUCTIONS.md) |
| Product npm scripts | [`docs/templates/app-package-scripts.md`](docs/templates/app-package-scripts.md) |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HARNESS_MODEL` | *(CLI default)* | Force one model for all phases |
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
