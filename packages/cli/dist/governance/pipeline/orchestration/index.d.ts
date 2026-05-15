/**
 * Pipeline orchestration extractions — public re-exports.
 *
 * Each module in this directory is a typed, replay-aware extraction of an
 * orchestration region previously inlined in `commands/verify.ts`. The goal
 * is to reduce orchestration concentration in verify.ts while preserving
 * byte-for-byte semantics (replay checksum, finding identity, JSON shape).
 */
export { runAdvisoryMode, type AdvisoryChangeContractSummary, type AdvisoryModeInput, type AdvisoryModeResult, } from './advisory-mode';
export { buildMinimalAdvisoryContractFromDiff, } from './advisory-mode-contract';
export { captureEvidencePayload, createEvidenceLifecycleState, emitCalibrationTelemetry, runEvidenceFinalize, setProvenanceRunId, type EvidenceFinalizeResult, type EvidenceLifecycleConfig, type EvidenceLifecycleState, } from './evidence-lifecycle';
export { runPlanStructuralAnalysis, type PlanStructuralAnalysisInput, type PlanStructuralAnalysisResult, } from './plan-structural-analysis';
export { runScopeGuardOrchestration, type ScopeGuardOrchestrationInput, type ScopeGuardOrchestrationResult, type ScopeGuardPlanClient, type ScopeGuardLocalPlan, type ScopeGuardSigningParams, type SessionResolutionNote, } from './scope-guard-orchestration';
export { buildPolicyEvaluationSummaries, type PolicyEvaluationSummariesInput, type PolicyEvaluationSummariesResult, type PolicyExceptionsSummary, type PolicyGovernanceSummary, type PolicyExceptionResolutionSummary, type ExceptionApprovalConfig, type GovernanceAuditConfig, type AuditIntegrityData, } from './policy-evaluation-summaries';
export { runIntentDriftOrchestration, type IntentDriftOrchestrationInput, type IntentDriftOrchestrationResult, } from './intent-drift-orchestration';
//# sourceMappingURL=index.d.ts.map