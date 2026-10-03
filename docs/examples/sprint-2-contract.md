# Sprint Contract — Sprint 2: Habits + check-in

> **Example only.** The contract that reached QA. [`sprint-2-contract-review.md`](sprint-2-contract-review.md) is the one pass that ran on the draft, before implementation. The self-evaluation below is the section that review does not receive.

## Scope

**Sprint goal:** Users can create habits, see them on the home screen, and mark today complete with persistence across refresh.

**Features from spec:** Habit list home (#1), quick check-in (#2), habit create/edit (#4).

## Implementation approach

- Zustand store with `localStorage` sync on every mutation
- `Habit` type: `id`, `name`, `emoji?`, `completions: string[]` (ISO date strings)
- Home route `/` lists habits; `/habits/new` and `/habits/:id/edit` for CRUD
- Check-in toggles today's date in `completions` (idempotent)

## Acceptance criteria

### Feature: Habit list home
- [ ] Home shows all habits with name and emoji (or default icon)
- [ ] Each row shows done/undone state for **today**
- [ ] Empty state when no habits exist, with link to create first habit

### Feature: Quick check-in
- [ ] Clicking row or checkbox marks habit done for today
- [ ] Second click same day undoes check-in (toggle)
- [ ] After refresh, done state matches last action

### Feature: Habit create/edit
- [ ] User can create habit with name (required) and optional emoji
- [ ] User can edit name/emoji and delete habit (confirm dialog)

## Design requirements

- [ ] Midnight ledger palette from spec (navy surfaces, amber primary)
- [ ] Check-in uses 180ms ease-out animation per spec
- [ ] Mobile layout: single column, 44px min touch targets

## Acceptance tests

- [ ] Home shows all habits with name and emoji — `app/src/habits.test.ts`
- [ ] Each row shows done/undone state for today — `app/src/habits.test.ts`
- [ ] Empty state when no habits exist, with link to create first habit — `app/src/habits.test.ts`
- [ ] Clicking row or checkbox marks habit done for today — `app/src/check-in.test.ts`
- [ ] Second click same day undoes check-in — `app/src/check-in.test.ts`
- [ ] After a full page load, done state matches the last action — `app/src/check-in.test.ts`
- [ ] User can create a habit with name and optional emoji — `app/src/habits.test.ts`
- [ ] User can edit name/emoji and delete a habit — `app/src/habits.test.ts`

## Stack APIs

No framework APIs. Persistence is the Zustand store plus `localStorage` key `taskflow-habits`, covered by `app/src/check-in.test.ts`.

## Out of scope

- Streak calculation (Sprint 3)
- AI naming (Sprint 4)
- Backend / accounts

## Test setup notes

- Seed: optional — empty store is valid for empty-state test
- Run: `cd app && npm run dev` (port 5173)
- Clear data: DevTools → Application → localStorage → `taskflow-habits`

## Definition of done

- All acceptance criteria pass via Playwright
- Each acceptance criterion had a failing test in the named file before the behavior landed
- Stack APIs are cited, marked UNVERIFIED, or recorded as “No framework APIs”
- No console errors on happy path
- Commits with descriptive messages

---

## Generator self-evaluation

- [x] Habit CRUD routes implemented
- [x] Check-in toggle persists to localStorage
- [x] Empty state on home
- [x] Design tokens applied (navy/amber)
- [ ] Streak display — **deferred to Sprint 3** (not in this contract)
