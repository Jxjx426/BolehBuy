import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateCommitmentMetrics,
  calculatePurchaseComparison,
  calculatePurchaseImpact,
  getActiveBnplSummary,
  getTotals,
} from "../js/calculations.js";

const referenceDate = new Date("2026-11-15T12:00:00");
const records = [
  { type: "income", amount: 2000 },
  { type: "commitment", amount: 100 },
  { type: "expense", amount: 200, date: "2026-11-04" },
];

function calculate(duration, annualFlatInterestRate = 0, additionalFees = 0) {
  return calculatePurchaseImpact(records, {
    name: "Laptop",
    price: 1200,
    paymentMethod: "installment",
    duration,
    annualFlatInterestRate,
    additionalFees,
  }, referenceDate);
}

test("annual flat interest and one-off fees produce the requested rounded instalment", () => {
  const impact = calculate(12, 5, 20);

  assert.equal(impact.totalInterest, 60);
  assert.equal(impact.totalPurchaseCost, 1280);
  assert.equal(impact.monthlyInstallment, 106.67);
  assert.equal(impact.newCommitments, 206.67);
  assert.equal(impact.estimatedRemaining, 1593.33);
});

test("zero-interest instalments preserve the existing no-fee calculation", () => {
  const impact = calculate(6);

  assert.equal(impact.totalInterest, 0);
  assert.equal(impact.totalPurchaseCost, 1200);
  assert.equal(impact.monthlyInstallment, 200);
});

test("all supported instalment durations include flat interest for the selected term", () => {
  const expected = new Map([
    [3, [15, 1235, 411.67]],
    [6, [30, 1250, 208.33]],
    [12, [60, 1280, 106.67]],
    [24, [120, 1340, 55.83]],
  ]);

  for (const [duration, [interest, totalCost, monthly]] of expected) {
    const impact = calculate(duration, 5, 20);
    assert.equal(impact.totalInterest, interest, `${duration} months interest`);
    assert.equal(impact.totalPurchaseCost, totalCost, `${duration} months total cost`);
    assert.equal(impact.monthlyInstallment, monthly, `${duration} months payment`);
  }
});

test("comparison savings use the actual monthly payment and stop at the term", () => {
  const comparison = calculatePurchaseComparison(calculate(3, 5, 20));

  assert.equal(comparison.monthlyInstallment, 411.67);
  assert.equal(comparison.potentialSavings3Months, 1235);
  assert.equal(comparison.potentialSavings6Months, 1235);
});

test("Pay in Full ignores instalment rates and fees", () => {
  const impact = calculatePurchaseImpact(records, {
    name: "Laptop",
    price: 1200,
    paymentMethod: "pay-full",
    duration: null,
    annualFlatInterestRate: 5,
    additionalFees: 20,
  }, referenceDate);
  const comparison = calculatePurchaseComparison(impact);

  assert.equal(impact.totalInterest, 0);
  assert.equal(impact.additionalFees, 0);
  assert.equal(impact.totalPurchaseCost, 1200);
  assert.equal(impact.monthlyInstallment, 0);
  assert.equal(impact.estimatedRemaining, 500);
  assert.equal(comparison.potentialSavings3Months, 1200);
  assert.equal(comparison.potentialSavings6Months, 1200);
});

test("instalment calculations reject missing, negative and excessive input values", () => {
  const validPurchase = {
    name: "Laptop",
    price: 1200,
    paymentMethod: "installment",
    duration: 12,
    annualFlatInterestRate: 0,
    additionalFees: 0,
  };

  for (const changes of [
    { annualFlatInterestRate: undefined },
    { annualFlatInterestRate: -1 },
    { annualFlatInterestRate: 100.01 },
    { additionalFees: undefined },
    { additionalFees: -1 },
    { additionalFees: 1_000_000.01 },
  ]) {
    const purchase = { ...validPurchase, ...changes };
    assert.throws(
      () => calculatePurchaseImpact(records, purchase, referenceDate),
      RangeError,
    );
  }
});

test("commitment metrics show the before and after ratios and ignore a one-time purchase", () => {
  const impact = calculate(12);
  const metrics = calculateCommitmentMetrics(impact);

  assert.equal(metrics.existingMonthlyCommitments, 100);
  assert.equal(metrics.monthlyInstalment, 100);
  assert.equal(metrics.totalMonthlyCommitments, 200);
  assert.equal(metrics.commitmentRatioBefore, 5);
  assert.equal(metrics.commitmentRatioAfter, 10);

  const payFull = calculateCommitmentMetrics(calculatePurchaseImpact(records, {
    name: "Laptop",
    price: 1200,
    paymentMethod: "pay-full",
    duration: null,
    annualFlatInterestRate: 0,
    additionalFees: 0,
  }, referenceDate));
  assert.equal(payFull.monthlyInstalment, 0);
  assert.equal(payFull.totalMonthlyCommitments, 100);
});

test("commitment metrics preserve missing income or commitment data", () => {
  const noIncome = calculatePurchaseImpact([
    { type: "commitment", amount: 100 },
  ], {
    name: "Laptop", price: 1200, paymentMethod: "installment", duration: 12,
    annualFlatInterestRate: 0, additionalFees: 0,
  }, referenceDate);
  const noCommitments = calculatePurchaseImpact([
    { type: "income", amount: 2000 },
  ], {
    name: "Laptop", price: 1200, paymentMethod: "installment", duration: 12,
    annualFlatInterestRate: 0, additionalFees: 0,
  }, referenceDate);

  assert.deepEqual(calculateCommitmentMetrics(noIncome), {
    existingMonthlyCommitments: 100,
    monthlyInstalment: 100,
    totalMonthlyCommitments: 200,
    commitmentRatioBefore: null,
    commitmentRatioAfter: null,
  });
  assert.equal(calculateCommitmentMetrics(noCommitments).existingMonthlyCommitments, null);
  assert.equal(calculateCommitmentMetrics(noCommitments).totalMonthlyCommitments, null);
});

test("active BNPL summary excludes bills, completed plans, future plans and expired plans", () => {
  const commitments = [
    { type: "commitment", category: "BNPL", amount: 30, startDate: "2026-10-01", endDate: "2026-12-01", status: "active" },
    { type: "commitment", category: "BNPL", amount: 40, startDate: "2026-01-01", endDate: "2026-10-01", status: "active" },
    { type: "commitment", category: "BNPL", amount: 50, startDate: "2026-01-01", endDate: "2026-12-01", status: "completed" },
    { type: "commitment", category: "Bills", amount: 100 },
    { type: "commitment", category: "BNPL", amount: 60, startDate: "2026-12-01", endDate: "2027-03-01", status: "active" },
  ];

  assert.deepEqual(getActiveBnplSummary(commitments, referenceDate), {
    count: 1,
    monthlyAmount: 30,
  });
  assert.equal(getTotals(commitments, referenceDate, referenceDate).commitments, 130);
});
