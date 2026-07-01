import type { AgentPlan } from './agent-plan';
import type { BoundaryVerdict } from './profile';
import { type ArchitectureSurfaceKind, type RepoArchitectureGraph } from './architecture-graph';
import { type RepositoryTopologyArtifact } from './repository-topology';
export declare const ARCHITECTURE_OBLIGATION_SCHEMA_VERSION: 1;
export type ArchitectureObligationCategory = 'reliability' | 'data-model' | 'behavior' | 'ownership' | 'security' | 'payments' | 'api-contract' | 'dependency';
export type ArchitectureObligationSeverity = 'warn' | 'critical';
export type ArchitectureObligationStatus = 'pending' | 'satisfied' | 'waived';
export type ArchitectureObligationPolicyMode = 'off' | 'warn' | 'block';
export type ArchitectureObligationWaiverSource = 'local_cli' | 'dashboard' | 'mcp' | 'unknown';
export type ArchitectureObligationEvidenceKind = 'accepted-plan' | 'change-trajectory' | 'exact-approval' | 'waiver';
export interface ArchitectureObligationEvidence {
    kind: ArchitectureObligationEvidenceKind;
    summary: string;
    path?: string;
}
export interface ArchitectureObligation {
    schemaVersion: 1;
    id: string;
    category: ArchitectureObligationCategory;
    title: string;
    description: string;
    severity: ArchitectureObligationSeverity;
    status: ArchitectureObligationStatus;
    triggeredBy: string[];
    requiredEvidence: string[];
    observedEvidence: ArchitectureObligationEvidence[];
    firstSeenAt: string;
    updatedAt: string;
    requiredPath?: string;
    effectiveMode?: ArchitectureObligationPolicyMode;
    waiver?: ArchitectureObligationWaiverEvidence;
}
export interface ArchitectureObligationPolicy {
    mode: ArchitectureObligationPolicyMode;
    ruleModes: Record<string, ArchitectureObligationPolicyMode>;
}
export interface ArchitectureObligationWaiver {
    obligationId: string;
    reason: string;
    waivedAt: string;
    expiresAt: string | null;
    source: ArchitectureObligationWaiverSource;
    eventId: string;
    waivedBy?: string | null;
    revokedAt?: string | null;
}
export interface ArchitectureObligationWaiverEvidence {
    eventId: string;
    reason: string;
    waivedAt: string;
    expiresAt: string | null;
    waivedBy?: string | null;
    source: ArchitectureObligationWaiverSource;
}
export interface ArchitectureObligationEvent {
    type: string;
    filePath?: string;
    detail?: Record<string, unknown>;
}
export interface ArchitectureObligationIntent {
    primaryAction?: string;
    target?: {
        domainKeywords?: string[];
        expectedPathGlobs?: string[];
        supportPathGlobs?: string[];
        pathTokens?: string[];
    };
    obligations?: Array<{
        id?: string;
    }>;
}
export interface DeriveArchitectureObligationsInput {
    goal: string;
    intentContract?: ArchitectureObligationIntent;
    agentPlan?: AgentPlan | null;
    events?: ArchitectureObligationEvent[];
    approvedPaths?: string[];
    /** Profile approval-required globs — used to pre-declare ownership obligations for plan targets. */
    approvalRequiredGlobs?: string[];
    policy?: ArchitectureObligationPolicy;
    waivers?: ArchitectureObligationWaiver[];
    previous?: ArchitectureObligation[];
    /** V2: repository architecture graph used to derive structural obligations. */
    graph?: RepoArchitectureGraph | null;
    /** Runtime-compiled repository topology used for generated/migration authority. */
    topology?: RepositoryTopologyArtifact | null;
    now?: string;
}
export interface ArchitectureObligationSummary {
    total: number;
    pending: number;
    satisfied: number;
    waived: number;
    /** All pending obligations with severity=critical, regardless of effectiveMode. */
    criticalPending: number;
    /** Pending obligations with effectiveMode=block (will halt the task). */
    blockingPending: number;
    /** Pending obligations with severity=critical AND effectiveMode=warn (advisory only). */
    criticalAdvisoryPending: number;
    /** Pending obligations with severity!=critical AND effectiveMode=warn (non-critical advisory). */
    otherAdvisoryPending: number;
}
export interface ArchitectureObligationFeedback {
    action: 'none' | 'warn' | 'block';
    filePath: string;
    pending: ArchitectureObligation[];
    blocking: ArchitectureObligation[];
    reasons: string[];
}
export declare const DEFAULT_ARCHITECTURE_OBLIGATION_POLICY: ArchitectureObligationPolicy;
/**
 * Paths the accepted agent plan declares that sit inside approval-required /
 * CODEOWNERS boundaries. These become live obligations at plan capture — before
 * the first guarded write attempt — so agents and humans can approve upfront.
 */
