/**
 * Session Management Command
 *
 * Manages AI coding sessions - list, end, and view session status.
 *
 * Commands:
 * - neurcode session list    - List all sessions
 * - neurcode session end     - End the current or specified session
 * - neurcode session status  - Show status of current session
 */
import { type AgentPlan, type AgentPlanAmendmentProposal, type AIChangeRecord, type AgentInvocationSummary, type AgentGuardPostureSummary, type ArchitectureObligation, type GovernanceSession, type SessionCompletionStatus, type SessionEvent } from '@neurcode-ai/governance-runtime';
import { type DiffFile } from '@neurcode-ai/diff-parser';
import { type ProfileFreshnessSignal } from '../utils/v0-governance';
import { type RuntimeConnection } from '../utils/runtime-connection';
import { type ImpactSummary } from '../utils/repo-brain-impact';
import { type AgentGuardSupervisorInspection } from '../utils/agent-guard-supervisor';
interface SessionCommandOptions {
    sessionId?: string;
    projectId?: string;
    all?: boolean;
    left?: string;
    right?: string;
    json?: boolean;
    local?: boolean;
    dir?: string;
    path?: string;
    record?: string;
    receipt?: string;
    signed?: boolean;
    output?: string;
    requestId?: string;
    obligationId?: string;
    reason?: string;
    expiresAt?: string;
    ttlMinutes?: number;
    waivedBy?: string;
    waiverSource?: 'local_cli' | 'dashboard' | 'mcp' | 'unknown';
    plan?: string;
    planFile?: string;
    summary?: string;
    addStep?: string[];
    removeStep?: string[];
    addFile?: string[];
    removeFile?: string[];
    addGlob?: string[];
    removeGlob?: string[];
    /** `amend-plan --scope <glob>` sugar: expected globs to add to the active plan. */
    scope?: string[];
    addConstraint?: string[];
    removeConstraint?: string[];
    addRisk?: string[];
    removeRisk?: string[];
    proposedBy?: 'agent' | 'human';
    proposalId?: string;
    decision?: 'accept' | 'reject';
    decidedBy?: string;
    force?: boolean;
    completionStatus?: SessionCompletionStatus;
    maxAgeMinutes?: number;
    latest?: boolean;
    staged?: boolean;
    head?: boolean;
    base?: string;
    maxProgramFiles?: number;
    timeBudgetMs?: number;
}
interface MissingLocalGovernanceStatus {
    ok: false;
    repoRoot: string;
    active: false;
    message: string;
    connection: RuntimeConnection | null;
}
interface PresentLocalGovernanceStatus {
    ok: true;
    repoRoot: string;
    active: boolean;
    sessionId: string;
    status: GovernanceSession['status'];
    goal: string;
    profileHash: string;
    profileFreshness: ProfileFreshnessSignal;
    scopeMode: GovernanceSession['contract']['scopeMode'];
    planCoherenceMode: NonNullable<GovernanceSession['contract']['planCoherenceMode']>;
    agentPlan: AgentPlan | null;
    agentPlanRevision: number | null;
    pendingPlanAmendments: AgentPlanAmendmentProposal[];
    architectureObligations: ArchitectureObligation[];
    allowedGlobs: string[];
    sensitiveGlobs: string[];
    approvalRequiredGlobs: string[];
    approvedPaths: string[];
    recentEvents: SessionEvent[];
    agentInvocation: AgentInvocationSummary;
    agentGuard: AgentGuardPostureSummary;
    agentSupervisor: AgentGuardSupervisorInspection;
    latestBlock: {
        filePath?: string;
        message?: string;
        owners: string[];
        suggestedApprovalPath: string | null;
        approveCommand: string | null;
    } | null;
    recordPath: string;
    connection: RuntimeConnection | null;
}
type LocalGovernanceStatus = MissingLocalGovernanceStatus | PresentLocalGovernanceStatus;
type UnderstandingDiffFile = DiffFile & {
    provenance?: 'git-diff' | 'git-untracked';
};
export declare function resolveUnderstandingDiffFiles(repoRoot: string, options?: Pick<SessionCommandOptions, 'staged' | 'base' | 'head'>): UnderstandingDiffFile[];
export declare function buildLocalGovernanceStatus(options?: SessionCommandOptions): LocalGovernanceStatus;
export declare function localGovernanceStatusCommand(options?: SessionCommandOptions): void;
export declare function resetStaleGovernanceSessionCommand(options?: SessionCommandOptions): Promise<void>;
export declare function replanGovernanceSessionCommand(options?: SessionCommandOptions): Promise<void>;
export declare function decideGovernanceReplanCommand(options?: SessionCommandOptions): Promise<void>;
export declare function approveGovernanceSessionCommand(options?: SessionCommandOptions): Promise<void>;
export declare function showGovernanceObligationsCommand(options?: SessionCommandOptions): void;
export declare function waiveGovernanceObligationCommand(options?: SessionCommandOptions): Promise<void>;
export declare function listRuntimeSessionsCommand(options?: SessionCommandOptions): void;
export declare function showRuntimeSessionCommand(sessionId: string, options?: SessionCommandOptions): void;
export declare function aiChangeRecordCommand(options?: SessionCommandOptions): void;
export interface AIChangeRecordExportSummary {
    ok: true;
    repoRoot: string;
    sessionId: string;
    localPath: string;
    publicPath: string;
    publicRelativePath: string;
    recordHash: string;
    trustLevel: string;
    receipt: {
        present: boolean;
        receiptId: string | null;
        keyId: string | null;
        verificationStatus: string;
    };
    warnings: string[];
}
/**
 * Collect the real, source-free file paths that a change touched or intended to
 * touch, for impact analysis. Approved/blocked paths are stored as hashes for
 * privacy and are deliberately excluded; the filter drops any non-path token.
 */
