"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStructuralOnDiffFiles = runStructuralOnDiffFiles;
const fs_1 = require("fs");
const path_1 = require("path");
const structural_rules_1 = require("../structural-rules");
const diff_line_provenance_1 = require("./diff-line-provenance");
/**
 * Run the default structural rule set on files touched by the diff.
 *
 * Phase 2 — Diff-Scoped Enforcement:
 *   When diffFiles carries hunk line ranges, violations are classified as:
 *     - introducedOnModifiedLine: true  → BLOCKING eligible (new code)
 *     - introducedOnModifiedLine: false → ADVISORY only (legacy debt)
 *
 *   Pass strictFullFile=true to restore the original whole-file behaviour
 *   (equivalent to the --strict-full-file CLI flag).
 *
 * No I/O beyond reading the file contents. The modified-line index is built
 * entirely from the already-parsed diffFiles structure.
 */
function runStructuralOnDiffFiles(projectRoot, diffFiles, options = {}) {
    const strictMode = options.strictFullFile ?? false;
    // Build the modified-line index from hunk data (Phase 2).
    // If the diff objects don't carry hunk info (legacy callers), the index
    // will be empty and all violations will be treated as new (safe default).
    const modifiedLineIndex = (0, diff_line_provenance_1.buildModifiedLineIndex)(diffFiles);
    const hasDiffLineData = modifiedLineIndex.size > 0;
    const engine = (0, structural_rules_1.createDefaultStructuralRuleEngine)();
    const filesToAnalyze = [];
    for (const df of diffFiles) {
        const absPath = (0, path_1.join)(projectRoot, df.path);
        if (!(0, fs_1.existsSync)(absPath))
            continue;
        try {
            const sourceText = (0, fs_1.readFileSync)(absPath, 'utf-8');
            filesToAnalyze.push({ filePath: df.path, sourceText });
        }
        catch {
            // skip unreadable
        }
    }
    if (filesToAnalyze.length === 0) {
        return {
            violations: [],
            rulesApplied: [],
            suppressedCount: 0,
            newViolationCount: 0,
            legacyDebtCount: 0,
            diffScopedEnforcement: false,
        };
    }
    const result = engine.analyze(filesToAnalyze);
    // Apply diff-scoped provenance classification (Phase 2)
    const { violations, legacyDebtCount, newViolationCount } = hasDiffLineData && !strictMode
        ? (0, diff_line_provenance_1.applyDiffScopedProvenance)(result.violations, modifiedLineIndex, false)
        : { violations: result.violations, legacyDebtCount: 0, newViolationCount: result.violations.length };
    return {
        violations,
        rulesApplied: result.rulesApplied,
        suppressedCount: result.suppressedCount,
        newViolationCount,
        legacyDebtCount,
        diffScopedEnforcement: hasDiffLineData && !strictMode,
    };
}
//# sourceMappingURL=structural-on-diff.js.map