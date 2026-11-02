import {
  byDateAscending,
  currency,
  currentMonthExpenses,
  dateAfterDays,
  formatDate,
  getActiveBnplSummary,
  getActiveCommitments,
  getTotals,
  isActiveCommitment,
  isValidDate,
  localDateString,
  sumAmount,
} from "./calculations.js";
import { CATEGORIES, createPurchaseRecord, saveRecords as persistRecords } from "./storage.js";

const dialog = document.querySelector("#record-dialog");
const dialogContent = document.querySelector("#dialog-content");
const notice = document.querySelector("#data-notice");

let records = [];
let storageReady = true;
let selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function setNotice(message, isError = false) {
  notice.textContent = message;
  notice.hidden = !message;
  notice.classList.toggle("is-error", isError);
}

function updateRecords(nextRecords) {
  if (!storageReady) {
    setNotice("Browser storage is unavailable, so this change was not saved.", true);
    return false;
  }

  try {
    persistRecords(nextRecords);
  } catch (error) {
    setNotice(`Could not save your change in this browser: ${error.message}`, true);
    return false;
  }

  records = nextRecords;
  renderDashboard();
  return true;
}

export function addSimulatorPurchase(purchase, recordId) {
  if (!storageReady) {
    return { success: false, error: "Browser storage is unavailable, so this purchase was not saved." };
  }

  let record;
  try {
    record = createPurchaseRecord(purchase, recordId);
  } catch (error) {
    return { success: false, error: error.message };
  }

  if (records.some((entry) => entry.id === record.id)) {
    return { success: false, error: "This purchase has already been added." };
  }

  const previousMonth = selectedMonth;
  if (record.type === "expense") {
    const today = new Date();
    selectedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  }
  if (!updateRecords([...records, record])) {
    selectedMonth = previousMonth;
    renderDashboard();
    return { success: false, error: notice.textContent };
  }

  setNotice("Added to Dashboard successfully!");
  return { success: true, record };
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
  const activeCommitments = getActiveCommitments(records);
  const expenses = currentMonthExpenses(records, selectedMonth);
  const selectedMonthName = selectedMonth.toLocaleDateString("en-MY", { month: "long" });
  document.querySelector('[data-summary-note="income"]').textContent = incomeSources.length
    ? incomeSources.length <= 2
      ? incomeSources.map((record) => record.name).join(" + ")
      : `${incomeSources.length} income sources`
    : "No income sources yet";
  document.querySelector('[data-summary-note="commitments"]').textContent = activeCommitments.length
    ? `${activeCommitments.length} active ${activeCommitments.length === 1 ? "commitment" : "commitments"}`
    : "No commitments yet";
  document.querySelector('[data-summary-note="expenses"]').textContent = expenses.length
    ? `${expenses.length} ${expenses.length === 1 ? "record" : "records"} in ${selectedMonthName}`
    : `No expenses in ${selectedMonthName}`;

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
  const monthExpenses = currentMonthExpenses(records, selectedMonth);
  const hasIncomeOrCommitments = records.some(
    (record) => record.type === "income" || record.type === "commitment",
  );
  if (!hasIncomeOrCommitments && monthExpenses.length === 0) {
    message = "Add your income and spending to see your monthly picture.";
  } else if (totals.remaining < 0) {
    message = `Recorded commitments and expenses are ${currency(-totals.remaining)} more than your income.`;
  } else if (totals.remaining === 0) {
    message = "Your monthly income is fully allocated.";
  } else {
    const monthName = selectedMonth.toLocaleDateString("en-MY", { month: "long" });
    message = `${currency(totals.remaining)} remains after commitments and expenses in ${monthName}.`;
  }
  tip.append(document.createTextNode(` ${message}`));
  tip.classList.toggle("is-empty", chartTotal === 0);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthFromKey(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function renderMonthPicker() {
  const picker = document.querySelector("#month-picker");
  const label = document.querySelector("#selected-month-label");
  const menu = document.querySelector("#month-menu");
  const selectedKey = monthKey(selectedMonth);
  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const currentKey = monthKey(currentMonth);
  const defaultHistoryStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 11, 1);
  const expenseDates = records
    .filter((record) => record.type === "expense" && isValidDate(record.date))
    .map((record) => record.date.slice(0, 7))
    .filter((key) => key <= currentKey);
  const earliestKey = expenseDates.length
    ? expenseDates.reduce((earliest, key) => key < earliest ? key : earliest, monthKey(defaultHistoryStart))
    : monthKey(defaultHistoryStart);
  const selectedLabel = selectedMonth.toLocaleDateString("en-MY", { month: "long", year: "numeric" });

  label.textContent = selectedLabel;
  picker.setAttribute("aria-label", `Showing ${selectedLabel}`);
  menu.replaceChildren();

  const menuHeading = createElement("p", "month-menu-heading", "AVAILABLE MONTHS");
  menu.append(menuHeading);

  for (let date = currentMonth; monthKey(date) >= earliestKey; date = new Date(date.getFullYear(), date.getMonth() - 1, 1)) {
    const key = monthKey(date);
    const option = createElement(
      "button",
      `month-option${key === selectedKey ? " is-selected" : ""}`,
      date.toLocaleDateString("en-MY", { month: "long", year: "numeric" }),
    );
    option.type = "button";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(key === selectedKey));
    option.dataset.month = key;
    if (key > currentKey) option.disabled = true;
    if (key === selectedKey) {
      const marker = createElement("span", "month-option-marker", "✓");
      marker.setAttribute("aria-hidden", "true");
      option.append(marker);
    }
    menu.append(option);
  }

  menu.append(createElement("p", "month-menu-note", "Future months aren’t available yet."));
}

