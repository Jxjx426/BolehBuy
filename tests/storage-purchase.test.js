import assert from "node:assert/strict";
import { test } from "node:test";
import { currentMonthExpenses, getTotals, localDateString } from "../js/calculations.js";
import { createPurchaseRecord } from "../js/storage.js";

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

test("Instalment creates one BNPL commitment for the exact monthly amount, not a one-off expense", () => {
  const commitment = createPurchaseRecord({
    itemName: "Laptop",
    itemPrice: 1200,
    paymentMethod: "installment",
    duration: 12,
    monthlyInstallment: 106.67,
  }, "purchase-installment-1");

  assert.deepEqual(commitment, {
    id: "purchase-installment-1",
    type: "commitment",
    name: "Laptop",
    category: "BNPL",
    amount: 106.67,
    date: null,
    dueDate: null,
  });
  assert.equal("duration" in commitment, false);
  assert.equal("endDate" in commitment, false);

  const totals = getTotals([...existingRecords, commitment]);
  assert.equal(totals.commitments, 186.67);
  assert.equal(totals.expenses, 0);
});

test("purchase record creation rejects invalid instalments", () => {
  assert.throws(() => createPurchaseRecord({
    itemName: "Laptop",
    paymentMethod: "installment",
    duration: 9,
    monthlyInstallment: 100,
  }, "invalid-purchase"), /instalment details are invalid/);
});
