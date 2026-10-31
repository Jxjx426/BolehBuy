const STORAGE_KEY = "bolehbuy-finances";
const STORAGE_VERSION = 1;
const RECORD_TYPES = ["income", "commitment", "expense", "payment"];
const CATEGORIES = {
  commitment: ["BNPL", "Bills", "Subscriptions"],
  expense: ["Food", "Transport", "Shopping", "Entertainment", "Others"],
  payment: ["BNPL", "Bills", "Subscriptions", "Other"],
};

const navigationLinks = document.querySelectorAll("[data-page]");
const pages = document.querySelectorAll("[data-page-panel]");
const breadcrumb = document.querySelector("#page-breadcrumb");
const sidebar = document.querySelector("#sidebar");
const menuToggle = document.querySelector("#menu-toggle");
const brandLink = document.querySelector(".brand");
const dialog = document.querySelector("#record-dialog");
const dialogContent = document.querySelector("#dialog-content");
const notice = document.querySelector("#data-notice");

let records = [];
let storageReady = true;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateAfterDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function makeSampleRecords() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
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

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDateString(parsed) === value;
}

function validateSavedRecords(value) {
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
      return CATEGORIES.commitment.includes(record.category);
    }
    if (record.type === "expense") {
      return CATEGORIES.expense.includes(record.category) && isValidDate(record.date);
    }
    return CATEGORIES.payment.includes(record.category) && isValidDate(record.dueDate);
  });

  if (!valid) throw new Error("Some saved finance records are invalid.");
  return value.records;
}

function setNotice(message, isError = false) {
  notice.textContent = message;
  notice.hidden = !message;
  notice.classList.toggle("is-error", isError);
}

function loadRecords() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      records = makeSampleRecords();
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: STORAGE_VERSION, records }),
      );
      return;
    }

    records = validateSavedRecords(JSON.parse(saved));
  } catch (error) {
    storageReady = false;
    records = makeSampleRecords();
    setNotice(
      `Saved data could not be loaded or browser storage is unavailable. The sample preview is shown; changes will not be saved. ${error.message}`,
      true,
    );
  }
}

function saveRecords(nextRecords) {
  if (!storageReady) {
    setNotice("Browser storage is unavailable, so this change was not saved.", true);
    return false;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, records: nextRecords }),
    );
  } catch (error) {
    setNotice(`Could not save your change in this browser: ${error.message}`, true);
    return false;
  }

  records = nextRecords;
  renderDashboard();
  return true;
}

function currency(amount) {
  const absolute = Math.abs(amount);
  const formatted = absolute.toLocaleString("en-MY", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(absolute) ? 0 : 2,
  });
  return amount < 0 ? `-RM ${formatted}` : `RM ${formatted}`;
}

function formatDate(value, options = { day: "numeric", month: "short" }) {
  if (!isValidDate(value)) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", options);
}

function sumAmount(items) {
  const cents = items.reduce((total, item) => total + Math.round(item.amount * 100), 0);
  return cents / 100;
}

function currentMonthExpenses() {
  const month = localDateString().slice(0, 7);
  return records.filter((record) => record.type === "expense" && record.date.startsWith(month));
}

function getTotals() {
  const income = sumAmount(records.filter((record) => record.type === "income"));
  const commitments = sumAmount(records.filter((record) => record.type === "commitment"));
  const expenses = sumAmount(currentMonthExpenses());
  return { income, commitments, expenses, remaining: income - commitments - expenses };
}

