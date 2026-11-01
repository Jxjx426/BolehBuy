import { createLocalAnalysis } from "./advisor-analysis.js";

const section = document.querySelector("#ai-advisor");
const analyseButton = document.querySelector("#analyse-purchase");
const retryButton = document.querySelector("#retry-analysis");
const loading = document.querySelector("#advisor-loading");
const status = document.querySelector("#advisor-status");
const errorPanel = document.querySelector("#advisor-error");
const result = document.querySelector("#advisor-result");
const resultContent = document.querySelector("#advisor-result-content");

let getAnalysisPayload = () => null;
let requestController = null;
let requestVersion = 0;
let purchaseReady = false;
let advisorConfigured = null;
let isAnalyzing = false;

const errorMessages = {
  RATE_LIMITED: "Gemini is busy right now.",
  GEMINI_TIMEOUT: "Gemini took too long to respond.",
};
const verdictLabels = ["Looks manageable", "Be careful", "Consider waiting", "Not enough information"];

function setMessage(message) {
  status.textContent = message;
}

function clearResult() {
  resultContent.replaceChildren();
  result.hidden = true;
}

function addTextCard(heading, text, className = "") {
  const card = document.createElement("article");
  card.className = `advisor-result-card ${className}`.trim();
  const title = document.createElement("h3");
  title.textContent = heading;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  card.append(title, paragraph);
  return card;
}

function renderAnalysis(analysis) {
  resultContent.replaceChildren();
  const verdict = document.createElement("article");
  verdict.className = "advisor-result-card advisor-verdict";
  const label = document.createElement("span");
  label.className = "advisor-verdict-label";
  label.textContent = analysis.verdictLabel;
  const summary = document.createElement("p");
  summary.textContent = analysis.verdict;
  verdict.append(label, summary);

  resultContent.append(
    verdict,
    addTextCard("Positive", analysis.positive, "advisor-positive"),
    addTextCard("Watch out", analysis.watchOut, "advisor-watchout"),
    addTextCard("My suggestion", analysis.suggestion, "advisor-suggestion"),
    addTextCard("Before you decide", analysis.question, "advisor-question"),
  );
  result.hidden = false;
}

function validateAnalysis(analysis) {
  return Boolean(
    analysis &&
    typeof analysis === "object" &&
    verdictLabels.includes(analysis.verdictLabel) &&
    ["verdict", "positive", "watchOut", "suggestion", "question"]
      .every((field) => typeof analysis[field] === "string" &&
        analysis[field].trim().length > 0 &&
        analysis[field].length <= 200),
  );
}

function setReady(isReady) {
  purchaseReady = isReady;
  analyseButton.disabled = !isReady || isAnalyzing;
  retryButton.disabled = isAnalyzing;
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
    throw new Error(errorMessages[code] || body?.error?.message || "Gemini could not complete the analysis.");
  }
  if (!body || !validateAnalysis(body.analysis)) throw new Error("Gemini returned an unexpected response.");
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
  retryButton.hidden = true;
  errorPanel.hidden = true;
  clearResult();
  loading.hidden = false;
  setMessage("");

  try {
    if (advisorConfigured === false) {
      renderAnalysis(createLocalAnalysis(payload));
      setMessage("Local analysis shown; Gemini is unavailable.");
      return;
    }

    try {
      const analysis = await requestGeminiAnalysis(payload, requestController.signal);
      if (thisRequest !== requestVersion) return;
      renderAnalysis(analysis);
      setMessage("Gemini analysis complete. Your calculated figures remain the source of truth.");
    } catch (error) {
      if (thisRequest !== requestVersion || error.name === "AbortError") return;
      renderAnalysis(createLocalAnalysis(payload));
      errorPanel.textContent = `${error.message} A local summary is shown instead.`;
      errorPanel.hidden = false;
      retryButton.hidden = false;
      setMessage("Local summary shown; you can retry the Gemini analysis.");
    }
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
  retryButton.addEventListener("click", analysePurchase);
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
  retryButton.hidden = true;
  errorPanel.hidden = true;
  clearResult();
  setReady(false);
  if (!section.hidden) setMessage("Your purchase details changed. Recalculate before asking again.");
}

export function markAIAdviceReady() {
  section.hidden = false;
  clearResult();
  errorPanel.hidden = true;
  retryButton.hidden = true;
  setMessage("");
  setReady(true);
}
