import test from "node:test";
import assert from "node:assert/strict";
import { extractionFieldMessage, getExtractionWarnings } from "../js/checkout-scanner.js";

function extraction(overrides = {}) {
  return {
    itemName: { value: "Fictional headphones", confidence: "high" },
    cashPrice: { value: "360", confidence: "high" },
    paymentMethod: { value: "installment", confidence: "high" },
    durationMonths: { value: "6", confidence: "high" },
    monthlyInstallment: { value: "63", confidence: "high" },
    totalInstallmentPayment: { value: "378", confidence: "high" },
    processingFee: { value: "0", confidence: "high" },
    warnings: [],
    ...overrides,
  };
}

test("checkout extraction warns when the shown monthly and total amounts do not reconcile", () => {
  const result = extraction({
    totalInstallmentPayment: { value: "400", confidence: "medium" },
  });

  assert.match(getExtractionWarnings(result)[0], /do not match a simple instalment total/);
  assert.equal(result.totalInstallmentPayment.value, "400");
});

test("checkout extraction does not infer a total when duration is missing", () => {
  const result = extraction({
    durationMonths: { value: "", confidence: "not_found" },
    totalInstallmentPayment: { value: "", confidence: "not_found" },
  });

  assert.deepEqual(getExtractionWarnings(result), []);
});

test("checkout warnings preserve ambiguity about multiple displayed prices", () => {
  const warning = "Several prices are visible; verify which amount is final.";
  assert.deepEqual(getExtractionWarnings(extraction({ warnings: [warning] })), [warning]);
});

test("missing and low-confidence fields are clearly marked for verification", () => {
  assert.deepEqual(
    extractionFieldMessage({ value: "", confidence: "not_found" }, "Instalment period"),
    { text: "⚠️ Instalment period not found. Enter or select it manually; AI will not guess.", warning: true },
  );
  assert.equal(
    extractionFieldMessage({ value: "360", confidence: "low" }, "Cash price").warning,
    true,
  );
});
