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
import { type AgentPlan, type AgentPlanAmendmentProposal, type AgentInvocationSummary, type AgentGuardPostureSummary, type ArchitectureObligation, type GovernanceSession, type SessionEvent } from '@neurcode-ai/governance-runtime';
import { type RuntimeConnection } from '../utils/runtime-connection';
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
export declare function structuralUnderstandingCommand(options?: SessionCommandOptions): void;
/**
 * List all sessions
 */
export declare function listSessionsCommand(options: SessionCommandOptions): Promise<void>;
/**
 * End a session
 */
export declare function endSessionCommand(options: SessionCommandOptions): Promise<void>;
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