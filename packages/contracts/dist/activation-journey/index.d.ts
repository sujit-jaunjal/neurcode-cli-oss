/**
 * Canonical account-to-verified-evidence activation journey V2.
 *
 * Clients may choose a workspace, a locally paired repository, and a host.
 * They cannot mark any stage complete. Every completion is derived from
 * durable backend authority scoped to user + workspace + repository + host.
 */
export declare const ACTIVATION_JOURNEY_SCHEMA_VERSION: "neurcode.activation-journey.v2";
export declare const ACTIVATION_JOURNEY_STAGE_IDS: readonly ["account_ready", "workspace_selected", "local_repo_paired", "host_selected", "host_configured", "brain_proof_synced", "session_runtime_active", "first_governed_action_observed", "evidence_verified"];
export type ActivationJourneyStageId = (typeof ACTIVATION_JOURNEY_STAGE_IDS)[number];
export type ActivationJourneyStageStatus = 'complete' | 'current' | 'blocked' | 'pending';
export type ActivationJourneyWorkspaceKind = 'personal' | 'organization';
export type ActivationJourneyAgent = 'claude' | 'cursor' | 'codex' | 'copilot' | 'vscode' | 'action';
export type ActivationJourneyRepositoryKind = 'project' | 'runtime_repo';
export type ActivationJourneySessionStatus = 'not_started' | 'active' | 'finished_pending_evidence' | 'evidence_available';
export type ActivationBrainProofStatus = 'unavailable' | 'uploaded' | 'verified' | 'stale' | 'failed';
export type ActivationBrainLocalStatus = 'not_observed' | 'indexing' | 'fresh' | 'partial' | 'stale' | 'failed';
export interface ActivationJourneyBrainState {
    proofStatus: ActivationBrainProofStatus;
    localStatus: ActivationBrainLocalStatus;
    uploadedAt: string | null;
    verifiedAt: string | null;
    reason: string;
    repairCommand: string;
}
export type ActivationHostAutomaticInterception = 'complete_prewrite_boundary' | 'supported_tool_prewrite_guardrail' | 'host_dependent_prewrite_hook' | 'cooperative_prewrite' | 'post_write_observation' | 'ci_backstop';
export type ActivationHostEvidenceLevel = 'host_enforced' | 'host_guardrail' | 'host_dependent' | 'cooperative' | 'observed' | 'post_change';
export interface ActivationHostCapabilityProfile {
    id: ActivationJourneyAgent;
    label: string;
    adapter: string;
    automaticPreWriteInterception: boolean;
    interception: ActivationHostAutomaticInterception;
    governedAction: string;
    evidenceLevel: ActivationHostEvidenceLevel;
    limitation: string;
    setupCommand: string;
    repairCommand: string;
}
export declare function getActivationHostCapability(agent: ActivationJourneyAgent): ActivationHostCapabilityProfile;
export declare function listActivationHostCapabilities(): ActivationHostCapabilityProfile[];
export interface ActivationJourneyRepositoryCandidate {
    kind: ActivationJourneyRepositoryKind;
    id: string;
    projectId: string | null;
    repoId: string | null;
    label: string;
    branch: string | null;
    connectionStatus: 'connected' | 'disconnected';
    pairingAuthority: 'activation_proof' | 'runtime_pairing';
    lastActivityAt: string | null;
}
export interface ActivationJourneyEvidence {
    authority: 'account_onboarding' | 'workspace_membership' | 'cli_credential' | 'activation_selection' | 'activation_proof' | 'runtime_pairing' | 'runtime_session' | 'runtime_action' | 'backend_receipt';
    observedAt: string;
    detail: string;
}
export interface ActivationJourneyStage {
    id: ActivationJourneyStageId;
    label: string;
    description: string;
    status: ActivationJourneyStageStatus;
    complete: boolean;
    completedAt: string | null;
    evidence: ActivationJourneyEvidence | null;
}
export interface ActivationJourneyNextAction {
    stage: ActivationJourneyStageId | 'complete';
    surface: 'web' | 'cli' | 'hybrid';
    label: string;
    reason: string;
    command: string | null;
    href: string | null;
}
export interface ActivationJourneyWorkspaceSummary {
    memberCount: number;
    repositoryCount: number;
    cliConnectedMemberCount: number;
    activeMemberCount: number;
    governedSessionCount: number;
    evidenceRecordCount: number;
    pendingApprovalCount: number;
}
export interface ActivationJourneyHostState {
    id: ActivationJourneyAgent | null;
    capability: ActivationHostCapabilityProfile | null;
    detected: boolean;
    selected: boolean;
    configured: boolean;
    authenticated: boolean;
    active: boolean;
    failureReason: string | null;
    repairCommand: string | null;
}
export interface ActivationJourney {
    schemaVersion: typeof ACTIVATION_JOURNEY_SCHEMA_VERSION;
    generatedAt: string;
    workspace: {
        id: string;
        kind: ActivationJourneyWorkspaceKind;
        role: string;
        cliAuthenticated: boolean;
    };
    selectedAgent: ActivationJourneyAgent | null;
    host: ActivationJourneyHostState;
    brain: ActivationJourneyBrainState;
    repository: {
        selected: ActivationJourneyRepositoryCandidate | null;
        candidates: ActivationJourneyRepositoryCandidate[];
        selectionRequired: boolean;
    };
    session: {
        status: ActivationJourneySessionStatus;
        startedAt: string | null;
        finishedAt: string | null;
    };
    stages: ActivationJourneyStage[];
    currentStage: ActivationJourneyStageId | null;
    progress: number;
    total: number;
    firstValueReached: boolean;
    nextAction: ActivationJourneyNextAction;
    summary: ActivationJourneyWorkspaceSummary;
    outcome: {
        verified: boolean;
        headline: string;
        detail: string;
    };
    privacy: {
        sourceUploaded: false;
        promptsStored: false;
        diffsStored: false;
        machinePathsStored: false;
        evidenceDerived: true;
    };
    limitations: string[];
}
export interface ActivationJourneyStageSignal {
    completedAt?: string | null;
    evidence?: ActivationJourneyEvidence | null;
}
export interface ActivationJourneySignals {
    generatedAt?: string;
    workspace: ActivationJourney['workspace'];
    selectedAgent?: ActivationJourneyAgent | null;
    selectedRepository?: ActivationJourneyRepositoryCandidate | null;
    repositoryCandidates?: ActivationJourneyRepositoryCandidate[];
    sessionStatus?: ActivationJourneySessionStatus;
    sessionStartedAt?: string | null;
    sessionFinishedAt?: string | null;
    accountReady?: ActivationJourneyStageSignal;
    workspaceSelected?: ActivationJourneyStageSignal;
    localRepoPaired?: ActivationJourneyStageSignal;
    hostSelected?: ActivationJourneyStageSignal;
    hostConfigured?: ActivationJourneyStageSignal;
    brainProofSynced?: ActivationJourneyStageSignal;
    sessionRuntimeActive?: ActivationJourneyStageSignal;
    firstGovernedActionObserved?: ActivationJourneyStageSignal;
    evidenceVerified?: ActivationJourneyStageSignal;
    hostFacts?: Partial<Pick<ActivationJourneyHostState, 'detected' | 'configured' | 'authenticated' | 'active' | 'failureReason'>>;
    brain?: Partial<ActivationJourneyBrainState>;
    summary?: Partial<ActivationJourneyWorkspaceSummary>;
}
export declare function activationSessionCommand(agent: ActivationJourneyAgent | null): string;
export declare function buildActivationJourney(input: ActivationJourneySignals): ActivationJourney;
//# sourceMappingURL=index.d.ts.map