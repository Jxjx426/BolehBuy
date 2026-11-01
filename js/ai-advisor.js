import { currency } from "./calculations.js";

const section = document.querySelector("#ai-advisor");
const analyseButton = document.querySelector("#analyse-purchase");
const loading = document.querySelector("#advisor-loading");
const status = document.querySelector("#advisor-status");
const result = document.querySelector("#advisor-result");
const resultContent = document.querySelector("#advisor-result-content");

let getAnalysisPayload = () => null;
let requestController = null;
let requestVersion = 0;
let purchaseReady = false;
let advisorConfigured = null;
let isAnalyzing = false;

const errorMessages = {
  RATE_LIMITED: "The advisor is busy right now.",
  GEMINI_TIMEOUT: "The advisor took too long to respond.",
};

function setMessage(message) {
  status.textContent = message;
}

function clearResult() {
  resultContent.replaceChildren();
  result.hidden = true;
}

function renderList(container, entries) {
  const list = document.createElement("ul");
  for (const entry of entries) {
    const item = document.createElement("li");
    item.textContent = entry;
    list.append(item);
  }
  container.append(list);
}

function renderAnalysis(analysis) {
  resultContent.replaceChildren();
  const sections = [
    ["Overall Opinion", analysis.overallOpinion, false],
    ["Key Reasons", analysis.keyReasons, true],
    ["Financial Risks", analysis.financialRisks, true],
    ["Suggestions", analysis.suggestions, true],
    ["Questions to Consider", analysis.questionsToConsider, true],
  ];

  for (const [heading, content, isList] of sections) {
    const card = document.createElement("article");
    card.className = "advisor-result-card";
    const title = document.createElement("h3");
    title.textContent = heading;
    card.append(title);
    if (isList) renderList(card, content);
    else {
      const paragraph = document.createElement("p");
      paragraph.textContent = content;
      card.append(paragraph);
    }
    resultContent.append(card);
  }
  result.hidden = false;
}

function validateAnalysis(analysis) {
  return Boolean(
    analysis &&
    typeof analysis.overallOpinion === "string" &&
    Array.isArray(analysis.keyReasons) &&
    Array.isArray(analysis.financialRisks) &&
    Array.isArray(analysis.suggestions) &&
    Array.isArray(analysis.questionsToConsider) &&
    [analysis.keyReasons, analysis.financialRisks, analysis.suggestions, analysis.questionsToConsider]
      .every((list) => list.length > 0 && list.every((item) => typeof item === "string")),
  );
}

function setReady(isReady) {
  purchaseReady = isReady;
  analyseButton.disabled = !isReady || isAnalyzing;
}

function formatValue(value) {
  return Number.isFinite(value) ? currency(value) : "not available";
}

