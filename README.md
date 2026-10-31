# BolehBuy?

A static, browser-based financial companion for Malaysian students and young adults.

## Run the website

Open `index.html` in a browser, or start a local server from this folder:

```powershell
py -m http.server 8000
```

Then open `http://localhost:8000`.

No packages, account, database or API are required.

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

Amounts are stored as RM values. This shared record collection is available for future Simulator work.

## Current scope

The Dashboard tracker is functional. The Simulator and Scam Checker remain visual placeholders; their calculations and checking features are not implemented yet.
