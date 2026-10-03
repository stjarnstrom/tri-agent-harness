# Constraints

Last reviewed: [date] by [owner]

The pre-QA floor guard reads the `## Thresholds` table. A number that moves
the wrong way, or a row that disappears, fails the sprint. Tightening is
silent. Loosening is a failure.

`tighten-up` means a higher value is stricter (coverage). `tighten-down`
means a lower value is stricter (LCP, CLS, bundle size).

## Floor

- No new suppression comments (`@ts-ignore`, `eslint-disable`, coverage ignores)
- No unimplemented stubs (`Not implemented`, empty `catch`)
- No skipped or deleted tests
- No secrets in source
- This file is not weakened to make a change pass

## Thresholds

| Metric | Operator | Value | Direction |
| --- | --- | --- | --- |
| coverage | >= | 80 | tighten-up |
| lcp-ms | <= | 2500 | tighten-down |
| cls | <= | 0.1 | tighten-down |

Every row needs a command that produces the number. A number with no command
is an aspiration, and the floor guard does not treat it as one — it only
notices when the number moves.
