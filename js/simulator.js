import {
  calculateCostEquivalents,
  calculatePurchaseComparison,
  calculatePurchaseImpact,
  currency,
} from "./calculations.js";
import {
  DEFAULT_TRANSLATOR_PRICES,
  getRecords,
  loadTranslatorPrices,
  saveTranslatorPrices,
} from "./storage.js";

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
const translatorError = document.querySelector("#translator-error");
const translatorStorageNote = document.querySelector("#translator-storage-note");
const referencePriceInputs = [...document.querySelectorAll("[data-reference-price]")];
let currentPurchaseImpact = null;
let referencePrices = { ...DEFAULT_TRANSLATOR_PRICES };

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
  setText("#impact-item-name", impact.itemName);
  setText("#impact-item-price", currency(impact.itemPrice));
  setText(
    "#impact-payment-method",
    impact.paymentMethod === "pay-full" ? "Pay in Full" : "Instalment · 0% interest",
  );

  const durationLabel = document.querySelector("#impact-duration-label");
  const durationValue = document.querySelector("#impact-duration");
  const durationVisible = impact.duration !== null;
  durationLabel.hidden = !durationVisible;
  durationValue.hidden = !durationVisible;
  if (durationVisible) durationValue.textContent = `${impact.duration} months`;

  const isPayFull = impact.paymentMethod === "pay-full";
  setText(
    "#impact-period-note",
    isPayFull
      ? "Pay in Full: the item price is counted once in this month’s estimate, not as a recurring commitment."
      : `Instalment: ${currency(impact.monthlyInstallment)} is added to commitments each month for ${impact.duration} months. Estimate assumes 0% interest and no fees.`,
  );
  setText("#impact-income", currency(impact.income));
  setText("#impact-existing", currency(impact.commitments));
  setText(
    "#impact-installment",
    isPayFull ? "None · one-time purchase" : `${currency(impact.monthlyInstallment)} / month`,
  );
  setText("#impact-new-commitments", currency(impact.newCommitments));
  setText("#impact-expenses", currency(impact.expenses));
  setText(
    "#impact-remaining-label",
    isPayFull
      ? "Estimated remaining after this one-time purchase"
      : "Estimated remaining each instalment month",
  );
  setText("#impact-remaining", currency(impact.estimatedRemaining));

  const assessment = document.querySelector("#impact-assessment");
  assessment.className = `assessment assessment-${impact.assessment.level}`;
  setText("#assessment-title", impact.assessment.title);
  setText("#assessment-reason", impact.assessment.reason);

  const limitation = document.querySelector("#impact-data-limitation");
  const missing = [
    ...(!impact.hasIncomeRecords ? ["monthly income"] : []),
    ...(!impact.hasCommitmentRecords ? ["monthly commitments"] : []),
  ];
  limitation.hidden = missing.length === 0;
  limitation.textContent = missing.length
    ? `This estimate is incomplete because no records for ${missing.join(" or ")} were found. Add them on My Money Dashboard; unavailable amounts are not confirmed as RM 0.`
    : "";

  if (missing.length) {
    if (!impact.hasIncomeRecords) setText("#impact-income", "Not recorded");
    if (!impact.hasCommitmentRecords) setText("#impact-existing", "Not recorded");
    setText("#impact-new-commitments", "Incomplete");
    setText("#impact-remaining", "Incomplete");
  }

  renderComparison(calculatePurchaseComparison(impact));
  renderTranslator(impact.itemPrice);
}

