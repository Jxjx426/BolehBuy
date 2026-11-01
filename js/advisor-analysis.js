import { currency } from "./calculations.js";

export function createLocalAnalysis(payload) {
  const { purchase, finances, spendingAssessment } = payload;
  const complete = finances.recordsComplete;
  const missing = finances.missingRecords.join(" and ");
  const assessmentLevel = spendingAssessment.level;
  const verdictLabel = !complete
    ? "Not enough information"
    : assessmentLevel === "risky"
      ? "Consider waiting"
      : assessmentLevel === "careful"
        ? "Be careful"
        : "Looks manageable";
  const remainingIsNegative = complete && finances.estimatedRemainingAfterPurchase < 0;

  return {
    verdictLabel,
    verdict: !complete
      ? `The estimate is incomplete because ${missing} ${finances.missingRecords.length === 1 ? "is" : "are"} not recorded.`
      : remainingIsNegative
        ? "The current estimate goes below zero after this purchase."
        : `The recorded budget leaves ${currency(finances.estimatedRemainingAfterPurchase)} after the purchase.`,
    positive: complete
      ? "Your recorded income, commitments and this month’s expenses are included in the estimate."
      : "You’ve entered the purchase details, so we can still review the payment terms.",
    watchOut: !complete
      ? `Without ${missing}, the estimate cannot confirm how manageable the payment would feel.`
      : assessmentLevel === "comfortable"
        ? "The estimate only includes recorded expenses; unlisted spending or provider terms could change the picture."
        : spendingAssessment.reason,
    suggestion: !complete
      ? `Add your ${missing} to the Dashboard before relying on an affordability estimate.`
      : purchase.paymentMethod === "pay-full"
        ? "Compare the one-time cost with your other plans for this month before deciding."
        : purchase.annualFlatInterestRate > 0 || purchase.additionalFees > 0
          ? "Check the provider’s final total and due dates; this is only an estimated flat-rate calculation."
          : `Check that the monthly payment fits alongside your existing commitments for all ${purchase.duration} months.`,
    question: "If an unexpected expense came up this month, would you still feel comfortable with this choice?",
  };
}