function createLocalAnalysis(payload) {
  const { purchase, finances, spendingAssessment, comparison } = payload;
  const installment = purchase.paymentMethod === "pay-full"
    ? `a one-time payment of ${currency(purchase.itemPrice)}`
    : `${currency(purchase.monthlyInstallment)} per month for ${purchase.duration} months`;
  const remaining = finances.recordsComplete
    ? `The calculated remaining cash after purchase is ${currency(finances.estimatedRemainingAfterPurchase)}.`
    : `The remaining-cash estimate is incomplete because ${finances.missingRecords.join(" and ")} ${finances.missingRecords.length === 1 ? "is" : "are"} not recorded.`;
  const assessment = spendingAssessment?.title || "No spending assessment is available";
  const savings = `The existing comparison calculates potential savings of ${formatValue(comparison.potentialSavings3Months)} over 3 months and ${formatValue(comparison.potentialSavings6Months)} over 6 months.`;
  const remainingIsNegative = finances.recordsComplete && finances.estimatedRemainingAfterPurchase < 0;
  const recordedFigures = [
    finances.monthlyIncome !== null ? `Recorded monthly income is ${currency(finances.monthlyIncome)}.` : null,
    finances.existingMonthlyCommitments !== null
      ? `Recorded monthly commitments are ${currency(finances.existingMonthlyCommitments)}.`
      : null,
    `Current-month expenses in the estimate are ${currency(finances.currentMonthExpenses)}.`,
  ].filter(Boolean);
  const keyReasons = [
    `${purchase.itemName} costs ${currency(purchase.itemPrice)}; the selected payment would be ${installment}.`,
    ...recordedFigures,
    remaining,
    finances.recordsComplete
      ? `The existing JavaScript assessment is “${assessment}”.`
      : `The recorded assessment is “${assessment}”; missing records mean affordability is not confirmed.`,
  ];
  const financialRisks = finances.recordsComplete
    ? [
      remainingIsNegative
        ? `The current estimate is below zero by ${currency(Math.abs(finances.estimatedRemainingAfterPurchase))}.`
        : `The estimate is based on the records entered and may not include unrecorded costs.`,
      "Provider fees, late charges, or payment terms may differ from this estimate.",
    ]
    : [
      `Without ${finances.missingRecords.join(" and ")}, the available figures cannot confirm whether this purchase fits your budget.`,
      "Provider fees, late charges, or payment terms may differ from this estimate.",
    ];
  const suggestions = [
    finances.recordsComplete
      ? "Compare the instalment schedule and any provider fees with your upcoming bills before deciding."
      : "Add the missing income or commitment records on the Dashboard for a more complete estimate.",
    `If you wait, ${savings}`,
  ];
  const questionsToConsider = [
    `Think Before You Tap: If you waited 48 hours, would you still choose ${purchase.itemName} over another use for ${currency(purchase.itemPrice)}?`,
    "Would this payment still feel manageable in a month with an unexpected expense?",
  ];

  return {
    overallOpinion: finances.recordsComplete
      ? `${remaining} The recorded assessment is “${assessment}”. This is a snapshot of the information provided, not a guarantee of affordability.`
      : `This estimate for ${purchase.itemName} is incomplete. ${remaining} Avoid treating it as a confident affordability conclusion.`,
    keyReasons,
    financialRisks,
    suggestions,
    questionsToConsider,
  };
}

async function requestGeminiAnalysis(payload, signal) {
  const response = await fetch("/api/analyse-purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body?.error?.code;
    throw new Error(errorMessages[code] || body?.error?.message || "Advisor unavailable.");
  }
  if (!body || !validateAnalysis(body.analysis)) throw new Error("Unexpected advisor response.");
  return body.analysis;
}

async function analysePurchase() {
  if (!purchaseReady) {
    setMessage("Calculate the purchase impact before analysing.");
    return;
  }

  const payload = getAnalysisPayload();
  if (!payload) {
    setMessage("Calculate the purchase impact before analysing.");
    return;
  }

  const thisRequest = ++requestVersion;
  requestController = new AbortController();
  isAnalyzing = true;
  setReady(purchaseReady);
  clearResult();
  loading.hidden = false;
  setMessage("");

  try {
    let analysis = null;
    if (advisorConfigured !== false) {
      try {
        analysis = await requestGeminiAnalysis(payload, requestController.signal);
      } catch {
        analysis = null;
      }
    }
    if (thisRequest !== requestVersion) return;

    if (analysis) {
      renderAnalysis(analysis);
      setMessage("Gemini analysis complete. Your calculated figures remain the source of truth.");
    } else {
      renderAnalysis(createLocalAnalysis(payload));
      setMessage("Local analysis (offline fallback) shown using your calculated figures.");
    }
  } catch {
    if (thisRequest !== requestVersion) return;
    setMessage("This purchase summary could not be analysed. Calculate the impact again to refresh it.");
  } finally {
    if (thisRequest === requestVersion) {
      loading.hidden = true;
      isAnalyzing = false;
      setReady(purchaseReady);
      requestController = null;
    }
  }
}

export function initializeAIAdvisor(getPayload) {
  getAnalysisPayload = getPayload;
  setReady(false);
  analyseButton.addEventListener("click", analysePurchase);
  void checkAdvisorAvailability();
}

async function checkAdvisorAvailability() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error("Advisor server unavailable.");
    const health = await response.json();
    advisorConfigured = health.configured === true;
  } catch {
    advisorConfigured = false;
  }
}

export function invalidateAIAdvice() {
  requestVersion += 1;
  requestController?.abort();
  requestController = null;
  isAnalyzing = false;
  loading.hidden = true;
  clearResult();
  setReady(false);
  if (!section.hidden) setMessage("Calculate the updated impact to refresh your analysis.");
}

export function markAIAdviceReady() {
  section.hidden = false;
  clearResult();
  setMessage("");
  setReady(true);
}
