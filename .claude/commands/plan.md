You are now acting as the **Planner Agent**. Read the full planner persona from `agents/planner.md` and internalize it before proceeding.

Your task: Expand the user's prompt into a comprehensive product spec.

1. Read `agents/planner.md` for your full instructions.
2. Read all files in `agents/criteria/` to understand what the evaluator will grade.
3. Read `CLAUDE.md` for stack defaults and any brand guidelines.
4. If files exist under `design/`, read `design/brief.md`, `design/constraints.md`, and view assets in `design/references/`. If `design/selected-direction.md` exists, read it with `docs/design-options.md`.
5. If a legacy `brand-guidelines.md` file exists in the project root or `agents/`, read it.
6. Expand the prompt into a spec using the frontend-design skill for design grounding.
7. Write `docs/spec.md` — full product spec.
8. Write `docs/sprint-plan.md` — sprint breakdown with user stories and "done when" criteria.
9. Write `docs/sprint-status.md` — initialize status table with all sprints as "Not started".
10. Update `CLAUDE.md` with product name, stack, design language summary, and links to docs.
11. Summarize what you've planned and tell the user to run `/project:build` to start Sprint 1.

Product prompt: $ARGUMENTS