export declare function collectChangeRecordImpactPaths(record: AIChangeRecord): string[];
/**
 * Build a source-free {@link ImpactSummary} for an AI Change Record. Advisory:
 * never throws and never auto-builds the brain — when the brain is not indexed
 * the summary is honestly degraded (brainStatus: 'missing') rather than absent.
 */
export declare function buildChangeRecordImpactSummary(repoRoot: string, record: AIChangeRecord): ImpactSummary | null;
export declare function exportAIChangeRecordForCli(options?: SessionCommandOptions): Promise<AIChangeRecordExportSummary>;
export declare function verifyAIChangeRecordForCli(options?: SessionCommandOptions): {
    ok: boolean;
    recordHash: string;
    receiptId: string | null;
    trustLevel: import("@neurcode-ai/governance-runtime").AIChangeRecordTrustLevel;
    verification: import("@neurcode-ai/governance-runtime").AIChangeRecordReceiptVerification;
    privacy: {
        sourceUploaded: boolean;
        sourceFree: boolean;
    };
};
export declare function structuralUnderstandingCommand(options?: SessionCommandOptions): void;
/**
 * List all sessions
 */
export declare function listSessionsCommand(options: SessionCommandOptions): Promise<void>;
/**
 * End a session
 */
export declare function endSessionCommand(options: SessionCommandOptions): Promise<void>;
interface SessionEndCloudClient {
    getSessions(projectId?: string, limit?: number): Promise<any[]>;
    getSession(sessionId: string): Promise<any>;
    endSession(sessionId: string): Promise<unknown>;
}
export interface SessionEndDependencies {
    isInteractive?: () => boolean;
    prompt?: (question: string) => Promise<string>;
    cloudClient?: SessionEndCloudClient;
}
export declare function endSessionCommandWithDependencies(options: SessionCommandOptions, dependencies?: SessionEndDependencies): Promise<void>;
/**
 * Show session status
 */
export declare function sessionStatusCommand(options: SessionCommandOptions): Promise<void>;
export declare function listLocalSessionsCommand(options?: SessionCommandOptions): void;
export declare function currentLocalSessionCommand(options?: SessionCommandOptions): void;
export declare function resumeLocalSessionCommand(options?: SessionCommandOptions): void;
export declare function compareLocalSessionsCommand(options?: SessionCommandOptions): void;
export {};
//# sourceMappingURL=session.d.ts.map