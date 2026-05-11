"use strict";
/**
 * Bounded, explainable trust signals — no opaque ML.
 * All outputs are in [0, 1] unless noted.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.trustFromVerifyPayload = trustFromVerifyPayload;
exports.trustFromRollups = trustFromRollups;
function trustFromVerifyPayload(p) {
    const n = Math.max(1, p.governanceFindingCount);
    const findingTrustScore = clamp01(1 - p.suppressedFindingCount / n);
    const ruleIds = Object.keys(p.structuralRuleTriggerHistogram);
    let sum = 0;
    let count = 0;
    for (const ruleId of ruleIds) {
        const t = p.structuralRuleTriggerHistogram[ruleId] ?? 0;
        const s = p.structuralRuleSuppressionHistogram[ruleId] ?? 0;
        if (t <= 0) {
            continue;
        }
        sum += 1 - s / t;
        count += 1;
    }
    const ruleTrustScore = count > 0 ? clamp01(sum / count) : 1;
    let replayTrustScore = 0.5;
    if (p.replayIntegrityStatus === 'exact') {
        replayTrustScore = 1;
    }
    else if (p.replayIntegrityStatus === 'bounded-degradation') {
        replayTrustScore = 0.65;
    }
    const reviewerTrustDensity = clamp01(p.blockingFindingCount / n);
    const governanceUsefulnessScore = clamp01(0.45 * findingTrustScore + 0.35 * ruleTrustScore + 0.2 * replayTrustScore);
    return {
        findingTrustScore,
        ruleTrustScore,
        replayTrustScore,
        reviewerTrustDensity,
        governanceUsefulnessScore,
    };
}
function trustFromRollups(rollup) {
    const rows = rollup.ruleRollups.filter(r => r.triggerCount > 0);
    if (rows.length === 0) {
        return { ruleTrustScore: 1 };
    }
    const acc = rows.reduce((s, r) => s + (1 - r.suppressionRate), 0) / rows.length;
    return { ruleTrustScore: clamp01(acc) };
}
function clamp01(x) {
    if (x < 0) {
        return 0;
    }
    if (x > 1) {
        return 1;
    }
    return x;
}
