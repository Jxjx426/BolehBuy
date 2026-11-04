import { createLocalAnalysis } from "./advisor-analysis.js";

const section = document.querySelector("#ai-advisor");
const summary = document.querySelector("#advisor-summary");
const retryButton = document.querySelector("#retry-analysis");
const loading = document.querySelector("#advisor-loading");
const status = document.querySelector("#advisor-status");
const errorPanel = document.querySelector("#advisor-error");
const result = document.querySelector("#advisor-mamak-text");

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
const responseFields = ["mamakText", "keyRisk", "recommendedAction"];

function setMessage(message) {
  status.textContent = message;
}

function clearResult() {
  document.querySelector("#advisor-verdict-label").textContent = "";
  document.querySelector("#advisor-key-risk").textContent = "";
  document.querySelector("#advisor-recommended-action").textContent = "";
  result.textContent = "";
  result.hidden = true;
}

function renderRatioSummary(payload) {
  const ratioSummary = document.querySelector(".advisor-ratio-summary");
  const before = payload?.finances?.commitmentRatioBefore;
  const after = payload?.finances?.commitmentRatioAfter;
  const hasRatio = Number.isFinite(before) && Number.isFinite(after);
  const beforeElement = document.querySelector("#advisor-ratio-before");
  const afterElement = document.querySelector("#advisor-ratio-after");
  const ring = document.querySelector("#advisor-ratio-ring");
  const ringLabel = document.querySelector("#advisor-ratio-ring-label");
  ratioSummary.classList.toggle("has-ratio", hasRatio);
  beforeElement.textContent = hasRatio ? `${before.toFixed(2)}%` : "Not enough data";
  afterElement.textContent = hasRatio ? `${after.toFixed(2)}%` : "Not enough data";
  afterElement.dataset.target = hasRatio ? String(after) : "";
  ringLabel.textContent = hasRatio ? `${after.toFixed(2)}%` : "—";
  ring.style.strokeDashoffset = hasRatio ? String(100 - Math.min(Math.max(after, 0), 100)) : "100";
  if (!hasRatio) {
    document.querySelector("#advisor-ratio-shift").textContent = "Not enough data";
    return;
  }
  const difference = after - before;
  const direction = difference > 0 ? "+" : difference < 0 ? "−" : "";
  document.querySelector("#advisor-ratio-shift").textContent = difference === 0
    ? "No change (0.00 percentage points)"
    : `${direction}${Math.abs(difference).toFixed(2)} percentage points`;
}

export function animateAdvisorRatio() {
  const beforeText = document.querySelector("#advisor-ratio-before").textContent;
  const target = Number(document.querySelector("#advisor-ratio-after").dataset.target);
  const before = Number.parseFloat(beforeText);
  if (!Number.isFinite(before) || !Number.isFinite(target)) return;

  const afterElement = document.querySelector("#advisor-ratio-after");
  const ring = document.querySelector("#advisor-ratio-ring");
  const ringLabel = document.querySelector("#advisor-ratio-ring-label");
  const start = performance.now();
  const duration = 600;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const update = (timestamp) => {
    const progress = reducedMotion ? 1 : Math.min((timestamp - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    const value = before + (target - before) * eased;
    const formatted = `${value.toFixed(2)}%`;
    afterElement.textContent = formatted;
    ringLabel.textContent = formatted;
    ring.style.strokeDashoffset = String(100 - Math.min(Math.max(value, 0), 100));
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function renderAnalysis(analysis, payload) {
  document.querySelector("#advisor-verdict-label").textContent = analysis.verdictLabel;
  document.querySelector("#advisor-key-risk").textContent = analysis.keyRisk;
  document.querySelector("#advisor-recommended-action").textContent = analysis.recommendedAction;
  renderRatioSummary(payload);
  result.textContent = analysis.mamakText;
  result.hidden = false;
}

function validateAnalysis(analysis) {
  return Boolean(
    analysis &&
    typeof analysis === "object" &&
    !Array.isArray(analysis) &&
    Object.keys(analysis).length === 4 &&
    verdictLabels.includes(analysis.verdictLabel) &&
    typeof analysis.mamakText === "string" &&
    analysis.mamakText.trim().length > 0 &&
    analysis.mamakText.length <= 280 &&
    responseFields.slice(1).every((field) => typeof analysis[field] === "string" &&
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
      renderAnalysis(createLocalAnalysis(payload), payload);
      setMessage("Some financial records are missing; Gemini was not sent an incomplete budget.");
      return;
    }
    if (advisorConfigured === false) {
      renderAnalysis(createLocalAnalysis(payload), payload);
      setMessage("Local analysis shown; Gemini is unavailable.");
      return;
    }

    try {
      const analysis = await requestGeminiAnalysis(payload, requestController.signal);
      if (thisRequest !== requestVersion) return;
      renderAnalysis(analysis, payload);
      setMessage("Gemini analysis complete. Your calculated figures remain the source of truth.");
    } catch (error) {
      if (thisRequest !== requestVersion || error.name === "AbortError") return;
      renderAnalysis(createLocalAnalysis(payload), payload);
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
  summary.hidden = false;
  section.hidden = false;
  renderRatioSummary(getAnalysisPayload());
  if (!isAnalyzing && result.hidden) setMessage("Calculate Impact to get a second opinion.");
}

export function analyzeCurrentPurchase() {
  void analysePurchase();
}
