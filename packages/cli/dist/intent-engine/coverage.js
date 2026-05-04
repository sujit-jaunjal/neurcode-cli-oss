"use strict";
/**
 * Coverage Computation — measures how complete an implementation is relative
 * to the requirements declared in requirements.ts.
 *
 * No side effects.  Pure functions only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeWeightedCoverage = computeWeightedCoverage;
exports.computeCoverage = computeCoverage;
exports.computeIntentSummary = computeIntentSummary;
exports.formatCoverageBar = formatCoverageBar;
exports.formatComponentLabel = formatComponentLabel;
const requirements_1 = require("./requirements");
// ── Confidence thresholds ─────────────────────────────────────────────────────
function confidenceFromCoverage(coverage) {
    if (coverage >= 0.8)
        return 'HIGH';
    if (coverage >= 0.5)
        return 'MEDIUM';
    return 'LOW';
}
// ── Weighted coverage ─────────────────────────────────────────────────────────
function computeWeightedCoverage(domain, foundComponents) {
    const required = (0, requirements_1.requirementsForDomain)(domain);
    if (required.length === 0)
        return { weightedScore: 0, maxScore: 0, coverage: 1 };
    const foundSet = new Set(foundComponents);
    const maxScore = required.reduce((sum, k) => sum + (0, requirements_1.weightOf)(k), 0);
    const weightedScore = required
        .filter((k) => foundSet.has(k))
        .reduce((sum, k) => sum + (0, requirements_1.weightOf)(k), 0);
    return {
        weightedScore,
        maxScore,
        coverage: maxScore > 0 ? weightedScore / maxScore : 1,
    };
}
// ── Status derivation ─────────────────────────────────────────────────────────
function deriveStatus(criticalMissing, weightedCoverage) {
    if (criticalMissing.length > 0)
        return 'CRITICAL';
    if (weightedCoverage < 0.5)
        return 'AT RISK';
    return 'SECURE';
}
// ── Core computation ──────────────────────────────────────────────────────────
/**
 * Compute coverage for a single domain given the set of detected components.
 */
function computeCoverage(domain, foundComponents) {
    const required = (0, requirements_1.requirementsForDomain)(domain);
    if (required.length === 0) {
        return {
            domain,
            coverage: 1,
            coveragePct: 100,
            total: 0,
            found: 0,
            missing: [],
            foundList: [],
            confidence: 'HIGH',
            weightedCoverage: 1,
            criticalMissing: [],
            status: 'SECURE',
        };
    }
    const foundSet = new Set(foundComponents);
    const foundList = required.filter((k) => foundSet.has(k));
    const missing = required.filter((k) => !foundSet.has(k));
    const coverage = foundList.length / required.length;
    const criticalMissing = missing.filter(requirements_1.isCritical);
    const { coverage: weightedCoverage } = computeWeightedCoverage(domain, foundComponents);
    return {
        domain,
        coverage,
        coveragePct: Math.round(coverage * 100),
        total: required.length,
        found: foundList.length,
        missing,
        foundList,
        confidence: confidenceFromCoverage(coverage),
        weightedCoverage,
        criticalMissing,
        status: deriveStatus(criticalMissing, weightedCoverage),
    };
}
/**
 * Build an IntentSummary from the per-domain foundComponents map.
 * When multiple domains are active the primary domain is the one with
 * the most requirements (most comprehensive), and overall coverage is
 * a weighted average.
 */
function computeIntentSummary(checkedDomains, foundComponents, componentMap = {}, componentQuality = {}) {
    if (checkedDomains.length === 0)
        return null;
    const domainCoverages = checkedDomains.map((d) => computeCoverage(d, foundComponents[d] ?? []));
    // Primary domain = highest requirement count (most comprehensive view)
    const primary = domainCoverages.reduce((best, curr) => curr.total >= best.total ? curr : best);
    // Overall weighted coverage = average of per-domain weighted coverages weighted by maxScore
    let totalMaxScore = 0;
    let totalWeightedScore = 0;
    for (const d of checkedDomains) {
        const { weightedScore, maxScore } = computeWeightedCoverage(d, foundComponents[d] ?? []);
        totalMaxScore += maxScore;
        totalWeightedScore += weightedScore;
    }
    const overallWeightedCoverage = totalMaxScore > 0 ? totalWeightedScore / totalMaxScore : 1;
    // Aggregate critical missing across all domains (deduplicated)
    const criticalMissingSet = new Set();
    for (const dc of domainCoverages) {
        for (const k of dc.criticalMissing)
            criticalMissingSet.add(k);
    }
    const criticalMissing = Array.from(criticalMissingSet);
    const status = deriveStatus(criticalMissing, overallWeightedCoverage);
    return {
        domain: primary.domain,
        coverage: primary.coverage,
        coveragePct: primary.coveragePct,
        confidence: primary.confidence,
        missing: primary.missing,
        foundList: primary.foundList,
        domains: domainCoverages,
        weightedCoverage: overallWeightedCoverage,
        status,
        criticalMissing,
        componentMap,
        componentQuality,
    };
}
// ── Formatting helpers ────────────────────────────────────────────────────────
function formatCoverageBar(pct, width = 20) {
    const filled = Math.round((pct / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}
function formatComponentLabel(key) {
    return (0, requirements_1.labelForComponent)(key);
}
//# sourceMappingURL=coverage.js.map