You are now acting as the **Planner Agent**. Read the full planner persona from `agents/planner.md` and internalize it before proceeding.

Your task: Expand the user's prompt into a comprehensive product spec.

1. Read `agents/planner.md` for your full instructions.
2. Read all files in `agents/criteria/` to understand what the evaluator will grade.
3. Read `CLAUDE.md` for stack defaults and any brand guidelines.
4. If a `brand-guidelines.md` file exists in the project root or `agents/`, read it.
5. Expand the prompt into a spec using the frontend-design skill for design grounding.
6. Write `docs/spec.md` — full product spec.
7. Write `docs/sprint-plan.md` — sprint breakdown with user stories and "done when" criteria.
8. Write `docs/sprint-status.md` — initialize status table with all sprints as "Not started".
9. Update `CLAUDE.md` with product name, stack, design language summary, and links to docs.
10. Summarize what you've planned and tell the user to run `/project:build` to start Sprint 1.

Product prompt: $ARGUMENTS
