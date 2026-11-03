import { createLocalAnalysis } from "./advisor-analysis.js";

const section = document.querySelector("#ai-advisor");
const retryButton = document.querySelector("#retry-analysis");
const loading = document.querySelector("#advisor-loading");
const status = document.querySelector("#advisor-status");
const errorPanel = document.querySelector("#advisor-error");
const result = document.querySelector("#advisor-result");

let getAnalysisPayload = () => null;
let requestController = null;
let requestVersion = 0;
let advisorConfigured = null;
let isAnalyzing = false;

const errorMessages = {
  RATE_LIMITED: "Gemini is busy right now.",
  GEMINI_TIMEOUT: "Gemini took too long to respond.",
};
const verdictLabels = ["Review the trade-offs", "Be careful", "Consider waiting", "Not enough information"];
const responseFields = ["verdict", "keyRisk", "recommendedAction"];

function setMessage(message) {
  status.textContent = message;
}

function clearResult() {
  document.querySelector("#advisor-verdict-label").textContent = "";
  for (const field of responseFields) {
    document.querySelector(`#advisor-${field === "keyRisk" ? "key-risk" : field === "recommendedAction" ? "recommended-action" : field}`).textContent = "";
  }
  result.hidden = true;
}

function renderAnalysis(analysis) {
  document.querySelector("#advisor-verdict-label").textContent = analysis.verdictLabel;
  document.querySelector("#advisor-verdict").textContent = analysis.verdict;
  document.querySelector("#advisor-key-risk").textContent = analysis.keyRisk;
  document.querySelector("#advisor-recommended-action").textContent = analysis.recommendedAction;
  result.hidden = false;
}

function validateAnalysis(analysis) {
  return Boolean(
    analysis &&
    typeof analysis === "object" &&
    !Array.isArray(analysis) &&
    Object.keys(analysis).length === 4 &&
    verdictLabels.includes(analysis.verdictLabel) &&
    responseFields.every((field) => typeof analysis[field] === "string" &&
      analysis[field].trim().length > 0 &&
      analysis[field].length <= 180),
  );
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
  const payload = getAnalysisPayload();
  if (!payload) return;

  const thisRequest = ++requestVersion;
  requestController = new AbortController();
  isAnalyzing = true;
  retryButton.disabled = true;
  retryButton.hidden = true;
  errorPanel.hidden = true;
  clearResult();
  loading.hidden = false;
  setMessage("");

  try {
    if (!payload.finances.recordsComplete) {
      renderAnalysis(createLocalAnalysis(payload));
      setMessage("Some financial records are missing; Gemini was not sent an incomplete budget.");
      return;
    }
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
      retryButton.disabled = false;
      requestController = null;
    }
  }
}

export function initializeAIAdvisor(getPayload) {
  getAnalysisPayload = getPayload;
  retryButton.addEventListener("click", () => void analysePurchase());
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
  retryButton.disabled = false;
  errorPanel.hidden = true;
  clearResult();
  setMessage("Calculate Impact to refresh the second opinion.");
}

export function prepareAIAdvisor() {
  section.hidden = false;
  if (!isAnalyzing && result.hidden) setMessage("Calculate Impact to get a second opinion.");
}

export function analyzeCurrentPurchase() {
  void analysePurchase();
}
