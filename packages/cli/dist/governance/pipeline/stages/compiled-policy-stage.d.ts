/**
 * Compiled Policy Stage
 * ---------------------
 * Loads the compiled policy artifact (signed JSON) from disk, exposes its
 * fingerprint, and reports load/parse failures via stage status. Pure wrapper
 * around `readCompiledPolicyArtifact` from `utils/policy-compiler`.
 *
 * SEMANTIC PRESERVATION:
 *   The returned `artifact` and `error` fields are byte-identical to what
 *   `readCompiledPolicyArtifact` returns inline. Signature verification and
 *   strict-artifact-mode policy live in verify.ts — this stage only loads.
 */
import { type CompiledPolicyArtifact } from '../../../utils/policy-compiler';
import type { GovernancePipelineStage } from '../types';
export interface CompiledPolicyInput {
    projectRoot: string;
    /** Optional override path for the compiled artifact (CLI flag). */
    compiledPolicyPath?: string;
}
export interface CompiledPolicyOutput {
    path: string;
    exists: boolean;
    artifact: CompiledPolicyArtifact | null;
    error?: string;
    fingerprint: string | null;
}
export declare const compiledPolicyStage: GovernancePipelineStage<CompiledPolicyInput, CompiledPolicyOutput>;
//# sourceMappingURL=compiled-policy-stage.d.ts.map