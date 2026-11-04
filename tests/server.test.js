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
    processingFeeExplicitlyShown: false,
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
  mamakText: "Aiyo dik, this monthly payment ah? Small small also add up one lah. Can still handle your other plans or not?",
  keyRisk: "Unrecorded expenses could make the plan tighter.",
  recommendedAction: "Check the payment dates against your regular bills.",
};

const validExtraction = {
  itemName: { value: "Campus Study Headphones", confidence: "high" },
  cashPrice: { value: "360", confidence: "high" },
  paymentMethod: { value: "installment", confidence: "high" },
  durationMonths: { value: "6", confidence: "high" },
  monthlyInstallment: { value: "63", confidence: "high" },
  totalInstallmentPayment: { value: "378", confidence: "high" },
  processingFee: { value: "0", confidence: "high" },
  warnings: [],
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

test("health reports safe model configuration without exposing credentials", async () => {
  const origin = await startServer({ apiKey: "test-key", model: "test-flash" });
  const response = await fetch(`${origin}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { configured: true, advisor: "purchase", model: "test-flash" });
  assert.doesNotMatch(JSON.stringify(body), /test-key/);
});

test("checkout image extraction uses structured multimodal Gemini input", async () => {
  let request;
  const origin = await startServer({
    apiKey: "test-key",
    model: "test-flash",
    aiClient: {
      models: {
        generateContent: async (value) => {
          request = value;
          return { text: JSON.stringify(validExtraction) };
        },
      },
    },
  });
  const response = await fetch(`${origin}/api/extract-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Fictional checkout screenshot",
      image: { mimeType: "image/jpeg", data: "/9j/2Q==" },
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.extraction, validExtraction);
  assert.equal(request.model, "test-flash");
  assert.equal(request.config.responseMimeType, "application/json");
  assert.match(request.config.systemInstruction, /explicitly labels that amount as a processing fee/);
  assert.ok(request.contents[0].parts.some((part) => part.inlineData?.mimeType === "image/jpeg"));
  assert.match(request.config.systemInstruction, /Never infer a cash price from instalment totals/);
  assert.match(request.config.systemInstruction, /If several prices are visible, explain the ambiguity/);
  const pngResponse = await fetch(`${origin}/api/extract-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Fictional PNG checkout",
      image: { mimeType: "image/png", data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64") },
    }),
  });
  assert.equal(pngResponse.status, 200);
  assert.ok(request.contents[0].parts.some((part) => part.inlineData?.mimeType === "image/png"));
  assert.deepEqual(request.config.responseSchema.required, [
    "itemName",
    "cashPrice",
    "paymentMethod",
    "durationMonths",
    "monthlyInstallment",
    "totalInstallmentPayment",
    "processingFee",
    "warnings",
  ]);
  assert.doesNotMatch(JSON.stringify(body), /test-key/);
});

test("text extraction preserves a missing instalment period instead of guessing", async () => {
  const missingTermExtraction = structuredClone(validExtraction);
  missingTermExtraction.durationMonths = { value: "", confidence: "not_found" };
  missingTermExtraction.warnings = ["Instalment period is not visible; select it manually."];
  let request;
  const origin = await startServer({
    apiKey: "test-key",
    aiClient: {
      models: {
        generateContent: async (value) => {
          request = value;
          return { text: JSON.stringify(missingTermExtraction) };
        },
      },
    },
  });
  const response = await fetch(`${origin}/api/extract-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Product: Demo headphones. Cash RM360. Monthly RM63. Duration not shown.",
      image: null,
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.extraction.durationMonths, { value: "", confidence: "not_found" });
  assert.match(body.extraction.warnings[0], /not visible/);
  assert.equal(request.contents[0].parts.some((part) => part.inlineData), false);
});

test("purchase alternatives use Google Search and return only cited cheaper products", async () => {
  let request;
  const sourceUrl = "https://example.com/products/headphones";
  const origin = await startServer({
    apiKey: "test-key",
    model: "test-flash",
    aiClient: {
      models: {
        generateContent: async (value) => {
          request = value;
          return {
            text: JSON.stringify({
              alternatives: [
                {
                  productName: "Example Wired Headphones",
                  estimatedPrice: 89.9,
                  reason: "A simpler wired option listed below the entered price.",
                  sourceUrl,
                },
                {
                  productName: "Uncited Headphones",
                  estimatedPrice: 49,
                  reason: "No grounding source supports this listing.",
                  sourceUrl: "https://unverified.example/item",
                },
                {
                  productName: "More Expensive Headphones",
                  estimatedPrice: 400,
                  reason: "This is not cheaper.",
                  sourceUrl,
                },
              ],
            }),
            candidates: [{
              groundingMetadata: {
                groundingChunks: [{ web: { uri: sourceUrl, title: "Example Malaysia Store" } }],
              },
            }],
          };
        },
      },
    },
  });
  const response = await fetch(`${origin}/api/purchase-alternatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemName: "Wireless Headphones", itemPrice: 250 }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.alternatives.length, 1);
  assert.deepEqual(body.alternatives[0], {
    productName: "Example Wired Headphones",
    estimatedPrice: 89.9,
    reason: "A simpler wired option listed below the entered price.",
    source: { url: sourceUrl, title: "Example Malaysia Store" },
  });
  assert.deepEqual(request.config.tools, [{ googleSearch: {} }]);
  assert.deepEqual(request.config.responseSchema.required, ["alternatives"]);
  assert.match(request.config.systemInstruction, /Return an empty alternatives array/);
});

test("purchase alternatives reject invalid input and do not accept unsupported source URLs", async () => {
  let called = false;
  const origin = await startServer({
    apiKey: "test-key",
    aiClient: {
      models: {
        generateContent: async () => {
          called = true;
          return {
            text: JSON.stringify({
              alternatives: [{
                productName: "Unverified product",
                estimatedPrice: 10,
                reason: "A claimed lower price.",
                sourceUrl: "https://unverified.example/item",
              }],
            }),
            candidates: [{ groundingMetadata: { groundingChunks: [] } }],
          };
        },
      },
    },
  });
  const invalid = await fetch(`${origin}/api/purchase-alternatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemName: "", itemPrice: 100 }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(called, false);

  const unverified = await fetch(`${origin}/api/purchase-alternatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemName: "Headphones", itemPrice: 100 }),
  });
  assert.equal(unverified.status, 502);
  assert.equal((await unverified.json()).error.code, "UNVERIFIED_ALTERNATIVES");
  assert.equal(called, true);
});

test("unreadable checkout can return explicit not-found fields without invented amounts", async () => {
  const unreadableExtraction = {
    itemName: { value: "", confidence: "not_found" },
    cashPrice: { value: "", confidence: "not_found" },
    paymentMethod: { value: "unknown", confidence: "not_found" },
    durationMonths: { value: "", confidence: "not_found" },
    monthlyInstallment: { value: "", confidence: "not_found" },
    totalInstallmentPayment: { value: "", confidence: "not_found" },
    processingFee: { value: "", confidence: "not_found" },
    warnings: ["The screenshot is too blurry to read."],
  };
  const origin = await startServer({
    apiKey: "test-key",
    aiClient: { models: { generateContent: async () => ({ text: JSON.stringify(unreadableExtraction) }) } },
  });
  const response = await fetch(`${origin}/api/extract-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "", image: { mimeType: "image/jpeg", data: "/9j/2Q==" } }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.extraction.cashPrice.value, "");
  assert.equal(body.extraction.durationMonths.confidence, "not_found");
});

