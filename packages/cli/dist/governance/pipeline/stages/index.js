"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.structuralAnalysisStage = exports.runtimeGuardStage = exports.policyLockStage = exports.synthesizeGovernance = exports.governanceSynthesisStage = exports.computeDiffNormalization = exports.diffNormalizationStage = exports.compiledPolicyStage = void 0;
var compiled_policy_stage_1 = require("./compiled-policy-stage");
Object.defineProperty(exports, "compiledPolicyStage", { enumerable: true, get: function () { return compiled_policy_stage_1.compiledPolicyStage; } });
var diff_normalization_stage_1 = require("./diff-normalization-stage");
Object.defineProperty(exports, "diffNormalizationStage", { enumerable: true, get: function () { return diff_normalization_stage_1.diffNormalizationStage; } });
Object.defineProperty(exports, "computeDiffNormalization", { enumerable: true, get: function () { return diff_normalization_stage_1.computeDiffNormalization; } });
var governance_synthesis_stage_1 = require("./governance-synthesis-stage");
Object.defineProperty(exports, "governanceSynthesisStage", { enumerable: true, get: function () { return governance_synthesis_stage_1.governanceSynthesisStage; } });
Object.defineProperty(exports, "synthesizeGovernance", { enumerable: true, get: function () { return governance_synthesis_stage_1.synthesizeGovernance; } });
var policy_lock_stage_1 = require("./policy-lock-stage");
Object.defineProperty(exports, "policyLockStage", { enumerable: true, get: function () { return policy_lock_stage_1.policyLockStage; } });
var runtime_guard_stage_1 = require("./runtime-guard-stage");
Object.defineProperty(exports, "runtimeGuardStage", { enumerable: true, get: function () { return runtime_guard_stage_1.runtimeGuardStage; } });
var structural_analysis_stage_1 = require("./structural-analysis-stage");
Object.defineProperty(exports, "structuralAnalysisStage", { enumerable: true, get: function () { return structural_analysis_stage_1.structuralAnalysisStage; } });
//# sourceMappingURL=index.js.map