function byDateAscending(a, b) {
  return a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderSummary(totals) {
  document.querySelector('[data-summary="income"]').textContent = currency(totals.income);
  document.querySelector('[data-summary="commitments"]').textContent = currency(totals.commitments);
  document.querySelector('[data-summary="expenses"]').textContent = currency(totals.expenses);
  document.querySelector('[data-summary="remaining"]').textContent = currency(totals.remaining);

  const incomeSources = records.filter((record) => record.type === "income");
  const commitments = records.filter((record) => record.type === "commitment");
  const expenses = currentMonthExpenses();
  document.querySelector('[data-summary-note="income"]').textContent = incomeSources.length
    ? incomeSources.length <= 2
      ? incomeSources.map((record) => record.name).join(" + ")
      : `${incomeSources.length} income sources`
    : "No income sources yet";
  document.querySelector('[data-summary-note="commitments"]').textContent = commitments.length
    ? `${commitments.length} recurring ${commitments.length === 1 ? "payment" : "payments"}`
    : "No commitments yet";
  document.querySelector('[data-summary-note="expenses"]').textContent = expenses.length
    ? `${expenses.length} ${expenses.length === 1 ? "record" : "records"} this month`
    : "No expenses this month";

  const remainingNote = document.querySelector('[data-summary-note="remaining"]');
  const remainingDot = remainingNote.previousElementSibling;
  if (totals.remaining < 0) {
    remainingNote.textContent = `${currency(-totals.remaining)} over income`;
    remainingDot.classList.remove("green");
    remainingDot.classList.add("peach");
  } else {
    remainingNote.textContent = "After commitments & expenses";
    remainingDot.classList.remove("peach");
    remainingDot.classList.add("green");
  }
}

function renderSpendingOverview(totals) {
  const chart = document.querySelector(".chart-wrap");
  const legend = document.querySelector("[data-spending-legend]");
  const segments = [
    { key: "commitment", label: "Monthly commitments", value: totals.commitments },
    { key: "expense", label: "Daily expenses", value: totals.expenses },
    { key: "remaining", label: "Remaining money", value: totals.remaining },
  ];
  const positiveValues = segments.map((segment) => Math.max(0, segment.value));
  const chartTotal = positiveValues.reduce((total, amount) => total + amount, 0);
  const circumference = 2 * Math.PI * 58;
  const gap = chartTotal > 0 ? 4 : 0;
  const drawableLength = circumference - gap * segments.length;
  let offset = 0;

  segments.forEach((segment, index) => {
    const circle = chart.querySelector(`.${segment.key}-segment`);
    const length = chartTotal ? (positiveValues[index] / chartTotal) * drawableLength : 0;
    circle.style.strokeDasharray = `${length} ${circumference - length}`;
    circle.style.strokeDashoffset = `${-offset}`;
    offset += length + gap;

    const row = legend.children[index];
    row.querySelector(".legend-label").lastChild.textContent = segment.label;
    row.querySelector("strong").textContent = currency(segment.value);
  });

  document.querySelector("[data-chart-total]").textContent = currency(chartTotal);
  const income = totals.income;
  document.querySelector(".chart-center span").textContent = income > 0
    ? totals.remaining < 0
      ? "spent & committed"
      : "of monthly income"
    : "recorded outflow";
  chart.setAttribute(
    "aria-label",
    `Spending overview: monthly commitments ${currency(totals.commitments)}, daily expenses ${currency(totals.expenses)}, and remaining money ${currency(totals.remaining)}.`,
  );

  const tip = document.querySelector("[data-spending-tip]");
  tip.replaceChildren(createElement("span", "", "✎"));
  let message;
  if (!records.some((record) => ["income", "commitment", "expense"].includes(record.type))) {
    message = "Add your income and spending to see your monthly picture.";
  } else if (totals.remaining < 0) {
    message = `Recorded commitments and expenses are ${currency(-totals.remaining)} more than your income.`;
  } else if (totals.remaining === 0) {
    message = "Your monthly income is fully allocated.";
  } else {
    message = `${currency(totals.remaining)} remains after this month’s commitments and expenses.`;
  }
  tip.append(document.createTextNode(` ${message}`));
  tip.classList.toggle("is-empty", chartTotal === 0);
}

function renderCommitmentBreakdown() {
  const container = document.querySelector('[data-record-list="commitment"]');
  container.replaceChildren();
  const commitments = records
    .filter((record) => record.type === "commitment")
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!commitments.length) {
    container.append(createElement("p", "empty-state commitment-empty", "No monthly commitments yet. Add one to keep track of regular payments."));
    return;
  }

  commitments.forEach((record) => {
    const item = createElement("div", "commitment-item");
    const symbol = createElement("span", "commitment-symbol", record.category === "BNPL" ? "↻" : record.category === "Bills" ? "▯" : "♡");
    symbol.setAttribute("aria-hidden", "true");
    item.append(
      symbol,
      createElement("span", "commitment-name", record.name),
      createElement("span", "commitment-type", record.category),
    );
    const value = createElement("span", "commitment-value");
    value.append(document.createTextNode(currency(record.amount)));
    value.append(createElement("span", "", "/mo"));
    item.append(value);
    container.append(item);
  });
}

