# Sprint Contract — Sprint [N]: [Title]

## Scope
**Sprint goal:** [One sentence describing what this sprint achieves]

**Features from spec:** [Which features/user stories from the spec are being implemented]

## Implementation approach
[Key technical decisions for this sprint — not exhaustive, just the ones that
matter for the evaluator to understand what they're testing]

## Acceptance criteria

Each criterion must be testable by the Evaluator using Playwright. Be specific.

### Feature: [Name]
- [ ] [Criterion 1 — describe the specific testable behavior]
- [ ] [Criterion 2]
- [ ] ...

### Feature: [Name]
- [ ] [Criterion 1]
- [ ] ...

## Design requirements
- [ ] [Specific design expectations — e.g., "Navigation follows the spec's dark sidebar pattern"]
- [ ] [Color, typography, spacing checks]

## Acceptance tests

One item per acceptance criterion. Name a test file that exists under `app/`
before the sprint is marked Ready for QA. Write that test so it fails, then
implement.

- [ ] [Criterion 1] — `app/src/[feature].test.ts`

## Stack APIs

Cite the official docs, or mark the call `UNVERIFIED`. Use `No framework APIs`
when the sprint does not call one.

- [Library or endpoint] — https://example.com/docs or UNVERIFIED

## Out of scope
[Explicitly list what is NOT being built in this sprint to prevent scope creep]

## Test setup notes
[Any specific setup the QA agent needs — seed data, env vars, running services]

## Definition of done
- All acceptance criteria pass when tested via Playwright
- Each acceptance criterion has a test that failed before the implementation
- Stack APIs are cited or marked UNVERIFIED
- Ship-bar items from the sprint plan are acceptance criteria when this sprint has them
- No console errors or warnings
- Git commits with descriptive messages
- Application runs without manual intervention after `npm run dev` / equivalent

---

## Evaluator review

**Status:** PENDING / APPROVED / NEEDS REVISION

**Evaluator notes:**
[To be filled by the Evaluator agent during contract review]

---

## Generator self-evaluation

[To be filled by the Generator after building — before marking "Ready for QA"]
