"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.harvestGovernanceVerifyCompleted = harvestGovernanceVerifyCompleted;
const crypto_1 = require("crypto");
function isRecord(x) {
    return typeof x === 'object' && x !== null && !Array.isArray(x);
}
function asString(x) {
    return typeof x === 'string' ? x : undefined;
}
function asBoolean(x) {
    return typeof x === 'boolean' ? x : undefined;
}
function asNumber(x) {
    return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
}
/**
 * Derive a privacy-safe, bounded payload from canonical verify JSON.
 * Does not copy excerpts, titles, or file paths.
 */
function harvestGovernanceVerifyCompleted(canonical) {
    if (!canonical) {
        return null;
    }
    const verdict = asString(canonical.verdict) ?? 'UNKNOWN';
    const ciMode = asBoolean(canonical.ciMode) ?? false;
    const policyOnly = asBoolean(canonical.policyOnly) ?? false;
    const gv = canonical.governanceVerification;
    if (!isRecord(gv)) {
        const payload = {
            verdict,
            governanceFindingCount: 0,
            blockingFindingCount: 0,
            advisoryFindingCount: 0,
            determinismHistogram: {},
            suppressedFindingCount: 0,
            waivedFindingCount: 0,
            structuralRuleTriggerHistogram: {},
            structuralRuleSuppressionHistogram: {},
            compressedDuplicateCount: 0,
            replayIntegrityStatus: null,
            ciMode,
            policyOnly,
        };
        const findingSetDigest = digestFindingIds([]);
        return { payload, findingSetDigest };
    }
    const findingsRaw = gv.findings;
    const findings = Array.isArray(findingsRaw) ? findingsRaw.filter(isRecord) : [];
    const determinismHistogram = {};
    let blockingFindingCount = 0;
    let advisoryFindingCount = 0;
    let suppressedFindingCount = 0;
    let waivedFindingCount = 0;
    const structuralRuleTriggerHistogram = {};
    const structuralRuleSuppressionHistogram = {};
    const findingIds = [];
    for (const f of findings) {
        const id = asString(f.id);
        if (id) {
            findingIds.push(id);
        }
        const sev = asString(f.severity);
        if (sev === 'BLOCKING') {
            blockingFindingCount += 1;
        }
        else if (sev === 'ADVISORY') {
            advisoryFindingCount += 1;
        }
        const det = asString(f.determinismClassification) ?? 'unknown';
        determinismHistogram[det] = (determinismHistogram[det] ?? 0) + 1;
        const sup = f.suppressionMetadata;
        let suppressed = false;
        let waived = false;
        if (isRecord(sup)) {
            suppressed = sup.suppressed === true;
            const directive = asString(sup.directive);
            waived = directive === 'waive' || directive === 'waiver';
        }
        if (suppressed) {
            suppressedFindingCount += 1;
        }
        if (waived) {
            waivedFindingCount += 1;
        }
        const sm = f.structuralMetadata;
        const ruleId = isRecord(sm) ? asString(sm.ruleId) : undefined;
        if (ruleId) {
            structuralRuleTriggerHistogram[ruleId] = (structuralRuleTriggerHistogram[ruleId] ?? 0) + 1;
            if (suppressed) {
                structuralRuleSuppressionHistogram[ruleId] =
                    (structuralRuleSuppressionHistogram[ruleId] ?? 0) + 1;
            }
        }
    }
    const compressedDuplicateCount = asNumber(gv.compressedDuplicateCount) ?? 0;
    let replayIntegrityStatus = null;
    const ri = gv.replayIntegrity;
    if (isRecord(ri)) {
        const st = asString(ri.status);
        if (st === 'exact' || st === 'bounded-degradation') {
            replayIntegrityStatus = st;
        }
    }
    const payload = {
        verdict,
        governanceFindingCount: findings.length,
        blockingFindingCount,
        advisoryFindingCount,
        determinismHistogram,
        suppressedFindingCount,
        waivedFindingCount,
        structuralRuleTriggerHistogram,
        structuralRuleSuppressionHistogram,
        compressedDuplicateCount,
        replayIntegrityStatus,
        ciMode,
        policyOnly,
    };
    return {
        payload,
        findingSetDigest: digestFindingIds(findingIds),
    };
}
function digestFindingIds(ids) {
    const sorted = [...ids].sort();
    return (0, crypto_1.createHash)('sha256').update(sorted.join('|'), 'utf8').digest('hex');
}
