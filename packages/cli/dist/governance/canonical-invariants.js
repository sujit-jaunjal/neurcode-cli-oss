"use strict";
/**
 * Canonical Finding Invariants (Phase 1 + Phase 3)
 *
 * Two responsibilities:
 *
 * 1. Architectural invariant enforcement (Phase 1):
 *    - Assert that policyViolations never contain structural:* rows
 *    - If violated, emit a deterministic console warning (never throw)
 *    - This guards against regressions where future code re-introduces the merge
 *
 * 2. Replay determinism (Phase 3):
 *    - computeCanonicalFindingChecksum(): deterministic SHA-256 over finding set
 *    - sortFindingsDeterministically(): canonical sort order for stable checksums
 *
 * Both functions are pure and dependency-free (only Node 'crypto').
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertNoStructuralPolicyRows = assertNoStructuralPolicyRows;
exports.sortFindingsDeterministically = sortFindingsDeterministically;
exports.computeCanonicalFindingChecksum = computeCanonicalFindingChecksum;
exports.compareForReplayEquivalence = compareForReplayEquivalence;
const crypto_1 = require("crypto");
// ── Phase 1: Architectural invariant guard ────────────────────────────────────
/**
 * Assert that the policyViolations array contains no structural:* prefixed rows.
 *
 * Structural violations MUST flow only through `payload.structuralViolations`
 * into the canonical pipeline. Structural rows in policyViolations cause
 * cross-source duplicate GovernanceFinding objects.
 *
 * This guard emits a console.warn if violated — it NEVER throws. The intention
 * is observability and regression detection, not hard failure. The pipeline's
 * stripStructuralPolicyRows() provides the actual cleanup.
 *
 * @param violations  The policyViolations array before it reaches the pipeline
 * @param context     Caller label for the warning message (e.g. 'verify:policy-only')
 * @returns           Count of structural rows found (0 = invariant holds)
 */
function assertNoStructuralPolicyRows(violations, context) {
    const leaked = violations.filter(v => String(v.rule ?? '').startsWith('structural:'));
    if (leaked.length > 0) {
        console.warn(`[neurcode/canonical-invariant] VIOLATION in ${context}: ` +
            `${leaked.length} structural:* row(s) found in policyViolations. ` +
            `These should flow exclusively through payload.structuralViolations. ` +
            `Rows: ${leaked.map(v => v.rule).join(', ')}. ` +
            `The canonical pipeline will strip them, but this represents a source-level duplication bug.`);
    }
    return leaked.length;
}
// ── Phase 3: Replay determinism ───────────────────────────────────────────────
/**
 * Determinism rank for sorting (higher = more deterministic = sorted first).
 * Identical to rankDeterminism in canonical-pipeline.ts — kept separate to
 * avoid circular import.
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
function rankSeverity(s) {
    switch (s) {
        case 'BLOCKING': return 3;
        case 'ADVISORY': return 2;
        case 'INFO': return 1;
        default: return 0;
    }
}
/**
 * Sort findings into a canonical deterministic order.
 *
 * Sort key (descending priority):
 *   1. determinismClassification rank (descending — structural first)
 *   2. severity rank (descending — BLOCKING first)
 *   3. filePath (ascending — lexicographic)
 *   4. line number (ascending)
 *   5. id (ascending — stable tiebreaker)
 *
 * This order is stable across multiple runs on the same input, enabling
 * reliable replay checksum comparison.
 *
 * NEVER mutates the input array — returns a new sorted array.
 */
