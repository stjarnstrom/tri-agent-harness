Run the **full harness cycle** in this conversation — Planner → Generator →
Pre-QA Gate → Evaluator → Retrospector — instead of driving each phase by hand
with `/plan`, `/build`, and `/qa`.

Invoke the `harness-cycle` skill now (Skill tool, `skill: harness-cycle`) and
follow it exactly. It is the chat-native equivalent of `./harness.sh`: you
orchestrate, and every phase runs in its own isolated subagent.

Arguments (pass through to the skill): $ARGUMENTS

Common forms:

- `/cycle build a habit tracker with streak analytics` — plan, then build every sprint
- `/cycle` with a pasted intent brief — same loop; you do not have to start from a one-liner (`docs/planner-input.md`)
- `/cycle` — continue from wherever `docs/sprint-status.md` currently stands
- `/cycle sprints=1` — one sprint, then stop and report
- `/cycle rounds=5 advance` — five QA rounds per sprint, advance on persistent failure
- `/cycle pause=sprint` — confirm before each new sprint

Remember the two rules that make this work: never build, test, or grade
anything in this thread, and always take the next step from
`node harness-runtime/cli.mjs next-step` rather than from your own reading of
the docs.
