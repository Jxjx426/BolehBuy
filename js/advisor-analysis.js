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
        : "Review the trade-offs";

  if (!recordsComplete) {
    const missing = missingRecords.join(" and ");
    return {
      verdictLabel,
      mamakText: `Aiyo dik, ${missing} ${missingRecords.length === 1 ? "is" : "are"} not in your records yet lah. How to say can tahan or not, kan? Check those figures first, then we see properly.`,
      keyRisk: `Without ${missing}, the monthly picture is incomplete oh.`,
      recommendedAction: `Add ${missing} in the Dashboard and calculate again.`,
    };
  }

  const formatRM = (amount) => `RM ${Number(amount).toFixed(2)}`;
  const risk = spendingAssessment.level === "risky" || spendingAssessment.level === "careful"
    ? spendingAssessment.reason
    : "Other unrecorded costs and provider terms could still change the picture.";
  let recommendedAction;
  let mamakText;
  if (purchase.paymentMethod === "pay-full") {
    mamakText = `Aiyo dik, paying ${formatRM(purchase.itemPrice)} upfront ah? That’s one big bite, like ordering nasi lemak for the whole table. You okay with less cash this month or not?`;
    recommendedAction = "Check this one-time cost against your other plans for the month.";
  } else if (
    purchase.annualFlatInterestRate > 0 ||
    purchase.additionalFees > 0 ||
    purchase.processingFeeExplicitlyShown === false
  ) {
    mamakText = `Aiyo dik, ${formatRM(purchase.monthlyInstallment)} every month ah? Small small also add up one lah. Check the full provider total first—can tahan this along with your usual plans or not?`;
    recommendedAction = "Check the provider’s final total and repayment dates before confirming.";
  } else {
    mamakText = `Aiyo dik, ${formatRM(purchase.monthlyInstallment)} a month ah? Like kopi and roti canai, one by one seems small, kan? You still got room for your other plans or need to pause awhile?`;
    recommendedAction = "Review how this plan stacks with your other active monthly commitments.";
  }

  return {
    verdictLabel,
    mamakText,
    keyRisk: risk,
    recommendedAction,
  };
}
