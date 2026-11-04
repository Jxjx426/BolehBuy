import { addSimulatorPurchase } from "./dashboard.js";
import {
  extractionFieldMessage,
  initializeCheckoutScanner,
} from "./checkout-scanner.js";
import {
  calculateCommitmentMetrics,
  calculateCostEquivalents,
  calculatePurchaseImpact,
  currency,
  isValidDurationMonths,
} from "./calculations.js";
import {
  COOLING_PERIOD_MS,
  getRemainingCoolingTime,
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
  animateAdvisorRatio,
  prepareAIAdvisor,
} from "./ai-advisor.js";
import {
  clearPurchaseAlternatives,
  loadPurchaseAlternatives,
} from "./alternative-suggestions.js";

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
const advisorSummary = document.querySelector("#advisor-summary");
const advisorSection = document.querySelector("#ai-advisor");
const advisorTyping = document.querySelector("#advisor-typing");
const alternativesSection = document.querySelector("#purchase-alternatives");
const translator = document.querySelector("#cost-translator");
const translatorToggle = document.querySelector("#translator-toggle");
const translatorContent = document.querySelector("#translator-content");
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
const coolingJarEmpty = document.querySelector("#cooling-jar-empty");
const coolingJarPage = document.querySelector("#cooling-jar");
const coolingJarActionFeedback = document.querySelector("#cooling-jar-action-feedback");
const coolingJarActionMessage = document.querySelector("#cooling-jar-action-message");
const coolingJarActionLink = document.querySelector("#cooling-jar-action-link");
let coolingJarExpiryTimer = null;
let coolingJarInterval = null;
let currentPurchaseImpact = null;
let hasCalculatedPurchase = false;
let pendingPurchase = null;
let purchaseSubmissionId = null;
let purchaseAdded = false;
let scannerExtracted = false;
let processingFeeExplicitlyShown = false;
let resultRevealTimers = [];

const revealObserver = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-revealed");
      if (entry.target === advisorSummary) animateAdvisorRatio();
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08 })
  : null;

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

function clearResultRevealTimers() {
  resultRevealTimers.forEach((timer) => window.clearTimeout(timer));
  resultRevealTimers = [];
}

function resetResultRevealStyles() {
  [advisorSummary, comparison, advisorSection, alternativesSection, translator, purchaseDecision].forEach((section) => {
    revealObserver?.unobserve(section);
    section.classList.remove("result-reveal", "is-revealed", "is-typing");
  });
  advisorTyping.hidden = true;
}

function revealResultSection(section) {
  section.hidden = false;
  section.classList.add("result-reveal");
  if (revealObserver) {
    requestAnimationFrame(() => revealObserver.observe(section));
  } else {
    section.classList.add("is-revealed");
    if (section === advisorSummary) animateAdvisorRatio();
  }
}

function stageResultSections() {
  clearResultRevealTimers();
  resetResultRevealStyles();
  [advisorSummary, comparison, advisorSection, alternativesSection, translator, purchaseDecision].forEach((section) => {
    section.hidden = true;
    section.classList.add("result-reveal");
  });

  revealResultSection(advisorSummary);
  resultRevealTimers.push(window.setTimeout(() => revealResultSection(comparison), 150));
  resultRevealTimers.push(window.setTimeout(() => {
    revealResultSection(advisorSection);
    advisorSection.classList.add("is-typing");
    advisorTyping.hidden = false;
    resultRevealTimers.push(window.setTimeout(() => {
      advisorSection.classList.remove("is-typing");
      advisorTyping.hidden = true;
    }, 500));
  }, 300));
  resultRevealTimers.push(window.setTimeout(() => revealResultSection(alternativesSection), 950));
  resultRevealTimers.push(window.setTimeout(() => revealResultSection(translator), 1_150));
  resultRevealTimers.push(window.setTimeout(() => revealResultSection(purchaseDecision), 1_300));
}

function showResultsImmediately() {
  clearResultRevealTimers();
  resetResultRevealStyles();
  [advisorSummary, comparison, advisorSection, translator, purchaseDecision].forEach((section) => {
    section.hidden = false;
  });
}

