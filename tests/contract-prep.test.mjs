import assert from "node:assert/strict";
import test from "node:test";
import {
  contractHasAcceptanceCriteria,
  decideContractPrep,
  reviewIsFresh,
  stripSelfEvaluation,
} from "../harness-runtime/contract-prep.mjs";

const CONTRACT = `# Sprint 1

## Acceptance criteria
- [ ] Home lists habits

## Generator self-evaluation
I am confident this matches the spec.
- [x] done
`;

test("acceptance criteria require a checklist under that heading", () => {
  assert.equal(contractHasAcceptanceCriteria(CONTRACT), true);
  assert.equal(contractHasAcceptanceCriteria("# Notes\n\nLooks done.\n"), false);
  assert.equal(
    contractHasAcceptanceCriteria("## Acceptance criteria\n\nWe will know it when we see it.\n"),
    false,
  );
});

test("stripSelfEvaluation drops the generator's claim and keeps the contract", () => {
  const artifact = stripSelfEvaluation(CONTRACT);
  assert.match(artifact, /Home lists habits/);
  assert.doesNotMatch(artifact, /self-evaluation/i);
  assert.doesNotMatch(artifact, /confident/);
});

test("reviewIsFresh requires the stop line, the autonomous skip, and a newer file", () => {
  const review = "Stop: reviewed\n\nCross-model: skipped (autonomous)\n";
  assert.equal(
    reviewIsFresh({ reviewText: review, reviewMtimeMs: 200, contractMtimeMs: 100 }),
    true,
  );
  assert.equal(
    reviewIsFresh({ reviewText: review, reviewMtimeMs: 50, contractMtimeMs: 100 }),
    false,
  );
  assert.equal(
    reviewIsFresh({
      reviewText: "Stop: reviewed\n",
      reviewMtimeMs: 200,
      contractMtimeMs: 100,
    }),
    false,
  );
});

test("decideContractPrep drafts, then reviews once, then implements", () => {
  assert.equal(decideContractPrep({ contractText: "" }), "write-contract");
  assert.equal(
    decideContractPrep({ contractText: CONTRACT, draftDispatches: 1 }),
    "review",
  );
  assert.equal(
    decideContractPrep({
      contractText: CONTRACT,
      reviewText: "Stop: reviewed\nCross-model: skipped (autonomous)\n",
      reviewMtimeMs: 20,
      contractMtimeMs: 10,
      draftDispatches: 1,
      reviewDispatches: 1,
    }),
    "implement",
  );
});

test("a QA retry skips contract prep", () => {
  assert.equal(decideContractPrep({ qaRetry: true, contractText: "" }), "implement");
});

test("one review dispatch is the bound when the review file is missing", () => {
  assert.equal(
    decideContractPrep({ contractText: CONTRACT, reviewDispatches: 1 }),
    "implement",
  );
});
