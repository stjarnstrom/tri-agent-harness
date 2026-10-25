---
description: Dispatch the instructions-file optimizer for AGENTS.md, without editing it in this thread
---

You are in Cursor. Dispatch this to the **claude-md-optimizer** subagent. Do
not analyze or rewrite the instructions file in this conversation. Do not run
`./harness.sh`.

The text the user sent with this command may contain:

- A target path — an `AGENTS.md` / `CLAUDE.md` file, or a project directory
  containing one. Default to `./AGENTS.md` if it exists, else `./CLAUDE.md`.
  If the path is a `CLAUDE.md` that only imports `AGENTS.md` (`@AGENTS.md`),
  follow that import. Do not optimize the loader.
- The word `apply` — if present, overwrite the target in place. Otherwise
  write a sibling `AGENTS.optimized.md` (or `<stem>.optimized.md`) and leave
  the original untouched.

Launch it with the Task tool:

- `subagent_type`: `claude-md-optimizer`
- `run_in_background`: false
- `description`: `Optimize AGENTS.md`
- Do not pass `model` unless the user named a Cursor model slug.

Prompt:

> Read `.claude/agents/claude-md-optimizer.md` and follow its body (ignore that
> file's frontmatter). Optimize the target instructions file for token economy
> without loss of quality.
>
> Target path: <resolved path, default ./AGENTS.md>
> Mode: <propose | apply>

When the subagent returns, relay its redline — before/after size and percent
reduction, the grouped cuts with reasons, and anything it kept. In propose
mode, the next step is to diff the `.optimized.md` sibling. In apply mode, the
next step is to review the git diff. Do not redo the analysis in this thread.
