"use strict";
/**
 * Canonical Deterministic Ordering (Phase 1 — Canonical Deterministic Ordering)
 *
 * Single source of truth for finding sort order across:
 *   - replayChecksum generation
 *   - provenance serialization
 *   - governance envelope emission
 *   - telemetry harvesting
 *
 * INVARIANT:
 *   Any two invocations on the same logical finding set MUST produce
 *   the same ordered array, regardless of:
 *   - filesystem traversal order
 *   - async execution timing
 *   - insertion order
 *   - Map iteration order
 *   - Object.keys() order
 *
 * Canonical sort key (evaluated in priority order):
 *   1. severity          (BLOCKING > ADVISORY > INFO > unknown)
 *   2. determinismClassification (deterministic-structural > deterministic-semantic
 *                                 > heuristic-advisory > llm-assisted-planning > unknown)
 *   3. ruleId            (ascending lexicographic)
 *   4. filePath          (ascending lexicographic, normalized to forward slashes)
 *   5. line              (ascending numeric, missing = 0)
 *   6. column            (ascending numeric, missing = 0)
 *   7. findingId         (ascending lexicographic — stable tiebreaker, always unique)
 *
 * These rules ensure a total order: no two distinct findings can be equal on
 * all 7 keys simultaneously (findingId is always unique by construction).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalFindingOrderingKey = canonicalFindingOrderingKey;
exports.sortCanonicalFindingsStable = sortCanonicalFindingsStable;
exports.validateCanonicalOrder = validateCanonicalOrder;
// ── Rank tables ───────────────────────────────────────────────────────────────
/**
 * Severity rank — higher number = sorted first (BLOCKING first).
 * Deterministic: closed set, no dynamic lookup.
 */
function rankSeverity(s) {
    switch (s) {
        case 'BLOCKING': return 3;
        case 'ADVISORY': return 2;
        case 'INFO': return 1;
        default: return 0;
    }
}
/**
 * Determinism classification rank — higher = sorted first (structural first).
 * Deterministic: closed set, no dynamic lookup.
 */
function rankDeterminism(d) {
    switch (d) {
        case 'deterministic-structural': return 4;
        case 'deterministic-semantic': return 3;
        case 'heuristic-advisory': return 2;
        case 'llm-assisted-planning': return 1;
        default: return 0;
    }
}
/** Normalize a file path to use forward slashes for cross-platform stability. */
function normalizePath(p) {
    return p.replace(/\\/g, '/');
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Compute the canonical ordering key for a single finding.
 *
 * Returns a tuple whose elements, compared left-to-right, produce the
 * canonical ordering defined above. Useful for inspection and testing.
 *
 * Format: [severityRank, determinismRank, ruleId, filePath, line, column, id]
 */
function canonicalFindingOrderingKey(f) {
    return [
        rankSeverity(f.severity),
        rankDeterminism(f.determinismClassification),
        f.structuralMetadata?.ruleId ?? '',
        normalizePath(f.evidence?.filePath ?? ''),
        f.evidence?.line ?? 0,
        f.evidence?.column ?? 0,
        f.id,
    ];
}
/**
 * Sort findings into the canonical deterministic order.
 *
 * Properties:
 *   - Pure function — NEVER mutates the input array
 *   - Stable across process restarts for identical inputs
 *   - Independent of insertion order, Map iteration, filesystem traversal
 *   - Total order — no two distinct findings can compare as equal
 *
 * @param findings  Any array of GovernanceFinding (may be in any order)
 * @returns         New sorted array (input is not mutated)
 */
function sortCanonicalFindingsStable(findings) {
    return [...findings].sort((a, b) => {
        // 1. Severity descending (BLOCKING first)
        const sA = rankSeverity(a.severity);
        const sB = rankSeverity(b.severity);
        if (sA !== sB)
            return sB - sA;
        // 2. Determinism classification descending (structural first)
        const dA = rankDeterminism(a.determinismClassification);
        const dB = rankDeterminism(b.determinismClassification);
        if (dA !== dB)
            return dB - dA;
        // 3. Rule ID ascending
        const rA = a.structuralMetadata?.ruleId ?? '';
        const rB = b.structuralMetadata?.ruleId ?? '';
        if (rA !== rB)
            return rA < rB ? -1 : 1;
        // 4. File path ascending (normalized)
        const fA = normalizePath(a.evidence?.filePath ?? '');
        const fB = normalizePath(b.evidence?.filePath ?? '');
        if (fA !== fB)
            return fA < fB ? -1 : 1;
        // 5. Line number ascending (missing = 0)
        const lA = a.evidence?.line ?? 0;
        const lB = b.evidence?.line ?? 0;
        if (lA !== lB)
            return lA - lB;
        // 6. Column number ascending (missing = 0)
        const cA = a.evidence?.column ?? 0;
        const cB = b.evidence?.column ?? 0;
        if (cA !== cB)
            return cA - cB;
        // 7. Finding ID ascending — guaranteed unique tiebreaker
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
/**
 * Validate that a finding array is already in canonical order.
 *
 * Returns the index of the first out-of-order finding pair, or -1 if
 * the array is already sorted. Used for invariant checking.
 *
 * Emits a console.warn if ordering drift is detected.
 *
 * @param findings  Array to validate (not mutated)
 * @param context   Caller label for the warning (e.g. 'envelope-emit')
 * @returns         Index of first violation, or -1 if canonical
 */
function validateCanonicalOrder(findings, context) {
    for (let i = 1; i < findings.length; i++) {
        const prev = findings[i - 1];
        const curr = findings[i];
        const kPrev = canonicalFindingOrderingKey(prev);
        const kCurr = canonicalFindingOrderingKey(curr);
        // Compare tuple element by element
        for (let k = 0; k < kPrev.length; k++) {
            const pv = kPrev[k];
            const cv = kCurr[k];
            if (typeof pv === 'number' && typeof cv === 'number') {
                if (pv > cv) {
                    console.warn(`[neurcode/canonical-ordering] ORDERING DRIFT at index ${i} in ${context}. ` +
                        `Finding "${prev.id}" (key[${k}]=${pv}) appears before "${curr.id}" (key[${k}]=${cv}) ` +
                        `but canonical order requires ascending value at position ${k}. ` +
                        `Run sortCanonicalFindingsStable() before serialization.`);
                    return i;
                }
                if (pv < cv)
                    break; // correct order for this pair
            }
            else if (typeof pv === 'string' && typeof cv === 'string') {
                // Numeric keys are descending (rank), string keys are ascending
                // Keys 0 and 1 are ranks (descending means higher rank first = larger number first)
                if (k <= 1) {
                    // These are rank values stored as numbers — already handled above
                    break;
                }
                if (pv > cv) {
                    console.warn(`[neurcode/canonical-ordering] ORDERING DRIFT at index ${i} in ${context}. ` +
                        `Finding "${prev.id}" (key[${k}]="${pv}") appears before "${curr.id}" ` +
                        `(key[${k}]="${cv}") but canonical order requires ascending string at position ${k}. ` +
                        `Run sortCanonicalFindingsStable() before serialization.`);
                    return i;
                }
                if (pv < cv)
                    break; // correct order for this pair
            }
        }
    }
    return -1;
}
//# sourceMappingURL=canonical-ordering.js.map