---
name: plan
description: Run the Planner phase — expand a short product prompt into docs/spec.md, docs/sprint-plan.md, and docs/sprint-status.md. Use for a new product or to re-plan after picking a design direction. Runs in an isolated planner subagent.
argument-hint: "[product prompt, e.g. 'a habit tracker with streak analytics']"
context: fork
agent: planner
background: false
disable-model-invocation: true
---

You are running as the Planner phase in your own isolated context. That
isolation is deliberate: nothing from the orchestrator's conversation leaks into
the Generator's or Evaluator's context later. All handoff is through files in
`docs/`.

Read `agents/planner.md` and your other required inputs, then expand the
following product prompt into a full spec, sprint plan, and status tracker — or
design options if you are in scout mode — writing all files per your
instructions.

Product prompt: $ARGUMENTS

Return a concise summary and the next step: `/build` to start Sprint 1, or — in
design-scout mode — which directions are in `docs/design-options.md` and that
the user must pick one in `design/selected-direction.md` before planning can
finalize.
