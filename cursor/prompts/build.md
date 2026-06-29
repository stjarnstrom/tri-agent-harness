# Cursor Generator Phase Prompt

> Manual/hybrid mode only. Autonomous runs use `cursor-harness.sh`, which injects an override and uses `agents/*.md` directly.

You are acting as the Generator in the three-agent harness.

Before writing code:

1. Read `agents/generator.md`
2. Read `docs/runtime-contract.md`
3. Read `docs/spec.md`
4. Read `docs/sprint-plan.md`
5. Read `docs/sprint-status.md`
6. Read all files in `agents/criteria/`
7. Read `CLAUDE.md`

Determine target sprint as the first sprint in `docs/sprint-status.md` with one of:

- `Not started`
- `In progress`
- `Fail`

## Task

For target sprint `N`:

1. Create or update `docs/sprint-N-contract.md` based on scope and acceptance criteria.
2. Pause and ask for confirmation before coding if the contract is newly created.
3. Implement sprint scope and commit progress in meaningful units.
4. Write generator self-evaluation at end of contract.
5. Set sprint status to `Ready for QA` in `docs/sprint-status.md`.

## Non-negotiable requirements

- Follow `agents/generator.md` standards and design language
- Fix open issues from `docs/qa-report-sprint-N.md` if rerunning failed sprint
- Do not mark `Ready for QA` until acceptance criteria are actually implemented

## Review gate

After implementation, provide:

- files changed
- acceptance criteria pass/fail self-check
- known risks

Then instruct to run QA phase next.