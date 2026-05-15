/**
 * Pipeline stage definitions — public re-exports.
 *
 * Each stage is a behavior-preserving wrapper around an existing verify.ts
 * code region. The wrappers add stage lineage, deterministic fingerprinting,
 * timing metrics, dependency declarations, and failure-isolation policy.
 *
 * STAGE-EXTRACTION STATUS (this phase):
 *   - diff-normalization      ✓ wrapper + wired in verify.ts
 *   - policy-lock             ✓ wrapper (wire-in deferred to next phase)
 *   - compiled-policy         ✓ wrapper (wire-in deferred to next phase)
 *   - structural-analysis     ✓ wrapper (wire-in deferred to next phase)
 *   - runtime-guard           ✓ wrapper (wire-in deferred to next phase)
 *   - governance-synthesis    ✓ wrapper + wired in verify.ts
 *
 * REMAINING STAGES (designed but not yet implemented):
 *   plan-sync, policy-exceptions, intent-evaluation, semantic-analysis,
 *   policy-evaluation, suppression-evaluation, advisory-signals,
 *   change-contract, ai-debt-budget, provenance-generation,
 *   replay-integrity, remediation-export-preparation, evidence-generation,
 *   telemetry-harvest, ci-shaping, output-rendering.
 */
export { compiledPolicyStage, type CompiledPolicyInput, type CompiledPolicyOutput, } from './compiled-policy-stage';
export { diffNormalizationStage, computeDiffNormalization, type DiffMode, type DiffNormalizationInput, type DiffNormalizationOutput, } from './diff-normalization-stage';
export { governanceSynthesisStage, synthesizeGovernance, type GovernanceSynthesisInput, type GovernanceSynthesisOutput, } from './governance-synthesis-stage';
export { policyLockStage, type PolicyLockInput, type PolicyLockOutput, } from './policy-lock-stage';
export { runtimeGuardStage, type RuntimeGuardInput, type RuntimeGuardOutput, } from './runtime-guard-stage';
export { structuralAnalysisStage, type StructuralAnalysisInput, type StructuralAnalysisOutput, } from './structural-analysis-stage';
//# sourceMappingURL=index.d.ts.map