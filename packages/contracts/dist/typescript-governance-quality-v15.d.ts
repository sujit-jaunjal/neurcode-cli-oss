export declare const GOVERNANCE_CALIBRATION_V15_SCHEMA_VERSION: "neurcode.governance-calibration.v1.5";
export declare const GOVERNANCE_PREWRITE_V15_SCHEMA_VERSION: "neurcode.governance-prewrite.v1.5";
export type GovernanceDecisionV15 = 'allow' | 'block' | 'advisory' | 'unknown';
export type GovernanceAuthorityV15 = 'deterministic_structural_fact' | 'deterministic_semantic_fact' | 'advisory_evidence' | 'unknown' | 'approval_required_denial';
export type GovernancePreWriteReasonCodeV15 = 'deterministic_structural_block' | 'structural_protected_path' | 'exact_approval_current_context' | 'approval_required' | 'approval_context_mismatch' | 'approval_exact_path_mismatch' | 'semantic_slice_ready' | 'semantic_deadline_exceeded' | 'semantic_unavailable' | 'semantic_stale' | 'semantic_partial' | 'semantic_unsupported' | 'semantic_resource_constrained' | 'repository_changed' | 'host_authority_reduced' | 'missing_evidence_cannot_prove_absence';
export interface GovernanceEvidenceStateV15 {
    deterministicStructuralBlock?: boolean;
    structuralProtected: boolean;
    exactApprovalCurrentContext: boolean;
    approvalContextMismatch?: boolean;
    semanticState: 'ready' | 'deadline_exceeded' | 'unavailable' | 'stale' | 'partial' | 'unsupported' | 'resource_constrained';
    semanticRelevantPlanCoverage: number | null;
    repositoryChanged: boolean;
    graphId: string | null;
    graphGeneration: number | null;
    semanticSliceId: string | null;
}
export interface GovernancePreWriteDecisionV15 {
    schemaVersion: typeof GOVERNANCE_PREWRITE_V15_SCHEMA_VERSION;
    decision: GovernanceDecisionV15;
    permissionDecision: 'allow' | 'deny';
    authority: GovernanceAuthorityV15;
    reasonCodes: GovernancePreWriteReasonCodeV15[];
    rawHostProposal: GovernanceDecisionV15 | null;
    boundedNeurcodeDecision: GovernanceDecisionV15;
    deadlineMs: number;
    elapsedMs: number;
    evidenceObservedAt: string;
    provenance: {
        sourceFree: true;
        clientAuthorityTrusted: false;
        graphId: string | null;
        graphGeneration: number | null;
        semanticSliceId: string | null;
    };
}
export declare function boundGovernancePreWriteDecisionV15(input: {
    rawHostProposal: GovernanceDecisionV15 | null;
    evidence: GovernanceEvidenceStateV15;
    deadlineMs: number;
    elapsedMs: number;
    evidenceObservedAt?: string;
}): GovernancePreWriteDecisionV15;
//# sourceMappingURL=typescript-governance-quality-v15.d.ts.map