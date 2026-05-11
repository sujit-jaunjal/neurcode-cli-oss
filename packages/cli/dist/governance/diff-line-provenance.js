"use strict";
/**
 * Diff Line Provenance (Phase 2 — Diff-Scoped Enforcement)
 *
 * Builds a per-file index of which line numbers were modified in the current
 * diff. Used to classify structural violations as either:
 *
 *   introducedOnModifiedLine: true  → violation sits on a changed line
 *                                     → BLOCKING eligible (normal behaviour)
 *
 *   introducedOnModifiedLine: false → violation is on an unmodified line
 *                                     → demoted to ADVISORY, tagged legacyDebt
 *
 * Only added diff lines are indexed (type === 'added'). Removed lines are by
 * definition gone from the file and cannot carry current violations.
 *
 * The index is a Map<filePath, Set<1-based line number>> built entirely from
 * the parsed diff — no disk I/O.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildModifiedLineIndex = buildModifiedLineIndex;
exports.classifyViolationProvenance = classifyViolationProvenance;
exports.applyDiffScopedProvenance = applyDiffScopedProvenance;
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Build a modified-line index from a parsed diff.
 *
 * For each file in the diff, collect all line numbers that are 'added' in any
 * hunk. These are the only lines that could carry new violations.
 *
 * Hunk format from diff-parser: each hunk has a `newStart` (1-based line
 * number of the first line in the post-diff file) and lines with type
 * 'added' | 'removed' | 'context'.
 */
function buildModifiedLineIndex(diffFiles) {
    const index = new Map();
    for (const file of diffFiles) {
        const modifiedLines = new Set();
        for (const hunk of file.hunks ?? []) {
            // newStart is the 1-based line number of the first line in the new file
            let currentNewLine = hunk.newStart ?? 1;
            for (const line of hunk.lines ?? []) {
                if (line.type === 'added') {
                    modifiedLines.add(currentNewLine);
                    currentNewLine++;
                }
                else if (line.type === 'context') {
                    // Context lines advance the new-file line counter but are not modified
                    currentNewLine++;
                }
                // Removed lines don't appear in the new file, don't advance new counter
            }
        }
        if (modifiedLines.size > 0) {
            index.set(file.path, modifiedLines);
        }
    }
    return index;
}
/**
 * Classify a structural violation's provenance against the modified-line index.
 *
 * Returns a new StructuralViolation (never mutates the input) with:
 *   - introducedOnModifiedLine set
 *   - legacyDebt set if demoting
 *   - severity demoted to ADVISORY if legacyDebt
 *
 * @param violation   The raw violation from the rule engine
 * @param index       The modified-line index for this diff
 * @param strictMode  If true (--strict-full-file), skip demotion entirely
 */
function classifyViolationProvenance(violation, index, strictMode = false) {
    // In strict full-file mode, do not apply diff-scoping
    if (strictMode)
        return violation;
    const modifiedLines = index.get(violation.filePath);
    // File not in diff at all — should not happen (we only analyze diff files)
    // but treat conservatively: do not demote, leave unclassified
    if (!modifiedLines) {
        return { ...violation, introducedOnModifiedLine: false, legacyDebt: true, severity: 'ADVISORY' };
    }
    const onModifiedLine = modifiedLines.has(violation.line);
    if (onModifiedLine) {
        return { ...violation, introducedOnModifiedLine: true };
    }
    // Violation is on an unmodified (historical) line — demote
    return {
        ...violation,
        introducedOnModifiedLine: false,
        legacyDebt: true,
        // Demote BLOCKING → ADVISORY for legacy debt; ADVISORY stays ADVISORY
        severity: 'ADVISORY',
    };
}
/**
 * Apply provenance classification to a batch of violations.
 *
 * @param violations  Raw violations from rule engine
 * @param index       Modified-line index for this diff
 * @param strictMode  If true, no demotion applied (--strict-full-file)
 */
function applyDiffScopedProvenance(violations, index, strictMode = false) {
    const result = [];
    let legacyDebtCount = 0;
    let newViolationCount = 0;
    for (const v of violations) {
        const classified = classifyViolationProvenance(v, index, strictMode);
        result.push(classified);
        if (classified.legacyDebt) {
            legacyDebtCount++;
        }
        else if (classified.introducedOnModifiedLine === true) {
            newViolationCount++;
        }
    }
    return { violations: result, legacyDebtCount, newViolationCount };
}
//# sourceMappingURL=diff-line-provenance.js.map