"use strict";

function evaluateCoverage(numerator, denominator, threshold = 0.1) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)
    || numerator < 0 || denominator < 0 || numerator > denominator) {
    throw new TypeError("coverage counts must be safe integers with 0 <= numerator <= denominator");
  }
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 || threshold >= 1) {
    throw new TypeError("coverage threshold must be at least 0 and below 1");
  }
  const scaledThreshold = threshold * 100;
  const thresholdHundredths = Math.round(scaledThreshold);
  if (Math.abs(scaledThreshold - thresholdHundredths) > Number.EPSILON * 100) {
    throw new TypeError("coverage threshold must use exact hundredths");
  }

  if (denominator === 0) {
    return { numerator, denominator, raw_ratio: null, state: "NO_POPULATION", alert: null };
  }

  const state = numerator === 0
    ? "NO_COVERAGE"
    : numerator === denominator
      ? "FULL"
      : "PARTIAL";
  const alert = thresholdHundredths > 0
    && 100n * BigInt(numerator) < BigInt(thresholdHundredths) * BigInt(denominator)
    ? "LOW_COVERAGE"
    : null;
  return { numerator, denominator, raw_ratio: numerator / denominator, state, alert };
}

module.exports = { evaluateCoverage };
