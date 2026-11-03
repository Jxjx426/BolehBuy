import { addSimulatorPurchase } from "./dashboard.js";
import {
  extractionFieldMessage,
  initializeCheckoutScanner,
} from "./checkout-scanner.js";
import {
  calculateCommitmentMetrics,
  calculateApproximateDailyEquivalent,
  calculateCostEquivalents,
  calculatePurchaseImpact,
  currency,
  isValidDurationMonths,
} from "./calculations.js";
import {
  isCoolingPeriodComplete,
  loadCoolingJarItems,
  pausePurchase,
} from "./cooling-jar.js";
import {
  DEFAULT_TRANSLATOR_PRICES,
  getRecords,
} from "./storage.js";
import {
  initializeAIAdvisor,
  invalidateAIAdvice,
  analyzeCurrentPurchase,
  prepareAIAdvisor,
} from "./ai-advisor.js";

const form = document.querySelector("#simulator-form");
const itemNameInput = document.querySelector("#item-name");
const itemPriceInput = document.querySelector("#item-price");
const paymentMethodInput = document.querySelector("#payment-method");
const durationField = document.querySelector("#duration-field");
const durationInput = document.querySelector("#instalment-duration");
const instalmentCostFields = document.querySelector("#instalment-cost-fields");
const interestRateInput = document.querySelector("#annual-interest-rate");
const quotedMonthlyInstallmentInput = document.querySelector("#quoted-monthly-installment");
const quotedTotalInstallmentInput = document.querySelector("#quoted-total-installment");
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
const coolingJarButton = document.querySelector("#cooling-jar-button");
const coolingJarFeedback = document.querySelector("#cooling-jar-feedback");
const coolingJarList = document.querySelector("#cooling-jar-list");
const advisorViewButtons = [...document.querySelectorAll("[data-advisor-view]")];
let coolingJarExpiryTimer = null;
let currentPurchaseImpact = null;
let hasCalculatedPurchase = false;
let pendingPurchase = null;
let purchaseSubmissionId = null;
let purchaseAdded = false;
let scannerExtracted = false;
let processingFeeExplicitlyShown = false;

const extractionInputs = {
  itemName: itemNameInput,
  cashPrice: itemPriceInput,
  paymentMethod: paymentMethodInput,
  durationMonths: durationInput,
  monthlyInstallment: quotedMonthlyInstallmentInput,
  totalInstallmentPayment: quotedTotalInstallmentInput,
  processingFee: additionalFeesInput,
};

function setExtractionStatus(field, text, warning) {
  const status = document.querySelector(`[data-extraction-status="${field}"]`);
  const input = extractionInputs[field];
  status.textContent = text;
  status.hidden = !text;
  status.classList.toggle("is-warning", warning);
  input?.classList.toggle("extracted-value", Boolean(text));
  input?.classList.toggle("is-warning", warning && Boolean(text));
}

function updateDurationVisibility() {
  const isInstallment = paymentMethodInput.value === "installment";
  const showDuration = isInstallment || scannerExtracted;
  durationField.hidden = !showDuration;
  durationInput.required = isInstallment;
  instalmentCostFields.hidden = !showDuration;
  interestRateInput.required = isInstallment;
  additionalFeesInput.required = false;
  interestRateInput.disabled = !showDuration;
  additionalFeesInput.disabled = !showDuration;
}

