"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rollupRulePrecisionFromEvents = rollupRulePrecisionFromEvents;
exports.noisyRuleLeaderboard = noisyRuleLeaderboard;
exports.highTrustRuleLeaderboard = highTrustRuleLeaderboard;
function isVerifyCompletedPayload(p) {
    return (typeof p === 'object' &&
        p !== null &&
        'structuralRuleTriggerHistogram' in p &&
        'structuralRuleSuppressionHistogram' in p);
}
/**
 * Aggregate rule-level signals from governance.verify.completed events only.
 * Deterministic: rules sorted by ruleId for stable output order.
 */
function rollupRulePrecisionFromEvents(events) {
    const triggers = {};
    const suppressions = {};
    let verifyCompletedEvents = 0;
    for (const ev of events) {
        if (ev.eventType !== 'governance.verify.completed') {
            continue;
        }
        if (!isVerifyCompletedPayload(ev.payload)) {
            continue;
        }
        verifyCompletedEvents += 1;
        const p = ev.payload;
        for (const [ruleId, c] of Object.entries(p.structuralRuleTriggerHistogram)) {
            triggers[ruleId] = (triggers[ruleId] ?? 0) + c;
        }
        for (const [ruleId, c] of Object.entries(p.structuralRuleSuppressionHistogram)) {
            suppressions[ruleId] = (suppressions[ruleId] ?? 0) + c;
        }
    }
    const ruleIds = new Set([...Object.keys(triggers), ...Object.keys(suppressions)]);
    const ruleRollups = [...ruleIds]
        .sort()
        .map(ruleId => {
        const triggerCount = triggers[ruleId] ?? 0;
        const suppressionCount = suppressions[ruleId] ?? 0;
        const suppressionRate = triggerCount > 0 ? suppressionCount / triggerCount : 0;
        return { ruleId, triggerCount, suppressionCount, suppressionRate };
    });
    return { verifyCompletedEvents, ruleRollups };
}
/** Higher score = more noise (suppressions relative to triggers). */
function noisyRuleLeaderboard(rollup, limit = 20) {
    return [...rollup.ruleRollups]
        .filter(r => r.triggerCount > 0)
        .sort((a, b) => {
        const dr = b.suppressionRate - a.suppressionRate;
        if (dr !== 0) {
            return dr;
        }
        return b.triggerCount - a.triggerCount;
    })
        .slice(0, limit);
}
/** Higher score = fewer suppressions per trigger (reviewer trust proxy). */
function highTrustRuleLeaderboard(rollup, limit = 20) {
    return [...rollup.ruleRollups]
        .filter(r => r.triggerCount >= 3)
        .sort((a, b) => {
        const dr = a.suppressionRate - b.suppressionRate;
        if (dr !== 0) {
            return dr;
        }
        return b.triggerCount - a.triggerCount;
    })
        .slice(0, limit);
}
