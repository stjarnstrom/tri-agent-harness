---
name: retro
description: Run the Retrospector phase — distill QA-failure lessons from all QA reports into the lessons ledger, regenerate harness/LESSONS.md, and draft guardrail proposals for patterns at 2+ strikes. Use at the end of a run. Runs in an isolated retrospector subagent.
argument-hint: "[extra context, e.g. 'focus on a11y failures']"
context: fork
agent: retrospector
background: false
disable-model-invocation: true
---

You are running as the Retrospector phase in your own isolated context. That
isolation is deliberate: distillation should judge the run's artifacts cold,
without the orchestrator's conversation biasing which failures feel important.
All handoff is through files: the ledger, `harness/LESSONS.md`, and
`docs/proposals/`.

Read `agents/retrospector.md` and your other required inputs. Distill the
`LESSON-CANDIDATES` blocks from all QA reports into `harness/lessons.jsonl`,
regenerate `harness/LESSONS.md` via `node scripts/render-lessons.mjs`, run
`node scripts/validate-lessons.mjs`, draft guardrail proposals for lessons at
2+ strikes, and commit.

Additional context: $ARGUMENTS

Return a concise summary: lessons added/updated, lessons retired, proposals
drafted (these need human review), and validation status.
