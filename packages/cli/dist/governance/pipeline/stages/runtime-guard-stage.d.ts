/**
 * Runtime Guard Stage
 * -------------------
 * Validates the runtime guard artifact against the actual diff. Pure wrapper
 * around `readRuntimeGuardArtifact` + `evaluateRuntimeGuardArtifact` from
 * `utils/runtime-guard`.
 *
 * SEMANTIC PRESERVATION:
 *   The `RuntimeGuardEvaluation` returned here is byte-identical to what
 *   verify.ts produces inline. This stage adds lineage + fingerprinting only.
 */
import type { DiffFile } from '@neurcode-ai/diff-parser';
import { type RuntimeGuardArtifact, type RuntimeGuardEvaluation } from '../../../utils/runtime-guard';
import type { GovernancePipelineStage } from '../types';
export interface RuntimeGuardInput {
    projectRoot: string;
    guardPath?: string;
    diffFiles: DiffFile[];
    fileContents?: Record<string, string>;
}
export interface RuntimeGuardOutput {
    path: string;
    exists: boolean;
    artifact: RuntimeGuardArtifact | null;
    error?: string;
    evaluation: RuntimeGuardEvaluation | null;
}
export declare const runtimeGuardStage: GovernancePipelineStage<RuntimeGuardInput, RuntimeGuardOutput>;
//# sourceMappingURL=runtime-guard-stage.d.ts.map