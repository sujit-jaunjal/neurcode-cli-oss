/**
 * Enterprise First-Value Proof V1.
 *
 * A source-free proof object shared by CLI, API, and dashboard. It records only
 * coarse activation/proof state, repository labels or hashes, counts/statuses,
 * and next commands. It must never carry source, prompts, diffs, raw args,
 * absolute paths, secrets, or raw request bodies.
 */
export declare const FIRST_VALUE_PROOF_SCHEMA_VERSION: "neurcode.first-value-proof.v1";
export declare const FIRST_VALUE_ACTIVATION_PROOF_SCHEMA_VERSION: "neurcode.first-value-activation-proof.v1";
export declare const FIRST_VALUE_STEP_IDS: readonly ["login", "repo_connect", "brain_index", "agent_setup", "governed_check", "evidence_view", "repo_intelligence_sync"];
export type FirstValueStepId = (typeof FIRST_VALUE_STEP_IDS)[number];
export type FirstValueBrainStatus = 'missing' | 'stale' | 'fresh' | 'not_evaluated';
export type FirstValueRuntimeStatus = 'not_configured' | 'configured' | 'governed_check_seen' | 'block_seen' | 'approval_seen';
export type FirstValueEvidenceStatus = 'none' | 'synced' | 'viewed';
export type FirstValueRepoIntelligenceStatus = 'none' | 'synced' | 'not_evaluated';
export type FirstValuePrivacyStatus = 'source_uploaded_false';
export type FirstValueRepoConnectionStatus = 'missing' | 'cloud_proof_synced' | 'cloud_project_owned' | 'cloud_runtime_repo_owned' | 'local_proof_queued' | 'stale_local_config';
export type FirstValueRepoConnectionSource = 'none' | 'activation_proof' | 'project' | 'runtime_repo' | 'local_config';
export declare const FIRST_VALUE_ACTIVATION_PROOF_STAGES: readonly ["repo_connect", "brain_index", "agent_setup", "governed_check", "evidence_view", "repo_intelligence_sync"];
export type FirstValueActivationProofStage = (typeof FIRST_VALUE_ACTIVATION_PROOF_STAGES)[number];
export interface FirstValueProofStep {
    id: FirstValueStepId;
    label: string;
    complete: boolean;
    recommendedCommand: string;
    expectedOutcome: string;
}
export interface FirstValueProof {
    schemaVersion: typeof FIRST_VALUE_PROOF_SCHEMA_VERSION;
    proofId: string;
    generatedAt: string;
    workspaceId: string | null;
    repo: {
        label: string | null;
        hash: string | null;
    };
    repoConnection: {
        status: FirstValueRepoConnectionStatus;
        source: FirstValueRepoConnectionSource;
        cloudProofSyncedAt: string | null;
        proofQueued: boolean;
        projectId: string | null;
        repoId: string | null;
    };
    brainStatus: FirstValueBrainStatus;
    runtimeStatus: FirstValueRuntimeStatus;
    evidenceStatus: FirstValueEvidenceStatus;
    repoIntelligenceStatus: FirstValueRepoIntelligenceStatus;
    privacyStatus: FirstValuePrivacyStatus;
    missingSteps: FirstValueStepId[];
    nextRecommendedCommand: string;
    steps: FirstValueProofStep[];
    limitations: string[];
}
export interface FirstValueState {
    schemaVersion: typeof FIRST_VALUE_PROOF_SCHEMA_VERSION;
    proof: FirstValueProof;
    alreadyProven: FirstValueStepId[];
    generatedAt: string;
    privacy: {
        sourceUploaded: false;
        commandArgumentsStored: false;
        machinePathsStored: false;
        sourceFree: true;
    };
}
export interface FirstValueProofSignals {
    generatedAt?: string;
    workspaceId?: string | null;
    repoLabel?: string | null;
    repoHash?: string | null;
    projectId?: string | null;
    repoId?: string | null;
    repoConnectionStatus?: FirstValueRepoConnectionStatus;
    repoConnectionSource?: FirstValueRepoConnectionSource;
    repoProofSyncedAt?: string | null;
    repoProofQueued?: boolean;
    loggedIn?: boolean;
    repoConnected?: boolean;
    brainStatus?: FirstValueBrainStatus;
    agentConfigured?: boolean;
    governedCheckSeen?: boolean;
    blockSeen?: boolean;
    approvalSeen?: boolean;
    evidenceSynced?: boolean;
    evidenceViewed?: boolean;
    repoIntelligenceSynced?: boolean;
    repoIntelligenceNotEvaluated?: boolean;
}
export interface FirstValueActivationProofLocalPosture {
    repoConfigPresent?: boolean;
    runtimeConfigured?: boolean;
    brainIndexed?: boolean;
    hostDetected?: boolean;
    hostConfigured?: boolean;
    hostAuthenticated?: boolean;
    automaticPreWriteInterception?: boolean;
    evidenceQueued?: boolean;
    telemetryQueued?: boolean;
}
export interface FirstValueActivationProofPayload {
    schemaVersion: typeof FIRST_VALUE_ACTIVATION_PROOF_SCHEMA_VERSION;
    eventId: string;
    installId: string;
    cliVersion?: string | null;
    commandFamily?: string | null;
    stage: FirstValueActivationProofStage;
    reasonCode?: string | null;
    timestamp: string;
    success: boolean;
    projectId?: string | null;
    repoId?: string | null;
    repoKeyHash?: string | null;
    repoLabel?: string | null;
    agentTarget?: string | null;
    localPosture?: FirstValueActivationProofLocalPosture | null;
}
export interface FirstValueActivationProofValidationResult {
    ok: boolean;
    proof?: FirstValueActivationProofPayload;
    errors: string[];
}
export declare const FIRST_VALUE_FORBIDDEN_FIELDS: readonly ["source", "sourceCode", "code", "prompt", "prompts", "diff", "patch", "secret", "secrets", "token", "accessToken", "authorization", "password", "absolutePath", "path", "rawPath", "filePath", "rawArgs", "args", "argv", "databaseUrl", "connectionString", "repoContents", "rawIp", "ip", "body", "content"];
export declare function firstValueNextCommand(step: FirstValueStepId): string;
export declare function buildFirstValueProof(input: FirstValueProofSignals): FirstValueProof;
export declare function buildFirstValueState(input: FirstValueProofSignals): FirstValueState;
export declare function validateFirstValueSourceFreeInput(input: unknown): {
    ok: boolean;
    errors: string[];
};
export declare function validateFirstValueActivationProofPayload(input: unknown): FirstValueActivationProofValidationResult;
export declare function assertFirstValueActivationProofPayload(input: unknown): FirstValueActivationProofPayload;
export * from './local';
//# sourceMappingURL=index.d.ts.map