const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);
const CONFIDENCE_LABELS = {
  high: "AI confidence: high — verify this value",
  medium: "AI confidence: medium — please verify",
  low: "AI confidence: low — please verify",
  not_found: "Not found — enter this value manually",
};

const sampleText = {
  complete: `FICTIONAL DEMO CHECKOUT
Product: Campus Study Headphones
Cash price: RM 360
Pay in 6 monthly instalments of RM 63.00
Total instalment payment: RM 378.00
Processing fee: RM 0.00
Payment method: BNPL instalment plan`,
  "missing-duration": `FICTIONAL DEMO CHECKOUT
Product: Campus Study Headphones
Cash price: RM 360
Monthly instalment: RM 63.00
The instalment period is not displayed.`,
};

function setMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("is-error", isError);
}

function acceptedImage(file) {
  if (!file || file.size <= 0 || file.size > MAX_IMAGE_BYTES) return false;
  const extension = file.name.toLowerCase().split(".").pop();
  return (file.type === "image/png" && extension === "png") ||
    (file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension));
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const separator = dataUrl.indexOf(",");
      if (separator < 0) {
        reject(new Error("The selected image could not be read."));
        return;
      }
      resolve(dataUrl.slice(separator + 1));
    }, { once: true });
    reader.addEventListener("error", () => reject(new Error("The selected image could not be read.")), { once: true });
    reader.readAsDataURL(file);
  });
}

function renderWarnings(container, warnings) {
  container.replaceChildren();
  if (!warnings.length) {
    container.hidden = true;
    return;
  }
  const list = document.createElement("ul");
  for (const warning of warnings) {
    const item = document.createElement("li");
    item.textContent = warning;
    list.append(item);
  }
  container.append(list);
  container.hidden = false;
}

export function initializeCheckoutScanner(onExtract) {
  const fileInput = document.querySelector("#checkout-image");
  const dropzone = document.querySelector("#checkout-dropzone");
  const selectedImageName = document.querySelector("#selected-image-name");
  const textInput = document.querySelector("#checkout-text");
  const extractButton = document.querySelector("#extract-purchase-details");
  const message = document.querySelector("#scanner-message");
  const warningsContainer = document.querySelector("#scanner-warnings");
  const simulatorForm = document.querySelector("#simulator-form");
  let selectedFile = null;
  let activeRequest = null;

  function invalidatePendingExtraction() {
    if (!activeRequest) return;
    activeRequest = null;
    extractButton.disabled = false;
    setMessage(message, "Your details changed while extraction was running. The stale result will not replace your edits.");
  }

  function chooseFile(file) {
    if (!file) return;
    invalidatePendingExtraction();
    if (!acceptedImage(file)) {
      selectedFile = null;
      fileInput.value = "";
      selectedImageName.textContent = "No screenshot selected";
      setMessage(message, "Choose a PNG or JPG image no larger than 4 MB.", true);
      return;
    }
    selectedFile = file;
    selectedImageName.textContent = file.name;
    setMessage(message, "Screenshot ready. The image is sent to the server only when you extract details.");
  }

  fileInput.addEventListener("change", () => chooseFile(fileInput.files?.[0]));
  textInput.addEventListener("input", invalidatePendingExtraction);
  simulatorForm.addEventListener("input", invalidatePendingExtraction);
  simulatorForm.addEventListener("change", invalidatePendingExtraction);
  dropzone.addEventListener("click", (event) => {
    if (event.target !== fileInput) fileInput.click();
  });
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  for (const eventName of ["dragenter", "dragover"]) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragging");
    });
  }
  dropzone.addEventListener("drop", (event) => chooseFile(event.dataTransfer?.files?.[0]));

  document.querySelectorAll("[data-sample-checkout]").forEach((button) => {
    button.addEventListener("click", () => {
      invalidatePendingExtraction();
      const text = sampleText[button.dataset.sampleCheckout];
      if (!text) return;
      textInput.value = text;
      selectedFile = null;
      fileInput.value = "";
      selectedImageName.textContent = "No screenshot selected";
      renderWarnings(warningsContainer, []);
      setMessage(message, "Fictional demo details loaded. Select Extract Purchase Details to run AI extraction.");
    });
  });

  extractButton.addEventListener("click", async () => {
    const text = textInput.value.trim();
    if (!text && !selectedFile) {
      setMessage(message, "Choose a checkout screenshot or paste product details first.", true);
      return;
    }

    const request = {};
    activeRequest = request;
    extractButton.disabled = true;
    setMessage(message, "Reading the visible checkout details…");
    renderWarnings(warningsContainer, []);
    try {
      const image = selectedFile
        ? { mimeType: selectedFile.type, data: await readAsBase64(selectedFile) }
        : null;
      const response = await fetch("/api/extract-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, image }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message || "AI could not extract checkout details. Try again or enter them manually.");
      }
      if (!body?.extraction) throw new Error("AI returned an unexpected extraction. Please try again.");
      if (activeRequest !== request) return;

      onExtract(body.extraction);
      renderWarnings(warningsContainer, getExtractionWarnings(body.extraction));
    } catch (error) {
      if (activeRequest === request) {
        setMessage(message, `${error.message} You can still enter the details manually.`, true);
      }
    } finally {
      if (activeRequest === request) {
        activeRequest = null;
        extractButton.disabled = false;
      }
    }
  });
}

export function extractionFieldMessage(field, label) {
  if (field.confidence === "not_found" || !field.value) {
    return { text: `⚠️ ${label} not found. Enter or select it manually; AI will not guess.`, warning: true };
  }
  return { text: `${CONFIDENCE_LABELS[field.confidence] || "AI extracted — verify this value"}.`, warning: field.confidence === "low" };
}

export function getExtractionWarnings(extraction) {
  const warnings = [...extraction.warnings];
  const duration = Number(extraction.durationMonths.value);
  const monthly = Number(extraction.monthlyInstallment.value);
  const total = Number(extraction.totalInstallmentPayment.value);
  if (
    extraction.durationMonths.confidence !== "not_found" &&
    extraction.monthlyInstallment.confidence !== "not_found" &&
    extraction.totalInstallmentPayment.confidence !== "not_found" &&
    Math.abs(total - monthly * duration) > 0.02
  ) {
    warnings.push("The displayed monthly amount and total do not match a simple instalment total. Verify whether upfront payments or additional charges are included.");
  }
  return warnings;
}
