# [Project Name]

> Combined harness: three-agent orchestration + professional guardrails.
> Updated by the Planner agent at project start.

---

## Required reading (every agent, every session)

1. **`harness/AGENT-INSTRUCTIONS.md`** — Sandbox, lints-as-instructions, anti-slop rules
2. **`docs/runtime-contract.md`** — File ownership and phase boundaries
3. This file — project-specific context (stack, design, status)

---

## What this is

[One sentence description — filled in by Planner]

**Status:** Planning / Active / Complete
**Current sprint:** —
**Last QA:** —

---

## Architecture

This project uses a **combined harness** with two layers:

### Orchestration (who runs when)

Three runners drive the same phases over the same files: `./harness.sh`
(unattended terminal), the `harness-cycle` skill via `/cycle` (one Claude Code
conversation drives the loop), and the per-phase slash commands. Switch between
them at any point, including mid-sprint.

- **Planner** (Fable): Expands a short prompt into spec, sprint plan, and status tracker.
- **Generator** (Sonnet): Builds sprint-by-sprint; commits pass pre-commit hooks.
- **Pre-QA Gate**: Mechanical checks (lints, artifacts) before Evaluator runs.
- **Evaluator** (Fable): Playwright testing + rubric grading + review persona checklists.
- **Retrospector** (Fable): End-of-run learning — distills QA failures into `harness/LESSONS.md` and drafts guardrail proposals at 2 strikes.

Agents communicate through files in `docs/`. Personas in `agents/`. Criteria in `agents/criteria/`.

### Model policy (Claude Code paths)

Every phase defaults to `opus` — the alias for the latest Opus (currently
Opus 5) — so defaults track new model releases automatically.

Interactive/mobile runs get the model from the `model:` field in
`.claude/agents/*.md`; autonomous runs (`harness.sh`) get it from the
per-phase defaults, overridable via `HARNESS_PLANNER_MODEL` /
`HARNESS_GENERATOR_MODEL` / `HARNESS_EVALUATOR_MODEL` / `HARNESS_RETRO_MODEL`,
or `HARNESS_MODEL` to force one model for all phases. When Fable access is
available, planning benefits from it:
`HARNESS_PLANNER_MODEL=claude-fable-5 ./harness.sh "..."` (see README
"Model policy").

### Product layout

The harness lives at the repo root; the product the agents build lives under
`app/` (`app/package.json`, `app/src/`, tests, and app config). Do not mix
application source with harness tooling at the root.

### Environment (always on)
- Git pre-commit hook: sandbox, lints, secret scan (`bun run setup`)
- Context-hygiene deny rules: secrets + junk context (deps, build output, lockfiles) are read-denied via `.claude/settings.json` `Read(...)` deny rules (there is no `.claudeignore`). See "Context Hygiene" in `harness/AGENT-INSTRUCTIONS.md`.
- ESLint harness plugin: lints are agent instructions (`bun lint:harness`)
- Review personas: `review-personas/` for focused code review
- Anti-slop loop: recurring QA failures → new guardrails (`bun gc:weekly`)

## Key Principles

1. **Separate creation from judgment.** Generator never has final say on quality.
2. **Mechanical before subjective.** Pre-QA gate catches lint/artifact failures before Playwright.
3. **Grading criteria make quality concrete.** See `agents/criteria/`.
4. **Evaluator tests the live app** via Playwright, not just code review.
5. **Sprint contracts prevent scope drift.** See `docs/templates/sprint-contract.md`.
6. **Guardrails improve over time.** Two-strike rule in `CONTRIBUTING.md`.

---

## Stack

[Defaults — Planner adapts for each product]

**Frontend (always)**

- React 18+ with TypeScript (strict mode)
- Vite for bundling
- Tailwind CSS for utility styling
- React Router v6 for routing
- Zustand for non-trivial state management
- Framer Motion for animation

**Full stack (when backend needed)**

- FastAPI (Python) for the API layer
- SQLite for prototyping, PostgreSQL for production
- Alembic for migrations
- Pydantic for data validation

**Testing**

- Playwright for E2E (always install, always configure)
- Vitest for unit tests when needed

**AI integration**

- Anthropic SDK (claude-sonnet-4-6 as default model)
- Build real AI features as product value, not demos

---

## Code style

- TypeScript strict mode, no `any` without a comment explaining why
- Functional components only — no class components
- Co-locate types with the code that uses them
- Prefer explicit over clever
- Run `bun lint:harness` before committing — lint messages are fix instructions
- No console.log left in committed code (enforced by harness lint rule)

---

