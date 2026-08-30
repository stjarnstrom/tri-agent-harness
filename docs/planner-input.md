# What to give the Planner

You do not have to start with a one-liner. A sentence works. So does a page of
intent you already wrote in another chat. What you should **not** do is hand
the Planner a finished PRD and expect it to rubber-stamp it.

The Planner's job is to expand **intent** into the harness's own artifacts:
`docs/spec.md`, `docs/sprint-plan.md`, and `docs/sprint-status.md`. Those files
are the source of truth for the Generator and Evaluator. A competing spec from
Claude chat fights that job — it either gets ignored, or it locks in
implementation the Planner was supposed to stay above.

The useful middle is an **intent brief**: richer than a slogan, thinner than a
PRD. Users, the job, must / won't, and how the first session should feel.

Paste it as the product prompt:

```bash
./harness.sh "$(cat my-intent-brief.md)"
# or
/plan   # paste the brief as the argument
/cycle  # same — the first planner dispatch gets the whole brief
```

Visual direction belongs in [`design/brief.md`](../design/README.md), not in
the prompt. Standing stack choices belong in `AGENTS.md` under
**Tech Stack Preferences**, so you do not repeat "use Convex" every run.

Worked example: [`examples/pre-plan-input.md`](examples/pre-plan-input.md).
Field-guide version: [Planning input](https://stjarnstrom.github.io/tri-agent-harness/guide/#preplan).

---

## What actually helps

Give the Planner *product* material. It will invent the spec shape, the sprint
cuts, and the design language (unless you parked those in `design/`).

| Include | Why |
|---------|-----|
| **Who and the situation** | "Someone maintaining 3–8 personal habits who wants streak feedback without an account" |
| **The job** | The one thing the product must do well on the first session |
| **Must / nice / won't** | Observable outcomes and hard exclusions. "No social, no accounts" is gold |
| **First-session feel** | What using it should feel like — calm ritual, not gamified feed |
| **Outcome-shaped stories** | "As a runner I want to mark today done in one tap so the streak stays honest" |
| **Constraints that are real** | Legal, brand, platform, data residency, "do not expand beyond this scope" |

User stories are welcome when they describe **outcomes**. They are not a
substitute for a spec — the Planner will rewrite them into the sprint plan.

---

## What to leave out (or park elsewhere)

| Skip or move | Why |
|--------------|-----|
| File trees, table schemas, component names | Wrong implementation detail cascades into Generator bugs. The Planner stays at *what*, not *how* |
| "Use Zustand and put the store in `src/store`" | Stack *preferences* live in `AGENTS.md`. Per-product stack goes in the spec the Planner writes |
| Full visual system in the prompt | Authoritative visuals go in `design/brief.md` and `design/constraints.md` |
| Pre-cut sprint lists | Hints only. The Planner re-slices into 4–8 runnable sprints; Sprint 1 is always the skeleton |
| A complete `docs/spec.md` clone | That is the Planner's output, not its input. Distill the intent and let it write the spec |

A long PRD from another chat is still useful as **raw material**. Distill it
into the layers above — do not paste the whole thing. If you must paste, strip
implementation prescriptions first and add one line: *"This is intent, not the
spec. Rewrite into the harness spec format. Re-slice sprints."*

---

## Paste-ready skeleton

Fill only what you know. Blank sections are fine — that is where the Planner
is supposed to be ambitious.

```markdown
# [Product working title]

**Who:** [user and situation]
**Job:** [the core job this tool does]
**First session:** [what the first use should feel like]

## Must
- [observable outcome]
- [observable outcome]

## Nice
- [outcome you would love if it fits]

## Won't (v1)
- [hard exclusion]

## Stories (optional)
- As a [user], I want to [action] so that [outcome]

## Constraints
- [legal / brand / platform / "do not expand beyond this scope"]

## Stack
- Only list departures from AGENTS.md Tech Stack Preferences.
```

That is enough. The Planner will still go beyond a thin brief — that is
intentional — so cap cost with `HARNESS_MAX_SPRINTS_PER_RUN=1` until you trust
the plan.

---

## Where each kind of input lives

| Input | Put it here |
|-------|-------------|
| Intent, users, stories, scope | Product prompt (`./harness.sh`, `/plan`, `/cycle`) |
| Visual direction, anti-patterns | `design/brief.md` |
| Must-have / must-not design rules | `design/constraints.md` |
| Mood images, logos | `design/references/` |
| Usual stack when uncertain | `AGENTS.md` → Tech Stack Preferences |
| Confirmed stack for *this* product | Written by the Planner into `docs/spec.md` and `AGENTS.md` |

The Planner reads `AGENTS.md` and `design/` before it writes. It does not see
your other chat unless you paste (or file) the intent.
