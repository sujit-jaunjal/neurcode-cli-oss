/**
 * Canonical account-to-first-evidence activation journey.
 *
 * This read model is intentionally evidence-derived. Clients may select an
 * agent or repository, but they cannot mark a stage complete. Completion is
 * built from durable account, credential, repository, Brain, runtime-session,
 * and evidence facts owned by the API.
 */
export declare const ACTIVATION_JOURNEY_SCHEMA_VERSION: "neurcode.activation-journey.v1";
export declare const ACTIVATION_JOURNEY_STAGE_IDS: readonly ["account_onboarded", "cli_authenticated", "agent_selected", "repository_connected", "brain_ready", "runtime_active", "first_governed_session", "evidence_available"];
export type ActivationJourneyStageId = (typeof ACTIVATION_JOURNEY_STAGE_IDS)[number];
export type ActivationJourneyStageStatus = 'complete' | 'current' | 'blocked' | 'pending';
export type ActivationJourneyWorkspaceKind = 'personal' | 'organization';
export type ActivationJourneyAgent = 'claude' | 'cursor' | 'codex' | 'copilot' | 'vscode' | 'action';
export type ActivationJourneyRepositoryKind = 'project' | 'runtime_repo';
export type ActivationJourneySessionStatus = 'not_started' | 'active' | 'finished_pending_evidence' | 'evidence_available';
export interface ActivationJourneyRepositoryCandidate {
    kind: ActivationJourneyRepositoryKind;
    id: string;
    projectId: string | null;
    repoId: string | null;
    label: string;
    lastActivityAt: string | null;
}
export interface ActivationJourneyEvidence {
    authority: 'account_onboarding' | 'cli_credential' | 'activation_event' | 'account_profile' | 'repository_ownership' | 'activation_proof' | 'runtime_session' | 'runtime_evidence';
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
export interface ActivationJourney {
    schemaVersion: typeof ACTIVATION_JOURNEY_SCHEMA_VERSION;
    generatedAt: string;
    workspace: {
        id: string;
        kind: ActivationJourneyWorkspaceKind;
        role: string;
    };
    selectedAgent: ActivationJourneyAgent | null;
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
    accountOnboarded?: ActivationJourneyStageSignal;
    cliAuthenticated?: ActivationJourneyStageSignal;
    agentSelected?: ActivationJourneyStageSignal;
    repositoryConnected?: ActivationJourneyStageSignal;
    brainReady?: ActivationJourneyStageSignal;
    runtimeActive?: ActivationJourneyStageSignal;
    firstGovernedSession?: ActivationJourneyStageSignal;
    evidenceAvailable?: ActivationJourneyStageSignal;
    summary?: Partial<ActivationJourneyWorkspaceSummary>;
}
export declare function activationSessionCommand(agent: ActivationJourneyAgent | null): string;
export declare function buildActivationJourney(input: ActivationJourneySignals): ActivationJourney;
//# sourceMappingURL=index.d.ts.map