export declare function planDeclaredApprovalRequiredPaths(input: Pick<DeriveArchitectureObligationsInput, 'agentPlan' | 'approvalRequiredGlobs'>): string[];
export declare function normalizeArchitectureObligationPolicy(value?: Partial<ArchitectureObligationPolicy> | null): ArchitectureObligationPolicy;
export declare function effectiveArchitectureObligationMode(obligation: Pick<ArchitectureObligation, 'id' | 'severity'>, policy?: Partial<ArchitectureObligationPolicy> | null): ArchitectureObligationPolicyMode;
export declare function isArchitectureObligationWaiverActive(waiver: ArchitectureObligationWaiver, checkedAt?: string): boolean;
export declare function activeArchitectureObligationWaivers(waivers?: ArchitectureObligationWaiver[], checkedAt?: string): ArchitectureObligationWaiver[];
/**
 * Derive the live architecture-obligation ledger from source-free metadata.
 *
 * The first rule set is intentionally conservative. Every obligation is
 * explainable from user intent, the accepted agent plan, guarded path attempts,
 * or exact approval state. Source, diffs, and file contents are never inputs.
 */
export declare function deriveArchitectureObligations(input: DeriveArchitectureObligationsInput): ArchitectureObligation[];
export declare function summarizeArchitectureObligations(obligations?: ArchitectureObligation[]): ArchitectureObligationSummary;
export declare function evaluateArchitectureObligationFeedback(obligations: ArchitectureObligation[] | undefined, filePath: string): ArchitectureObligationFeedback;
export type RuntimeEditStatus = 'pass' | 'warn' | 'block' | 'obligation_pending' | 'obligation_waived';
export type RuntimeEditOption = 'continue' | 'approve' | 'narrow' | 'replan' | 'waive';
export interface RuntimeEditEvaluation {
    status: RuntimeEditStatus;
    filePath: string;
    /** Architecture module the edit lands in, if the graph is available. */
    module: string | null;
    surfaces: ArchitectureSurfaceKind[];
    /** Downstream modules that depend on the edited module. */
    dependents: string[];
    boundaryVerdict: BoundaryVerdict;
    obligations: {
        blocking: ArchitectureObligation[];
        pending: ArchitectureObligation[];
        waived: ArchitectureObligation[];
        satisfied: ArchitectureObligation[];
    };
    reasons: string[];
    /** Plain expert-language explanation suitable for the control plane. */
    message: string;
    options: RuntimeEditOption[];
}
/**
 * Evaluate one edit against the architecture graph + live obligation ledger and
 * return a single structured verdict:
 *   pass · warn · block · obligation_pending · obligation_waived
 *
 * Boundary blocks always win. Block-mode pending obligations also block. Open
 * warn-mode obligations surface as `obligation_pending` (the edit is allowed but
 * carries an open obligation). When the only applicable obligations are waived,
 * the status is `obligation_waived`.
 */
export declare function evaluateArchitectureEdit(input: {
    filePath: string;
    boundaryVerdict?: BoundaryVerdict;
    graph?: RepoArchitectureGraph | null;
    obligations?: ArchitectureObligation[];
}): RuntimeEditEvaluation;
//# sourceMappingURL=architecture-obligations.d.ts.map