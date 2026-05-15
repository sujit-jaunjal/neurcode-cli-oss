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
import { type StructuralViolation } from '../../../structural-rules';
import type { DiffFile } from '@neurcode-ai/diff-parser';
export interface PlanStructuralAnalysisInput {
    projectRoot: string;
    diffFiles: ReadonlyArray<DiffFile>;
}
export interface PlanStructuralAnalysisResult {
    violations: StructuralViolation[];
    rulesApplied: string[];
    suppressedCount: number;
}
/**
 * Run the plan-mode structural engine. Replaces the inline block.
 * Returns a default zero-violation result on empty input or on engine fault
 * (preserving the original "non-fatal: structural engine errors must never
 * break verification" invariant).
 */
export declare function runPlanStructuralAnalysis(input: PlanStructuralAnalysisInput): PlanStructuralAnalysisResult;
//# sourceMappingURL=plan-structural-analysis.d.ts.map