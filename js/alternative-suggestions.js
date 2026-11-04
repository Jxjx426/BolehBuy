import {
  isStudyHeadphonesDemoScenario,
  STUDY_HEADPHONES_DEMO,
} from "./alternative-demo-data.js";

const section = document.querySelector("#purchase-alternatives");
const status = document.querySelector("#alternatives-status");
const list = document.querySelector("#alternatives-list");
const modeLabel = document.querySelector("#alternatives-mode-label");
const retryButton = document.querySelector("#alternatives-retry");

let requestVersion = 0;
let requestController = null;
let requestKey = null;
let requestPromise = null;
let lastSearch = null;

const currency = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function isValidAlternative(alternative) {
  return Boolean(
    alternative &&
    typeof alternative === "object" &&
    typeof alternative.productName === "string" &&
    alternative.productName.trim() &&
    Number.isFinite(alternative.estimatedPrice) &&
    typeof alternative.reason === "string" &&
    alternative.reason.trim() &&
    alternative.source &&
    typeof alternative.source.url === "string" &&
    typeof alternative.source.title === "string",
  );
}

function renderAlternatives(alternatives) {
  list.replaceChildren();
  for (const alternative of alternatives) {
    const card = document.createElement("article");
    card.className = "translator-row";
    const details = document.createElement("div");
    details.className = "translator-detail";
    const name = document.createElement("strong");
    name.textContent = alternative.productName;
    const reason = document.createElement("span");
    reason.textContent = alternative.reason;
    const source = document.createElement("a");
    source.href = alternative.source.url;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = `Source: ${alternative.source.title}`;
    details.append(name, reason, source);

    const price = document.createElement("strong");
    price.className = "translator-equivalent";
    price.textContent = currency.format(alternative.estimatedPrice);
    card.append(details, price);
    list.append(card);
  }
}

function renderDemoAlternatives() {
  list.replaceChildren();
  for (const alternative of STUDY_HEADPHONES_DEMO.alternatives) {
    const card = document.createElement("article");
    card.className = "translator-row demo-alternative";
    const details = document.createElement("div");
    details.className = "translator-detail";
    const name = document.createElement("strong");
    name.textContent = alternative.productName;
    const reason = document.createElement("span");
    reason.textContent = "Illustrative lower-cost option; not a verified listing.";
    details.append(name, reason);

    const price = document.createElement("strong");
    price.className = "translator-equivalent";
    price.textContent = currency.format(alternative.estimatedPrice);
    card.append(details, price);
    list.append(card);
  }
}

function showDemoFallback(itemName, itemPrice) {
  if (!isStudyHeadphonesDemoScenario(itemName, itemPrice)) return false;
  renderDemoAlternatives();
  modeLabel.classList.add("is-demo");
  modeLabel.textContent = "Demo Example — Not Live Product Listings";
  modeLabel.hidden = false;
  return true;
}

function showLiveMode() {
  modeLabel.classList.remove("is-demo");
  modeLabel.textContent = "Live sourced results";
  modeLabel.hidden = false;
}

export function clearPurchaseAlternatives() {
  requestVersion += 1;
  requestController?.abort();
  requestController = null;
  requestKey = null;
  requestPromise = null;
  lastSearch = null;
  section.hidden = true;
  status.textContent = "";
  modeLabel.textContent = "";
  modeLabel.classList.remove("is-demo");
  modeLabel.hidden = true;
  retryButton.hidden = true;
  retryButton.disabled = false;
  list.replaceChildren();
}

export function loadPurchaseAlternatives(itemName, itemPrice) {
  const nextRequestKey = JSON.stringify([itemName, itemPrice]);
  if (requestController && requestKey === nextRequestKey) return requestPromise;

  clearPurchaseAlternatives();
  const thisRequest = requestVersion;
  requestController = new AbortController();
  const controller = requestController;
  requestKey = nextRequestKey;
  lastSearch = { itemName, itemPrice };
  retryButton.disabled = true;
  retryButton.hidden = true;
  section.hidden = false;
  status.textContent = "Searching current Malaysian prices…";

  requestPromise = (async () => {
    try {
      const response = await fetch("/api/purchase-alternatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName, itemPrice }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message || "Live product search is temporarily unavailable.");
      }
      if (
        !body ||
        !Array.isArray(body.alternatives) ||
        body.alternatives.length > 3 ||
        !body.alternatives.every(isValidAlternative)
      ) {
        throw new Error("Live product search returned results that could not be verified.");
      }
      if (thisRequest !== requestVersion) return;

      if (body.alternatives.length) {
        renderAlternatives(body.alternatives);
        showLiveMode();
        status.textContent = "Current lower-priced options found. Check each seller’s price before deciding.";
      } else {
        const demoShown = showDemoFallback(itemName, itemPrice);
        status.textContent = demoShown
          ? "Live search found no verified alternatives. Showing a fictional demo example instead."
          : "Live search found no verified alternatives for this product.";
        retryButton.hidden = false;
      }
    } catch (error) {
      if (thisRequest !== requestVersion || error.name === "AbortError") return;
      const demoShown = showDemoFallback(itemName, itemPrice);
      status.textContent = demoShown
        ? "Live product search is temporarily unavailable. Showing a fictional demo example instead."
        : "Live product search is temporarily unavailable.";
      retryButton.hidden = false;
    } finally {
      if (thisRequest === requestVersion) {
        requestController = null;
        requestKey = null;
        requestPromise = null;
        retryButton.disabled = false;
      }
    }
  })();
  return requestPromise;
}

retryButton.addEventListener("click", () => {
  if (!lastSearch || requestController) return;
  void loadPurchaseAlternatives(lastSearch.itemName, lastSearch.itemPrice);
});
