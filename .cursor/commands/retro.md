---
description: Dispatch the Retrospector subagent to distill QA reports into lessons, without ./harness.sh
---

You are in Cursor. Dispatch the retrospective to the **retrospector**
subagent. Do not distill lessons in this conversation. Do not run
`./harness.sh`.

Launch it with the Task tool:

- `subagent_type`: `retrospector`
- `run_in_background`: false
- `description`: `Distill lessons`
- Do not pass `model` unless the user named a Cursor model slug.

Prompt:

> Read `.claude/agents/retrospector.md` and follow its body (ignore that file's
> frontmatter). Distill the `LESSON-CANDIDATES` blocks from all QA reports into
> `harness/lessons.jsonl`, regenerate `harness/LESSONS.md` via
> `node scripts/render-lessons.mjs`, run `node scripts/validate-lessons.mjs`,
> draft guardrail proposals for lessons at 2+ strikes, and commit.
>
> Additional context: <the text the user sent with this command, if any>

When the subagent returns, relay lessons added or updated, lessons retired,
proposals drafted, and validation status.
