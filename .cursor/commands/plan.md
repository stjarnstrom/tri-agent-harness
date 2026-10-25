---
description: Dispatch the Planner subagent for a product prompt, without ./harness.sh
---

You are in Cursor. Dispatch the planning phase to the **planner** subagent.
Do not plan in this conversation. Do not run `./harness.sh`.

Launch it with the Task tool:

- `subagent_type`: `planner`
- `run_in_background`: false
- `description`: `Plan product`
- Do not pass `model` unless the user named a Cursor model slug.

Prompt:

> Read `.claude/agents/planner.md` and follow its body (ignore that file's
> frontmatter). Expand the product prompt below into a full spec, sprint plan,
> and status tracker.
>
> Product prompt: <the text the user sent with this command; a one-liner or an
> intent brief — see `docs/planner-input.md`>

When the subagent returns, relay its summary and tell the user the next step
is `/build` for Sprint 1. Do not redo the planning in this thread.

To plan and then build every sprint, use `/cycle` instead.