function applyCheckoutExtraction(extraction) {
  scannerExtracted = true;
  hasCalculatedPurchase = false;
  currentPurchaseImpact = null;
  resetPurchaseDecision();
  invalidateAIAdvice();
  hidePurchaseResults();

  itemNameInput.value = extraction.itemName.value;
  itemPriceInput.value = extraction.cashPrice.value;
  paymentMethodInput.value = extraction.paymentMethod.value === "unknown"
    ? ""
    : extraction.paymentMethod.value;
  durationInput.value = "";
  const extractedDuration = Number(extraction.durationMonths.value);
  let durationWarning = false;
  let durationStatus = extractionFieldMessage(extraction.durationMonths, "Instalment period").text;
  if (isValidDurationMonths(extractedDuration)) {
    if (![...durationInput.options].some((option) => option.value === String(extractedDuration))) {
      const option = document.createElement("option");
      option.value = String(extractedDuration);
      option.textContent = `${extractedDuration} months`;
      durationInput.append(option);
    }
    durationInput.value = String(extractedDuration);
  } else if (extraction.durationMonths.value) {
    durationWarning = true;
    durationStatus = `⚠️ AI found ${extractedDuration} months, which is not an available Simulator duration. Verify the plan before calculating.`;
  }
  quotedMonthlyInstallmentInput.value = extraction.monthlyInstallment.value;
  quotedTotalInstallmentInput.value = extraction.totalInstallmentPayment.value;
  additionalFeesInput.value = extraction.processingFee.value;
  processingFeeExplicitlyShown = ["high", "medium"].includes(extraction.processingFee.confidence) &&
    Boolean(extraction.processingFee.value);

  for (const [field, data, label] of [
    ["itemName", extraction.itemName, "Product name"],
    ["cashPrice", extraction.cashPrice, "Cash price"],
    ["paymentMethod", extraction.paymentMethod, "Payment method"],
    ["monthlyInstallment", extraction.monthlyInstallment, "Monthly instalment"],
    ["totalInstallmentPayment", extraction.totalInstallmentPayment, "Total instalment payment"],
    ["processingFee", extraction.processingFee, "Processing fee"],
  ]) {
    const message = extractionFieldMessage(data, label);
    setExtractionStatus(field, message.text, message.warning || (field === "paymentMethod" && data.value === "unknown"));
  }
  setExtractionStatus("durationMonths", durationStatus, durationWarning || extraction.durationMonths.confidence === "not_found");
  if (extraction.paymentMethod.value === "unknown") {
    setExtractionStatus("paymentMethod", "⚠️ Payment method unclear. Select Pay in Full or Instalments manually.", true);
  }

  updateDurationVisibility();
  const complete = Boolean(
    extraction.itemName.value &&
    extraction.cashPrice.value &&
    extraction.paymentMethod.value !== "unknown" &&
    (extraction.paymentMethod.value === "pay-full" ||
      (extraction.durationMonths.value &&
        isValidDurationMonths(extractedDuration) &&
        extraction.monthlyInstallment.value)),
  );
  document.querySelector("#scanner-message").textContent = complete
    ? "✨ AI extracted these details. Please check that they are accurate before calculating."
    : "Some details need your review. Check the amber notes beside the fields; AI will not guess missing information.";
}