test("invalid image formats, signatures and missing scan input are rejected before Gemini", async () => {
  let called = false;
  const origin = await startServer({
    apiKey: "test-key",
    aiClient: { models: { generateContent: async () => { called = true; } } },
  });
  const invalidImage = await fetch(`${origin}/api/extract-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "", image: { mimeType: "image/gif", data: "R0lGODlh" } }),
  });
  const invalidSignature = await fetch(`${origin}/api/extract-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "", image: { mimeType: "image/png", data: Buffer.from("not a PNG").toString("base64") } }),
  });
  const missingInput = await fetch(`${origin}/api/extract-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "", image: null }),
  });

  assert.equal(invalidImage.status, 400);
  assert.equal(invalidSignature.status, 400);
  assert.equal(missingInput.status, 400);
  assert.equal(called, false);
});

test("oversized checkout images are rejected before Gemini", async () => {
  let called = false;
  const origin = await startServer({
    apiKey: "test-key",
    aiClient: { models: { generateContent: async () => { called = true; } } },
  });
  const image = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(4 * 1024 * 1024),
  ]);
  const response = await fetch(`${origin}/api/extract-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "", image: { mimeType: "image/png", data: image.toString("base64") } }),
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_EXTRACTION_REQUEST");
  assert.equal(called, false);
});

