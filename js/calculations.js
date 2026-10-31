export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateAfterDays(days, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDateString(parsed) === value;
}

export function currency(amount) {
  const absolute = Math.abs(amount);
  const formatted = absolute.toLocaleString("en-MY", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(absolute) ? 0 : 2,
  });
  return amount < 0 ? `-RM ${formatted}` : `RM ${formatted}`;
}

export function formatDate(value, options = { day: "numeric", month: "short" }) {
  if (!isValidDate(value)) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", options);
}

export function sumAmount(items) {
  const cents = items.reduce((total, item) => total + Math.round(item.amount * 100), 0);
  return cents / 100;
}

export function currentMonthExpenses(records, date = new Date()) {
  const month = localDateString(date).slice(0, 7);
  return records.filter((record) => record.type === "expense" && record.date.startsWith(month));
}

export function getTotals(records, date = new Date()) {
  const income = sumAmount(records.filter((record) => record.type === "income"));
  const commitments = sumAmount(records.filter((record) => record.type === "commitment"));
  const expenses = sumAmount(currentMonthExpenses(records, date));
  return { income, commitments, expenses, remaining: income - commitments - expenses };
}

export function byDateAscending(a, b) {
  return a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name);
}
