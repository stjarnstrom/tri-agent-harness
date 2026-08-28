# Tri-Agent Harness (Claude Code)

Orchestration and guardrails in one harness: **Planner → Generator → Pre-QA Gate → Evaluator → Retrospector**.

This repo is a **harness scaffold**, not a finished application. You provide a product prompt; agents create planning artifacts in `docs/` and application code under `app/` sprint by sprint.

> **Claude Code only.** Sibling repos for [Cursor](https://github.com/stjarnstrom/tri-agent-harness-cursor) and [OpenCode](https://github.com/stjarnstrom/tri-agent-harness-opencode) share the loop idea but omit the Retrospector in v1.

## The core insight

Most agent workflows collapse creation and judgment into one conversation. This harness separates them:

1. **Creation** — the Generator builds; it never has final say on quality.
2. **Mechanical gates** — lints, artifacts, and secrets are checked *before* subjective QA.
3. **Judgment** — the Evaluator tests the live app with Playwright and grades against rubrics.
4. **Learning** — the Retrospector distills QA failures into durable guardrails.

**Environment defines the rails. Orchestration drives the train.**

```
Layer 3: Phase gates     pre-qa-gate.sh (lints, artifacts, secrets)
Layer 2: Orchestration   Planner → Generator ↔ Evaluator (sprint loop) → Retrospector
Layer 1: Environment     hooks, ESLint plugin, sandbox, review personas
```

## One sprint, end to end

Each sprint is a contract-driven loop. Agents communicate only through files in `docs/` (see [`docs/runtime-contract.md`](docs/runtime-contract.md)).

```
User prompt
    ↓
Planner  →  docs/spec.md, docs/sprint-plan.md, docs/sprint-status.md
    ↓
Generator  →  docs/sprint-N-contract.md, app/*, commits
    ↓
Pre-QA Gate  →  docs/mechanical-checks-sprint-N.md  (PASS / FAIL)
    ↓
Evaluator  →  docs/qa-report-sprint-N.md  (grades + LESSON-CANDIDATES)
    ↓
Pass → next sprint  |  Fail → Generator retry (round++, up to budget)
```

| Phase | Reads | Writes | Who decides quality? |
|-------|-------|--------|----------------------|
| **Planner** | Prompt, `agents/criteria/*`, optional `design/brief.md` | Spec, sprint plan, status tracker | — |
| **Generator** | Spec, contract template, prior QA report if retrying | Sprint contract, `app/` code, status → Ready for QA | Self-eval only (first pass) |
| **Pre-QA Gate** | `app/` source, harness lints | Mechanical checks report | Script (deterministic) |
| **Evaluator** | Contract, criteria, live app via Playwright | QA report, status → Pass/Fail | Evaluator (isolated context) |
| **Retrospector** | QA reports from the run | `harness/lessons.jsonl`, guardrail proposals | — |

Visual walkthrough of the same flow: [`docs/guide.html`](docs/guide.html).

## Try it

```bash
git init
bun install && bun run setup
cp .env.example .env.local

# One sprint, then stop — good for a first look
HARNESS_MAX_SPRINTS_PER_RUN=1 ./harness.sh "Build a project management tool with kanban boards"
```

Resume after interruption by re-running the same command. State lives in `docs/sprint-status.md`.

| Requirement | Notes |
|-------------|-------|
| **Git repo** | Hooks install into `.git/hooks/` — without one, guardrails warn but still run |
| **Bun or Node ≥ 20** | `bun install` preferred |
| **Claude Code CLI** (`claude`) | Required for `./harness.sh`; must be logged in |
| **`.env.local`** | Copy from `.env.example`; never commit secrets |

Optional: **gitleaks** for full secret scan in pre-commit; **Playwright** installed by the Generator under `app/`.

## Guardrails (Layer 1)

These run on every agent invocation and every commit:

- **Pre-commit hook** — sandbox boundary, harness lints, secret scan (`bun run setup`)
- **ESLint harness plugin** — lint messages are agent instructions (`bun lint:harness`)
- **Context hygiene** — deps, build output, and lockfiles are read-denied via `.claude/settings.json`
- **Review personas** — security, frontend architecture, reliability checklists in `review-personas/`

When an agent hits a harness lint, the error text tells it exactly what to fix. Recurring mistakes become permanent constraints via the [two-strike rule](CONTRIBUTING.md).

## Grading (Layer 3, subjective half)

After mechanical checks pass, the Evaluator:

1. Starts the dev server from `app/` and drives **Playwright** like a real user.
2. Grades against **`agents/criteria/`** rubrics (feature completeness, product depth, code quality).
3. Runs **review persona** checklists for security and architecture.
4. Writes **`docs/qa-report-sprint-N.md`** with a binary Pass/Fail and a `LESSON-CANDIDATES` block.

Mechanical FAIL in the pre-QA gate report = automatic sprint FAIL — the Evaluator never runs until the gate passes.

## Learning loop

At end of every `./harness.sh` run, the **Retrospector** mines `LESSON-CANDIDATES` from QA reports into `harness/lessons.jsonl` and regenerates `harness/LESSONS.md`. Disable with `HARNESS_RETRO=off`.

```bash
bun lessons:validate
bun lessons:render
bun lessons:sync <template-repo-path>
```

## Running it

Three runners, same files, same contract — switch between them at any point:

### 1. Autonomous (recommended for unattended runs)

```bash
./harness.sh "your product prompt"
./harness.sh "your product prompt" 5    # max QA rounds per sprint
```

### 2. Chat-driven cycle (one conversation)

```
/cycle build a habit tracker with streak analytics
/cycle                      # continue from sprint-status
/cycle sprints=1            # one sprint, then stop
```

Control flow is deterministic — the orchestrator asks `next-step`, never improvises:

```bash
node harness-runtime/cli.mjs next-step          # what runs next, and why
node harness-runtime/cli.mjs next-step --record generator --sprint 3
```

See [`.claude/skills/harness-cycle/SKILL.md`](.claude/skills/harness-cycle/SKILL.md).

### 3. Interactive (one phase at a time)

| Command | Phase |
|---------|-------|
| `/plan` | Planner |
| `/build` | Generator |
| `/qa` | Evaluator |
| `/retro` | Retrospector |

## Product layout

| Path | Purpose |
|------|---------|
| Repo root | Harness: `harness.sh`, `scripts/`, `harness/`, `docs/`, `agents/` |
| `app/` | **Product root** — Generator scaffolds here |

From sprint 2 onward, the pre-QA gate requires `app/package.json` and source under `app/`. See [`app/README.md`](app/README.md).

## Optional inputs

- **`design/brief.md`** — visual direction before planning ([`design/README.md`](design/README.md))
- **Rich pre-plans from another chat** — paste as the product prompt; strip implementation prescriptions. Visual rules belong in `design/brief.md`, not the prompt.
- **`extras/`** — add-on rubrics and patterns not required for the core loop

## Model policy

Every phase defaults to `opus` (latest Opus). Override per phase with `HARNESS_PLANNER_MODEL` / `HARNESS_GENERATOR_MODEL` / `HARNESS_EVALUATOR_MODEL` / `HARNESS_RETRO_MODEL`, or all at once with `HARNESS_MODEL`.

When Fable access is available, planning benefits from it:

```bash
HARNESS_PLANNER_MODEL=claude-fable-5 ./harness.sh "your product prompt"
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HARNESS_MODEL` | *(unset)* | Force one model for all phases |
| `HARNESS_PLANNER_MODEL` etc. | `opus` | Per-phase model override |
| `HARNESS_PAUSE` | `off` (`sprint` on fresh project) | Checkpoint before sprint/phase |
| `HARNESS_MAX_SPRINTS_PER_RUN` | unlimited | Stop after N sprints |
| `HARNESS_ON_MAX_ROUNDS` | `halt` | Or `advance` to skip stuck sprints |
| `HARNESS_RETRO` | `on` | `off` skips Retrospector |
| `HARNESS_YES` | `0` | `1` skips pause prompts |

## Documentation map

| If you want to… | Read |
|-----------------|------|
| Visual field guide | [`docs/guide.html`](docs/guide.html) |
| File ownership and phase boundaries | [`docs/runtime-contract.md`](docs/runtime-contract.md) |
| Agent sandbox and lint rules | [`harness/AGENT-INSTRUCTIONS.md`](harness/AGENT-INSTRUCTIONS.md) |
| Improving guardrails over time | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Chat-driven cycle details | [`.claude/skills/harness-cycle/SKILL.md`](.claude/skills/harness-cycle/SKILL.md) |
| Optional add-ons | [`extras/README.md`](extras/README.md) |

## Before your first run

**First runs pause by default** on a fresh project (`HARNESS_PAUSE=sprint`). Answer `a` for the rest of the run, or set `HARNESS_PAUSE=off` / `HARNESS_YES=1`.

**Cost is real.** Vague prompts often plan 8–10 sprints. Cap with `HARNESS_MAX_SPRINTS_PER_RUN=1`.

**QA needs a runnable app.** First-run failures are often `cd app && npx playwright install` or a busy port.

**Autonomy means real permissions.** Agents use `--dangerously-skip-permissions`; hooks catch bad commits, not bad commands.
