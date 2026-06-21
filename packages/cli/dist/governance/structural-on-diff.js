"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStructuralOnDiffFiles = runStructuralOnDiffFiles;
const fs_1 = require("fs");
const path_1 = require("path");
const structural_rules_1 = require("../structural-rules");
const diff_line_provenance_1 = require("./diff-line-provenance");
function isStructurallySupportedPath(path) {
    return /\.(?:ts|tsx|js|jsx|py)$/.test(path.toLowerCase());
}
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
    const filesSkipped = [];
    const filesUnsupported = [];
    const requestedPaths = [...new Set(diffFiles.map((file) => file.path))];
    for (const path of requestedPaths) {
        if (!isStructurallySupportedPath(path)) {
            filesUnsupported.push({ path, reasonCode: 'unsupported_language' });
            continue;
        }
        const absPath = (0, path_1.join)(projectRoot, path);
        if (!(0, fs_1.existsSync)(absPath)) {
            filesSkipped.push({ path, reasonCode: 'source_missing' });
            continue;
        }
        try {
            const sourceText = (0, fs_1.readFileSync)(absPath, 'utf-8');
            filesToAnalyze.push({ filePath: path, sourceText });
        }
        catch {
            filesSkipped.push({ path, reasonCode: 'source_unreadable' });
        }
    }
    if (filesToAnalyze.length === 0) {
        const supportedFilesRequested = requestedPaths.length - filesUnsupported.length;
        return {
            violations: [],
            rulesApplied: [],
            suppressedCount: 0,
            newViolationCount: 0,
            legacyDebtCount: 0,
            diffScopedEnforcement: false,
            filesRequested: requestedPaths.length,
            filesAnalyzed: 0,
            filesSkipped,
            filesUnsupported,
            coveragePosture: requestedPaths.length === 0 || supportedFilesRequested === 0
                ? 'not_evaluated'
                : 'partial',
        };
    }
    const result = engine.analyze(filesToAnalyze);
    // Apply diff-scoped provenance classification (Phase 2)
    const { violations, legacyDebtCount, newViolationCount } = hasDiffLineData && !strictMode
        ? (0, diff_line_provenance_1.applyDiffScopedProvenance)(result.violations, modifiedLineIndex, false)
        : { violations: result.violations, legacyDebtCount: 0, newViolationCount: result.violations.length };
    for (const path of result.skippedFiles) {
        filesSkipped.push({ path, reasonCode: 'rule_execution_failed' });
    }
    // Unsupported languages are outside this structural engine's applicability.
    // They remain visible in evidence, but do not make supported-file coverage partial.
    const coveragePosture = filesSkipped.length > 0
        ? 'partial'
        : 'complete';
    return {
        violations,
        rulesApplied: result.rulesApplied,
        suppressedCount: result.suppressedCount,
        newViolationCount,
        legacyDebtCount,
        diffScopedEnforcement: hasDiffLineData && !strictMode,
        filesRequested: requestedPaths.length,
        filesAnalyzed: Math.max(0, result.filesAnalyzed - result.skippedFiles.length),
        filesSkipped,
        filesUnsupported,
        coveragePosture,
    };
}
//# sourceMappingURL=structural-on-diff.js.map