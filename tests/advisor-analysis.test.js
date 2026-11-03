import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalAnalysis } from "../js/advisor-analysis.js";

test("local advisor flags missing financial records without treating them as zero", () => {
  const analysis = createLocalAnalysis({
    purchase: {
      itemName: "Laptop",
      itemPrice: 1200,
      paymentMethod: "installment",
      duration: 12,
      annualFlatInterestRate: 5,
      additionalFees: 20,
      monthlyInstallment: 106.67,
    },
    finances: {
      recordsComplete: false,
      missingRecords: ["monthly income", "monthly commitments"],
      monthlyIncome: null,
      existingMonthlyCommitments: null,
      currentMonthExpenses: 742,
      estimatedRemainingAfterPurchase: null,
    },
    spendingAssessment: {
      title: "Insufficient Data",
      reason: "Add missing records.",
      level: "insufficient",
    },
  });

  assert.equal(analysis.verdictLabel, "Not enough information");
  assert.match(analysis.verdict, /monthly income and monthly commitments/);
  assert.match(analysis.keyRisk, /Missing records/);
  assert.match(analysis.recommendedAction, /Add monthly income and monthly commitments/);
  assert.doesNotMatch(JSON.stringify(analysis), /RM 0/);
  assert.deepEqual(Object.keys(analysis), ["verdictLabel", "verdict", "keyRisk", "recommendedAction"]);
  assert.ok(Object.values(analysis).every((text) => typeof text === "string" && text.length <= 180));
});

test("local advisor recommends reviewing the commitment stack without declaring it manageable", () => {
  const analysis = createLocalAnalysis({
    purchase: {
      itemName: "Laptop",
      itemPrice: 1200,
      paymentMethod: "installment",
      duration: 12,
      annualFlatInterestRate: 5,
      additionalFees: 20,
      monthlyInstallment: 106.67,
    },
    finances: {
      recordsComplete: true,
      missingRecords: [],
      monthlyIncome: 2200,
      existingMonthlyCommitments: 680,
      currentMonthExpenses: 742,
      estimatedRemainingAfterPurchase: 500,
    },
    spendingAssessment: { title: "Review the trade-offs", reason: "Assessment text.", level: "informational" },
  });

  assert.equal(analysis.verdictLabel, "Review the trade-offs");
  assert.match(analysis.recommendedAction, /provider’s final total/);
  assert.match(analysis.keyRisk, /Unrecorded costs/);
});

test("local advisor does not infer a zero processing fee from an empty field", () => {
  const analysis = createLocalAnalysis({
    purchase: {
      itemName: "Tablet",
      itemPrice: 300,
      paymentMethod: "installment",
      duration: 6,
      annualFlatInterestRate: 0,
      additionalFees: 0,
      processingFeeExplicitlyShown: false,
      monthlyInstallment: 50,
    },
    finances: {
      recordsComplete: true,
      missingRecords: [],
      monthlyIncome: 2200,
      existingMonthlyCommitments: 680,
      currentMonthExpenses: 742,
      estimatedRemainingAfterPurchase: 728,
    },
    spendingAssessment: {
      title: "Review the trade-offs",
      reason: "This adds a monthly commitment.",
      level: "informational",
    },
  });

  assert.match(analysis.recommendedAction, /provider’s final total/);
});
