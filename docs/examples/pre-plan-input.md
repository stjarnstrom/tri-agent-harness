# Intent brief (from another chat — not canonical)

> **Example only.** This is the useful middle: richer than a one-liner, not a
> competing PRD. Paste something in this shape into `./harness.sh "…"` or
> `/plan`. The Planner still writes the authoritative `docs/spec.md` and
> sprint plan. See [`docs/planner-input.md`](../planner-input.md).

---

# Taskflow

**Who:** individuals building small daily routines (exercise, reading, meditation) who want streak feedback without an account.

**Job:** make today's check-in frictionless and the streak visible.

**First session:** add two habits, mark one done, see a streak of 1. The UI should feel like a private ritual — dark, calm, not generic startup purple.

## Must
- Add habits with a name and optional emoji
- One-tap "done today" on the home screen
- Streak count per habit (current + longest), honest across midnight
- Data survives a refresh

## Nice
- Weekly bar chart of completion rate
- Claude suggests habit names from a short goal description

## Won't (v1)
- Social, accounts, or mobile app stores — web only
- Teams, sharing, or reminders

## Stories
- As someone building a routine, I want to mark today done in one tap so the streak stays honest.
- As a returning user, I want to see current and longest streaks so a miss is visible without a lecture.

## Stack
- Local-first for v1 (localStorage is fine). Otherwise follow AGENTS.md Tech Stack Preferences.

## Sprints (rough idea — harness will re-slice)
1. Shell + nav + design tokens
2. CRUD habits + check-in
3. Streaks + analytics
4. AI naming helper + polish
