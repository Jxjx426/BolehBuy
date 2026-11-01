# BolehBuy?

A browser-based financial companion for Malaysian students and young adults.

## Run the website

Install dependencies and start the frontend and API on one local origin:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. Scam Checker analysis is still a placeholder.

## Project structure

- `index.html` is the main entry point and contains the three page layouts.
- `styles.css` contains the shared visual design and responsive styles.
- `js/app.js` loads saved records and initializes the app modules.
- `js/navigation.js` handles the three page views and mobile navigation.
- `js/storage.js` validates, initializes, loads and saves Local Storage data.
- `js/calculations.js` provides reusable, data-in/data-out currency, date, budget and purchase-comparison calculations.
- `js/dashboard.js` renders the Dashboard and manages its financial records.
- `js/simulator.js` renders the purchase impact, buy-versus-wait comparison and fixed illustrative real-cost examples.
- `js/ai-advisor.js` renders Gemini insights when available and uses a clearly labelled local analysis fallback otherwise.
- `server.js` serves the website and validates requests before calling the Gemini API.

## Dashboard features

- Add, edit and delete income sources, monthly commitments, daily expenses, and upcoming payments.
- View monthly income, commitments, current-month expenses, and money remaining.
- Review a dynamic spending overview and upcoming payments sorted by due date.
- See a highlighted due-soon or overdue status for each payment.
- Keep records in browser Local Storage. Records stay in this browser and are not synced.
- On the first visit only, sample student-budget records are saved as a starting point. Deleting all records leaves an empty dashboard instead of restoring the samples.

All records use one data shape in Local Storage under `bolehbuy-finances`:

```js
{
  version: 1,
  records: [
    {
      id: "unique-id",
      type: "income | commitment | expense | payment",
      name: "Record name",
      category: "Income, BNPL, Bills, Subscriptions, Food, ...",
      amount: 80,
      date: "YYYY-MM-DD or null",
      dueDate: "YYYY-MM-DD or null"
    }
  ]
}
```

Amounts are stored as RM values. The Dashboard and Simulator read this same record collection.

## Simulator features

- Compare Pay in Full with instalments of 3, 6, 12 or 24 months using the Dashboard's existing income, commitment and expense records.
- Compare estimated remaining money when buying and waiting. Potential savings reflect payments avoided and do not assume the user will actually save them.
- Translate the purchase price into approximate bowls of mixed rice (RM 12), cups of bubble tea (RM 15) and RapidKL rides (RM 4).
- Translator reference prices are illustrative examples, not fixed market prices. Instalment estimates assume 0% interest and no fees.

## Configure the AI Purchase Advisor

1. Copy `.env.example` to `.env`.
2. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey) and add it as `GEMINI_API_KEY` in `.env`. Do not paste the key into the website or commit `.env`.
3. Optionally set `GEMINI_MODEL` to another supported model and `PORT` to a different local port. The default model is `gemini-3.1-flash-lite`.
4. Restart `npm run dev`, calculate a purchase in the Simulator, and click **Analyse My Purchase**.

If no key is configured or Gemini is unavailable, the button still works and shows a clearly labelled local analysis based on the Simulator's calculated figures, including a critical-thinking question. The local analysis does not claim to be Gemini output. When Gemini is available, the server sends only the item name and concise calculated values needed for analysis; it does not send dashboard records, transaction descriptions, or Local Storage data. Gemini's response is validated as structured JSON before the browser renders it. Do not include sensitive information in an item name.

Run the backend tests with:

```powershell
npm test
```

## Current scope

The Dashboard tracker and the Simulator's purchase impact, spending assessment, buy-versus-wait comparison, real-cost translator and AI Purchase Advisor are implemented. Live Gemini analysis requires a user-provided API key; a local calculated analysis is available when Gemini is not configured or unavailable. Scam Checker analysis is not implemented yet.
