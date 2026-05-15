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
import type { DiffFile } from '@neurcode-ai/diff-parser';
import { type StructuralOnDiffResult } from '../../structural-on-diff';
import type { GovernancePipelineStage } from '../types';
export interface StructuralAnalysisInput {
    projectRoot: string;
    diffFiles: DiffFile[];
    strictFullFile?: boolean;
}
export type StructuralAnalysisOutput = StructuralOnDiffResult;
export declare const structuralAnalysisStage: GovernancePipelineStage<StructuralAnalysisInput, StructuralAnalysisOutput>;
//# sourceMappingURL=structural-analysis-stage.d.ts.map