function markExtractionEdited(target) {
  const field = target.dataset.extractionField;
  if (!field) return;
  const input = extractionInputs[field];
  const status = document.querySelector(`[data-extraction-status="${field}"]`);
  const hasValue = Boolean(input?.value.trim());
  if (hasValue) {
    setExtractionStatus(field, "Edited by you — verify this against the checkout.", false);
  } else if (scannerExtracted) {
    const labels = {
      itemName: "Product name",
      cashPrice: "Cash price",
      paymentMethod: "Payment method",
      durationMonths: "Instalment period",
      monthlyInstallment: "Monthly instalment",
      totalInstallmentPayment: "Total instalment payment",
      processingFee: "Processing fee",
    };
    setExtractionStatus(field, `⚠️ ${labels[field]} is required or not confirmed. Enter it manually; AI will not guess.`, true);
  } else {
    status.hidden = true;
  }
}

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
  renderCommitmentSnowball(impact);
  renderExtraInstallmentCost(impact);
  renderAdvisorPersonality(impact);
  renderComparison(impact);
  renderTranslator(impact.totalPurchaseCost);
  purchaseDecision.hidden = false;
  purchaseSubmissionId ??= window.crypto?.randomUUID?.() ||
    `purchase-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  prepareAIAdvisor();
}

function renderAdvisorPersonality(impact) {
  const isInstallment = impact.paymentMethod === "installment";
  const dailyEquivalent = calculateApproximateDailyEquivalent(impact.monthlyInstallment);
  setText("#marketing-framing", isInstallment && dailyEquivalent !== null
    ? `Checkout framing: “Only ${currency(dailyEquivalent)}/day?”`
    : `Pay in Full shows the full ${currency(impact.itemPrice)} cost upfront.`);
  setText("#marketing-monthly", isInstallment
    ? `Actual monthly instalment: ${currency(impact.monthlyInstallment)} /month. The daily amount is an approximate equivalent, not an actual daily payment.`
    : "Actual monthly instalment: RM 0 (Pay in Full). No daily equivalent applies.");

  const snowball = impact.commitmentSnowball;
  const summary = !isInstallment
    ? `Dik, paying in full adds no monthly instalment. It is a one-time ${currency(impact.itemPrice)} cost, so check how it fits with the rest of the month.`
    : snowball.existingMonthlyCommitments === null
      ? `Dik, this adds ${currency(impact.monthlyInstallment)} per month. Your existing commitment records are incomplete, so I can't show the full monthly stack yet.`
      : `Dik, this adds ${currency(impact.monthlyInstallment)} per month. Recorded commitments go from ${currency(snowball.existingMonthlyCommitments)} to ${currency(snowball.totalMonthlyCommitments)} /month. That's the monthly lock-in to think about.`;
  setText("#mamak-summary", summary);

  const extraCost = document.querySelector("#mamak-extra-cost");
  if (isInstallment && impact.extraInstallmentCost > 0) {
    const source = impact.quotedTotalInstallmentPayment !== null
      ? "Based on the total you entered"
      : "Estimated from monthly instalment × duration";
    extraCost.textContent = `${source}, this option costs ${currency(impact.extraInstallmentCost)} more than the cash price. That's not necessarily a processing fee, and charges not shown may change the total.`;
    extraCost.hidden = false;
  } else {
    extraCost.textContent = "";
    extraCost.hidden = true;
  }
  setText("#smart-dupe-direction", "If it isn't essential, compare a basic wired or entry-level version you can pay for in cash, or wait for a payday sale—no new instalment needed.");
}

function setAdvisorView(view) {
  const showMarketing = view === "marketing";
  document.querySelector("#marketing-view").hidden = !showMarketing;
  document.querySelector("#mamak-view").hidden = showMarketing;
  for (const button of advisorViewButtons) {
    const selected = button.dataset.advisorView === view;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }
}

function setCoolingJarFeedback(message, isError = false) {
  coolingJarFeedback.textContent = message;
  coolingJarFeedback.classList.toggle("is-error", isError);
  coolingJarFeedback.hidden = !message;
}

function renderCoolingJarItems() {
  if (coolingJarExpiryTimer !== null) window.clearTimeout(coolingJarExpiryTimer);
  coolingJarExpiryTimer = null;
  coolingJarList.replaceChildren();

  const { items, error } = loadCoolingJarItems();
  if (error) {
    setCoolingJarFeedback(error, true);
    return;
  }
  if (items.length) {
    const heading = document.createElement("strong");
    heading.className = "cooling-jar-list-title";
    heading.textContent = "Paused in Cooling Jar";
    coolingJarList.append(heading);
  }
  for (const item of items) {
    const complete = isCoolingPeriodComplete(item);
    const entry = document.createElement("div");
    entry.className = `cooling-jar-entry${complete ? " is-complete" : ""}`;
    const name = document.createElement("strong");
    name.textContent = item.itemName;
    const price = document.createElement("span");
    price.textContent = currency(item.price);
    const status = document.createElement("span");
    status.className = "cooling-jar-entry-status";
    status.textContent = complete
      ? "Cooling Period Complete — Ready to Decide"
      : "72h cooling period active";
    entry.append(name, price, status);
    coolingJarList.append(entry);
  }

  const nextExpiry = items
    .map((item) => Date.parse(item.timestamp) + 72 * 60 * 60 * 1000)
    .filter((timestamp) => timestamp > Date.now())
    .sort((left, right) => left - right)[0];
  if (nextExpiry !== undefined) {
    coolingJarExpiryTimer = window.setTimeout(
      renderCoolingJarItems,
      Math.min(nextExpiry - Date.now() + 50, 2_147_000_000),
    );
  }
}

