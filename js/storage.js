import {
  addMonthsToDate,
  dateAfterDays,
  isValidDate,
  localDateString,
} from "./calculations.js";

export const STORAGE_KEY = "bolehbuy-finances";
export const TRANSLATOR_PRICES_KEY = "bolehbuy-cost-translator-prices";
export const DEFAULT_TRANSLATOR_PRICES = Object.freeze({
  rice: 12,
  bubbleTea: 15,
  transport: 4,
});
const STORAGE_VERSION = 1;
const RECORD_TYPES = ["income", "commitment", "expense", "payment"];

export const CATEGORIES = {
  commitment: ["BNPL", "Bills", "Subscriptions"],
  expense: ["Food", "Transport", "Shopping", "Entertainment", "Others"],
  payment: ["BNPL", "Bills", "Subscriptions", "Other"],
};

let currentRecords = [];

function validTranslatorPrices(value) {
  return value && Object.keys(DEFAULT_TRANSLATOR_PRICES).every((key) =>
    Number.isFinite(value[key]) && value[key] > 0
  );
}

export function loadTranslatorPrices() {
  try {
    const saved = window.localStorage.getItem(TRANSLATOR_PRICES_KEY);
    if (saved === null) return { prices: { ...DEFAULT_TRANSLATOR_PRICES }, error: null };
    const prices = JSON.parse(saved);
    if (!validTranslatorPrices(prices)) {
      throw new Error("Saved reference prices are invalid.");
    }
    return { prices, error: null };
  } catch (error) {
    return {
      prices: { ...DEFAULT_TRANSLATOR_PRICES },
      error: `Custom reference prices could not be loaded. Default examples are shown. ${error.message}`,
    };
  }
}

export function saveTranslatorPrices(prices) {
  if (!validTranslatorPrices(prices)) {
    throw new Error("All example reference prices must be greater than RM 0.");
  }
  window.localStorage.setItem(TRANSLATOR_PRICES_KEY, JSON.stringify(prices));
}

function makeSampleRecords() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const sampleDate = (day) => `${year}-${month}-${String(day).padStart(2, "0")}`;
  const seed = (id, type, name, category, amount, date = null, dueDate = null) => ({
    id,
    type,
    name,
    category,
    amount,
    date,
    dueDate,
  });

  return [
    seed("sample-income-allowance", "income", "Allowance", "Income", 1600),
    seed("sample-income-job", "income", "Part-time Job", "Income", 600),
    seed("sample-commitment-phone", "commitment", "Mobile Bill", "Bills", 58),
    seed("sample-commitment-laptop", "commitment", "Laptop", "BNPL", 220),
    seed("sample-commitment-bag", "commitment", "Everyday Bag", "BNPL", 150),
    seed("sample-commitment-wifi", "commitment", "Wi-Fi Share", "Bills", 252),
    seed("sample-expense-food", "expense", "Meals & drinks", "Food", 326, sampleDate(4)),
    seed("sample-expense-travel", "expense", "Bus & train", "Transport", 148, sampleDate(10)),
    seed("sample-expense-shopping", "expense", "Campus essentials", "Shopping", 168, sampleDate(17)),
    seed("sample-expense-other", "expense", "Study printing", "Others", 100, sampleDate(24)),
    seed("sample-payment-phone", "payment", "Mobile Bill", "Bills", 58, null, dateAfterDays(5)),
    seed("sample-payment-course", "payment", "Course Materials", "BNPL", 45, null, dateAfterDays(8)),
    seed("sample-payment-headphones", "payment", "Headphones", "BNPL", 72, null, dateAfterDays(12)),
  ];
}

