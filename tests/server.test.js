import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApp } from "../server.js";

const validPayload = {
  purchase: {
    itemName: "Laptop",
    itemPrice: 1200,
    paymentMethod: "installment",
    duration: 6,
    annualFlatInterestRate: 0,
    additionalFees: 0,
    totalInterest: 0,
    totalPurchaseCost: 1200,
    monthlyInstallment: 200,
  },
  finances: {
    monthlyIncome: 2200,
    existingMonthlyCommitments: 680,
    currentMonthExpenses: 742,
    remainingBeforePurchase: 778,
    estimatedRemainingAfterPurchase: 578,
    newTotalMonthlyCommitments: 880,
    commitmentRatioBefore: 30.91,
    commitmentRatioAfter: 40,
    recordsComplete: true,
    missingRecords: [],
  },
  comparison: {
    buyEstimatedRemaining: 578,
    dontBuyEstimatedRemaining: 778,
    buyMonthlyCommitments: 880,
    dontBuyMonthlyCommitments: 680,
  },
  spendingAssessment: {
    title: "Be Careful",
    reason: "Your estimated remaining money is below the available margin.",
    level: "careful",
  },
};

const validAnalysis = {
  verdictLabel: "Be careful",
  verdict: "The payment leaves less room for other plans this month.",
  keyRisk: "Unrecorded expenses could make the plan tighter.",
  recommendedAction: "Check the payment dates against your regular bills.",
};

let server;
afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
});

async function startServer(options) {
  server = createApp(options).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test("missing API key gives a clear setup response without contacting Gemini", async () => {
  let called = false;
  const origin = await startServer({
    apiKey: "",
    aiClient: { models: { generateContent: async () => { called = true; } } },
  });

  const response = await fetch(`${origin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "NOT_CONFIGURED");
  assert.match(body.error.message, /\.env/);
  assert.equal(called, false);
});

test("invalid and oversized requests are rejected before reaching Gemini", async () => {
  let called = false;
  const origin = await startServer({
    apiKey: "test-key",
    aiClient: { models: { generateContent: async () => { called = true; } } },
  });

  const invalid = await fetch(`${origin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...validPayload, privateData: "must not pass validation" }),
  });
  const invalidRate = await fetch(`${origin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...validPayload,
      purchase: { ...validPayload.purchase, annualFlatInterestRate: 100.01 },
    }),
  });
  const invalidFees = await fetch(`${origin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...validPayload,
      purchase: { ...validPayload.purchase, additionalFees: 1_000_000.01 },
    }),
  });
  const oversized = await fetch(`${origin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(9000) }),
  });

  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "INVALID_REQUEST");
  assert.equal(invalidRate.status, 400);
  assert.equal((await invalidRate.json()).error.code, "INVALID_REQUEST");
  assert.equal(invalidFees.status, 400);
  assert.equal((await invalidFees.json()).error.code, "INVALID_REQUEST");
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "REQUEST_TOO_LARGE");
  assert.equal(called, false);
});

test("valid summary reaches Gemini with structured output and returns validated JSON", async () => {
  let request;
  const origin = await startServer({
    apiKey: "test-key",
    model: "test-flash",
    aiClient: {
      models: {
        generateContent: async (value) => {
          request = value;
          return { text: JSON.stringify(validAnalysis) };
        },
      },
    },
  });

  const response = await fetch(`${origin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.analysis, validAnalysis);
  assert.equal(request.model, "test-flash");
  assert.equal(request.config.responseMimeType, "application/json");
  assert.match(request.config.systemInstruction, /source of truth/);
  assert.match(request.config.systemInstruction, /under 180 characters/);
  assert.deepEqual(request.config.responseSchema.required, [
    "verdictLabel",
    "verdict",
    "keyRisk",
    "recommendedAction",
  ]);
  assert.equal(request.config.httpOptions.timeout, 20_000);
  assert.equal(request.config.httpOptions.retryOptions.attempts, 1);
  assert.equal(request.contents, JSON.stringify(validPayload));
  assert.doesNotMatch(JSON.stringify(body), /test-key/);
});

