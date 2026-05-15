"use strict";
/**
 * Structural Analysis Stage
 * -------------------------
 * Runs the deterministic structural rule engine (SR/DS/PY rules) on the
 * diff files produced by `diff-normalization`. Pure wrapper around
 * `runStructuralOnDiffFiles` from `governance/structural-on-diff`.
 *
 * SEMANTIC PRESERVATION:
 *   The output `violations[]`, `rulesApplied[]`, `suppressedCount`,
 *   `newViolationCount`, `legacyDebtCount`, and `diffScopedEnforcement`
 *   fields are produced by `runStructuralOnDiffFiles` directly — verify.ts
 *   inline behavior is unchanged.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.structuralAnalysisStage = void 0;
const structural_on_diff_1 = require("../../structural-on-diff");
const fingerprint_1 = require("../fingerprint");
const types_1 = require("../types");
exports.structuralAnalysisStage = {
    id: 'structural-analysis',
    determinism: 'deterministic-structural',
    boundary: {
        ...types_1.STRICT_REQUIRED_BOUNDARY,
        dependencies: ['diff-normalization'],
    },
    description: 'Run deterministic structural rule engine (SR/DS/PY) on diff files; classify diff-scoped vs legacy debt.',
    execute(input) {
        return (0, structural_on_diff_1.runStructuralOnDiffFiles)(input.projectRoot, input.diffFiles, {
            strictFullFile: input.strictFullFile,
        });
    },
    fingerprintInput(input) {
        return (0, fingerprint_1.fingerprintStageSignal)({
            files: input.diffFiles.map(f => f.path).sort(),
            strictFullFile: input.strictFullFile ?? false,
        });
    },
    fingerprintOutput(output) {
        return (0, fingerprint_1.fingerprintStageSignal)({
            rulesApplied: [...output.rulesApplied].sort(),
            violationKeys: output.violations
                .map(v => `${v.ruleId}\x1e${v.filePath}\x1e${v.line}\x1e${v.column ?? 0}`)
                .sort(),
            newViolationCount: output.newViolationCount,
            legacyDebtCount: output.legacyDebtCount,
            suppressedCount: output.suppressedCount,
            diffScopedEnforcement: output.diffScopedEnforcement,
        });
    },
    inputItemCount(input) {
        return input.diffFiles.length;
    },
    outputItemCount(output) {
        return output.violations.length;
    },
};
//# sourceMappingURL=structural-analysis-stage.js.map