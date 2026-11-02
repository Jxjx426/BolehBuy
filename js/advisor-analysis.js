export function createLocalAnalysis(payload) {
  const { purchase, finances, spendingAssessment } = payload;
  const missingRecords = finances.missingRecords;
  const recordsComplete = finances.recordsComplete;
  const verdictLabel = !recordsComplete
    ? "Not enough information"
    : spendingAssessment.level === "risky"
      ? "Consider waiting"
      : spendingAssessment.level === "careful"
        ? "Be careful"
        : "Looks manageable";

  if (!recordsComplete) {
    const missing = missingRecords.join(" and ");
    return {
      verdictLabel,
      verdict: `This estimate is limited because ${missing} ${missingRecords.length === 1 ? "is" : "are"} not recorded.`,
      keyRisk: "Missing records mean the monthly impact cannot be assessed fully.",
      recommendedAction: `Add ${missing} to the Dashboard, then review the purchase again.`,
    };
  }

  const risk = spendingAssessment.level === "risky" || spendingAssessment.level === "careful"
    ? spendingAssessment.reason
    : "Unrecorded day-to-day costs or provider terms could still affect your budget.";
  let recommendedAction;
  if (purchase.paymentMethod === "pay-full") {
    recommendedAction = "Check this one-time cost against your other plans for the month.";
  } else if (purchase.annualFlatInterestRate > 0 || purchase.additionalFees > 0) {
    recommendedAction = "Check the provider’s final total and repayment dates before confirming.";
  } else {
    recommendedAction = "Review how this plan stacks with your other active monthly commitments.";
  }

  return {
    verdictLabel,
    verdict: spendingAssessment.level === "risky"
      ? "The recorded figures show a potential short-term squeeze."
      : spendingAssessment.level === "careful"
        ? "The recorded budget suggests taking a closer look before deciding."
        : "The recorded figures do not show a clear short-term strain.",
    keyRisk: risk,
    recommendedAction,
  };
}
