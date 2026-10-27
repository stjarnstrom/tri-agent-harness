# Reviewer brief (REVIEW.md)

Optional project-level brief for the Evaluator and contract-reviewer. Copy to
`docs/review.md` when the product has recurring area-specific failure modes.
Sprint contracts may instead use a short `## Reviewer brief` section.

Keep this short. Personas in `review-personas/` stay the global checklists;
this file narrows signal for *this* product.

## Failure modes

- [What usually goes wrong in this codebase — e.g. "auth redirects drop returnTo"]

## Nit cap

- Ignore style/cleanup already covered by `bun lint:harness`
- Cap nits at [N] per sprint unless Risk is High

## Skip paths

- Do not deep-review: [generated fixtures, vendor CSS, …]

## Evidence

- Prefer file+line or a Playwright reproduction step on every Important finding
- Summary of a review pass should start with a count ("3 Important, 1 Nit") or
  "nothing to fix"

## Graduation

Recurring Evaluator flags that survive two strikes belong in a lint rule or
persona checklist first; only then add a bullet here if the rule cannot be
mechanical. See `CONTRIBUTING.md` two-strike workflow and Retrospector proposals.