## Design defaults

Every project should feel intentional and specific:

- Commit to a strong aesthetic direction before writing a line of CSS
- Avoid generic AI patterns: no Inter/Roboto defaults, no purple-gradient-on-white-card layouts
- Mobile-responsive is not optional — build it from the start
- Spacing, typography hierarchy, and color consistency are first-class requirements

---

## Design language

[Filled in by Planner — adapt the design defaults above for this specific product]

- Aesthetic: —
- Colors: —
- Typography: —
- Motion: —
- Signature element: —

---

## Running the project

```bash
# Harness setup (first time)
bun install && bun run setup

# App setup (after Generator creates the app under app/)
cd app && npm install
cd app && npm run dev

# Harness lints
bun lint:harness

# Tests
npm run test:harness   # harness orchestrator tests only
cd app && npx playwright test    # app E2E (after Generator scaffolds test:e2e)
```

---

## Docs

- Full spec: `docs/spec.md`
- Sprint plan: `docs/sprint-plan.md`
- Sprint status: `docs/sprint-status.md`
- Sprint contracts: `docs/sprint-[N]-contract.md`
- Mechanical checks: `docs/mechanical-checks-sprint-[N].md`
- QA reports: `docs/qa-report-sprint-[N].md`
- Lessons: `harness/LESSONS.md` (rendered) / `harness/lessons.jsonl` (ledger)
- Guardrail proposals: `docs/proposals/guardrail-[id].md`

---

## Commands

**Autonomous mode** (`./harness.sh` / Claude Code is the default runner):

```bash
./harness.sh "product prompt"              # Claude Code loop (default)
./harness.sh "product prompt" 5            # max 5 QA rounds per sprint
HARNESS_ON_MAX_ROUNDS=advance ./harness.sh "..."  # advance on persistent failure
HARNESS_PAUSE=sprint ./harness.sh "..."    # confirm before each sprint
HARNESS_MAX_SPRINTS_PER_RUN=1 ./harness.sh "..."  # one sprint per run
HARNESS_RETRO=off ./harness.sh "..."       # skip end-of-run learning

# Model overrides (default: `opus` — latest Opus — for all phases)
HARNESS_MODEL=claude-fable-5 ./harness.sh "..."           # force one model for all phases
HARNESS_PLANNER_MODEL=claude-fable-5 ./harness.sh "..."   # override a single phase (Fable for planning)
```

**Chat-driven cycle** (whole loop in one Claude Code conversation — terminal, desktop, or mobile):

```
/cycle build a habit tracker with streak analytics   # plan, then build every sprint
/cycle                                              # continue from current sprint-status
/cycle sprints=1                                    # one sprint, then stop
/cycle rounds=5 advance                             # 5 QA rounds/sprint, advance on failure
```

The `harness-cycle` skill orchestrates; each phase still runs in an isolated
subagent. Control flow comes from a deterministic oracle, never improvised:

```bash
node harness-runtime/cli.mjs next-step                            # what runs next, and why
node harness-runtime/cli.mjs next-step --record generator --sprint 3
```

`next-step` owns round counting, pre-QA gate ordering, gate-report staleness, the
round budget, and halt-vs-advance. It is side-effect-free until `--record`.

**Interactive mode (Claude Code slash commands):**

- `/project:plan [description]` — Expand idea into full spec
- `/project:build` — Implement the current sprint
- `/project:qa` — Run QA against the current sprint
- `/project:retro` — Distill QA failures into lessons and guardrail proposals

**Utilities:**

- `/optimize-claude-md [path] [apply]` — Trim a CLAUDE.md to only what Claude can't infer from the code. Cuts anything inferable from the codebase (or findable by a senior dev in ~20 min); keeps non-obvious decisions, conventions, and gotchas. Dispatches to the `claude-md-optimizer` subagent (Fable). Default writes `CLAUDE.optimized.md` for review; `apply` rewrites in place.

**Guardrails:**

- `bun run setup` — Install git hooks
- `bun lint:harness` — Run agent-prompt lint rules
- `bun gc:weekly` — Anti-slop review of recurring failures
- `bun lessons:validate` / `bun lessons:render` / `bun lessons:sync` — lessons ledger tools (see README "Learning loop")

**Sibling repos** (separate products for other tools):

- [tri-agent-harness-cursor](https://github.com/stjarnstrom/tri-agent-harness-cursor) — Cursor CLI
- [tri-agent-harness-opencode](https://github.com/stjarnstrom/tri-agent-harness-opencode) — OpenCode CLI

---

## Key decisions

[Filled in as the project evolves]
