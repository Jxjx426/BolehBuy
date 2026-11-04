export const STUDY_HEADPHONES_DEMO = {
  itemName: "Study Headphones",
  itemPrice: 599,
  alternatives: [
    { productName: "Budget ANC Headphones", estimatedPrice: 199 },
    { productName: "Basic Wireless Headphones", estimatedPrice: 149 },
  ],
};

function normalizeDemoItemName(itemName) {
  return itemName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bheadphones\b/g, "headphone")
    .trim();
}

export function isStudyHeadphonesDemoScenario(itemName, itemPrice) {
  const numericPrice = typeof itemPrice === "number" ? itemPrice : Number(itemPrice);
  return typeof itemName === "string" &&
    normalizeDemoItemName(itemName) === normalizeDemoItemName(STUDY_HEADPHONES_DEMO.itemName) &&
    Number.isFinite(numericPrice) &&
    numericPrice === STUDY_HEADPHONES_DEMO.itemPrice;
}