test("Gemini checkout failures are classified and logged without request data or credentials", async () => {
  const failureCases = [
    { status: 400, code: "GEMINI_INVALID_REQUEST", category: "invalid_request" },
    { status: 401, code: "GEMINI_CONFIGURATION", category: "authentication_or_permission" },
    { status: 403, code: "GEMINI_CONFIGURATION", category: "authentication_or_permission" },
    { status: 404, code: "GEMINI_MODEL_NOT_FOUND", category: "model_not_found" },
    { status: 429, code: "RATE_LIMITED", category: "rate_limit" },
    { status: 503, code: "GEMINI_SERVER_ERROR", category: "gemini_server_error" },
    { status: null, code: "GEMINI_NETWORK_ERROR", category: "network_or_transport" },
  ];
  for (const failure of failureCases) {
    const logs = [];
    const providerMessage = JSON.stringify({
      error: {
        code: failure.status,
        message: "Fictional checkout details must not appear in logs.",
      },
    });
    const error = failure.status === null
      ? Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } })
      : Object.assign(new Error(providerMessage), { status: failure.status });
    const origin = await startServer({
      apiKey: "test-secret-key",
      logger: { error: (entry) => logs.push(JSON.parse(entry)) },
      aiClient: { models: { generateContent: async () => { throw error; } } },
    });
    const response = await fetch(`${origin}/api/extract-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Fictional checkout details must not appear in logs.", image: null }),
    });
    const body = await response.json();
    const [log] = logs;

    assert.equal(body.error.code, failure.code);
    assert.equal(log.event, "gemini_request_failed");
    assert.equal(log.operation, "checkout_extraction");
    assert.equal(log.category, failure.category);
    assert.equal(log.httpStatus, failure.status);
    assert.equal(log.requestReachedGemini, failure.status === null ? null : true);
    assert.doesNotMatch(JSON.stringify(log), /test-secret-key|Fictional checkout details/);

    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
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
  assert.match(request.config.systemInstruction, /Manglish particles/);
  assert.match(request.config.systemInstruction, /Do not restate figures in formal sentence structures/);
  assert.match(request.config.systemInstruction, /4\./);
  assert.deepEqual(request.config.responseSchema.required, [
    "verdictLabel",
    "mamakText",
    "keyRisk",
    "recommendedAction",
  ]);
  assert.equal(request.config.httpOptions.timeout, 20_000);
  assert.equal(request.config.httpOptions.retryOptions.attempts, 1);
  assert.equal(request.contents, JSON.stringify(validPayload));
  assert.doesNotMatch(JSON.stringify(body), /test-key/);
});

test("the advisor accepts the neutral commitment-tradeoff assessment", async () => {
  const payload = structuredClone(validPayload);
  payload.spendingAssessment = {
    title: "Review the trade-offs",
    reason: "This plan adds RM 50 per month to recorded commitments.",
    level: "informational",
  };
  const origin = await startServer({
    apiKey: "test-key",
    aiClient: { models: { generateContent: async () => ({ text: JSON.stringify({
      verdictLabel: "Review the trade-offs",
      mamakText: "Aiyo dik, this plan adds a monthly payment lah. Check the dates first, can manage or not?",
      keyRisk: "Other unrecorded costs may affect your budget.",
      recommendedAction: "Check repayment dates and total cost.",
    }) }) } },
  });
  const response = await fetch(`${origin}/api/analyse-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).analysis.verdictLabel, "Review the trade-offs");
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
