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
  assert.match(analysis.watchOut, /cannot confirm/);
  assert.match(analysis.suggestion, /Add your monthly income and monthly commitments/);
  assert.doesNotMatch(JSON.stringify(analysis), /RM 0/);
  assert.ok(Object.values(analysis).every((text) => typeof text === "string" && text.length <= 200));
});

test("local advisor suggests checking provider terms when instalment costs include rates or fees", () => {
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
    spendingAssessment: { title: "Comfortable", reason: "Assessment text.", level: "comfortable" },
  });

  assert.equal(analysis.verdictLabel, "Looks manageable");
  assert.match(analysis.suggestion, /flat-rate calculation/);
});