function relativeDueText(dueDate) {
  const today = new Date(`${localDateString()}T00:00:00`);
  const due = new Date(`${dueDate}T00:00:00`);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return `Overdue by ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}`;
  if (days === 0) return "Due today";
  if (days <= 7) return `Due in ${days} ${days === 1 ? "day" : "days"}`;
  return `Due ${formatDate(dueDate)}`;
}

function renderPayments() {
  const container = document.querySelector('[data-record-list="payment"]');
  const payments = records
    .filter((record) => record.type === "payment" && isValidDate(record.dueDate))
    .sort(byDateAscending);
  container.replaceChildren();

  if (!payments.length) {
    container.append(createElement("p", "empty-state payment-empty", "No upcoming payments. Add one to keep a gentle eye on its due date."));
  } else {
    payments.forEach((record) => {
      const days = Math.round(
        (new Date(`${record.dueDate}T00:00:00`) - new Date(`${localDateString()}T00:00:00`)) / 86400000,
      );
      const row = createElement("article", "payment-row");
      if (days >= 0 && days <= 7) row.classList.add("is-approaching");
      if (days < 0) row.classList.add("is-overdue");

      const dateBox = createElement("div", `payment-date${days < 0 ? " date-peach" : days <= 7 ? " date-lavender" : ""}`);
      const due = new Date(`${record.dueDate}T00:00:00`);
      dateBox.append(
        createElement("strong", "", String(due.getDate()).padStart(2, "0")),
        createElement("span", "", due.toLocaleDateString("en-MY", { month: "short" }).toUpperCase()),
      );
      const details = createElement("div", "payment-details");
      details.append(
        createElement("strong", "", record.name),
        createElement("span", `payment-urgency${days < 0 ? " is-overdue" : days <= 7 ? " is-approaching" : ""}`, `${record.category} · ${relativeDueText(record.dueDate)}`),
      );
      row.append(dateBox, details, createElement("strong", "payment-amount", currency(record.amount)));
      container.append(row);
    });
  }

  const today = localDateString();
  const cutoff = dateAfterDays(14);
  const dueSoon = payments.filter((payment) => payment.dueDate >= today && payment.dueDate <= cutoff);
  document.querySelector("[data-payment-total]").textContent = currency(sumAmount(dueSoon));
  document.querySelector("[data-payment-total-label]").textContent = dueSoon.length
    ? `Due in the next 14 days · ${dueSoon.length} ${dueSoon.length === 1 ? "payment" : "payments"}`
    : "Nothing due in the next 14 days";
}

function renderDashboard() {
  const totals = getTotals();
  renderSummary(totals);
  renderSpendingOverview(totals);
  renderCommitmentBreakdown();
  renderPayments();
  document.querySelector("[data-current-month]").textContent =
    new Date().toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  document.querySelector(".topbar-date").lastChild.textContent = ` ${new Date().toLocaleDateString("en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })}`;
}

