import { addSimulatorPurchase } from "./dashboard.js";
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
const instalmentCostFields = document.querySelector("#instalment-cost-fields");
const interestRateInput = document.querySelector("#annual-interest-rate");
const additionalFeesInput = document.querySelector("#additional-fees");
const formError = document.querySelector("#simulator-form-error");
const emptyResult = document.querySelector("#simulator-empty");
const result = document.querySelector("#simulator-result");
const comparison = document.querySelector("#simulator-comparison");
const translator = document.querySelector("#cost-translator");
const purchaseDecision = document.querySelector("#purchase-decision");
const openPurchaseConfirmationButton = document.querySelector("#open-purchase-confirmation");
const purchaseConfirmation = document.querySelector("#purchase-confirmation");
const purchaseSuccess = document.querySelector("#purchase-success");
const purchaseSaveError = document.querySelector("#purchase-save-error");
const confirmAddPurchaseButton = document.querySelector("#confirm-add-purchase");
const cancelAddPurchaseButton = document.querySelector("#cancel-add-purchase");
let currentPurchaseImpact = null;
let hasCalculatedPurchase = false;
let pendingPurchase = null;
let purchaseSubmissionId = null;
let purchaseAdded = false;

function showValidationError(message, input = itemNameInput) {
  formError.textContent = message;
  formError.hidden = false;
  input.focus();
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
  renderTranslator(impact.totalPurchaseCost);
  purchaseDecision.hidden = false;
  purchaseSubmissionId ??= window.crypto?.randomUUID?.() ||
    `purchase-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
      annualFlatInterestRate: impact.annualFlatInterestRate,
      additionalFees: impact.additionalFees,
      totalInterest: impact.totalInterest,
      totalPurchaseCost: impact.totalPurchaseCost,
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
      level: impact.assessment.level,
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
  setText("#comparison-buy-price", currency(comparisonData.totalPurchaseCost));
  setText("#comparison-buy-price-label", isPayFull ? "Purchase price" : "Total instalment cost");
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

function readPurchaseDetails() {
  const name = itemNameInput.value.trim();
  if (!name) return { error: "Add the item name so you can recognise this purchase.", input: itemNameInput };
  if (name.length > 80) return { error: "Keep the item name to 80 characters or fewer.", input: itemNameInput };

  const priceText = itemPriceInput.value.trim();
  const price = Number(priceText);
  if (!/^\d+(?:\.\d{1,2})?$/.test(priceText) || !Number.isFinite(price) || price <= 0) {
    return { error: "Enter a price greater than RM 0, using up to two decimal places.", input: itemPriceInput };
  }

  const paymentMethod = paymentMethodInput.value;
  const duration = Number(durationInput.value);
  if (paymentMethod === "installment" && ![3, 6, 12, 24].includes(duration)) {
    return { error: "Choose an instalment duration to continue.", input: durationInput };
  }

  let annualFlatInterestRate = 0;
  let additionalFees = 0;
  if (paymentMethod === "installment") {
    const rateText = interestRateInput.value.trim();
    annualFlatInterestRate = Number(rateText);
    if (!/^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(rateText) ||
      !Number.isFinite(annualFlatInterestRate) ||
      annualFlatInterestRate < 0 ||
      annualFlatInterestRate > 100) {
      return { error: "Enter an annual flat interest rate from 0% to 100%, using up to 6 decimal places.", input: interestRateInput };
    }

    const feeText = additionalFeesInput.value.trim();
    additionalFees = Number(feeText);
    if (!/^\d+(?:\.\d{1,2})?$/.test(feeText) ||
      !Number.isFinite(additionalFees) ||
      additionalFees < 0 ||
      additionalFees > 1_000_000) {
      return { error: "Enter additional fees from RM 0 to RM 1,000,000, using up to two decimal places.", input: additionalFeesInput };
    }
  }

  return {
    purchase: {
      name,
      price: Math.round(price * 100) / 100,
      paymentMethod,
      duration,
      annualFlatInterestRate,
      additionalFees,
    },
  };
}

function hidePurchaseResults() {
  result.hidden = true;
  comparison.hidden = true;
  translator.hidden = true;
  purchaseDecision.hidden = true;
  purchaseConfirmation.hidden = true;
  emptyResult.hidden = false;
}

function resetPurchaseDecision() {
  pendingPurchase = null;
  purchaseSubmissionId = null;
  purchaseAdded = false;
  purchaseConfirmation.hidden = true;
  purchaseSuccess.hidden = true;
  purchaseSaveError.hidden = true;
  purchaseSaveError.textContent = "";
  openPurchaseConfirmationButton.disabled = false;
  confirmAddPurchaseButton.disabled = false;
  cancelAddPurchaseButton.disabled = false;
  document.querySelector("#purchase-decision-button-label").textContent = "I've Decided to Buy";
}

function openPurchaseConfirmation() {
  if (!currentPurchaseImpact || purchaseAdded) return;
  pendingPurchase = { ...currentPurchaseImpact };
  purchaseSaveError.hidden = true;
  purchaseSaveError.textContent = "";
  const isPayFull = pendingPurchase.paymentMethod === "pay-full";
  setText("#confirm-item-name", pendingPurchase.itemName);
  setText("#confirm-item-price", currency(pendingPurchase.itemPrice));
  setText("#confirm-payment-method", isPayFull ? "Pay in Full" : "BNPL / Instalments");
  document.querySelector("#confirm-duration-row").hidden = isPayFull;
  document.querySelector("#confirm-total-row").hidden = isPayFull;
  document.querySelector("#confirm-monthly-row").hidden = isPayFull;
  document.querySelector("#confirm-interest-row").hidden = isPayFull;
  document.querySelector("#confirm-fees-row").hidden = isPayFull;
  document.querySelector("#purchase-duration-note").hidden = isPayFull;
  if (!isPayFull) {
    setText("#confirm-duration", `${pendingPurchase.duration} months`);
    setText("#confirm-total", currency(pendingPurchase.totalPurchaseCost));
    setText("#confirm-monthly", `${currency(pendingPurchase.monthlyInstallment)} / month`);
    setText("#confirm-interest", currency(pendingPurchase.totalInterest));
    setText("#confirm-fees", currency(pendingPurchase.additionalFees));
    setText("#purchase-destination", "This will be added to your Dashboard under Monthly Commitments (BNPL). Only the monthly instalment is recorded, not the full purchase price.");
  } else {
    setText("#purchase-destination", "This will be added to your Dashboard under Daily Expenses, dated today.");
  }
  purchaseConfirmation.hidden = false;
}

function confirmPurchaseAddition() {
  if (!pendingPurchase || !purchaseSubmissionId || purchaseAdded) return;
  confirmAddPurchaseButton.disabled = true;
  cancelAddPurchaseButton.disabled = true;

  const result = addSimulatorPurchase(pendingPurchase, purchaseSubmissionId);
  if (!result.success) {
    purchaseSaveError.textContent = result.error || "The purchase could not be saved. Please try again.";
    purchaseSaveError.hidden = false;
    confirmAddPurchaseButton.disabled = false;
    cancelAddPurchaseButton.disabled = false;
    return;
  }

  purchaseAdded = true;
  pendingPurchase = null;
  purchaseConfirmation.hidden = true;
  purchaseSuccess.hidden = false;
  openPurchaseConfirmationButton.disabled = true;
  document.querySelector("#purchase-decision-button-label").textContent = "Purchase added";
}

function updateResultsFromForm() {
  if (!hasCalculatedPurchase) return;
  const details = readPurchaseDetails();
  if (details.error) {
    currentPurchaseImpact = null;
    hidePurchaseResults();
    showValidationError(details.error, details.input);
    return;
  }
  clearValidationError();
  currentPurchaseImpact = calculatePurchaseImpact(getRecords(), details.purchase);
  renderImpact(currentPurchaseImpact);
}

export function initializeSimulator() {
  initializeAIAdvisor(() => currentPurchaseImpact ? createAdvisorPayload(currentPurchaseImpact) : null);

  function updateDurationVisibility() {
    const showDuration = paymentMethodInput.value === "installment";
    durationField.hidden = !showDuration;
    durationInput.required = showDuration;
    instalmentCostFields.hidden = !showDuration;
    interestRateInput.required = showDuration;
    additionalFeesInput.required = showDuration;
    interestRateInput.disabled = !showDuration;
    additionalFeesInput.disabled = !showDuration;
  }

  function onInputChange() {
    clearValidationError();
    resetPurchaseDecision();
    invalidateAIAdvice();
    updateResultsFromForm();
  }

  paymentMethodInput.addEventListener("change", () => {
    updateDurationVisibility();
    onInputChange();
  });
  form.addEventListener("input", onInputChange);
  form.addEventListener("change", onInputChange);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearValidationError();
    resetPurchaseDecision();
    const details = readPurchaseDetails();
    if (details.error) {
      currentPurchaseImpact = null;
      hidePurchaseResults();
      showValidationError(details.error, details.input);
      return;
    }
    const impact = calculatePurchaseImpact(getRecords(), details.purchase);
    currentPurchaseImpact = impact;
    hasCalculatedPurchase = true;
    renderImpact(impact);
  });

  openPurchaseConfirmationButton.addEventListener("click", openPurchaseConfirmation);
  cancelAddPurchaseButton.addEventListener("click", () => {
    pendingPurchase = null;
    purchaseConfirmation.hidden = true;
    purchaseSaveError.hidden = true;
    confirmAddPurchaseButton.disabled = false;
    cancelAddPurchaseButton.disabled = false;
  });
  confirmAddPurchaseButton.addEventListener("click", confirmPurchaseAddition);

  updateDurationVisibility();
}
