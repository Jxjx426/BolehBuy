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

export function isValidDurationMonths(value) {
  return Number.isInteger(value) && value >= 1 && value <= 120;
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

function roundCurrency(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function currentMonthExpenses(records, date = new Date()) {
  const month = localDateString(date).slice(0, 7);
  return records.filter((record) => record.type === "expense" && record.date.startsWith(month));
}

export function addMonthsToDate(dateString, months) {
  if (!isValidDate(dateString) || !Number.isInteger(months) || months < 0) {
    throw new RangeError("Enter a valid date and month offset.");
  }
  const [year, month, day] = dateString.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const lastDay = new Date(year, targetMonth + 1, 0).getDate();
  const targetDate = new Date(year, targetMonth, Math.min(day, lastDay));
  return localDateString(targetDate);
}

export function isActiveCommitment(record, date = new Date()) {
  if (record.type !== "commitment" || record.status === "completed") return false;
  if (record.startDate && record.startDate > localDateString(date)) return false;
  return !record.endDate || record.endDate >= localDateString(date);
}

export function getActiveCommitments(records, date = new Date()) {
  return records.filter((record) => isActiveCommitment(record, date));
}

export function getActiveBnplSummary(records, date = new Date()) {
  const plans = getActiveCommitments(records, date).filter((record) => record.category === "BNPL");
  return { count: plans.length, monthlyAmount: sumAmount(plans) };
}

export function calculateCommitmentMetrics(impact) {
  const hasCommitmentData = impact.hasCommitmentRecords;
  const hasIncomeData = impact.hasIncomeRecords && impact.income > 0;
  const existingMonthlyCommitments = hasCommitmentData ? impact.commitments : null;
  const totalMonthlyCommitments = hasCommitmentData ? impact.newCommitments : null;
  const monthlyInstalment = impact.paymentMethod === "pay-full" ? 0 : impact.monthlyInstallment;

  return {
    existingMonthlyCommitments,
    monthlyInstalment,
    totalMonthlyCommitments,
    commitmentRatioBefore: hasCommitmentData && hasIncomeData
      ? roundCurrency((impact.commitments / impact.income) * 100)
      : null,
    commitmentRatioAfter: hasCommitmentData && hasIncomeData
      ? roundCurrency((impact.newCommitments / impact.income) * 100)
      : null,
  };
}

export function getTotals(records, date = new Date(), asOfDate = new Date()) {
  const income = sumAmount(records.filter((record) => record.type === "income"));
  const commitments = sumAmount(getActiveCommitments(records, asOfDate));
  const expenses = sumAmount(currentMonthExpenses(records, date));
  return { income, commitments, expenses, remaining: income - commitments - expenses };
}

export function calculatePurchaseImpact(records, purchase, date = new Date()) {
  const totals = getTotals(records, date, date);
  const isInstallment = purchase.paymentMethod === "installment";
  const quotedMonthlyInstallment = purchase.quotedMonthlyInstallment ?? null;
  const quotedTotalInstallmentPayment = purchase.quotedTotalInstallmentPayment ?? null;
  if (isInstallment && (
    !Number.isFinite(purchase.annualFlatInterestRate) ||
    purchase.annualFlatInterestRate < 0 ||
    purchase.annualFlatInterestRate > 100 ||
    !Number.isFinite(purchase.additionalFees) ||
    purchase.additionalFees < 0 ||
    purchase.additionalFees > 1_000_000 ||
    !isValidDurationMonths(purchase.duration) ||
    (quotedMonthlyInstallment !== null &&
      (!Number.isFinite(quotedMonthlyInstallment) || quotedMonthlyInstallment <= 0)) ||
    (quotedTotalInstallmentPayment !== null &&
      (!Number.isFinite(quotedTotalInstallmentPayment) || quotedTotalInstallmentPayment <= 0))
  )) {
    throw new RangeError("Enter a valid interest rate, additional fee and instalment duration.");
  }
  const annualFlatInterestRate = isInstallment ? purchase.annualFlatInterestRate : 0;
  const additionalFees = isInstallment ? purchase.additionalFees : 0;
  const totalInterest = isInstallment
    ? roundCurrency(purchase.price * (annualFlatInterestRate / 100) * (purchase.duration / 12))
    : 0;
  const totalPurchaseCost = isInstallment
    ? quotedTotalInstallmentPayment !== null
      ? roundCurrency(quotedTotalInstallmentPayment)
      : quotedMonthlyInstallment !== null
        ? roundCurrency(quotedMonthlyInstallment * purchase.duration)
        : roundCurrency(purchase.price + totalInterest + additionalFees)
    : purchase.price;
  const monthlyInstallment = isInstallment
    ? quotedMonthlyInstallment !== null
      ? roundCurrency(quotedMonthlyInstallment)
      : roundCurrency(totalPurchaseCost / purchase.duration)
    : 0;
  const newCommitments = roundCurrency(totals.commitments + monthlyInstallment);
  const activeBnplSummary = getActiveBnplSummary(records, date);
  const hasCommitmentRecords = records.some((record) => record.type === "commitment");
  const commitmentSnowball = {
    existingActiveBnplPlans: activeBnplSummary.count,
    newBnplPlans: isInstallment ? 1 : 0,
    totalActiveBnplPlans: activeBnplSummary.count + (isInstallment ? 1 : 0),
    existingMonthlyCommitments: hasCommitmentRecords ? totals.commitments : null,
    newMonthlyInstallment: monthlyInstallment,
    totalMonthlyCommitments: hasCommitmentRecords ? newCommitments : null,
    monthlyIncrease: hasCommitmentRecords ? monthlyInstallment : null,
  };
  const instalmentTotalForComparison = isInstallment
    ? quotedTotalInstallmentPayment !== null
      ? roundCurrency(quotedTotalInstallmentPayment)
      : roundCurrency(monthlyInstallment * purchase.duration)
    : null;
  const extraInstallmentCost = isInstallment
    ? roundCurrency(instalmentTotalForComparison - purchase.price)
    : null;
  const estimatedRemaining = roundCurrency(purchase.paymentMethod === "pay-full"
    ? totals.remaining - purchase.price
    : totals.remaining - monthlyInstallment);
  const hasIncomeRecords = records.some((record) => record.type === "income");
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
  } else {
    assessment = {
      level: "informational",
      title: "Review the trade-offs",
      reason: isInstallment
        ? `This plan adds ${currency(monthlyInstallment)} per month to recorded commitments and brings active BNPL plans to ${commitmentSnowball.totalActiveBnplPlans}.`
        : "Paying in full does not add a monthly commitment; compare the one-time cost with your recorded monthly finances.",
    };
  }

  return {
    ...totals,
    itemName: purchase.name,
    itemPrice: purchase.price,
    paymentMethod: purchase.paymentMethod,
    duration: isInstallment ? purchase.duration : null,
    annualFlatInterestRate,
    additionalFees,
    totalInterest,
    totalPurchaseCost,
    monthlyInstallment,
    processingFeeExplicitlyShown: isInstallment && purchase.processingFeeExplicitlyShown === true,
    quotedMonthlyInstallment: isInstallment ? quotedMonthlyInstallment : null,
    quotedTotalInstallmentPayment: isInstallment ? quotedTotalInstallmentPayment : null,
    newCommitments,
    commitmentSnowball,
    instalmentTotalForComparison,
    extraInstallmentCost,
    estimatedRemaining,
    hasIncomeRecords,
    hasCommitmentRecords,
    assessment,
  };
}

export function calculatePurchaseComparison(impact) {
  const isPayFull = impact.paymentMethod === "pay-full";
  const monthlyPaymentAvoided = impact.monthlyInstallment;
  const potentialSavings = (months) => isPayFull
    ? impact.itemPrice
    : Math.min(
      impact.totalPurchaseCost,
      Math.round(monthlyPaymentAvoided * Math.min(months, impact.duration) * 100) / 100,
    );

  return {
    itemName: impact.itemName,
    itemPrice: impact.itemPrice,
    totalInterest: impact.totalInterest,
    additionalFees: impact.additionalFees,
    totalPurchaseCost: impact.totalPurchaseCost,
    paymentMethod: impact.paymentMethod,
    duration: impact.duration,
    monthlyInstallment: monthlyPaymentAvoided,
    buyRemaining: impact.estimatedRemaining,
    dontBuyRemaining: impact.remaining,
    moneyRetained: isPayFull ? impact.itemPrice : monthlyPaymentAvoided,
    moneyRetainedType: isPayFull ? "one-time" : "per month",
    monthlyPaymentsAvoided: isPayFull ? 0 : monthlyPaymentAvoided,
    potentialSavings3Months: potentialSavings(3),
    potentialSavings6Months: potentialSavings(6),
    hasCompleteFinancialRecords: impact.hasIncomeRecords && impact.hasCommitmentRecords,
  };
}

export function calculateCostEquivalents(price, referencePrices) {
  if (!Number.isFinite(price) || price <= 0) {
    throw new RangeError("Purchase price must be greater than zero.");
  }

  return Object.fromEntries(
    Object.entries(referencePrices).map(([category, referencePrice]) => {
      if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        throw new RangeError("Reference prices must be greater than zero.");
      }
      return [category, Math.round(price / referencePrice)];
    }),
  );
}

export function byDateAscending(a, b) {
  return a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name);
}
