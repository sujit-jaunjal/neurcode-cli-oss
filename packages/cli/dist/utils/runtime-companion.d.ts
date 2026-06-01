import { normalizeArchitectureObligationPolicy, summarizeArchitectureObligations, type AgentPlan, type AgentPlanAmendmentProposal, type ArchitectureObligation, type GovernanceSession, type SessionEvent } from '@neurcode-ai/governance-runtime';
import { type ProfileFreshnessSignal } from './v0-governance';
import { type RuntimeOutboxStatus } from './runtime-outbox';
export declare const RUNTIME_COMPANION_SCHEMA_VERSION: "neurcode.runtime-companion.v1";
export interface RuntimeCompanionPlan {
    revision: number;
    summary: string;
    steps: string[];
    expectedFiles: string[];
    expectedGlobs: string[];
    constraints: string[];
    risks: string[];
    capturedAt: string;
    source: AgentPlan['source'];
    confidence: AgentPlan['confidence'];
    pendingAmendments: Array<{
        proposalId: string;
        action: AgentPlanAmendmentProposal['action'];
        proposedBy: AgentPlanAmendmentProposal['proposedBy'];
        reason: string;
        riskLevel: AgentPlanAmendmentProposal['risk']['level'];
        addedFiles: string[];
        addedGlobs: string[];
        removedConstraints: string[];
        createdAt: string;
    }>;
}
export interface RuntimeCompanionObligations {
    policy: ReturnType<typeof normalizeArchitectureObligationPolicy>;
    summary: ReturnType<typeof summarizeArchitectureObligations>;
    items: Array<{
        id: string;
        category: ArchitectureObligation['category'];
        title: string;
        description: string;
        severity: ArchitectureObligation['severity'];
        status: ArchitectureObligation['status'];
        requiredEvidence: string[];
        observedEvidence: ArchitectureObligation['observedEvidence'];
        requiredPath?: string;
        effectiveMode?: ArchitectureObligation['effectiveMode'];
    }>;
    activeWaivers: Array<{
        obligationId: string;
        reason: string;
        waivedAt: string;
        expiresAt: string | null;
        waivedBy?: string | null;
    }>;
}
export interface RuntimeCompanionSnapshot {
    schemaVersion: typeof RUNTIME_COMPANION_SCHEMA_VERSION;
    generatedAt: string;
    repoRoot: string;
    privacy: {
        metadataOnly: true;
        sourceIncluded: false;
        sourceUploaded: false;
    };
    enforcement: {
        adapter: 'vscode-extension';
        level: 'observe_only';
        automatic: false;
        hardDenyAvailable: false;
        detail: string;
    };
    profileFreshness: ProfileFreshnessSignal & {
        sessionProfileHash: string | null;
    };
    transport: RuntimeOutboxStatus & {
        connected: boolean;
    };
    session: null | {
        sessionId: string;
        status: GovernanceSession['status'];
        repoName: string;
        goal: string;
        profileHash: string;
        scopeMode: GovernanceSession['contract']['scopeMode'];
        planCoherenceMode: NonNullable<GovernanceSession['contract']['planCoherenceMode']>;
        allowedGlobs: string[];
        approvalRequiredGlobs: string[];
        approvedPaths: string[];
        launcher: null | {
            agent: string;
            adapter: string;
            enforcementLevel: string;
            automatic: boolean;
            hardDeny: boolean;
            handshakeStatus: string;
            launchedAt?: string;
            promptSeenAt?: string;
        };
        plan: RuntimeCompanionPlan | null;
        obligations: RuntimeCompanionObligations;
        latestBlock: null | {
            filePath: string;
            message: string;
            owners: string[];
            suggestedApprovalPath: string;
            exactPathApproved: boolean;
        };
        recentEvents: Array<{
            type: SessionEvent['type'];
            ts: string;
            filePath?: string;
            verdict?: string;
            decision?: string;
            message?: string;
        }>;
    };
}
export interface RuntimeCompanionApprovalInput {
    path: string;
    reason: string;
    sessionId?: string;
    approvedBy?: string | null;
    requestId?: string | null;
}
export interface RuntimeCompanionApprovalResult {
    schemaVersion: typeof RUNTIME_COMPANION_SCHEMA_VERSION;
    sessionId: string;
    approvedPath: string;
    eventId: string;
    expiresAt: string | null;
    snapshot: RuntimeCompanionSnapshot;
}
interface BuildRuntimeCompanionOptions {
    forceFreshness?: boolean;
}
export declare function invalidateRuntimeCompanionFreshness(repoRoot: string): void;
export declare function buildRuntimeCompanionSnapshot(repoRoot: string, options?: BuildRuntimeCompanionOptions): RuntimeCompanionSnapshot;
export declare function approveRuntimeCompanionPath(repoRoot: string, input: RuntimeCompanionApprovalInput): RuntimeCompanionApprovalResult;
export declare function refreshRuntimeCompanionProfile(repoRoot: string): RuntimeCompanionSnapshot;
export declare function runtimeCompanionSession(repoRoot: string, sessionId: string): GovernanceSession | null;
export {};
//# sourceMappingURL=runtime-companion.d.ts.map