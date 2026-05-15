"use strict";
/**
 * Plan-Mode Structural Analysis Orchestration
 * --------------------------------------------
 * Extracts the inline structural-engine invocation previously at
 * `commands/verify.ts:4416–4440`. Unlike `structuralAnalysisStage` which
 * wraps `runStructuralOnDiffFiles`, the plan-mode invocation uses the
 * lower-level `StructuralRuleEngine.analyze()` API that requires explicit
 * file-content reads BEFORE analysis.
 *
 * SEMANTIC PRESERVATION:
 *   - file reads are isolated per-file with the same try/swallow pattern
 *   - the outer try/catch is preserved (engine failure must never abort
 *     verify; we return zero-violation defaults instead)
 *   - the returned shape matches the inline `let` updates exactly
 *
 * REPLAY:
 *   The order of file reads (the diffFiles iteration order) is preserved,
 *   and the StructuralRuleEngine output ordering is left untouched. The
 *   downstream canonical pipeline sorts by stable keys, so even if read
 *   order changed it would not affect replay checksums — but we preserve
 *   it as a defensive guarantee.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPlanStructuralAnalysis = runPlanStructuralAnalysis;
const fs_1 = require("fs");
const path_1 = require("path");
const structural_rules_1 = require("../../../structural-rules");
const EMPTY_RESULT = {
    violations: [],
    rulesApplied: [],
    suppressedCount: 0,
};
/**
 * Run the plan-mode structural engine. Replaces the inline block.
 * Returns a default zero-violation result on empty input or on engine fault
 * (preserving the original "non-fatal: structural engine errors must never
 * break verification" invariant).
 */
function runPlanStructuralAnalysis(input) {
    if (input.diffFiles.length === 0) {
        return { ...EMPTY_RESULT };
    }
    try {
        const structuralEngine = (0, structural_rules_1.createDefaultStructuralRuleEngine)();
        const filesToAnalyze = [];
        for (const df of input.diffFiles) {
            const absPath = (0, path_1.join)(input.projectRoot, df.path);
            if ((0, fs_1.existsSync)(absPath)) {
                try {
                    const sourceText = (0, fs_1.readFileSync)(absPath, 'utf-8');
                    filesToAnalyze.push({ filePath: df.path, sourceText });
                }
                catch {
                    // Skip unreadable files (preserved invariant).
                }
            }
        }
        if (filesToAnalyze.length === 0) {
            return { ...EMPTY_RESULT };
        }
        const structuralResult = structuralEngine.analyze(filesToAnalyze);
        return {
            violations: structuralResult.violations,
            rulesApplied: structuralResult.rulesApplied,
            suppressedCount: structuralResult.suppressedCount,
        };
    }
    catch {
        // Non-fatal: structural engine errors must never break verification.
        return { ...EMPTY_RESULT };
    }
}
//# sourceMappingURL=plan-structural-analysis.js.map