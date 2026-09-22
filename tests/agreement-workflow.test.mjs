import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgreementAcceptanceUpdate,
  getAgreementTitle,
  getAgreementType,
  shouldPromptAgreement,
} from "../lib/agreements/agreementWorkflow.mjs";

test("agreement workflow detects when prompting is required", () => {
  assert.equal(shouldPromptAgreement(null), false);
  assert.equal(shouldPromptAgreement({ agreementAccepted: true }), false);
  assert.equal(shouldPromptAgreement({ agreementAccepted: false }), true);
});

test("agreement workflow maps category to title and stored type", () => {
  assert.equal(getAgreementTitle("CosmOrbiter"), "Listed Partner Agreement");
  assert.equal(getAgreementTitle("Orbiter"), "Partner Agreement");
  assert.equal(getAgreementType("CosmOrbiter"), "LISTED_PARTNER");
  assert.equal(getAgreementType("Orbiter"), "PARTNER");
});

test("agreement workflow builds the Firestore update payload", () => {
  const acceptedAt = new Date("2026-04-03T10:00:00Z");
  const update = buildAgreementAcceptanceUpdate({
    category: "CosmOrbiter",
    pdfUrl: "https://example.com/agreement.pdf",
    acceptedAt,
  });

  assert.deepEqual(update, {
    agreementAccepted: true,
    agreementAcceptedAt: acceptedAt,
    agreementType: "LISTED_PARTNER",
    agreementPdfUrl: "https://example.com/agreement.pdf",
  });
});
