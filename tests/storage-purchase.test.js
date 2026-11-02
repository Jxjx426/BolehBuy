import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentMonthExpenses,
  getActiveBnplSummary,
  getTotals,
  localDateString,
} from "../js/calculations.js";
import { createPurchaseRecord, validateSavedRecords } from "../js/storage.js";

const existingRecords = [
  { id: "income-1", type: "income", name: "Allowance", category: "Income", amount: 2000, date: null, dueDate: null },
  { id: "commitment-1", type: "commitment", name: "Phone", category: "Bills", amount: 80, date: null, dueDate: null },
];

test("Pay in Full creates one dated Shopping expense without changing existing records", () => {
  const original = structuredClone(existingRecords);
  const expense = createPurchaseRecord({
    itemName: "Study desk",
    itemPrice: 349.9,
    paymentMethod: "pay-full",
    duration: null,
    monthlyInstallment: 0,
  }, "purchase-full-1");

  assert.deepEqual(expense, {
    id: "purchase-full-1",
    type: "expense",
    name: "Study desk",
    category: "Shopping",
    amount: 349.9,
    date: localDateString(),
    dueDate: null,
  });
  assert.deepEqual(existingRecords, original);
  assert.deepEqual(currentMonthExpenses([...existingRecords, expense]), [expense]);
  const totals = getTotals([...existingRecords, expense]);
  assert.equal(totals.expenses, 349.9);
  assert.equal(totals.commitments, 80);
});

test("Instalment creates a term-aware BNPL commitment for the exact monthly amount", () => {
  const commitment = createPurchaseRecord({
    itemName: "Laptop",
    itemPrice: 1200,
    paymentMethod: "installment",
    duration: 3,
    monthlyInstallment: 106.67,
    confirmationDate: "2026-01-31",
  }, "purchase-installment-1");

  assert.deepEqual(commitment, {
    id: "purchase-installment-1",
    type: "commitment",
    name: "Laptop",
    category: "BNPL",
    amount: 106.67,
    date: null,
    dueDate: null,
    startDate: "2026-01-31",
    durationMonths: 3,
    endDate: "2026-04-30",
    status: "active",
  });
  assert.equal("duration" in commitment, false);

  const totals = getTotals([...existingRecords, commitment], new Date("2026-03-01"), new Date("2026-01-31"));
  assert.equal(totals.commitments, 186.67);
  assert.equal(totals.expenses, 0);
});

test("legacy version-1 commitments remain ongoing without guessed dates", () => {
  const legacy = {
    version: 1,
    records: [
      { id: "legacy-bnpl", type: "commitment", name: "Old BNPL", category: "BNPL", amount: 25, date: null, dueDate: null },
    ],
  };
  assert.deepEqual(validateSavedRecords(legacy), legacy.records);
  assert.deepEqual(getActiveBnplSummary(legacy.records, new Date("2035-01-01")), {
    count: 1,
    monthlyAmount: 25,
  });
});

test("duration metadata is optional, but provided end dates must match the selected term", () => {
  const record = {
    id: "term-bnpl",
    type: "commitment",
    name: "Course fee",
    category: "BNPL",
    amount: 50,
    date: null,
    dueDate: null,
    startDate: "2026-01-31",
    durationMonths: 3,
    endDate: "2026-04-30",
  };
  assert.deepEqual(validateSavedRecords({ version: 1, records: [record] }), [record]);
  assert.throws(() => validateSavedRecords({
    version: 1,
    records: [{ ...record, endDate: "2026-04-29" }],
  }), /invalid/);
});

test("completed and expired BNPL plans are excluded but remain valid historical records", () => {
  const plans = [
    { id: "active", type: "commitment", name: "Active", category: "BNPL", amount: 30, date: null, dueDate: null, startDate: "2026-01-01", durationMonths: 3, endDate: "2026-04-01", status: "active" },
    { id: "completed", type: "commitment", name: "Completed", category: "BNPL", amount: 40, date: null, dueDate: null, startDate: "2026-01-01", durationMonths: 3, endDate: "2026-04-01", status: "completed" },
    { id: "bill", type: "commitment", name: "Bill", category: "Bills", amount: 80, date: null, dueDate: null },
  ];
  assert.deepEqual(getActiveBnplSummary(plans, new Date("2026-03-31")), { count: 1, monthlyAmount: 30 });
  assert.deepEqual(getActiveBnplSummary(plans, new Date("2026-04-02")), { count: 0, monthlyAmount: 0 });
  assert.equal(getTotals(plans, new Date("2026-03-01"), new Date("2026-04-02")).commitments, 80);
  assert.equal(validateSavedRecords({ version: 1, records: plans }).length, 3);
});

test("purchase record creation rejects invalid instalments", () => {
  assert.throws(() => createPurchaseRecord({
    itemName: "Laptop",
    paymentMethod: "installment",
    duration: 9,
    monthlyInstallment: 100,
  }, "invalid-purchase"), /instalment details are invalid/);
});