test("incomplete records are rejected before reaching Gemini", async () => {
  const incompletePayload = structuredClone(validPayload);
  incompletePayload.finances.monthlyIncome = null;
  incompletePayload.finances.remainingBeforePurchase = null;
  incompletePayload.finances.estimatedRemainingAfterPurchase = null;
  incompletePayload.finances.newTotalMonthlyCommitments = null;
  incompletePayload.finances.commitmentRatioBefore = null;
  incompletePayload.finances.commitmentRatioAfter = null;
  incompletePayload.finances.recordsComplete = false;
  incompletePayload.finances.missingRecords = ["monthly income"];
  incompletePayload.comparison.buyEstimatedRemaining = null;
  incompletePayload.comparison.dontBuyEstimatedRemaining = null;
  incompletePayload.comparison.dontBuyMonthlyCommitments = null;
  let called = false;
  const origin = await startServer({
    apiKey: "test-key",
    aiClient: {
      models: {
        generateContent: async () => {
          called = true;
          return { text: JSON.stringify(validAnalysis) };
        },
      },
    },
  });

  const response = await fetch(`${origin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(incompletePayload),
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_REQUEST");
  assert.equal(called, false);
});

test("malformed Gemini output and provider rate limits get safe errors", async () => {
  const badResponseOrigin = await startServer({
    apiKey: "test-key",
    aiClient: { models: { generateContent: async () => ({ text: '{"overallOpinion":"Missing arrays"}' }) } },
  });
  const badResponse = await fetch(`${badResponseOrigin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  assert.equal(badResponse.status, 502);
  assert.equal((await badResponse.json()).error.code, "INVALID_AI_RESPONSE");

  await new Promise((resolve) => server.close(resolve));
  server = null;
  const rateLimitOrigin = await startServer({
    apiKey: "test-key",
    aiClient: { models: { generateContent: async () => { throw Object.assign(new Error("private provider details"), { status: 429 }); } } },
  });
  const rateLimited = await fetch(`${rateLimitOrigin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  const body = await rateLimited.json();
  assert.equal(rateLimited.status, 429);
  assert.equal(body.error.code, "RATE_LIMITED");
  assert.doesNotMatch(JSON.stringify(body), /private provider details/);
});

test("Gemini authentication and timeout errors are mapped to safe client messages", async () => {
  const unauthorizedOrigin = await startServer({
    apiKey: "test-key",
    aiClient: { models: { generateContent: async () => { throw Object.assign(new Error("secret upstream body"), { status: 401 }); } } },
  });
  const unauthorized = await fetch(`${unauthorizedOrigin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  assert.equal(unauthorized.status, 503);
  assert.equal((await unauthorized.json()).error.code, "GEMINI_CONFIGURATION");

  await new Promise((resolve) => server.close(resolve));
  server = null;
  const timeoutOrigin = await startServer({
    apiKey: "test-key",
    aiClient: { models: { generateContent: async () => { throw Object.assign(new Error("private timeout details"), { name: "TimeoutError" }); } } },
  });
  const timeout = await fetch(`${timeoutOrigin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  const body = await timeout.json();
  assert.equal(timeout.status, 504);
  assert.equal(body.error.code, "GEMINI_TIMEOUT");
  assert.doesNotMatch(JSON.stringify(body), /private timeout details/);
});

test("server serves only the app entry, styles and frontend modules", async () => {
  const origin = await startServer({ apiKey: "" });
  assert.equal((await fetch(`${origin}/`)).status, 200);
  assert.equal((await fetch(`${origin}/styles.css`)).status, 200);
  assert.equal((await fetch(`${origin}/js/ai-advisor.js`)).status, 200);
  assert.equal((await fetch(`${origin}/server.js`)).status, 404);
  assert.equal((await fetch(`${origin}/.env.example`)).status, 404);
});
