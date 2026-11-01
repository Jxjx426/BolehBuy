export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateAfterDays(days, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDateString(parsed) === value;
}

export function currency(amount) {
  const absolute = Math.abs(amount);
  const formatted = absolute.toLocaleString("en-MY", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(absolute) ? 0 : 2,
  });
  return amount < 0 ? `-RM ${formatted}` : `RM ${formatted}`;
}

export function formatDate(value, options = { day: "numeric", month: "short" }) {
  if (!isValidDate(value)) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", options);
}

export function sumAmount(items) {
  const cents = items.reduce((total, item) => total + Math.round(item.amount * 100), 0);
  return cents / 100;
}

export function currentMonthExpenses(records, date = new Date()) {
  const month = localDateString(date).slice(0, 7);
  return records.filter((record) => record.type === "expense" && record.date.startsWith(month));
}

export function getTotals(records, date = new Date()) {
  const income = sumAmount(records.filter((record) => record.type === "income"));
  const commitments = sumAmount(records.filter((record) => record.type === "commitment"));
  const expenses = sumAmount(currentMonthExpenses(records, date));
  return { income, commitments, expenses, remaining: income - commitments - expenses };
}

export function calculatePurchaseImpact(records, purchase, date = new Date()) {
  const totals = getTotals(records, date);
  const monthlyInstallment = purchase.paymentMethod === "installment"
    ? Math.round((purchase.price / purchase.duration) * 100) / 100
    : 0;
  const newCommitments = totals.commitments + monthlyInstallment;
  const estimatedRemaining = purchase.paymentMethod === "pay-full"
    ? totals.remaining - purchase.price
    : totals.remaining - monthlyInstallment;
  const hasIncomeRecords = records.some((record) => record.type === "income");
  const hasCommitmentRecords = records.some((record) => record.type === "commitment");
  let assessment;

  if (!hasIncomeRecords || !hasCommitmentRecords) {
    const missing = [
      ...(!hasIncomeRecords ? ["monthly income"] : []),
      ...(!hasCommitmentRecords ? ["monthly commitment"] : []),
    ];
    assessment = {
      level: "insufficient",
      title: "Insufficient Data",
      reason: `Add records for ${missing.join(" and ")} in My Money Dashboard for a more complete assessment.`,
    };
  } else if (estimatedRemaining < 0) {
    assessment = {
      level: "risky",
      title: "Risky",
      reason: `This purchase would put your estimated monthly balance ${currency(Math.abs(estimatedRemaining))} below zero.`,
    };
  } else if (
    estimatedRemaining < totals.income * 0.2 ||
    (totals.income > 0 && newCommitments > totals.income * 0.5)
  ) {
    assessment = {
      level: "careful",
      title: "Be Careful",
      reason: "Your estimated remaining money is below 20% of your income, or commitments would use more than half of it.",
    };
  } else {
    assessment = {
      level: "comfortable",
      title: "Comfortable",
      reason: "Based on the records available, your estimate leaves at least 20% of your monthly income after this purchase.",
    };
  }

  return {
    ...totals,
    itemName: purchase.name,
    itemPrice: purchase.price,
    paymentMethod: purchase.paymentMethod,
    duration: purchase.paymentMethod === "installment" ? purchase.duration : null,
    monthlyInstallment,
    newCommitments,
    estimatedRemaining,
    hasIncomeRecords,
    hasCommitmentRecords,
    assessment,
  };
}

export function byDateAscending(a, b) {
  return a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name);
}