function renderComparison(comparisonData) {
  comparison.hidden = false;
  const isPayFull = comparisonData.paymentMethod === "pay-full";
  const remainingIsComplete = comparisonData.hasCompleteFinancialRecords;
  setText("#comparison-buy-name", comparisonData.itemName);
  setText("#comparison-buy-price", currency(comparisonData.itemPrice));
  document.querySelector("#comparison-installment-row").hidden = isPayFull;
  if (!isPayFull) setText("#comparison-installment", `${currency(comparisonData.monthlyInstallment)} / month`);
  setText("#comparison-buy-remaining-label", isPayFull
    ? "Estimated remaining after this one-time purchase"
    : "Estimated remaining each instalment month");
  setText("#comparison-buy-remaining", remainingIsComplete ? currency(comparisonData.buyRemaining) : "Incomplete estimate");
  setText("#comparison-buy-note", isPayFull
    ? "The full price is counted once in this month’s estimate."
    : `This adds ${currency(comparisonData.monthlyInstallment)} to monthly commitments for ${comparisonData.duration} months.`);

  setText("#comparison-retained-label", isPayFull ? "One-time money retained" : "Monthly payment avoided");
  setText("#comparison-retained", isPayFull
    ? currency(comparisonData.moneyRetained)
    : `${currency(comparisonData.moneyRetained)} / month`);
  document.querySelector("#comparison-avoided-row").hidden = isPayFull;
  if (!isPayFull) setText("#comparison-avoided", `${currency(comparisonData.monthlyPaymentsAvoided)} / month`);
  setText("#comparison-wait-remaining-label", "Estimated remaining this month");
  setText("#comparison-wait-remaining", remainingIsComplete ? currency(comparisonData.dontBuyRemaining) : "Incomplete estimate");
  setText("#comparison-savings-3", currency(comparisonData.potentialSavings3Months));
  setText("#comparison-savings-6", currency(comparisonData.potentialSavings6Months));
  setText("#comparison-wait-note", isPayFull
    ? "Waiting keeps this one-time amount available; it is not multiplied across months."
    : `Waiting avoids instalments for ${comparisonData.duration} months total; savings never include payments beyond that term.`);
  setText("#comparison-explanation", isPayFull
    ? `If you decide to wait, you could keep ${currency(comparisonData.itemPrice)} as a one-time amount instead of spending it on ${comparisonData.itemName}.`
    : `If you decide to wait, you could avoid up to ${currency(comparisonData.potentialSavings6Months)} in instalments over ${Math.min(6, comparisonData.duration)} months instead of committing it to ${comparisonData.itemName}.`);

  const limitation = document.querySelector("#comparison-data-limitation");
  limitation.hidden = remainingIsComplete;
  limitation.textContent = remainingIsComplete
    ? ""
    : "Remaining-money estimates are incomplete until both income and monthly commitment records are added on My Money Dashboard. Purchase amounts and payment comparisons above are still based on your entered item details.";
}

function renderTranslator(price) {
  translator.hidden = false;
  setText("#translator-purchase-price", currency(price));

  const invalidCategories = [];
  for (const input of referencePriceInputs) {
    const category = input.dataset.referencePrice;
    const text = input.value.trim();
    const value = Number(text);
    const isValid = /^\d+(?:\.\d{1,2})?$/.test(text) && Number.isFinite(value) && value > 0;
    input.setAttribute("aria-invalid", String(!isValid));
    if (isValid) {
      document.querySelector(`[data-translator-row="${category}"]`).classList.remove("is-invalid");
      const equivalent = calculateCostEquivalents(price, { [category]: value })[category];
      const units = category === "rice" ? "meals" : category === "bubbleTea" ? "cups" : "trips";
      setText(`[data-equivalent="${category}"]`, `≈ ${equivalent.toLocaleString("en-MY")} ${units}`);
    } else {
      invalidCategories.push(category);
      document.querySelector(`[data-translator-row="${category}"]`).classList.add("is-invalid");
      setText(`[data-equivalent="${category}"]`, "Check price");
    }
  }

  if (invalidCategories.length) {
    translatorError.textContent = "Enter a reference price greater than RM 0, using up to two decimal places. That comparison will update when the price is valid.";
    translatorError.hidden = false;
  } else {
    translatorError.textContent = "";
    translatorError.hidden = true;
  }
}

export function initializeSimulator() {
  const savedPrices = loadTranslatorPrices();
  referencePrices = savedPrices.prices;
  for (const input of referencePriceInputs) {
    input.value = referencePrices[input.dataset.referencePrice].toFixed(2);
  }
  if (savedPrices.error) {
    translatorStorageNote.textContent = savedPrices.error;
    translatorStorageNote.hidden = false;
  }

  function updateDurationVisibility() {
    const showDuration = paymentMethodInput.value === "installment";
    durationField.hidden = !showDuration;
    durationInput.required = showDuration;
    if (!showDuration) durationInput.value = "";
  }

  paymentMethodInput.addEventListener("change", updateDurationVisibility);
  form.addEventListener("input", clearValidationError);
  form.addEventListener("change", clearValidationError);
  for (const input of referencePriceInputs) {
    input.addEventListener("input", () => {
      const valueText = input.value.trim();
      const value = Number(valueText);
      const isValid = /^\d+(?:\.\d{1,2})?$/.test(valueText) && Number.isFinite(value) && value > 0;
      input.setAttribute("aria-invalid", String(!isValid));

      if (isValid) {
        referencePrices[input.dataset.referencePrice] = value;
        try {
          saveTranslatorPrices(referencePrices);
          translatorStorageNote.textContent = "";
          translatorStorageNote.hidden = true;
        } catch (error) {
          translatorStorageNote.textContent = `This reference price is active for this visit but could not be saved: ${error.message}`;
          translatorStorageNote.hidden = false;
        }
      }

      if (currentPurchaseImpact) renderTranslator(currentPurchaseImpact.itemPrice);
    });
  }
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
