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
- **Planner** (Fable): Expands a short prompt into spec, sprint plan, and status tracker.
- **Generator** (Sonnet): Builds sprint-by-sprint; commits pass pre-commit hooks.
- **Pre-QA Gate**: Mechanical checks (lints, artifacts) before Evaluator runs.
- **Evaluator** (Fable): Playwright testing + rubric grading + review persona checklists.
- **Retrospector** (Fable): End-of-run learning — distills QA failures into `harness/LESSONS.md` and drafts guardrail proposals at 2 strikes.

Agents communicate through files in `docs/`. Personas in `agents/`. Criteria in `agents/criteria/`.

### Model policy (Claude Code paths)

Each agent runs on a model matched to its job — big-picture reasoning on Fable,
implementation on Sonnet:

| Agent | Model | Why |
|-------|-------|-----|
| Planner | `claude-fable-5` | Deep, one-shot reasoning to expand a prompt into a sound spec |
| Generator | `claude-sonnet-5` | Strong coding at lower cost; the highest-token-volume phase |
| Evaluator | `claude-fable-5` | Skeptical grading + `review-personas/` code review (all review is Fable) |
| Retrospector | `claude-fable-5` | Judgment call: generalizing failures into durable lessons |

This is the **default**. Interactive/mobile runs get it from the `model:` field
in `.claude/agents/*.md`; autonomous runs (`harness.sh`) get it from the
per-phase defaults, overridable via `HARNESS_PLANNER_MODEL` /
`HARNESS_GENERATOR_MODEL` / `HARNESS_EVALUATOR_MODEL` / `HARNESS_RETRO_MODEL`,
or `HARNESS_MODEL` to force one model for all phases. If Fable is unavailable, fall back to
`claude-opus-4-8` for the Planner/Evaluator. (The Cursor/OpenCode/SDK runners
use their own model ecosystems — see `sdk-orchestrator.config.json`.)

### Environment (always on)
- Git pre-commit hook: sandbox, lints, secret scan (`bun run setup`)
- Context-hygiene deny rules: secrets + junk context (deps, build output, lockfiles) are read-denied per tool — `.claude/settings.json` for Claude Code (there is no `.claudeignore`; `Read(...)` deny rules are the native mechanism), `.cursorignore` for Cursor, `opencode.jsonc` for OpenCode. See "Context Hygiene" in `harness/AGENT-INSTRUCTIONS.md`.
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

Every project should feel intentional and specific. The bar is high:

- Read and follow the frontend-design skill when building UI
- Commit to a strong aesthetic direction before writing a line of CSS
- Avoid every generic AI pattern: no Inter/Roboto defaults, no purple-gradient-
over-white-card layouts, no cookie-cutter component assemblies
- Mobile-responsive is not optional — build it from the start, not as an
afterthought
- Spacing, typography hierarchy, and color consistency are treated as
first-class requirements, not nice-to-haves

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

# App setup (after Generator creates the app)
npm install
npm run dev

# Harness lints
bun lint:harness

# Tests
npm run test:harness   # harness orchestrator tests only
npx playwright test    # app E2E (after Generator scaffolds test:e2e)
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

# Model overrides (defaults: planner=Fable, generator=Sonnet, evaluator=Fable)
HARNESS_MODEL=claude-opus-4-8 ./harness.sh "..."           # force one model for all phases
HARNESS_GENERATOR_MODEL=claude-opus-4-8 ./harness.sh "..." # override a single phase
```

Optional alternative runners (same artifacts and state machine):

```bash
./cursor-harness.sh "product prompt"       # Cursor CLI loop
./opencode-harness.sh "product prompt"     # OpenCode CLI loop
```

**Interactive mode (Claude Code slash commands):**

- `/project:plan [description]` — Expand idea into full spec
- `/project:build` — Implement the current sprint
- `/project:qa` — Run QA against the current sprint
- `/project:retro` — Distill QA failures into lessons and guardrail proposals

**Utilities:**

- `/optimize-claude-md [path] [apply]` — Trim a CLAUDE.md to only what Claude can't infer from the code. Cuts anything inferable from the codebase (or findable by a senior dev in ~20 min); keeps non-obvious decisions, conventions, and gotchas. Dispatches to the `claude-md-optimizer` subagent (Fable). Default writes `CLAUDE.optimized.md` for review; `apply` rewrites in place.

**Guardrails:**

- `bun run setup` — Install git hooks and `.cursorignore`
- `bun lint:harness` — Run agent-prompt lint rules
- `bun gc:weekly` — Anti-slop review of recurring failures
- `bun lessons:validate` / `bun lessons:render` / `bun lessons:sync` — lessons ledger tools (see README "Learning loop")

---

## Key decisions

[Filled in as the project evolves]