function renderCommitmentBreakdown() {
  const container = document.querySelector('[data-record-list="commitment"]');
  container.replaceChildren();
  const summary = getActiveBnplSummary(records);
  const summaryText = `${summary.count} active BNPL ${summary.count === 1 ? "plan" : "plans"} · ${currency(summary.monthlyAmount)}/month`;
  document.querySelector("[data-bnpl-summary]").textContent = summaryText;
  const commitments = records
    .filter((record) => record.type === "commitment")
    .sort((a, b) => {
      const priority = (record) => record.category === "BNPL"
        ? isActiveCommitment(record) ? 0 : 2
        : 1;
      return priority(a) - priority(b) || a.name.localeCompare(b.name);
    });

  if (!commitments.length) {
    container.append(createElement("p", "empty-state commitment-empty", "No monthly commitments yet. Add one to keep track of regular payments."));
    return;
  }

  commitments.forEach((record) => {
    const active = isActiveCommitment(record);
    const expired = record.endDate && record.endDate < localDateString();
    const item = createElement("article", `commitment-item${record.category === "BNPL" ? " commitment-bnpl" : ""}${!active ? " commitment-inactive" : ""}`);
    const symbol = createElement("span", "commitment-symbol", record.category === "BNPL" ? "↻" : record.category === "Bills" ? "▯" : "♡");
    symbol.setAttribute("aria-hidden", "true");
    const details = createElement("div", "commitment-details");
    details.append(
      createElement("strong", "commitment-name", record.name),
      createElement("span", "commitment-type", record.category),
    );
    if (record.durationMonths) {
      details.append(createElement(
        "span",
        "commitment-status",
        expired ? "Expired" : record.status === "completed" ? "Completed" : `${record.durationMonths}-month plan · ends ${formatDate(record.endDate, { day: "numeric", month: "short", year: "numeric" })}`,
      ));
    }
    item.append(
      symbol,
      details,
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
  const totals = getTotals(records, selectedMonth);
  renderSummary(totals);
  renderSpendingOverview(totals);
  renderMonthPicker();
  renderCommitmentBreakdown();
  renderPayments();
  document.querySelector("[data-current-month]").textContent =
    selectedMonth.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  document.querySelector("#dashboard-month-copy").textContent =
    selectedMonth.toLocaleDateString("en-MY", { month: "long" });
  document.querySelector(".topbar-date").lastChild.textContent = ` ${new Date().toLocaleDateString("en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })}`;
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
                  ? `${record.category}${record.dueDate ? ` · payment date ${formatDate(record.dueDate)}` : ""}${record.durationMonths ? ` · ${record.durationMonths} months · ends ${formatDate(record.endDate, { day: "numeric", month: "short", year: "numeric" })} · ${record.status === "completed" ? "completed" : isActiveCommitment(record) ? "active" : "expired"}` : ""}`
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
        controls.append(amount, edit);
        if (type === "commitment" && record.durationMonths && record.status === "active") {
          const complete = createElement("button", "subtle-action", "Mark complete");
          complete.type = "button";
          complete.dataset.completeRecord = record.id;
          controls.append(complete);
        }
        controls.append(remove);
        row.append(details, controls);
        list.append(row);
      });
  }

  dialogContent.append(title, intro, toolbar, list);
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
    const categoryField = addFormField(form, "Category", "category", "select", {
      values: CATEGORIES[type],
      value: record?.category ?? CATEGORIES[type][0],
    });
    if (record?.durationMonths) categoryField.disabled = true;
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
    const category = type === "income" ? "Income" : record?.category ?? String(formData.get("category") ?? "");
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
      ...(record?.durationMonths ? {
        startDate: record.startDate,
        durationMonths: record.durationMonths,
        endDate: record.endDate,
        status: record.status,
      } : {}),
    };
    const nextRecords = record
      ? records.map((entry) => entry.id === record.id ? nextRecord : entry)
      : [...records, nextRecord];

    if (updateRecords(nextRecords)) {
      setNotice(`${categoryLabel(type)} ${record ? "updated" : "saved"}.`);
      renderManager(type);
    } else {
      formError.textContent = notice.textContent;
      formError.hidden = false;
    }
  });

  dialogContent.append(title, intro, form);
  form.insertBefore(formError, form.querySelector(".form-actions"));
  form.addEventListener("input", () => {
    formError.hidden = true;
  });
  form.querySelector("input[name='name']").focus();
}