function sortFindingsDeterministically(findings) {
    return [...findings].sort((a, b) => {
        // 1. Determinism rank descending
        const dA = rankDeterminism(a.determinismClassification);
        const dB = rankDeterminism(b.determinismClassification);
        if (dA !== dB)
            return dB - dA;
        // 2. Severity descending
        const sA = rankSeverity(a.severity);
        const sB = rankSeverity(b.severity);
        if (sA !== sB)
            return sB - sA;
        // 3. File path ascending
        const fA = a.evidence?.filePath ?? '';
        const fB = b.evidence?.filePath ?? '';
        if (fA !== fB)
            return fA < fB ? -1 : 1;
        // 4. Line number ascending
        const lA = a.evidence?.line ?? 0;
        const lB = b.evidence?.line ?? 0;
        if (lA !== lB)
            return lA - lB;
        // 5. ID ascending (stable tiebreaker)
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
/**
 * Compute a deterministic SHA-256 checksum over the canonical finding set.
 *
 * Checksum input is built from sorted findings:
 *   for each finding (in canonical sort order):
 *     id + '\x1e' + severity + '\x1e' + determinismClassification +
 *     '\x1e' + filePath + '\x1e' + line
 *   joined with '\x00'
 *
 * This checksum:
 *   - Changes if any finding is added, removed, or has severity/determinism changed
 *   - Changes if canonical ordering changes (sort key must be stable)
 *   - Is stable across process restarts on the same input
 *   - Is used to detect replay drift (same commit + diff + rules → same checksum)
 *
 * @param findings  Raw findings from the canonical pipeline (NOT pre-sorted)
 * @returns         hex SHA-256 string (64 chars)
 */
function computeCanonicalFindingChecksum(findings) {
    const sorted = sortFindingsDeterministically(findings);
    const input = sorted
        .map(f => [
        f.id,
        f.severity,
        f.determinismClassification,
        f.evidence?.filePath ?? '',
        String(f.evidence?.line ?? 0),
    ].join('\x1e'))
        .join('\x00');
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
/**
 * Compare two sets of findings for replay equivalence.
 *
 * Returns a structured comparison result:
 *   - 'exact': checksums match — identical governance output
 *   - 'drift-detected': checksums differ — replay divergence
 *
 * @param baseline  Findings from the baseline (e.g. cached) run
 * @param replay    Findings from the current run
 */
function compareForReplayEquivalence(baseline, replay) {
    const baselineChecksum = computeCanonicalFindingChecksum(baseline);
    const replayChecksum = computeCanonicalFindingChecksum(replay);
    if (baselineChecksum === replayChecksum) {
        return {
            status: 'exact',
            baselineChecksum,
            replayChecksum,
            baselineCount: baseline.length,
            replayCount: replay.length,
        };
    }
    // Drift detected — build detailed explanation
    const baselineIds = new Set(baseline.map(f => f.id));
    const replayIds = new Set(replay.map(f => f.id));
    const added = replay.filter(f => !baselineIds.has(f.id)).map(f => f.id);
    const removed = baseline.filter(f => !replayIds.has(f.id)).map(f => f.id);
    // Findings present in both but with changed severity or determinism
    const changed = [];
    for (const bf of baseline) {
        const rf = replay.find(f => f.id === bf.id);
        if (rf && (rf.severity !== bf.severity || rf.determinismClassification !== bf.determinismClassification)) {
            changed.push(`${bf.id}(sev:${bf.severity}→${rf.severity},det:${bf.determinismClassification}→${rf.determinismClassification})`);
        }
    }
    const parts = [];
    if (added.length > 0)
        parts.push(`added=${added.length}[${added.slice(0, 3).join(',')}${added.length > 3 ? '...' : ''}]`);
    if (removed.length > 0)
        parts.push(`removed=${removed.length}[${removed.slice(0, 3).join(',')}${removed.length > 3 ? '...' : ''}]`);
    if (changed.length > 0)
        parts.push(`changed=${changed.length}[${changed.slice(0, 3).join(',')}${changed.length > 3 ? '...' : ''}]`);
    return {
        status: 'drift-detected',
        baselineChecksum,
        replayChecksum,
        baselineCount: baseline.length,
        replayCount: replay.length,
        driftDetails: parts.join('; ') || 'checksum mismatch (unknown cause)',
    };
}
//# sourceMappingURL=canonical-invariants.js.map