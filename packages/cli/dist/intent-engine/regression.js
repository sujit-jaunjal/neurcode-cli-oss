"use strict";
/**
 * Regression Detector — compares the current intent engine result against
 * the previously saved state to identify system degradation.
 *
 * This is NOT about detecting new problems.  It answers:
 * "What was working before but is now broken?"
 *
 * All checks are deterministic.  No LLM calls.  No disk I/O — that is
 * handled by state.ts; this module receives pre-loaded data.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectRegressions = detectRegressions;
// ── Thresholds ────────────────────────────────────────────────────────────────
/** Minimum weighted-coverage drop (absolute, 0–1) that triggers a regression. */
const COVERAGE_DROP_THRESHOLD = 0.10;
// ── Detection rules ───────────────────────────────────────────────────────────
/**
 * A. Component regression — component was detected before, is absent now.
 */
function detectComponentRegressions(previousComponentMap, currentComponentMap) {
    const issues = [];
    for (const component of Object.keys(previousComponentMap)) {
        if (previousComponentMap[component].length > 0 && !currentComponentMap[component]) {
            issues.push({
                type: 'component-regression',
                message: `Component '${component}' was previously implemented but is now missing`,
                severity: 'high',
                rule: `regression:component:${component}`,
            });
        }
    }
    return issues;
}
/**
 * B. Critical regression — component was present, now appears in criticalMissing.
 */
function detectCriticalRegressions(previousComponentMap, currentCriticalMissing) {
    const issues = [];
    for (const component of currentCriticalMissing) {
        // It's a regression only if it was previously implemented
        if (previousComponentMap[component] && previousComponentMap[component].length > 0) {
            issues.push({
                type: 'critical-regression',
                message: `Critical component '${component}' regressed — it was implemented before but is now missing`,
                severity: 'high',
                rule: `regression:critical:${component}`,
            });
        }
    }
    return issues;
}
/**
 * C. Flow regression — a flow issue exists now that did NOT exist before.
 */
function detectFlowRegressions(previousFlowIssueIds, currentFlowIssues) {
    const prevSet = new Set(previousFlowIssueIds);
    return currentFlowIssues
        .filter((fi) => !prevSet.has(fi.rule))
        .map((fi) => ({
        type: 'flow-regression',
        message: `New flow issue introduced: ${fi.message}`,
        severity: 'high',
        rule: `regression:flow:${fi.rule}`,
    }));
}
/**
 * D. Coverage regression — weighted coverage dropped by more than the threshold.
 */
function detectCoverageRegression(previousSummary, currentSummary) {
    if (!previousSummary || !currentSummary)
        return null;
    const prev = previousSummary.weightedCoverage;
    const curr = currentSummary.weightedCoverage;
    if (typeof prev !== 'number' || typeof curr !== 'number')
        return null;
    const drop = prev - curr;
    if (drop <= COVERAGE_DROP_THRESHOLD)
        return null;
    const prevPct = Math.round(prev * 100);
    const currPct = Math.round(curr * 100);
    return {
        type: 'coverage-regression',
        message: `System coverage dropped from ${prevPct}% → ${currPct}% (−${Math.round(drop * 100)}pp)`,
        severity: 'high',
        rule: 'regression:coverage-drop',
    };
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Compare the previous saved state against the current engine output and return
 * a deduplicated list of regression issues.
 *
 * Returns [] when:
 * - previousState is null (first run, nothing to compare)
 * - intent text changed significantly (different feature, not a regression)
 */
function detectRegressions(previousState, currentIntentSummary, currentFlowIssues, currentComponentMap, currentIntentText) {
    if (!previousState)
        return [];
    // If the intent changed substantially, skip regression analysis to avoid
    // false positives (different feature = different component expectations).
    const intentChanged = !intentsSimilar(previousState.intent, currentIntentText);
    if (intentChanged)
        return [];
    const issues = [];
    const seen = new Set();
    const add = (list) => {
        for (const issue of list) {
            if (!seen.has(issue.rule)) {
                seen.add(issue.rule);
                issues.push(issue);
            }
        }
    };
    // A — component regressions (superset of B, so run B separately to give richer message)
    const componentRegressions = detectComponentRegressions(previousState.componentMap, currentComponentMap);
    // B — critical regressions (subset of A with different label; skip if already in A)
    const criticalMissing = currentIntentSummary?.criticalMissing ?? [];
    const criticalRegressions = detectCriticalRegressions(previousState.componentMap, criticalMissing);
    // Prefer the critical-regression message over the generic component-regression
    // message when the same component triggers both.
    const criticalComponents = new Set(criticalRegressions.map((r) => r.rule.replace('regression:critical:', '')));
    const filteredComponentRegressions = componentRegressions.filter((r) => !criticalComponents.has(r.rule.replace('regression:component:', '')));
    add(criticalRegressions);
    add(filteredComponentRegressions);
    // C — flow regressions
    add(detectFlowRegressions(previousState.flowIssueIds, currentFlowIssues));
    // D — coverage regression (at most one)
    const coverageReg = detectCoverageRegression(previousState.intentSummary, currentIntentSummary);
    if (coverageReg)
        add([coverageReg]);
    return issues;
}
// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Rough similarity check: two intents are considered "similar" if they share
 * at least 60% of their distinctive words (ignoring stop words).
 * This prevents false-positive regressions when the developer changes feature.
 */
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'in', 'on', 'for', 'with', 'to', 'of',
    'is', 'are', 'was', 'be', 'that', 'this', 'it', 'as', 'at', 'by', 'from',
    'implement', 'add', 'create', 'build', 'update', 'fix', 'change', 'refactor',
]);
function tokenise(text) {
    return new Set(text.toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
}
function intentsSimilar(a, b) {
    if (!a || !b)
        return false;
    const ta = tokenise(a);
    const tb = tokenise(b);
    if (ta.size === 0 || tb.size === 0)
        return false;
    let shared = 0;
    for (const word of ta) {
        if (tb.has(word))
            shared++;
    }
    const similarity = shared / Math.max(ta.size, tb.size);
    return similarity >= 0.4; // 40% word overlap = same intent domain
}
//# sourceMappingURL=regression.js.map