function showPage(pageName) {
  const selectedLink = document.querySelector(`[data-page="${pageName}"]`);
  const selectedPage = document.querySelector(`[data-page-panel="${pageName}"]`);
  if (!selectedLink || !selectedPage) return;

  navigationLinks.forEach((link) => {
    const isActive = link === selectedLink;
    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  pages.forEach((page) => {
    page.hidden = page !== selectedPage;
    page.classList.toggle("is-visible", page === selectedPage);
  });
  breadcrumb.textContent = selectedLink.querySelector("span").textContent;
  sidebar.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
}

function categoryLabel(type) {
  return {
    income: "Income source",
    commitment: "Monthly commitment",
    expense: "Daily expense",
    payment: "Upcoming payment",
  }[type];
}

function typeRecords(type) {
  return records.filter((record) => record.type === type);
}

function renderManager(type) {
  dialogContent.replaceChildren();
  const heading = createElement("p", "eyebrow small-eyebrow", "YOUR MONEY, YOUR WAY");
  const title = createElement("h2", "", `Manage ${type === "income" ? "income" : `${type}s`}`);
  title.id = "dialog-title";
  const intro = createElement("p", "dialog-intro", `Add, update or remove your ${type === "income" ? "income sources" : `${type} records`}.`);
  const toolbar = createElement("div", "dialog-toolbar");
  const addButton = createElement("button", "primary-button dialog-add", `+ Add ${type === "income" ? "source" : type}`);
  addButton.type = "button";
  addButton.dataset.newRecord = type;
  toolbar.append(addButton);

  const list = createElement("div", "manager-list");
  const entries = typeRecords(type);
  if (!entries.length) {
    list.append(createElement("p", "empty-state", `No ${type === "income" ? "income sources" : `${type}s`} yet. Add one to get started.`));
  } else {
    entries
      .slice()
      .sort((a, b) => {
        if (type === "payment") return byDateAscending(a, b);
        if (type === "expense") return b.date.localeCompare(a.date);
        return a.name.localeCompare(b.name);
      })
      .forEach((record) => {
        const row = createElement("article", "manager-row");
        const details = createElement("div", "manager-details");
        details.append(
          createElement("strong", "", record.name),
          createElement(
            "span",
            "",
            type === "payment"
              ? `${record.category} · due ${formatDate(record.dueDate, { day: "numeric", month: "short", year: "numeric" })}`
              : type === "expense"
                ? `${record.category} · ${formatDate(record.date, { day: "numeric", month: "short", year: "numeric" })}`
                : type === "commitment"
                  ? `${record.category}${record.dueDate ? ` · payment date ${formatDate(record.dueDate)}` : ""}`
                  : "Monthly income",
          ),
        );
        const controls = createElement("div", "manager-controls");
        const amount = createElement("strong", "manager-amount", currency(record.amount));
        const edit = createElement("button", "subtle-action", "Edit");
        edit.type = "button";
        edit.dataset.editRecord = record.id;
        edit.dataset.recordType = type;
        const remove = createElement("button", "subtle-action delete-action", "Delete");
        remove.type = "button";
        remove.dataset.deleteRecord = record.id;
        controls.append(amount, edit, remove);
        row.append(details, controls);
        list.append(row);
      });
  }

  dialogContent.append(heading, title, intro, toolbar, list);
}

function addFormField(form, labelText, name, type, options = {}) {
  const label = createElement("label", "", labelText);
  const id = `record-${name}`;
  label.htmlFor = id;
  let input;
  if (type === "select") {
    input = document.createElement("select");
    input.required = true;
    options.values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      input.append(option);
    });
  } else {
    input = document.createElement("input");
    input.type = type;
    if (type === "number") {
      input.min = "0.01";
      input.step = "0.01";
      input.inputMode = "decimal";
      input.required = true;
    } else if (options.required !== false) {
      input.required = true;
    }
  }
  input.id = id;
  input.name = name;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.value !== undefined && options.value !== null) input.value = options.value;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.required === false) input.required = false;
  form.append(label, input);
  return input;
}