function putCurrentPurchaseInCoolingJar() {
  if (!currentPurchaseImpact || !hasCalculatedPurchase) {
    setCoolingJarFeedback("Calculate a valid purchase before using the Cooling Jar.", true);
    return;
  }
  const saved = pausePurchase(currentPurchaseImpact);
  if (saved.duplicate) {
    setCoolingJarFeedback("This purchase calculation is already in your Cooling Jar.");
    renderCoolingJarItems();
    return;
  }
  if (!saved.success) {
    setCoolingJarFeedback(saved.error || "This item could not be saved to the Cooling Jar.", true);
    return;
  }

  setCoolingJarFeedback(`✨ Purchase paused for 72 hours! You just held back ${currency(saved.item.price)} (Potential Money Saved) to give yourself breathing room before deciding.`);
  renderCoolingJarItems();
}

function renderCommitmentSnowball(impact) {
  const snowball = impact.commitmentSnowball;
  const hasCompleteSnowballData = impact.hasIncomeRecords &&
    snowball.existingMonthlyCommitments !== null;
  const before = hasCompleteSnowballData
    ? currency(snowball.existingMonthlyCommitments)
    : "Not enough data";
  const after = hasCompleteSnowballData
    ? currency(snowball.totalMonthlyCommitments)
    : "Not enough data";
  const difference = hasCompleteSnowballData
    ? `+${currency(snowball.monthlyIncrease)} /month`
    : "Not enough data";

  setText("#snowball-before", hasCompleteSnowballData ? `${before} /month` : before);
  setText("#snowball-after", hasCompleteSnowballData ? `${after} /month` : after);
  setText("#snowball-difference", difference);

  const isPayFull = impact.paymentMethod === "pay-full";
  const planSummary = document.querySelector("#snowball-plan-summary");
  const payFullImpact = document.querySelector("#pay-full-impact");
  planSummary.hidden = isPayFull;
  payFullImpact.hidden = !isPayFull;
  if (isPayFull) {
    setText("#pay-full-impact", `One-time purchase: ${currency(impact.itemPrice)}; no added monthly commitment.`);
  } else {
    setText("#snowball-plan-summary", hasCompleteSnowballData
      ? `${snowball.existingActiveBnplPlans} active BNPL ${snowball.existingActiveBnplPlans === 1 ? "plan" : "plans"} → ${snowball.totalActiveBnplPlans} after this purchase`
      : "Not enough data to show active BNPL plan counts.");
  }
}

