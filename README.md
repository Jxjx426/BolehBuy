# BolehBuy?

A static, browser-based financial companion for Malaysian students and young adults.

## Run the website

Open `index.html` in a browser, or start a local server from this folder:

```powershell
py -m http.server 8000
```

Then open `http://localhost:8000`.

No packages, account, database or API are required.

## Project structure

- `index.html` is the main entry point and contains the three page layouts.
- `styles.css` contains the shared visual design and responsive styles.
- `js/app.js` loads saved records and initializes the app modules.
- `js/navigation.js` handles the three page views and mobile navigation.
- `js/storage.js` validates, initializes, loads and saves Local Storage data.
- `js/calculations.js` provides reusable, data-in/data-out currency, date, budget and purchase-comparison calculations.
- `js/dashboard.js` renders the Dashboard and manages its financial records.
- `js/simulator.js` renders the purchase impact, buy-versus-wait comparison and editable real-cost examples.

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
- Translate the purchase price into approximate mixed-rice meals, bubble tea cups and public transport trips. Example reference prices are editable and are saved separately under `bolehbuy-cost-translator-prices`; finance records remain unchanged.
- Translator reference prices are examples, not fixed market prices. Instalment estimates assume 0% interest and no fees.

## Current scope

The Dashboard tracker and the Simulator's purchase impact, spending assessment, buy-versus-wait comparison and real-cost translator are functional. Scam Checker analysis is not implemented yet.