export function initializeDashboard(initialState) {
  records = initialState.records;
  storageReady = initialState.writable;

  if (initialState.error) setNotice(initialState.error, true);

  const monthPicker = document.querySelector("#month-picker");
  const monthMenu = document.querySelector("#month-menu");

  monthPicker.addEventListener("click", () => {
    const isExpanded = monthPicker.getAttribute("aria-expanded") === "true";
    if (!isExpanded) renderMonthPicker();
    monthMenu.hidden = isExpanded;
    monthPicker.setAttribute("aria-expanded", String(!isExpanded));
  });

  monthMenu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-month]");
    if (!option || option.disabled) return;
    selectedMonth = monthFromKey(option.dataset.month);
    monthMenu.hidden = true;
    monthPicker.setAttribute("aria-expanded", "false");
    renderDashboard();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".month-picker-wrap") && !monthMenu.hidden) {
      monthMenu.hidden = true;
      monthPicker.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !monthMenu.hidden) {
      monthMenu.hidden = true;
      monthPicker.setAttribute("aria-expanded", "false");
      monthPicker.focus();
    }
  });

  function openDialog() {
    if (!dialog.open) dialog.showModal();
  }

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
    const completeButton = event.target.closest("[data-complete-record]");

    if (newButton) renderRecordForm(newButton.dataset.newRecord);
    if (backButton) renderManager(backButton.dataset.backToManager);
    if (completeButton) {
      const target = records.find((item) => item.id === completeButton.dataset.completeRecord);
      if (!target || !target.durationMonths || target.status !== "active") return;
      const nextRecords = records.map((item) => item.id === target.id
        ? { ...item, status: "completed" }
        : item);
      if (updateRecords(nextRecords)) {
        setNotice("BNPL plan marked completed.");
        renderManager("commitment");
      }
    }
    if (editButton) {
      const record = records.find((item) => item.id === editButton.dataset.editRecord);
      if (record) renderRecordForm(editButton.dataset.recordType, record);
    }
    if (deleteButton) {
      const target = records.find((item) => item.id === deleteButton.dataset.deleteRecord);
      if (!target) return;
      const nextRecords = records.filter((item) => item.id !== target.id);
      if (updateRecords(nextRecords)) {
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

  renderDashboard();
}