export function validateSavedRecords(value) {
  if (!value || value.version !== STORAGE_VERSION || !Array.isArray(value.records)) {
    throw new Error("Saved finance data has an unsupported format.");
  }

  const valid = value.records.every((record) => {
    if (
      !record ||
      typeof record.id !== "string" ||
      !RECORD_TYPES.includes(record.type) ||
      typeof record.name !== "string" ||
      !record.name.trim() ||
      typeof record.category !== "string" ||
      !Number.isFinite(record.amount) ||
      record.amount <= 0 ||
      !(record.date === null || isValidDate(record.date)) ||
      !(record.dueDate === null || isValidDate(record.dueDate))
    ) {
      return false;
    }

    if (record.type === "income") return record.category === "Income";
    if (record.type === "commitment") {
      if (!CATEGORIES.commitment.includes(record.category)) return false;
      const lifecycleFields = ["startDate", "durationMonths", "endDate", "status"];
      const hasLifecycle = lifecycleFields.some((field) => Object.hasOwn(record, field));
      if (!hasLifecycle) return true;
      return record.category === "BNPL" &&
        Number.isInteger(record.durationMonths) &&
        [3, 6, 12, 24].includes(record.durationMonths) &&
        isValidDate(record.startDate) &&
        isValidDate(record.endDate) &&
        record.endDate === addMonthsToDate(record.startDate, record.durationMonths) &&
        (record.status === undefined || ["active", "completed"].includes(record.status));
    }
    if (record.type === "expense") {
      return CATEGORIES.expense.includes(record.category) && isValidDate(record.date);
    }
    return CATEGORIES.payment.includes(record.category) && isValidDate(record.dueDate);
  });

  if (!valid) throw new Error("Some saved finance records are invalid.");
  return value.records;
}

export function loadRecords() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      currentRecords = validateSavedRecords(JSON.parse(saved));
      return { records: currentRecords, writable: true, error: null };
    }

    currentRecords = makeSampleRecords();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, records: currentRecords }),
    );
    return { records: currentRecords, writable: true, error: null };
  } catch (error) {
    currentRecords = makeSampleRecords();
    return {
      records: currentRecords,
      writable: false,
      error: `Saved data could not be loaded or browser storage is unavailable. The sample preview is shown; changes will not be saved. ${error.message}`,
    };
  }
}

export function saveRecords(records) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: STORAGE_VERSION, records }),
  );
  currentRecords = records;
}

export function getRecords() {
  return currentRecords;
}

export function createPurchaseRecord(purchase, id) {
  const recordId = id || globalThis.crypto?.randomUUID?.() ||
    `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (
    !purchase ||
    typeof purchase.itemName !== "string" ||
    !purchase.itemName.trim() ||
    purchase.itemName.trim().length > 80 ||
    typeof recordId !== "string" ||
    !recordId.trim()
  ) {
    throw new Error("The purchase details are invalid.");
  }

  if (purchase.paymentMethod === "pay-full") {
    if (!Number.isFinite(purchase.itemPrice) || purchase.itemPrice <= 0) {
      throw new Error("The purchase price must be greater than RM 0.");
    }
    return {
      id: recordId,
      type: "expense",
      name: purchase.itemName.trim(),
      category: "Shopping",
      amount: Math.round(purchase.itemPrice * 100) / 100,
      date: localDateString(),
      dueDate: null,
    };
  }

  if (
    purchase.paymentMethod !== "installment" ||
    ![3, 6, 12, 24].includes(purchase.duration) ||
    !Number.isFinite(purchase.monthlyInstallment) ||
    purchase.monthlyInstallment <= 0 ||
    !isValidDate(purchase.confirmationDate || localDateString())
  ) {
    throw new Error("The instalment details are invalid.");
  }

  const startDate = purchase.confirmationDate || localDateString();
  return {
    id: recordId,
    type: "commitment",
    name: purchase.itemName.trim(),
    category: "BNPL",
    amount: Math.round(purchase.monthlyInstallment * 100) / 100,
    date: null,
    dueDate: null,
    startDate,
    durationMonths: purchase.duration,
    endDate: addMonthsToDate(startDate, purchase.duration),
    status: "active",
  };
}
