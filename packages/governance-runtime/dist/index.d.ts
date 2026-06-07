export type PlanVerdict = 'PASS' | 'FAIL' | 'WARN';
export { buildRepoGovernanceProfile, checkFileBoundary, DEFAULT_PLAN_COHERENCE_MODE, ownersForPath, type RepoGovernanceProfile, type ProfileInput, type RuntimeGovernanceConfig, type PlanCoherenceMode, type SensitiveBoundary, type OwnershipBoundary, type BoundaryCheckInput, type BoundaryCheckResult, type BoundaryVerdict, type ReadinessStatus, } from './profile';
export { createSession, loadActiveSession, loadSession, appendEvent, approveSession, revokeSessionApproval, activeApprovalPaths, expireSessionApprovals, expireArchitectureObligationWaivers, waiveArchitectureObligation, refreshArchitectureObligations, evaluateIntentCoherence, evaluatePlanCoherencePolicy, attachAgentPlan, captureAgentPlan, amendAgentPlan, decideAgentPlanAmendment, classifyAgentPlanAmendment, evaluateSessionPlanCoherence, activeAgentPlanRevision, buildPlanTimeline, finishSession, replaySession, sessionsDir, sessionPath, type GovernanceSession, type SessionContract, type SessionEvent, type EventType, type ApprovalResult, type ApprovalGrant, type ApprovalOptions, type ApprovalRevocationOptions, type ApprovalRevocationResult, type ApprovalSource, type FinishSessionOptions, type UnresolvedApprovalBlock, type ArchitectureObligationWaiverOptions, type ArchitectureObligationWaiverResult, type AgentPlanAmendmentAction, type AgentPlanAmendmentActor, type AgentPlanAmendmentDecision, type AgentPlanAmendmentDecisionInput, type AgentPlanAmendmentDecisionResult, type AgentPlanAmendmentInput, type AgentPlanAmendmentProposal, type AgentPlanAmendmentProposalStatus, type AgentPlanAmendmentResult, type AgentPlanAmendmentRisk, type AgentPlanAmendmentRiskLevel, type AgentPlanCaptureResult, type AgentPlanRevision, type AgentPlanRevisionKind, type IntentCoherenceResult, type IntentCoherenceVerdict, type IntentConfidence, type IntentContract, type IntentObligation, type IntentPrimaryAction, type PlanCoherencePolicyAction, type PlanCoherencePolicyDecision, type PlanTimeline, type PlanTimelineEntry, type PlanTimelineEntryKind, } from './session';
export { AI_CHANGE_RECORD_SCHEMA_VERSION, AI_CHANGE_RECORD_TYPE, aiChangeRecordPath, buildAIChangeRecord, writeAIChangeRecord, type AIChangeRecord, type AIChangeRecordApprovalEntry, type AIChangeRecordPathTrajectory, type AIChangeRecordPlanTimelineEntry, type AIChangeRecordStructuralUnderstanding, } from './ai-change-record';
export { AGENT_INVOCATION_OBSERVABILITY_SCHEMA_VERSION, buildAgentInvocationSummary, type AgentInvocationCheckStatus, type AgentInvocationProtocolCheck, type AgentInvocationStatus, type AgentInvocationSummary, } from './agent-invocation-observability';
export { AGENT_GUARD_POSTURE_SCHEMA_VERSION, buildAgentGuardPostureSummary, type AgentGuardFileClassification, type AgentGuardPostureFile, type AgentGuardPostureStatus, type AgentGuardPostureSummary, } from './agent-guard-posture';
export { ARCHITECTURE_OBLIGATION_SCHEMA_VERSION, DEFAULT_ARCHITECTURE_OBLIGATION_POLICY, activeArchitectureObligationWaivers, deriveArchitectureObligations, effectiveArchitectureObligationMode, evaluateArchitectureObligationFeedback, planDeclaredApprovalRequiredPaths, evaluateArchitectureEdit, isArchitectureObligationWaiverActive, normalizeArchitectureObligationPolicy, summarizeArchitectureObligations, type ArchitectureObligation, type ArchitectureObligationCategory, type ArchitectureObligationEvidence, type ArchitectureObligationEvidenceKind, type ArchitectureObligationFeedback, type ArchitectureObligationIntent, type ArchitectureObligationPolicy, type ArchitectureObligationPolicyMode, type ArchitectureObligationSeverity, type ArchitectureObligationStatus, type ArchitectureObligationSummary, type ArchitectureObligationWaiver, type ArchitectureObligationWaiverEvidence, type ArchitectureObligationWaiverSource, type DeriveArchitectureObligationsInput, type RuntimeEditEvaluation, type RuntimeEditOption, type RuntimeEditStatus, } from './architecture-obligations';
export { ARCHITECTURE_GRAPH_SCHEMA_VERSION, buildArchitectureGraph, dependenciesOf, dependentsOf, deriveGraphObligationSeeds, extractImportSpecifiers, findModuleForPath, isModuleTestSatisfiable, moduleIdForPath, modulesInPlay, resolveImportSpecifier, type ArchitectureDependencyEdge, type ArchitectureGraphStats, type ArchitectureModule, type ArchitectureSurfaceKind, type BuildArchitectureGraphInput, type GraphObligationSeed, type ModuleImportRecord, type RepoArchitectureGraph, } from './architecture-graph';
export { compileDeterministicConstraints, type DeterministicConstraintCompilation, type DeterministicConstraintCompilationInput, type DeterministicConstraintRule, type DeterministicConstraintSource, } from './constraints';
export { buildCoverageManifest, computeCoverageSetHash, computeDeltaHash, deriveCoverageEntries, normalizeDeltaEntries, readSelfAttestedAdmissionRecord, readSelfAttestedAdmissionRecordFromText, sortCoverageEntries, sortDeltaEntries, unionCoverageEntries, unionCoverageManifests, validateSelfAttestedRecordConsistency, type BuildCoverageManifestInput, type GovernanceClassificationInput, type GovernanceClassificationMap, type RawDeltaInput, } from './admission-provenance';
export { AGENT_PLAN_SCHEMA_VERSION, extractAgentPlan, extractExpectedTargetsFromText, parsePlanSteps, evaluatePlanCoherence, planImpliesSupportWork, isTestOrUtilityPath, sanitizeAgentPlan, sanitizePlanCoherence, type AgentPlan, type AgentPlanSource, type AgentPlanConfidence, type PlanCoherenceResult, type PlanCoherenceVerdict, type PlanCoherenceInput, type ExtractAgentPlanOptions, } from './agent-plan';
export { AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION, AGENT_RUNTIME_DECISION_SCHEMA_VERSION, getAgentRuntimeAdapterCapability, listAgentRuntimeAdapterCapabilities, normalizeAgentRuntimeEvent, type AgentRuntimeAdapterCapability, type AgentRuntimeAdapterId, type AgentRuntimeDecision, type AgentRuntimeDecisionEnvelope, type AgentRuntimeEnforcementLevel, type AgentRuntimeEvent, type AgentRuntimeEventPayload, type AgentRuntimeEventType, } from './agent-runtime-adapter';
import { type DeterministicConstraintRule } from './constraints';
export interface PlanFileScopeItem {
    path: string;
    action: string;
}
export interface PlanDiffLine {
    type: 'context' | 'added' | 'removed';
    content: string;
    lineNumber?: number;
}
export interface PlanDiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: PlanDiffLine[];
}
export interface PlanDiffFile {
    path: string;
    oldPath?: string;
    changeType: 'add' | 'delete' | 'modify' | 'rename';
    added: number;
    removed: number;
    hunks?: PlanDiffHunk[];
}
export interface PlanDiffStats {
    totalAdded: number;
    totalRemoved: number;
    totalFiles: number;
}
export interface PlanVerificationInput {
    planFiles: PlanFileScopeItem[];
    changedFiles: PlanDiffFile[];
    diffStats?: PlanDiffStats;
    intentConstraints?: string;
    policyRules?: string[];
    extraConstraintRules?: DeterministicConstraintRule[];
    fileContents?: Record<string, string>;
}
export interface PlanDiffSummary {
    added: number;
    removed: number;
    files: Array<{
        path: string;
        oldPath?: string;
        changeType: string;
        added: number;
        removed: number;
        hunks: PlanDiffHunk[];
    }>;
    bloatFiles: string[];
    plannedFilesModified: number;
    totalPlannedFiles: number;
}
export interface PlanVerificationResult {
    adherenceScore: number;
    bloatCount: number;
    bloatFiles: string[];
    plannedFilesModified: number;
    totalPlannedFiles: number;
    scopeGuardPassed: boolean;
    constraintViolations: string[];
    verdict: PlanVerdict;
    diffSummary: PlanDiffSummary;
    message: string;
}
export declare function extractPlannedFilePaths(planFiles: PlanFileScopeItem[]): string[];
export declare function resolvePlanVerdict(input: {
    bloatCount: number;
    adherenceScore: number;
    totalPlannedFiles: number;
    plannedFilesModified: number;
    constraintViolations: string[];
}): PlanVerdict;
export declare function buildPlanVerificationMessage(result: Pick<PlanVerificationResult, 'constraintViolations' | 'totalPlannedFiles' | 'plannedFilesModified' | 'verdict' | 'adherenceScore' | 'bloatCount'>): string;
export declare function evaluatePlanVerification(input: PlanVerificationInput): PlanVerificationResult;
//# sourceMappingURL=index.d.ts.map