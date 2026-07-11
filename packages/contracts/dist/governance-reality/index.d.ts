/**
 * Evidence-derived governance reality assessment.
 *
 * This is not a compliance certification and it never asserts that code is
 * safe or correct. It answers a narrower operational question: which Neurcode
 * governance capabilities have actually been observed for one repository?
 */
export declare const GOVERNANCE_REALITY_SCHEMA_VERSION: "neurcode.governance-reality.v1";
export declare const GOVERNANCE_REALITY_CAPABILITY_IDS: readonly ["repository_context", "brain_intelligence", "agent_integration", "safe_change_governed", "protected_boundary_enforced", "exact_path_containment", "session_integrity", "evidence_delivery", "replay_integrity"];
export type GovernanceRealityCapabilityId = (typeof GOVERNANCE_REALITY_CAPABILITY_IDS)[number];
export type GovernanceRealityCapabilityStatus = 'proven' | 'partial' | 'failed' | 'not_evaluated';
export type GovernanceRealityPosture = 'not_started' | 'in_progress' | 'attention_required' | 'review_ready';
export type GovernanceRealityAuthority = 'repository_ownership' | 'runtime_manifest' | 'repo_brain' | 'governed_session' | 'boundary_event' | 'approval_decision' | 'evidence_record' | 'replay_hash';
export interface GovernanceRealityEvidenceRef {
    authority: GovernanceRealityAuthority;
    observedAt: string;
    detail: string;
    sessionId: string | null;
    href: string | null;
}
export interface GovernanceRealityCapability {
    id: GovernanceRealityCapabilityId;
    label: string;
    question: string;
    status: GovernanceRealityCapabilityStatus;
    summary: string;
    evidence: GovernanceRealityEvidenceRef[];
    limitations: string[];
    recovery: {
        label: string;
        command: string | null;
        href: string | null;
    } | null;
}
export interface GovernanceRealityAssessment {
    schemaVersion: typeof GOVERNANCE_REALITY_SCHEMA_VERSION;
    generatedAt: string;
    scope: {
        workspaceId: string | null;
        workspaceKind: 'personal' | 'organization' | 'local';
        repoId: string | null;
        repoLabel: string;
        agent: string | null;
    };
    posture: GovernanceRealityPosture;
    score: {
        proven: number;
        partial: number;
        failed: number;
        notEvaluated: number;
        total: number;
        percent: number;
    };
    capabilities: GovernanceRealityCapability[];
    nextAction: {
        capabilityId: GovernanceRealityCapabilityId | null;
        label: string;
        reason: string;
        command: string | null;
        href: string | null;
    };
    claims: {
        operationalEvidenceOnly: true;
        complianceCertification: false;
        codeSafetyGuaranteed: false;
        sourceReviewedByCloud: false;
    };
    privacy: {
        sourceUploaded: false;
        promptsStored: false;
        diffsStored: false;
        machinePathsStored: false;
    };
}
export interface GovernanceRealitySignal {
    status: GovernanceRealityCapabilityStatus;
    evidence?: GovernanceRealityEvidenceRef[];
    limitations?: string[];
}
export interface GovernanceRealitySignals {
    generatedAt?: string;
    workspaceId?: string | null;
    workspaceKind: GovernanceRealityAssessment['scope']['workspaceKind'];
    repoId?: string | null;
    repoLabel: string;
    agent?: string | null;
    repositoryContext: GovernanceRealitySignal;
    brainIntelligence: GovernanceRealitySignal;
    agentIntegration: GovernanceRealitySignal;
    safeChangeGoverned: GovernanceRealitySignal;
    protectedBoundaryEnforced: GovernanceRealitySignal;
    exactPathContainment: GovernanceRealitySignal;
    sessionIntegrity: GovernanceRealitySignal;
    evidenceDelivery: GovernanceRealitySignal;
    replayIntegrity: GovernanceRealitySignal;
}
export declare function buildGovernanceRealityAssessment(signals: GovernanceRealitySignals): GovernanceRealityAssessment;
//# sourceMappingURL=index.d.ts.map