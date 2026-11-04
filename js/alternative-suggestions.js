const section = document.querySelector("#purchase-alternatives");
const status = document.querySelector("#alternatives-status");
const list = document.querySelector("#alternatives-list");

let requestVersion = 0;
let requestController = null;

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

export function clearPurchaseAlternatives() {
  requestVersion += 1;
  requestController?.abort();
  requestController = null;
  section.hidden = true;
  status.textContent = "";
  list.replaceChildren();
}

export async function loadPurchaseAlternatives(itemName, itemPrice) {
  clearPurchaseAlternatives();
  const thisRequest = requestVersion;
  requestController = new AbortController();
  const controller = requestController;
  status.textContent = "Searching current Malaysian prices…";

  try {
    const response = await fetch("/api/purchase-alternatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemName, itemPrice }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error?.message || "Current alternatives could not be found.");
    }
    if (
      !body ||
      !Array.isArray(body.alternatives) ||
      body.alternatives.length > 3 ||
      !body.alternatives.every(isValidAlternative)
    ) {
      throw new Error("Search returned alternatives that could not be verified.");
    }
    if (thisRequest !== requestVersion) return;

    renderAlternatives(body.alternatives);
    status.textContent = body.alternatives.length
      ? "Current lower-priced options found. Check each seller’s price before deciding."
      : "No verified lower-priced options found for this search.";
  } catch (error) {
    if (thisRequest !== requestVersion || error.name === "AbortError") return;
    status.textContent = `${error.message} Check prices directly with sellers before deciding.`;
  } finally {
    if (thisRequest === requestVersion) requestController = null;
  }
}
