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

const setupMessage = "Gemini is not configured yet. Copy .env.example to .env, add your GEMINI_API_KEY, then restart the server.";

const errorMessages = {
  NOT_CONFIGURED: "Gemini is not configured yet. Copy .env.example to .env, add your GEMINI_API_KEY, then restart the server.",
  RATE_LIMITED: "The advisor is busy right now. Please wait a moment and try again.",
  GEMINI_TIMEOUT: "The advisor took too long to respond. Please try again.",
  GEMINI_CONFIGURATION: "Gemini could not be reached with the current configuration. Check the server setup and try again.",
  GEMINI_UNAVAILABLE: "The advisor could not complete the analysis. Please try again shortly.",
  INVALID_AI_RESPONSE: "The advisor returned an unexpected response. Please try again.",
};

function setMessage(element, message, visible = true) {
  element.textContent = message;
  element.hidden = !visible;
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
  analyseButton.disabled = !isReady || advisorConfigured !== true;
}

async function analysePurchase() {
  if (!purchaseReady) {
    setMessage(status, "Your purchase details changed. Calculate the impact again before analysing.", true);
    return;
  }
  if (advisorConfigured !== true) {
    setMessage(status, advisorConfigured === false
      ? setupMessage
      : "Checking the advisor setup. Please try again in a moment.", true);
    return;
  }

  const payload = getAnalysisPayload();
  if (!payload) {
    setMessage(status, "Calculate your purchase impact before requesting an analysis.", true);
    return;
  }

  const thisRequest = ++requestVersion;
  requestController = new AbortController();
  analyseButton.disabled = true;
  retryButton.hidden = true;
  errorPanel.hidden = true;
  clearResult();
  loading.hidden = false;
  setMessage(status, "Reviewing your purchase details and calculated budget summary…", true);

  try {
    const response = await fetch("/api/analyse-purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: requestController.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const code = body?.error?.code;
      throw new Error(errorMessages[code] || body?.error?.message || "The advisor could not complete the analysis. Please try again.");
    }
    if (!body || !validateAnalysis(body.analysis)) {
      throw new Error(errorMessages.INVALID_AI_RESPONSE);
    }
    if (thisRequest !== requestVersion) return;
    renderAnalysis(body.analysis);
    setMessage(status, "Analysis complete. These are educational insights, not financial advice.", true);
  } catch (error) {
    if (thisRequest !== requestVersion || error.name === "AbortError") return;
    setMessage(status, "", false);
    setMessage(errorPanel, error.message || "The advisor could not complete the analysis. Please try again.", true);
    retryButton.hidden = false;
  } finally {
    if (thisRequest === requestVersion) {
      loading.hidden = true;
      setReady(purchaseReady);
      requestController = null;
    }
  }
}

export function initializeAIAdvisor(getPayload) {
  getAnalysisPayload = getPayload;
  setReady(false);
  setMessage(status, "Checking the advisor setup…", true);

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
    if (advisorConfigured) {
      setReady(purchaseReady);
      if (!purchaseReady) {
        setMessage(status, "Calculate your purchase impact first. Then ask the advisor for a second opinion.", true);
      } else {
        setMessage(status, "Your purchase summary is ready. Analyse it whenever you’re ready.", true);
      }
    } else {
      setReady(false);
      setMessage(status, setupMessage, true);
    }
  } catch {
    advisorConfigured = false;
    setReady(false);
    setMessage(status, "The advisor server is unavailable. Start the app with npm run dev and refresh this page.", true);
  }
}

export function invalidateAIAdvice() {
  requestVersion += 1;
  requestController?.abort();
  requestController = null;
  loading.hidden = true;
  retryButton.hidden = true;
  errorPanel.hidden = true;
  clearResult();
  setReady(false);
  if (!section.hidden) {
    setMessage(status, advisorConfigured === false
      ? setupMessage
      : "Your purchase details changed. Calculate the impact again before analysing.", true);
  }
}

export function markAIAdviceReady() {
  section.hidden = false;
  clearResult();
  errorPanel.hidden = true;
  retryButton.hidden = true;
  setMessage(status, advisorConfigured === false
    ? setupMessage
    : advisorConfigured === true
      ? "Your purchase summary is ready. Analyse it whenever you’re ready."
      : "Checking the advisor setup…", true);
  setReady(true);
}
