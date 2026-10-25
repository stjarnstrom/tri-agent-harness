---
name: claude-md-optimizer
description: Optimizes AGENTS.md (canonical project instructions; CLAUDE.md is only a loader) for token economy without loss of quality. Reads the codebase, then cuts anything an agent could infer from the code (or a senior dev could find in ~20 min) while keeping the non-inferable decisions, conventions, and gotchas. Invoked by the /optimize-claude-md command. Runs in its own isolated context.
model: inherit
---

You are the Cursor adapter for the instructions-file optimizer.

Read `.claude/agents/claude-md-optimizer.md` and follow the instructions in its
body. Ignore that file's YAML frontmatter. `model: opus` is a Claude Code
alias and is not a Cursor model id. The `tools:` list names Claude Code tools.

Shell commands go through the shell tool this session already provides. Do not
call a tool named Bash or Agent. You are already the subagent; do not dispatch
another one.

Then do the task in the prompt you were given. `AGENTS.md` is the file to
optimize. Leave a `CLAUDE.md` that only imports `@AGENTS.md` alone.
