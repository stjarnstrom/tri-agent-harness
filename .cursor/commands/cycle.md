---
description: Run the full harness cycle in this chat (Planner through Retrospector) without ./harness.sh
---

You are in Cursor. Run the full harness cycle in this conversation. Do not run
`./harness.sh`.

Read `.agents/skills/harness-cycle/SKILL.md` and follow it exactly. Use the
skill's Cursor branch: dispatch every phase with the Task tool
(`subagent_type` from `next-step`, `run_in_background` false), one phase at a
time. Do not build, test, or grade in this thread.

The text the user sent with this command is the argument string (product
prompt and flags such as `sprints=1`, `rounds=5`, `advance`, `pause=sprint`,
`retro=off`, `sandbox`). If they only invoked the command, continue from
`docs/sprint-status.md`.

`sandbox` still means a separate `./harness.sh --sandbox` process. It does not
jail this chat, and it does not continue the cycle here.