function renderImpact(impact, staged = false) {
  emptyResult.hidden = true;
  result.hidden = false;
  renderExtraInstallmentCost(impact);
  renderComparison(impact);
  renderTranslator(impact.totalPurchaseCost);
  translatorContent.hidden = true;
  translatorToggle.setAttribute("aria-expanded", "false");
  purchaseDecision.hidden = false;
  purchaseSubmissionId ??= window.crypto?.randomUUID?.() ||
    `purchase-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  prepareAIAdvisor();
  if (staged) stageResultSections();
  else showResultsImmediately();
}

function setCoolingJarFeedback(message, isError = false) {
  coolingJarFeedback.textContent = message;
  coolingJarFeedback.classList.toggle("is-error", isError);
  coolingJarFeedback.hidden = !message;
}

function renderCoolingJarItems() {
  if (coolingJarExpiryTimer !== null) window.clearTimeout(coolingJarExpiryTimer);
  coolingJarExpiryTimer = null;
  if (coolingJarInterval !== null) window.clearInterval(coolingJarInterval);
  coolingJarInterval = null;
  coolingJarList.replaceChildren();

  const { items, error } = loadCoolingJarItems();
  if (error) {
    coolingJarEmpty.hidden = true;
    setCoolingJarFeedback(error, true);
    return;
  }
  coolingJarEmpty.hidden = items.length > 0;
  coolingJarFeedback.hidden = true;
  if (items.length) {
    const heading = document.createElement("strong");
    heading.className = "cooling-jar-list-title";
    heading.textContent = "Paused in Cooling Jar";
    coolingJarList.append(heading);
  }
  for (const item of items) {
    const remaining = getRemainingCoolingTime(item);
    const entry = document.createElement("div");
    entry.className = `cooling-jar-entry${remaining.complete ? " is-complete" : ""}`;
    const name = document.createElement("strong");
    name.textContent = item.itemName;
    const price = document.createElement("span");
    price.textContent = currency(item.price);
    const status = document.createElement("span");
    status.className = "cooling-jar-entry-status";
    status.textContent = remaining.complete
      ? "Cooling Period Complete — Ready to Decide"
      : `${remaining.hours}h ${String(remaining.minutes).padStart(2, "0")}m left`;
    entry.append(name, price, status);
    coolingJarList.append(entry);
  }

  const nextExpiry = items
    .map((item) => Date.parse(item.timestamp) + COOLING_PERIOD_MS)
    .filter((timestamp) => timestamp > Date.now())
    .sort((left, right) => left - right)[0];
  if (nextExpiry !== undefined) {
    coolingJarExpiryTimer = window.setTimeout(
      renderCoolingJarItems,
      Math.min(nextExpiry - Date.now() + 50, 2_147_000_000),
    );
  }
  if (isCoolingJarPageVisible()) {
    coolingJarInterval = window.setInterval(renderCoolingJarItems, 60_000);
  }
}

function isCoolingJarPageVisible() {
  return !document.hidden &&
    !coolingJarPage.hidden &&
    coolingJarPage.classList.contains("is-visible");
}

function clearCoolingJarTimers() {
  if (coolingJarExpiryTimer !== null) window.clearTimeout(coolingJarExpiryTimer);
  if (coolingJarInterval !== null) window.clearInterval(coolingJarInterval);
  coolingJarExpiryTimer = null;
  coolingJarInterval = null;
}

function putCurrentPurchaseInCoolingJar() {
  if (!currentPurchaseImpact || !hasCalculatedPurchase) {
    coolingJarActionMessage.textContent = "Calculate a valid purchase before using the Cooling Jar.";
    coolingJarActionLink.hidden = true;
    coolingJarActionFeedback.classList.add("is-error");
    coolingJarActionFeedback.hidden = false;
    return;
  }
  const saved = pausePurchase(currentPurchaseImpact);
  if (saved.duplicate) {
    coolingJarActionMessage.textContent = "Already paused —";
    coolingJarActionLink.hidden = false;
    coolingJarActionFeedback.classList.remove("is-error");
    coolingJarActionFeedback.hidden = false;
    renderCoolingJarItems();
    return;
  }
  if (!saved.success) {
    coolingJarActionMessage.textContent = saved.error || "This item could not be saved to the Cooling Jar.";
    coolingJarActionLink.hidden = true;
    coolingJarActionFeedback.classList.add("is-error");
    coolingJarActionFeedback.hidden = false;
    return;
  }

  coolingJarActionMessage.textContent = "Paused —";
  coolingJarActionLink.hidden = false;
  coolingJarActionFeedback.classList.remove("is-error");
  coolingJarActionFeedback.hidden = false;
  renderCoolingJarItems();
}

function renderComparison(impact) {
  comparison.hidden = false;
  const hasFinancialData = impact.hasIncomeRecords && impact.hasCommitmentRecords;
  const hasCommitmentData = impact.hasCommitmentRecords;
  const isPayFull = impact.paymentMethod === "pay-full";
  setText("#comparison-dont-buy-remaining", hasFinancialData ? currency(impact.remaining) : "Not enough data");
  setText("#comparison-buy-remaining", hasFinancialData ? currency(impact.estimatedRemaining) : "Not enough data");
  setText("#comparison-dont-buy-commitments", hasCommitmentData ? currency(impact.commitments) : "Not enough data");
  setText("#comparison-buy-commitments", hasCommitmentData ? currency(impact.newCommitments) : "Not enough data");

  const planSummary = document.querySelector("#snowball-plan-summary");
  const payFullImpact = document.querySelector("#pay-full-impact");
  planSummary.hidden = isPayFull;
  payFullImpact.hidden = !isPayFull;
  if (isPayFull) {
    setText("#pay-full-impact", `One-time purchase: ${currency(impact.itemPrice)}; no added monthly commitment.`);
  } else {
    setText("#snowball-plan-summary", hasCommitmentData
      ? `${impact.commitmentSnowball.existingActiveBnplPlans} → ${impact.commitmentSnowball.totalActiveBnplPlans} active BNPL plans`
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
  clearResultRevealTimers();
  resetResultRevealStyles();
  result.hidden = true;
  comparison.hidden = true;
  translator.hidden = true;
  purchaseDecision.hidden = true;
  purchaseConfirmation.hidden = true;
  advisorSummary.hidden = true;
  advisorSection.hidden = true;
  alternativesSection.hidden = true;
  translator.hidden = true;
  purchaseDecision.hidden = true;
  translatorContent.hidden = true;
  translatorToggle.setAttribute("aria-expanded", "false");
  clearPurchaseAlternatives();
  emptyResult.hidden = false;
}

function resetPurchaseDecision() {
  pendingPurchase = null;
  purchaseSubmissionId = null;
  purchaseAdded = false;
  coolingJarActionFeedback.hidden = true;
  coolingJarActionLink.hidden = true;
  coolingJarActionFeedback.classList.remove("is-error");
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
  document.addEventListener("pagechange", (event) => {
    if (event.detail?.pageName === "cooling-jar") {
      renderCoolingJarItems();
    } else {
      clearCoolingJarTimers();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearCoolingJarTimers();
    } else if (isCoolingJarPageVisible()) {
      renderCoolingJarItems();
    }
  });
  function onInputChange(event) {
    markExtractionEdited(event.target);
    clearPurchaseAlternatives();
    if (event.target === additionalFeesInput) {
      processingFeeExplicitlyShown = Boolean(additionalFeesInput.value.trim());
    }
    clearValidationError();
    resetPurchaseDecision();
    invalidateAIAdvice();
    updateResultsFromForm();
  }

  paymentMethodInput.addEventListener("change", (event) => {
    updateDurationVisibility();
    onInputChange(event);
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
    renderImpact(impact, true);
    void analyzeCurrentPurchase();
    void loadPurchaseAlternatives(impact.itemName, impact.itemPrice);
  });

  translatorToggle.addEventListener("click", () => {
    const expanded = translatorToggle.getAttribute("aria-expanded") !== "true";
    translatorToggle.setAttribute("aria-expanded", String(expanded));
    translatorContent.hidden = !expanded;
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
