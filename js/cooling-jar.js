export const COOLING_JAR_STORAGE_KEY = "bolehbuy-cooling-jar";
export const COOLING_PERIOD_MS = 72 * 60 * 60 * 1000;

function getStorage() {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

function validItems(value) {
  return Array.isArray(value) && value.every((item) =>
    item &&
    typeof item.itemName === "string" &&
    item.itemName.trim().length > 0 &&
    Number.isFinite(item.price) &&
    item.price > 0 &&
    typeof item.timestamp === "string" &&
    Number.isFinite(Date.parse(item.timestamp)) &&
    typeof item.fingerprint === "string" &&
    item.fingerprint.length > 0
  );
}

export function getCoolingJarFingerprint(purchase) {
  return JSON.stringify([
    purchase.itemName.trim().toLocaleLowerCase(),
    Math.round(purchase.itemPrice * 100),
    purchase.paymentMethod,
    purchase.duration ?? null,
    Math.round(purchase.monthlyInstallment * 100),
    Math.round(purchase.totalPurchaseCost * 100),
  ]);
}

export function loadCoolingJarItems(storage = getStorage()) {
  try {
    if (!storage) throw new Error("Browser storage is unavailable.");
    const saved = storage.getItem(COOLING_JAR_STORAGE_KEY);
    if (saved === null) return { items: [], error: null };
    const items = JSON.parse(saved);
    if (!validItems(items)) throw new Error("Saved Cooling Jar data is invalid.");
    return { items, error: null };
  } catch (error) {
    return { items: [], error: `Cooling Jar items could not be loaded: ${error.message}` };
  }
}

export function pausePurchase(purchase, storage = getStorage(), timestamp = new Date()) {
  if (
    !purchase ||
    typeof purchase.itemName !== "string" ||
    !purchase.itemName.trim() ||
    !Number.isFinite(purchase.itemPrice) ||
    purchase.itemPrice <= 0 ||
    !Number.isFinite(purchase.monthlyInstallment) ||
    !Number.isFinite(purchase.totalPurchaseCost)
  ) {
    return { success: false, error: "Calculate a valid purchase before using the Cooling Jar." };
  }

  try {
    if (!storage) throw new Error("Browser storage is unavailable.");
    const loaded = loadCoolingJarItems(storage);
    if (loaded.error) throw new Error(loaded.error);

    const fingerprint = getCoolingJarFingerprint(purchase);
    const duplicate = loaded.items.find((item) => item.fingerprint === fingerprint);
    if (duplicate) return { success: false, duplicate: true, item: duplicate };

    const item = {
      itemName: purchase.itemName.trim(),
      price: Math.round(purchase.itemPrice * 100) / 100,
      timestamp: timestamp.toISOString(),
      fingerprint,
    };
    storage.setItem(COOLING_JAR_STORAGE_KEY, JSON.stringify([...loaded.items, item]));
    return { success: true, item };
  } catch (error) {
    return { success: false, error: `Could not save this item to the Cooling Jar: ${error.message}` };
  }
}

export function isCoolingPeriodComplete(item, now = Date.now()) {
  return now >= Date.parse(item.timestamp) + COOLING_PERIOD_MS;
}
