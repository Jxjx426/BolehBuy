import {
  calculateCostEquivalents,
  calculatePurchaseComparison,
  calculatePurchaseImpact,
  currency,
} from "./calculations.js";
import {
  DEFAULT_TRANSLATOR_PRICES,
  getRecords,
} from "./storage.js";
import {
  initializeAIAdvisor,
  invalidateAIAdvice,
  markAIAdviceReady,
} from "./ai-advisor.js";

const form = document.querySelector("#simulator-form");
const itemNameInput = document.querySelector("#item-name");
const itemPriceInput = document.querySelector("#item-price");
const paymentMethodInput = document.querySelector("#payment-method");
const durationField = document.querySelector("#duration-field");
const durationInput = document.querySelector("#instalment-duration");
const formError = document.querySelector("#simulator-form-error");
const emptyResult = document.querySelector("#simulator-empty");
const result = document.querySelector("#simulator-result");
const comparison = document.querySelector("#simulator-comparison");
const translator = document.querySelector("#cost-translator");
let currentPurchaseImpact = null;

function showValidationError(message) {
  formError.textContent = message;
  formError.hidden = false;
  (message.includes("duration") ? durationInput : itemNameInput).focus();
}

function clearValidationError() {
  formError.textContent = "";
  formError.hidden = true;
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function renderImpact(impact) {
  emptyResult.hidden = true;
  result.hidden = false;
  const isPayFull = impact.paymentMethod === "pay-full";
  setText("#impact-installment", isPayFull ? "Paid in full" : `${currency(impact.monthlyInstallment)} / month`);
  setText(
    "#impact-remaining",
    impact.hasIncomeRecords && impact.hasCommitmentRecords
      ? currency(impact.estimatedRemaining)
      : "Incomplete estimate",
  );

  const assessment = document.querySelector("#impact-assessment");
  assessment.className = `assessment assessment-${impact.assessment.level}`;
  const assessmentLabels = {
    comfortable: "Comfortable",
    careful: "Tight",
    risky: "Stretching It",
    insufficient: "Incomplete Data",
  };
  setText("#assessment-title", assessmentLabels[impact.assessment.level] || impact.assessment.title);

  renderComparison(calculatePurchaseComparison(impact));
  renderTranslator(impact.itemPrice);
  markAIAdviceReady();
}

function createAdvisorPayload(impact) {
  const purchaseComparison = calculatePurchaseComparison(impact);
  const recordsComplete = impact.hasIncomeRecords && impact.hasCommitmentRecords;

  return {
    purchase: {
      itemName: impact.itemName,
      itemPrice: impact.itemPrice,
      paymentMethod: impact.paymentMethod,
      duration: impact.duration,
      monthlyInstallment: impact.monthlyInstallment,
    },
    finances: {
      monthlyIncome: impact.hasIncomeRecords ? impact.income : null,
      existingMonthlyCommitments: impact.hasCommitmentRecords ? impact.commitments : null,
      currentMonthExpenses: impact.expenses,
      remainingBeforePurchase: recordsComplete ? impact.remaining : null,
      newMonthlyCommitments: recordsComplete ? impact.newCommitments : null,
      estimatedRemainingAfterPurchase: recordsComplete ? impact.estimatedRemaining : null,
      recordsComplete,
      missingRecords: [
        ...(!impact.hasIncomeRecords ? ["monthly income"] : []),
        ...(!impact.hasCommitmentRecords ? ["monthly commitments"] : []),
      ],
    },
    spendingAssessment: {
      title: impact.assessment.title,
      reason: impact.assessment.reason,
    },
    comparison: {
      buyRemaining: recordsComplete ? purchaseComparison.buyRemaining : null,
      dontBuyRemaining: recordsComplete ? purchaseComparison.dontBuyRemaining : null,
      moneyRetained: purchaseComparison.moneyRetained,
      moneyRetainedUnit: purchaseComparison.moneyRetainedType,
      potentialSavings3Months: purchaseComparison.potentialSavings3Months,
      potentialSavings6Months: purchaseComparison.potentialSavings6Months,
    },
  };
}

function renderComparison(comparisonData) {
  comparison.hidden = false;
  const isPayFull = comparisonData.paymentMethod === "pay-full";
  const remainingIsComplete = comparisonData.hasCompleteFinancialRecords;
  setText("#comparison-buy-name", comparisonData.itemName);
  setText("#comparison-buy-price", currency(comparisonData.itemPrice));
  setText("#comparison-buy-remaining", remainingIsComplete ? currency(comparisonData.buyRemaining) : "Incomplete estimate");
  setText("#comparison-retained-label", isPayFull ? "One-time money kept" : "Monthly payment avoided");
  setText("#comparison-retained", isPayFull
    ? currency(comparisonData.moneyRetained)
    : `${currency(comparisonData.moneyRetained)} / month`);
  setText(
    "#comparison-savings",
    `${currency(comparisonData.potentialSavings3Months)} / ${currency(comparisonData.potentialSavings6Months)}`,
  );
}

function renderTranslator(price) {
  translator.hidden = false;
  setText("#translator-purchase-price", currency(price));
  const equivalents = calculateCostEquivalents(price, DEFAULT_TRANSLATOR_PRICES);
  const units = { rice: "bowls", bubbleTea: "cups", transport: "rides" };
  for (const [category, count] of Object.entries(equivalents)) {
    setText(`[data-equivalent="${category}"]`, `≈ ${count.toLocaleString("en-MY")} ${units[category]}`);
  }
}

export function initializeSimulator() {
  initializeAIAdvisor(() => currentPurchaseImpact ? createAdvisorPayload(currentPurchaseImpact) : null);

  function updateDurationVisibility() {
    const showDuration = paymentMethodInput.value === "installment";
    durationField.hidden = !showDuration;
    durationInput.required = showDuration;
  }

  paymentMethodInput.addEventListener("change", updateDurationVisibility);
  form.addEventListener("input", () => {
    clearValidationError();
    invalidateAIAdvice();
  });
  form.addEventListener("change", () => {
    clearValidationError();
    invalidateAIAdvice();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearValidationError();

    const name = itemNameInput.value.trim();
    if (!name) {
      showValidationError("Add the item name so you can recognise this purchase.");
      return;
    }
    if (name.length > 80) {
      showValidationError("Keep the item name to 80 characters or fewer.");
      return;
    }

    const priceText = itemPriceInput.value.trim();
    const price = Number(priceText);
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(priceText) ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      showValidationError("Enter a price greater than RM 0, using up to two decimal places.");
      return;
    }

    const paymentMethod = paymentMethodInput.value;
    const duration = Number(durationInput.value);
    if (
      paymentMethod === "installment" &&
      ![3, 6, 12, 24].includes(duration)
    ) {
      showValidationError("Choose an instalment duration to continue.");
      return;
    }

    const impact = calculatePurchaseImpact(getRecords(), {
      name,
      price: Math.round(price * 100) / 100,
      paymentMethod,
      duration,
    });
    currentPurchaseImpact = impact;
    renderImpact(impact);
  });

  updateDurationVisibility();
}
