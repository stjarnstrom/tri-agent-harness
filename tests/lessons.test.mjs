import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORIES,
  MAX_ACTIVE_LESSONS,
  mergeLedgers,
  parseLedger,
  renderLessonsMd,
  selectActive,
  serializeLedger,
  validateEntry,
} from "../scripts/lib/lessons-core.mjs";

function entry(overrides = {}) {
  return {
    id: "a11y-button-contrast",
    category: "a11y",
    phase: "generator",
    rule: "Verify WCAG AA contrast on all colored interactive elements.",
    strikes: 2,
    status: "active",
    sources: [{ project: "acme-dashboard", sprint: 2, date: "2026-07-13" }],
    ...overrides,
  };
}

test("validateEntry accepts a well-formed entry", () => {
  assert.deepEqual(validateEntry(entry()), []);
});

test("validateEntry rejects bad id, category, phase, strikes, status, sources", () => {
  assert.ok(validateEntry(entry({ id: "Bad Slug!" })).length > 0);
  assert.ok(validateEntry(entry({ category: "vibes" })).length > 0);
  assert.ok(validateEntry(entry({ phase: "retrospector" })).length > 0);
  assert.ok(validateEntry(entry({ strikes: 0 })).length > 0);
  assert.ok(validateEntry(entry({ status: "archived" })).length > 0);
  assert.ok(validateEntry(entry({ sources: [] })).length > 0);
  assert.ok(validateEntry(entry({ rule: "" })).length > 0);
  assert.ok(validateEntry(entry({ rule: "x".repeat(241) })).length > 0);
});

test("parseLedger skips malformed lines and reports errors", () => {
  const good = JSON.stringify(entry());
  const text = `${good}\nnot json\n${JSON.stringify(entry({ id: "second-lesson" }))}\n${JSON.stringify({ id: "missing-fields" })}\n`;
  const { entries, errors } = parseLedger(text);
  assert.equal(entries.length, 2);
  assert.equal(errors.length, 2);
});

test("parseLedger of empty text yields no entries and no errors", () => {
  assert.deepEqual(parseLedger(""), { entries: [], errors: [] });
});

test("selectActive filters, sorts by strikes then recency, and caps", () => {
  const entries = [
    entry({ id: "one-strike", strikes: 1, sources: [{ project: "p", sprint: 1, date: "2026-01-01" }] }),
    entry({ id: "graduated-lesson", status: "graduated", strikes: 9 }),
    entry({ id: "three-strikes", strikes: 3 }),
    entry({ id: "newer-one-strike", strikes: 1, sources: [{ project: "p", sprint: 1, date: "2026-06-01" }] }),
  ];
  const active = selectActive(entries);
  assert.deepEqual(
    active.map((e) => e.id),
    ["three-strikes", "newer-one-strike", "one-strike"],
  );
  const many = Array.from({ length: 30 }, (_, i) => entry({ id: `lesson-${String(i).padStart(2, "0")}` }));
  assert.equal(selectActive(many).length, MAX_ACTIVE_LESSONS);
});

test("renderLessonsMd groups active lessons by phase and skips non-active", () => {
  const md = renderLessonsMd([
    entry({ id: "gen-lesson" }),
    entry({ id: "eval-lesson", phase: "evaluator", category: "process", rule: "Re-test previously passed criteria after fixes." }),
    entry({ id: "grad-lesson", status: "graduated" }),
  ]);
  assert.match(md, /## Generator/);
  assert.match(md, /## Evaluator/);
  assert.match(md, /\*\*\[a11y\]\*\* Verify WCAG AA contrast/);
  assert.match(md, /2 strikes/);
  assert.doesNotMatch(md, /grad-lesson/);
  assert.ok(md.endsWith("\n"));
  assert.ok(!md.endsWith("\n\n"));
});

test("renderLessonsMd with no active lessons renders the empty placeholder", () => {
  const md = renderLessonsMd([]);
  assert.match(md, /No lessons yet/);
});

test("mergeLedgers unions sources, takes max strikes, prefers graduated, keeps base rule text", () => {
  const base = [entry({ rule: "Base wording.", strikes: 2 })];
  const incoming = [
    entry({
      rule: "Clone wording.",
      strikes: 1,
      status: "graduated",
      sources: [
        { project: "acme-dashboard", sprint: 2, date: "2026-07-13" }, // duplicate
        { project: "other-app", sprint: 1, date: "2026-07-20" },
      ],
    }),
    entry({ id: "brand-new-lesson", category: "design" }),
  ];
  const merged = mergeLedgers(base, incoming);
  assert.equal(merged.length, 2);
  const m = merged.find((e) => e.id === "a11y-button-contrast");
  assert.equal(m.sources.length, 2);
  assert.equal(m.strikes, 2);
  assert.equal(m.status, "graduated");
  assert.equal(m.rule, "Base wording.");
});

test("mergeLedgers recurrence bumps strikes to distinct source count", () => {
  const base = [entry({ strikes: 1 })];
  const incoming = [entry({ strikes: 1, sources: [{ project: "other-app", sprint: 3, date: "2026-08-01" }] })];
  const [m] = mergeLedgers(base, incoming);
  assert.equal(m.strikes, 2);
});

test("serializeLedger round-trips through parseLedger", () => {
  const entries = [entry(), entry({ id: "second-lesson" })];
  const { entries: parsed } = parseLedger(serializeLedger(entries));
  assert.deepEqual(parsed, entries);
});

test("CATEGORIES matches the spec", () => {
  assert.deepEqual(CATEGORIES, ["a11y", "correctness", "design", "performance", "process", "lint"]);
});