function renderRecordForm(type, record = null) {
  dialogContent.replaceChildren();
  const heading = createElement("p", "eyebrow small-eyebrow", record ? "MAKE AN UPDATE" : "A NEW RECORD");
  const title = createElement("h2", "", `${record ? "Edit" : "Add"} ${categoryLabel(type).toLowerCase()}`);
  title.id = "dialog-title";
  const intro = createElement("p", "dialog-intro", "Your entries stay in this browser and can be changed any time.");
  const form = createElement("form", "record-form");
  const formError = createElement("p", "form-error");
  formError.hidden = true;
  formError.setAttribute("role", "alert");
  form.dataset.recordForm = type;
  addFormField(form, type === "income" ? "Source name" : type === "payment" ? "Payment name" : type === "commitment" ? "Commitment name" : "Expense name", "name", "text", {
    value: record?.name ?? "",
    placeholder: type === "income" ? "e.g. Allowance" : type === "commitment" ? "e.g. Mobile Bill" : type === "payment" ? "e.g. Course fee" : "e.g. Lunch",
    maxLength: 80,
  });

  if (type !== "income") {
    addFormField(form, "Category", "category", "select", {
      values: CATEGORIES[type],
      value: record?.category ?? CATEGORIES[type][0],
    });
  }

  addFormField(form, "Amount (RM)", "amount", "number", {
    value: record?.amount ?? "",
    placeholder: "e.g. 80",
  });

  if (type === "expense") {
    addFormField(form, "Date", "date", "date", { value: record?.date ?? localDateString() });
  } else if (type === "commitment") {
    addFormField(form, "Payment date (optional)", "dueDate", "date", {
      value: record?.dueDate ?? "",
      required: false,
    });
  } else if (type === "payment") {
    addFormField(form, "Due date", "dueDate", "date", {
      value: record?.dueDate ?? localDateString(),
    });
  }

  const actions = createElement("div", "form-actions");
  const cancel = createElement("button", "secondary-button", "Back");
  cancel.type = "button";
  cancel.dataset.backToManager = type;
  const submit = createElement("button", "primary-button", record ? "Save changes" : "Save record");
  submit.type = "submit";
  actions.append(cancel, submit);
  form.append(actions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const amount = Number(formData.get("amount"));
    const category = type === "income" ? "Income" : String(formData.get("category") ?? "");
    const date = type === "expense" ? String(formData.get("date") ?? "") : null;
    const dueDate = type === "commitment" || type === "payment"
      ? String(formData.get("dueDate") ?? "") || null
      : null;

    if (!name || name.length > 80 || !Number.isFinite(amount) || amount <= 0) {
      formError.textContent = "Enter a name of up to 80 characters and an amount greater than RM 0.";
      formError.hidden = false;
      return;
    }
    if ((date && !isValidDate(date)) || (dueDate && !isValidDate(dueDate))) {
      formError.textContent = "Enter a valid calendar date.";
      formError.hidden = false;
      return;
    }

    const nextRecord = {
      id: record?.id ?? (window.crypto?.randomUUID?.() ?? `record-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      type,
      name,
      category,
      amount: Math.round(amount * 100) / 100,
      date,
      dueDate,
    };
    const nextRecords = record
      ? records.map((entry) => entry.id === record.id ? nextRecord : entry)
      : [...records, nextRecord];

    if (saveRecords(nextRecords)) {
      setNotice(`${categoryLabel(type)} ${record ? "updated" : "saved"}.`);
      renderManager(type);
    } else {
      formError.textContent = notice.textContent;
      formError.hidden = false;
    }
  });

  dialogContent.append(heading, title, intro, form);
  form.insertBefore(formError, form.querySelector(".form-actions"));
  form.addEventListener("input", () => {
    formError.hidden = true;
  });
  form.querySelector("input[name='name']").focus();
}

function openDialog() {
  if (!dialog.open) dialog.showModal();
}

navigationLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const pageName = link.dataset.page;
    showPage(pageName);
    window.history.replaceState(null, "", `#${pageName}`);
  });
});

brandLink.addEventListener("click", (event) => {
  event.preventDefault();
  showPage("dashboard");
  window.history.replaceState(null, "", "#dashboard");
});

menuToggle.addEventListener("click", () => {
  const isOpen = sidebar.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  const manageButton = event.target.closest("[data-manage]");
  if (addButton) {
    renderRecordForm(addButton.dataset.add);
    openDialog();
    return;
  }
  if (manageButton) {
    renderManager(manageButton.dataset.manage);
    openDialog();
  }
});

dialogContent.addEventListener("click", (event) => {
  const newButton = event.target.closest("[data-new-record]");
  const editButton = event.target.closest("[data-edit-record]");
  const deleteButton = event.target.closest("[data-delete-record]");
  const backButton = event.target.closest("[data-back-to-manager]");

  if (newButton) renderRecordForm(newButton.dataset.newRecord);
  if (backButton) renderManager(backButton.dataset.backToManager);
  if (editButton) {
    const record = records.find((item) => item.id === editButton.dataset.editRecord);
    if (record) renderRecordForm(editButton.dataset.recordType, record);
  }
  if (deleteButton) {
    const target = records.find((item) => item.id === deleteButton.dataset.deleteRecord);
    if (!target) return;
    const nextRecords = records.filter((item) => item.id !== target.id);
    if (saveRecords(nextRecords)) {
      setNotice(`${categoryLabel(target.type)} deleted.`);
      renderManager(target.type);
    } else {
      const error = createElement("p", "form-error", notice.textContent);
      error.setAttribute("role", "alert");
      dialogContent.prepend(error);
    }
  }
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog || event.target.closest("[data-close-dialog]")) dialog.close();
});

loadRecords();
renderDashboard();

const initialPage = window.location.hash.slice(1);
if (initialPage) showPage(initialPage);
