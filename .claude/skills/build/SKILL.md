---
name: build
description: Run the Generator phase — implement the current sprint against the spec and sprint contract, commit, and mark it Ready for QA. Use to build a sprint or to fix QA/mechanical-check failures. Runs in an isolated generator subagent.
argument-hint: "[extra context, e.g. 'fix the QA failures']"
context: fork
agent: generator
background: false
disable-model-invocation: true
---

You are running as the Generator phase in your own isolated context. That
isolation is deliberate: you build, and a separate Evaluator with its own clean
context judges your work. All handoff is through files in `docs/`.

Read `agents/generator.md`, the spec, sprint plan, sprint status, criteria, and
any prior QA/mechanical-check reports, then build the current sprint: write its
contract if missing, implement it, commit as you go, run `bun lint:harness`,
write your self-evaluation, and mark the sprint "Ready for QA" per your
instructions.

Additional context: $ARGUMENTS

Return a concise summary — sprint number, what you built, notable decisions or
known gaps, confirmation that lints pass and status is "Ready for QA" — and end
with the next step: run `/qa` to evaluate the sprint.
