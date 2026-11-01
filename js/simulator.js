import { calculatePurchaseImpact, currency } from "./calculations.js";
import { getRecords } from "./storage.js";

const form = document.querySelector("#simulator-form");
const itemNameInput = document.querySelector("#item-name");
const itemPriceInput = document.querySelector("#item-price");
const paymentMethodInput = document.querySelector("#payment-method");
const durationField = document.querySelector("#duration-field");
const durationInput = document.querySelector("#instalment-duration");
const formError = document.querySelector("#simulator-form-error");
const emptyResult = document.querySelector("#simulator-empty");
const result = document.querySelector("#simulator-result");

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
}

export function initializeSimulator() {
  function updateDurationVisibility() {
    const showDuration = paymentMethodInput.value === "installment";
    durationField.hidden = !showDuration;
    durationInput.required = showDuration;
    if (!showDuration) durationInput.value = "";
  }

  paymentMethodInput.addEventListener("change", updateDurationVisibility);
  form.addEventListener("input", clearValidationError);
  form.addEventListener("change", clearValidationError);
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
    renderImpact(impact);
  });

  updateDurationVisibility();
}
