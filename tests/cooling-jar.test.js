import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COOLING_JAR_STORAGE_KEY,
  COOLING_PERIOD_MS,
  isCoolingPeriodComplete,
  loadCoolingJarItems,
  pausePurchase,
} from "../js/cooling-jar.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

const purchase = {
  itemName: "Campus headphones",
  itemPrice: 300,
  paymentMethod: "installment",
  duration: 6,
  monthlyInstallment: 54.5,
  totalPurchaseCost: 327,
};

test("Cooling Jar records the purchase timestamp without touching financial records", () => {
  const storage = createStorage();
  const timestamp = new Date("2026-11-03T08:00:00.000Z");
  const saved = pausePurchase(purchase, storage, timestamp);

  assert.equal(saved.success, true);
  assert.equal(saved.item.timestamp, timestamp.toISOString());
  assert.equal(saved.item.price, 300);
  assert.equal(storage.getItem("bolehbuy-finances"), null);
  assert.ok(storage.getItem(COOLING_JAR_STORAGE_KEY));
});

test("Cooling Jar prevents duplicate entries for the same calculated purchase", () => {
  const storage = createStorage();
  const timestamp = new Date("2026-11-03T08:00:00.000Z");
  assert.equal(pausePurchase(purchase, storage, timestamp).success, true);
  const duplicate = pausePurchase({ ...purchase }, storage, new Date("2026-11-03T09:00:00.000Z"));

  assert.equal(duplicate.success, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(loadCoolingJarItems(storage).items.length, 1);
});

test("Cooling Jar entries persist and expire 72 hours after their saved timestamp", () => {
  const storage = createStorage();
  const timestamp = new Date("2026-11-03T08:00:00.000Z");
  const saved = pausePurchase(purchase, storage, timestamp);
  const restored = loadCoolingJarItems(storage);

  assert.equal(restored.error, null);
  assert.deepEqual(restored.items, [saved.item]);
  assert.equal(isCoolingPeriodComplete(saved.item, timestamp.getTime() + COOLING_PERIOD_MS - 1), false);
  assert.equal(isCoolingPeriodComplete(saved.item, timestamp.getTime() + COOLING_PERIOD_MS), true);
});

test("Cooling Jar returns graceful errors when storage is unavailable or corrupt", () => {
  const unavailableStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.equal(pausePurchase(purchase, unavailableStorage).success, false);
  assert.match(loadCoolingJarItems(unavailableStorage).error, /could not be loaded/);

  const corruptStorage = {
    getItem() { return "{not-json"; },
    setItem() {},
  };
  assert.match(loadCoolingJarItems(corruptStorage).error, /could not be loaded/);
});

test("Cooling Jar gracefully handles blocked localStorage access", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.defineProperty({}, "localStorage", {
      get() {
        throw new Error("storage access blocked");
      },
    }),
  });
  try {
    assert.match(loadCoolingJarItems().error, /Browser storage is unavailable/);
    assert.match(pausePurchase(purchase).error, /Browser storage is unavailable/);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    }
  }
});

test("Cooling Jar rejects invalid or uncalculated purchase data", () => {
  assert.equal(pausePurchase(null, createStorage()).success, false);
  assert.equal(pausePurchase({ ...purchase, itemPrice: 0 }, createStorage()).success, false);
});
