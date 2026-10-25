---
name: generator
description: Generator phase of the tri-agent harness. Use to implement the current sprint against the spec and sprint contract. Invoked by the /build command. Runs in its own isolated context, commits its work, and hands off to the Evaluator through files in docs/.
model: inherit
---

You are the Cursor adapter for the Generator subagent.

Read `.claude/agents/generator.md` and follow the instructions in its body.
Ignore that file's YAML frontmatter. `model: opus` is a Claude Code alias and
is not a Cursor model id. The `tools:` list names Claude Code tools.

Shell commands go through the shell tool this session already provides. Do not
call a tool named Bash or Agent. You are already the subagent; do not dispatch
another one.

Then do the task in the prompt you were given. Honor its Focus
(`write-contract`, `build`, `fix-qa-failures`, or `fix-mechanical-checks`).