function renderExtraInstallmentCost(impact) {
  const section = document.querySelector("#extra-installment-cost");
  const details = document.querySelector("#extra-cost-details");
  const hasVerifiedComparison = impact.paymentMethod === "installment" &&
    (impact.quotedTotalInstallmentPayment !== null ||
      impact.quotedMonthlyInstallment !== null);
  if (!hasVerifiedComparison || impact.extraInstallmentCost <= 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  details.hidden = false;
  setText("#extra-cost-cash-price", currency(impact.itemPrice));
  setText("#extra-cost-total", currency(impact.instalmentTotalForComparison));
  const extraCost = impact.extraInstallmentCost;
  document.querySelector("#extra-cost-warning").hidden = false;
  setText("#extra-cost-message", `You're paying ${currency(extraCost)} more through this instalment option.`);
  const feeNote = document.querySelector("#extra-cost-processing-fee");
  feeNote.hidden = !impact.processingFeeExplicitlyShown;
  if (impact.processingFeeExplicitlyShown) {
    setText("#extra-cost-processing-fee", `Processing fee explicitly shown: ${currency(impact.additionalFees)}.`);
  }
}

function createAdvisorPayload(impact) {
  const metrics = calculateCommitmentMetrics(impact);
  const recordsComplete = impact.hasIncomeRecords && impact.hasCommitmentRecords;

  return {
    purchase: {
      itemName: impact.itemName,
      itemPrice: impact.itemPrice,
      paymentMethod: impact.paymentMethod,
      duration: impact.duration,
      annualFlatInterestRate: impact.annualFlatInterestRate,
      additionalFees: impact.additionalFees,
      processingFeeExplicitlyShown: impact.processingFeeExplicitlyShown,
      totalInterest: impact.totalInterest,
      totalPurchaseCost: impact.totalPurchaseCost,
      monthlyInstallment: impact.monthlyInstallment,
    },
    finances: {
      monthlyIncome: impact.hasIncomeRecords ? impact.income : null,
      existingMonthlyCommitments: impact.hasCommitmentRecords ? impact.commitments : null,
      currentMonthExpenses: impact.expenses,
      remainingBeforePurchase: recordsComplete ? impact.remaining : null,
      estimatedRemainingAfterPurchase: recordsComplete ? impact.estimatedRemaining : null,
      newTotalMonthlyCommitments: metrics.totalMonthlyCommitments,
      commitmentRatioBefore: metrics.commitmentRatioBefore,
      commitmentRatioAfter: metrics.commitmentRatioAfter,
      recordsComplete,
      missingRecords: [
        ...(!impact.hasIncomeRecords ? ["monthly income"] : []),
        ...(!impact.hasCommitmentRecords ? ["monthly commitments"] : []),
      ],
    },
    comparison: {
      buyEstimatedRemaining: recordsComplete ? impact.estimatedRemaining : null,
      dontBuyEstimatedRemaining: recordsComplete ? impact.remaining : null,
      buyMonthlyCommitments: metrics.totalMonthlyCommitments,
      dontBuyMonthlyCommitments: metrics.existingMonthlyCommitments,
    },
    spendingAssessment: {
      title: impact.assessment.title,
      reason: impact.assessment.reason,
      level: impact.assessment.level,
    },
  };
}

function renderComparison(impact) {
  comparison.hidden = false;
  const hasFinancialData = impact.hasIncomeRecords && impact.hasCommitmentRecords;
  const hasCommitmentData = impact.hasCommitmentRecords;
  setText("#comparison-dont-buy-remaining", hasFinancialData ? currency(impact.remaining) : "Not enough data");
  setText("#comparison-buy-remaining", hasFinancialData ? currency(impact.estimatedRemaining) : "Not enough data");
  setText("#comparison-dont-buy-commitments", hasCommitmentData ? currency(impact.commitments) : "Not enough data");
  setText("#comparison-buy-commitments", hasCommitmentData ? currency(impact.newCommitments) : "Not enough data");
  let summary = "Some financial records are missing, so estimated remaining money or commitments cannot be fully compared.";
  if (hasFinancialData) {
    summary = impact.paymentMethod === "pay-full"
      ? `Paying in full changes estimated remaining money by ${currency(impact.itemPrice)}; monthly commitments stay the same.`
      : `Buying changes estimated remaining money by ${currency(impact.monthlyInstallment)} and increases monthly commitments by the same amount.`;
  }
  setText("#comparison-summary", summary);
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
  if (!["pay-full", "installment"].includes(paymentMethod)) {
    return { error: "Select a payment method before calculating.", input: paymentMethodInput };
  }
  const duration = Number(durationInput.value);
  if (paymentMethod === "installment" && !isValidDurationMonths(duration)) {
    return { error: "Choose an instalment duration to continue.", input: durationInput };
  }

  let annualFlatInterestRate = 0;
  let additionalFees = 0;
  let quotedMonthlyInstallment = null;
  let quotedTotalInstallmentPayment = null;
  if (paymentMethod === "installment") {
    const monthlyQuoteText = quotedMonthlyInstallmentInput.value.trim();
    if (monthlyQuoteText) {
      quotedMonthlyInstallment = Number(monthlyQuoteText);
      if (!/^\d+(?:\.\d{1,2})?$/.test(monthlyQuoteText) ||
        !Number.isFinite(quotedMonthlyInstallment) ||
        quotedMonthlyInstallment <= 0 ||
        quotedMonthlyInstallment > 1_000_000_000) {
        return { error: "Enter a quoted monthly instalment greater than RM 0, using up to two decimal places.", input: quotedMonthlyInstallmentInput };
      }
    } else if (scannerExtracted) {
      return { error: "Enter the monthly instalment shown at checkout. AI will not calculate or guess this value.", input: quotedMonthlyInstallmentInput };
    }

    const totalQuoteText = quotedTotalInstallmentInput.value.trim();
    if (totalQuoteText) {
      quotedTotalInstallmentPayment = Number(totalQuoteText);
      if (!/^\d+(?:\.\d{1,2})?$/.test(totalQuoteText) ||
        !Number.isFinite(quotedTotalInstallmentPayment) ||
        quotedTotalInstallmentPayment <= 0 ||
        quotedTotalInstallmentPayment > 1_000_000_000) {
        return { error: "Enter a quoted total instalment payment greater than RM 0, using up to two decimal places.", input: quotedTotalInstallmentInput };
      }
    }

    const rateText = interestRateInput.value.trim();
    annualFlatInterestRate = Number(rateText);
    if (!/^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(rateText) ||
      !Number.isFinite(annualFlatInterestRate) ||
      annualFlatInterestRate < 0 ||
      annualFlatInterestRate > 100) {
      return { error: "Enter an annual flat interest rate from 0% to 100%, using up to 6 decimal places.", input: interestRateInput };
    }

    const feeText = additionalFeesInput.value.trim();
    additionalFees = feeText ? Number(feeText) : 0;
    if ((feeText && !/^\d+(?:\.\d{1,2})?$/.test(feeText)) ||
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
      processingFeeExplicitlyShown,
      quotedMonthlyInstallment,
      quotedTotalInstallmentPayment,
    },
  };
}

function hidePurchaseResults() {
  result.hidden = true;
  comparison.hidden = true;
  translator.hidden = true;
  purchaseDecision.hidden = true;
  purchaseConfirmation.hidden = true;
  document.querySelector("#ai-advisor").hidden = true;
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
  const hasQuotedInstalment = !isPayFull && pendingPurchase.quotedMonthlyInstallment !== null;
  setText("#confirm-item-name", pendingPurchase.itemName);
  setText("#confirm-item-price", currency(pendingPurchase.itemPrice));
  setText("#confirm-payment-method", isPayFull ? "Pay in Full" : "BNPL / Instalments");
  document.querySelector("#confirm-duration-row").hidden = isPayFull;
  document.querySelector("#confirm-total-row").hidden = isPayFull;
  document.querySelector("#confirm-monthly-row").hidden = isPayFull;
  document.querySelector("#confirm-interest-row").hidden = isPayFull || hasQuotedInstalment;
  document.querySelector("#confirm-fees-row").hidden = isPayFull;
  document.querySelector("#purchase-duration-note").hidden = isPayFull;
  if (!isPayFull) {
    setText("#confirm-duration", `${pendingPurchase.duration} months`);
    setText("#confirm-total", currency(pendingPurchase.totalPurchaseCost));
    setText("#confirm-monthly", `${currency(pendingPurchase.monthlyInstallment)} / month`);
    document.querySelector("#confirm-total-row dt").textContent = pendingPurchase.quotedTotalInstallmentPayment !== null
      ? "Quoted total instalment payment"
      : hasQuotedInstalment
        ? "Total based on quoted monthly payments"
        : "Estimated total instalment cost";
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
  initializeCheckoutScanner(applyCheckoutExtraction);
  renderCoolingJarItems();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderCoolingJarItems();
  });
  advisorViewButtons.forEach((button) => {
    button.addEventListener("click", () => setAdvisorView(button.dataset.advisorView));
  });

  function onInputChange(event) {
    markExtractionEdited(event.target);
    if (event.target === additionalFeesInput) {
      processingFeeExplicitlyShown = Boolean(additionalFeesInput.value.trim());
    }
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
    invalidateAIAdvice();
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
    void analyzeCurrentPurchase();
  });

  openPurchaseConfirmationButton.addEventListener("click", openPurchaseConfirmation);
  coolingJarButton.addEventListener("click", putCurrentPurchaseInCoolingJar);
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
