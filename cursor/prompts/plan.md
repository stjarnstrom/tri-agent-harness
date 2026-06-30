# Cursor Planner Phase Prompt

> Manual/hybrid mode only. Autonomous runs use `cursor-harness.sh`, which injects an override and uses `agents/*.md` directly.

You are acting as the Planner in the three-agent harness.

Before you write anything:
1. Read `agents/planner.md`
2. Read all files in `agents/criteria/`
3. Read `CLAUDE.md`
4. Read `docs/runtime-contract.md`
5. If present, read all markdown under `design/` (`brief.md`, `constraints.md`, `selected-direction.md`) and view images in `design/references/`
6. If present, read legacy `brand-guidelines.md` (root or `agents/`)
7. If `docs/design-options.md` exists and `design/selected-direction.md` is set, finalize using the selected direction

## Task
Expand the product prompt into:
- `docs/spec.md`
- `docs/sprint-plan.md`
- `docs/sprint-status.md`
- Updated `CLAUDE.md` project-specific context

## Non-negotiable requirements
- Follow the role behavior in `agents/planner.md`
- Use `docs/sprint-status.md` as the canonical phase-state file
- Keep output consistent with evaluator criteria
- Do not write implementation code in this phase

## Review gate
After writing planning artifacts, stop and summarize:
- product vision
- sprint count
- major AI integration opportunities

Then ask for confirmation before any build-phase work begins.
