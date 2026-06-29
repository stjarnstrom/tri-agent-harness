# Agent Instructions — Tool-Agnostic Core Rules

These rules apply regardless of which AI coding agent you use (Claude Code, Cursor, opencode, etc.).
Each tool reads this file in its own way:

- **Claude Code**: Referenced via `CLAUDE.md` → "Read `harness/AGENT-INSTRUCTIONS.md`"
- **Cursor**: Referenced via `.cursorrules` → same content adapted for Cursor's format
- **opencode**: Referenced via `opencode.jsonc` → loaded as system instructions

## Domain Packages

When working inside a domain package (e.g. `packages/billing/`), read that package's `CLAUDE.md` before making changes. Claude Code loads these automatically; Cursor, opencode, and other tools must read them explicitly.

## The Four Rules Every Agent Must Follow

### 1. Sandbox First

Never read, write, or modify files outside the project root without explicit user permission.
The pre-commit hook (`harness/hooks/pre-commit`) enforces this at git level — but don't rely on it as your only guardrail. If you're about to `cat /etc/passwd` or `rm -rf ~/Downloads`, stop and ask first.

**Secrets:** Never read, paste, or hardcode real credentials. The workflow:

1. Read `.env.example` for variable **names** and placeholder shapes — that file is safe to commit.
2. Real values live in `.env.local` or `.env` (gitignored, listed in `.cursorignore`).
3. Reference secrets in code as `process.env.VAR_NAME` — never as string literals.
4. If you need a new env var, add it to `.env.example` with a dummy value and tell the user to set the real one locally.

The pre-commit hook blocks staging `.env` files and scans for leaked keys. opencode blocks reads of `.env` and credential files; Cursor uses `.cursorignore` (install via `bun run setup`).

### 2. Lints Are Instructions, Not Diagnostics

When a harness lint fires:
- Don't suppress it without reading the message.
- The error message IS the prompt — it tells you exactly what import/path/fix to apply.
- If you've seen this before in this session, suggest adding a rule rather than fixing it manually again.
- See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full two-strike workflow.

### 3. Code First, Spec Last

Don't over-engineer upfront. Generate working code from high-level intent, then let the harness refine it:
1. Write the code (messy is fine).
2. Run lints → fix what they tell you.
3. Commit when clean.
4. Document design decisions AFTER merging — the working code IS the spec.

### 4. Catch Your Own Slop

If you correct yourself for the same mistake twice in a session:
- Stop and flag it explicitly.
- Run `bun lint:harness` to check if a rule exists.
- If no rule catches it, propose adding one. Recurring mistakes belong in the harness.
