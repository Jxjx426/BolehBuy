import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isStudyHeadphonesDemoScenario,
  STUDY_HEADPHONES_DEMO,
} from "../js/alternative-demo-data.js";

test("study headphones demo data is explicitly illustrative and price-scoped", () => {
  assert.equal(STUDY_HEADPHONES_DEMO.itemPrice, 599);
  assert.deepEqual(
    STUDY_HEADPHONES_DEMO.alternatives.map(({ productName, estimatedPrice }) => [productName, estimatedPrice]),
    [
      ["Budget ANC Headphones", 199],
      ["Basic Wireless Headphones", 149],
    ],
  );
  assert.equal(isStudyHeadphonesDemoScenario("Study Headphones", 599), true);
  assert.equal(isStudyHeadphonesDemoScenario("  study   headphones ", 599), true);
  assert.equal(isStudyHeadphonesDemoScenario("Study headphone", 599), true);
  assert.equal(isStudyHeadphonesDemoScenario("Study Headphones", "599"), true);
  assert.equal(isStudyHeadphonesDemoScenario("Study Headphones", "599.00"), true);
  assert.equal(isStudyHeadphonesDemoScenario("Wireless Headphones", 599), false);
  assert.equal(isStudyHeadphonesDemoScenario("Study Headphones", "599 RM"), false);
  assert.equal(isStudyHeadphonesDemoScenario("Study Headphones", 598), false);
});
