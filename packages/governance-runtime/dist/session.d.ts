/**
 * V0 session store — lightweight JSON-file-backed governance session.
 *
 * One session per .neurcode/sessions/<id>.json.
 * No daemon required; CLI commands and hooks read/write directly.
 */
import { type OwnershipBoundary, type PlanCoherenceMode, type RepoGovernanceProfile } from './profile';
import { type AgentPlan, type AgentPlanSource, type PlanCoherenceResult } from './agent-plan';
import { type ArchitectureObligation, type ArchitectureObligationPolicy, type ArchitectureObligationWaiver, type ArchitectureObligationWaiverSource } from './architecture-obligations';
import type { RepoArchitectureGraph } from './architecture-graph';
export type EventType = 'session_start' | 'check_ok' | 'check_warn' | 'check_block' | 'approval_decision' | 'user_decision' | 'plan_captured' | 'plan_amended' | 'plan_amendment_proposed' | 'plan_amendment_decision' | 'obligation_state_changed' | 'obligation_waiver_decision' | 'agent_session_launched' | 'agent_handshake' | 'agent_runtime_call' | 'agent_guard_started' | 'agent_guard_status' | 'agent_guard_finished' | 'agent_guard_supervisor_started' | 'agent_guard_supervisor_stopped' | 'structural_understanding' | 'consequence_nudge' | 'session_finish';
export interface SessionEvent {
    type: EventType;
    ts: string;
    filePath?: string;
    verdict?: string;
    message?: string;
    decision?: string;
    detail?: Record<string, unknown>;
}
/**
 * scopeMode tracks how the allowed-glob list was derived:
 *   'explicit'  — user supplied specific paths in the goal (path-like tokens)
 *   'inferred'  — keyword-based inference from the goal text
 *   'ambiguous' — goal had no recognisable scope signal; globs are a conservative
 *                 best-effort list that excludes approval-required areas,
 *                 but the boundary check should treat any approval-required hit as block.
 */
export type ScopeMode = 'explicit' | 'inferred' | 'ambiguous';
export type ApprovalSource = 'local_cli' | 'dashboard' | 'mcp' | 'vscode' | 'unknown';
export declare const DEFAULT_APPROVAL_TTL_MS: number;
export declare const DEFAULT_OBLIGATION_WAIVER_TTL_MS: number;
export type IntentConfidence = 'high' | 'medium' | 'low';
export type IntentPrimaryAction = 'add' | 'modify' | 'fix' | 'refactor' | 'test' | 'document' | 'remove' | 'migrate' | 'unknown';
export interface IntentObligation {
    id: string;
    title: string;
    description: string;
    severity: 'info' | 'warn' | 'critical';
}
export interface IntentContract {
    schemaVersion: 1;
    summary: string;
    primaryAction: IntentPrimaryAction;
    confidence: IntentConfidence;
    target: {
        pathTokens: string[];
        domainKeywords: string[];
        expectedPathGlobs: string[];
        supportPathGlobs: string[];
    };
    obligations: IntentObligation[];
    outOfScopeGlobs: string[];
    riskNotes: string[];
    createdAt: string;
}
export type IntentCoherenceVerdict = 'aligned' | 'supporting' | 'drift' | 'unknown';
export interface IntentCoherenceResult {
    verdict: IntentCoherenceVerdict;
    score: number;
    filePath: string;
    matchedGlobs: string[];
    reasons: string[];
    obligations: IntentObligation[];
}
export interface ApprovalGrant {
    path: string;
    reason: string;
    approvedAt: string;
    expiresAt: string | null;
    source: ApprovalSource;
    eventId: string;
    approvedBy?: string | null;
    requestId?: string | null;
    revokedAt?: string | null;
    revokedBy?: string | null;
    revocationReason?: string | null;
}
export interface SessionContract {
    goal: string;
    /** Glob patterns the agent is allowed to edit. */
    allowedGlobs: string[];
    sensitiveGlobs: string[];
    approvalRequiredGlobs: string[];
    ownershipRules: OwnershipBoundary[];
    scopeMode: ScopeMode;
    safeSupportGlobs: string[];
    ignoredGlobs: string[];
    /**
     * Paths/globs for which the human has explicitly granted approval in this session.
     * Empty = no approvals on record. Checked by checkFileBoundary before blocking.
     */
    approvedPaths: string[];
    /** Structured approval metadata used for expiry and audit. */
    approvalGrants?: ApprovalGrant[];
    /** Source-free intent model derived from the user's task and repo profile. */
    intentContract?: IntentContract;
    /** Repo policy for edits that the captured agent plan did not justify. */
    planCoherenceMode?: PlanCoherenceMode;
    /**
     * Source-free model of the agent's *own stated plan* (steps + expected files),
     * captured from Claude Code hook payloads when the agent exposes one.
     * Optional for backward compatibility with pre-V1 session records.
     */
    agentPlan?: AgentPlan;
    /**
     * Active agent-plan revision number. `agentPlan` remains the latest/active
     * snapshot for backward compatibility; this revision tells reviewers whether
     * the plan changed during the session.
     */
    agentPlanRevision?: number;
    /**
     * Source-free revision ledger for plan changes inside the live session.
     * No source, diffs, or patches are stored — only the plan metadata that was
     * already eligible for `agentPlan`.
     */
    agentPlanRevisions?: AgentPlanRevision[];
    /**
     * Source-free proposal ledger for agent-authored amendments that require a
     * human decision before they can become the active enforcement plan.
     */
    planAmendmentProposals?: AgentPlanAmendmentProposal[];
    /**
     * Live source-free architecture obligations derived from intent, the
     * accepted plan, guarded change trajectory, and exact approvals.
     */
    architectureObligations?: ArchitectureObligation[];
    /** Session-captured authority policy for live architecture obligations. */
    architectureObligationPolicy?: ArchitectureObligationPolicy;
    /** Session-scoped human waivers for architecture obligations. */
    architectureObligationWaivers?: ArchitectureObligationWaiver[];
    /**
     * V2 repository architecture graph (module boundaries + dependency edges +
     * surfaces) carried from the repo profile. Source-free; used to derive
     * structural obligations as the agent edits. Optional for pre-V2 sessions.
     */
    architectureGraph?: RepoArchitectureGraph;
}
export type AgentPlanRevisionKind = 'captured' | 'amended';
export type AgentPlanAmendmentActor = 'agent' | 'human' | 'system';
export type AgentPlanAmendmentRiskLevel = 'low' | 'medium' | 'high';
export type AgentPlanAmendmentProposalStatus = 'pending' | 'accepted' | 'rejected';
export type AgentPlanAmendmentDecision = 'accept' | 'reject';
export interface AgentPlanRevision {
    revision: number;
    kind: AgentPlanRevisionKind;
    plan: AgentPlan;
    reason: string;
    source: AgentPlanSource;
    capturedAt: string;
    eventId: string;
}
export type AgentPlanAmendmentAction = 'replace' | 'patch';
export interface AgentPlanAmendmentInput {
    sessionId?: string;
    /** Full replacement plan text, usually from a re-plan / ExitPlanMode step. */
    planText?: string;
    /** Replacement summary when patching the active plan. */
    summary?: string;
    addSteps?: string[];
    removeSteps?: string[];
    addExpectedFiles?: string[];
    removeExpectedFiles?: string[];
    addExpectedGlobs?: string[];
    removeExpectedGlobs?: string[];
    addConstraints?: string[];
    removeConstraints?: string[];
    addRisks?: string[];
    removeRisks?: string[];
    reason?: string;
    source?: AgentPlanSource;
    proposedBy?: AgentPlanAmendmentActor;
    decidedBy?: string;
    amendedAt?: string;
}
export interface AgentPlanAmendmentResult {
    sessionId: string;
    previousRevision: number;
    revision: number | null;
    action: AgentPlanAmendmentAction;
    reason: string;
    eventId: string;
    status: 'applied' | 'pending';
    risk: AgentPlanAmendmentRisk;
    activePlan: AgentPlan | null;
    proposal?: AgentPlanAmendmentProposal;
}
export interface AgentPlanAmendmentRisk {
    level: AgentPlanAmendmentRiskLevel;
    requiresHumanApproval: boolean;
    reasons: string[];
    addedFiles: string[];
    addedGlobs: string[];
    removedConstraints: string[];
}
export interface AgentPlanAmendmentProposal {
    proposalId: string;
    sessionId: string;
    previousRevision: number;
    action: AgentPlanAmendmentAction;
    proposedBy: AgentPlanAmendmentActor;
    source: AgentPlanSource;
    reason: string;
    proposedPlan: AgentPlan;
    risk: AgentPlanAmendmentRisk;
    status: AgentPlanAmendmentProposalStatus;
    createdAt: string;
    decidedAt?: string | null;
    decidedBy?: string | null;
    decisionReason?: string | null;
    appliedRevision?: number | null;
}
export interface AgentPlanCaptureResult {
    session: GovernanceSession;
    status: 'captured' | 'applied' | 'pending' | 'unchanged';
    proposal?: AgentPlanAmendmentProposal;
}
export interface AgentPlanAmendmentDecisionInput {
    sessionId?: string;
    proposalId: string;
    decision: AgentPlanAmendmentDecision;
    reason?: string;
    decidedBy?: string;
    source?: AgentPlanSource;
    decidedAt?: string;
}
export interface AgentPlanAmendmentDecisionResult {
    sessionId: string;
    proposalId: string;
    decision: AgentPlanAmendmentDecision;
    status: AgentPlanAmendmentProposalStatus;
    previousRevision: number;
    revision: number | null;
    activePlan: AgentPlan | null;
}
export type PlanCoherencePolicyAction = 'none' | 'warn' | 'block';
export interface PlanCoherencePolicyDecision {
    mode: PlanCoherenceMode;
    action: PlanCoherencePolicyAction;
    reason: string;
}
export interface GovernanceSession {
    schemaVersion: 1;
    sessionId: string;
    profileHash: string;
    repoName: string;
    contract: SessionContract;
    events: SessionEvent[];
    replayHash?: string;
    finishedAt?: string;
    status: 'active' | 'finished';
}
export interface UnresolvedApprovalBlock {
    filePath: string;
    suggestedApprovalPath: string;
}
export interface FinishSessionOptions {
    unresolvedApprovalBlocks?: UnresolvedApprovalBlock[];
    reason?: string;
}
export declare function sessionsDir(projectRoot: string): string;
export declare function sessionPath(projectRoot: string, sessionId: string): string;
export declare function createSession(projectRoot: string, profile: RepoGovernanceProfile, goal: string): GovernanceSession;
export declare function loadActiveSession(projectRoot: string): GovernanceSession | null;
export declare function loadSession(projectRoot: string, sessionId: string): GovernanceSession | null;
export declare function appendEvent(projectRoot: string, sessionId: string, event: SessionEvent): GovernanceSession | null;
export declare function refreshArchitectureObligations(projectRoot: string, sessionId: string, now?: string): GovernanceSession | null;
export interface ApprovalResult {
    sessionId: string;
    approvedPath: string;
    approvedPaths: string[];
    approvalGrant: ApprovalGrant;
    expiresAt: string | null;
    eventId: string;
}
export interface ApprovalOptions {
    reason?: string;
    sessionId?: string;
    expiresAt?: string | null;
    ttlMs?: number | null;
    source?: ApprovalSource;
    approvedBy?: string | null;
    requestId?: string | null;
    approvedAt?: string;
}
export interface ApprovalRevocationOptions {
    reason?: string;
    sessionId?: string;
    requestId?: string | null;
    source?: ApprovalSource;
    revokedBy?: string | null;
    revokedAt?: string;
}
export interface ApprovalRevocationResult {
    sessionId: string;
    revokedPath: string;
    approvedPaths: string[];
    approvalGrant: ApprovalGrant;
    revokedAt: string;
}
export interface ArchitectureObligationWaiverOptions {
    reason?: string;
    sessionId?: string;
    expiresAt?: string | null;
    ttlMs?: number | null;
    source?: ArchitectureObligationWaiverSource;
    waivedBy?: string | null;
    waivedAt?: string;
}
export interface ArchitectureObligationWaiverResult {
    sessionId: string;
    obligationId: string;
    waiver: ArchitectureObligationWaiver;
    expiresAt: string | null;
    eventId: string;
    architectureObligations: ArchitectureObligation[];
}
export declare function activeApprovalPaths(contract: SessionContract, checkedAt?: string): string[];
export declare function expireSessionApprovals(projectRoot: string, sessionId: string, checkedAt?: string): GovernanceSession | null;
export declare function expireArchitectureObligationWaivers(projectRoot: string, sessionId: string, checkedAt?: string): GovernanceSession | null;
export declare function waiveArchitectureObligation(projectRoot: string, obligationId: string, options?: ArchitectureObligationWaiverOptions): ArchitectureObligationWaiverResult;
export declare function approveSession(projectRoot: string, approvedPath: string, reason?: string | ApprovalOptions, sessionId?: string): ApprovalResult;
/**
 * Revoke one exact session grant and recompute the backward-compatible active
 * path list. Dashboard revocations prefer requestId so the same path can be
 * approved again later without revoking the wrong historical grant.
 */
export declare function revokeSessionApproval(projectRoot: string, approvedPath: string, options?: ApprovalRevocationOptions): ApprovalRevocationResult;
export declare function finishSession(projectRoot: string, sessionId: string, options?: FinishSessionOptions): GovernanceSession | null;
export declare function replaySession(session: GovernanceSession): {
    replayHash: string;
    matchesOriginal: boolean;
    originalHash: string | undefined;
};
export declare function evaluateIntentCoherence(contract: SessionContract, filePath: string): IntentCoherenceResult;
/**
 * Attach (or replace) the agent's captured plan on a session contract and record
 * a `plan_captured` event. Source-free: only the AgentPlan metadata is stored.
 * Returns null when the session cannot be loaded; never throws on a missing plan.
 */
export declare function attachAgentPlan(projectRoot: string, sessionId: string, plan: AgentPlan): GovernanceSession | null;
/**
 * Deterministically classify a proposed plan change. The risk model is
 * intentionally conservative around permission-envelope expansion:
 *  - broad globs require human review;
 *  - newly named sensitive / approval-required / owned files require review;
 *  - files outside the original intent envelope require review;
 *  - removing a stated constraint requires review.
 *
 * Adding a concrete file already inside the declared task intent stays fluid,
 * which preserves normal iterative implementation work.
 */
export declare function classifyAgentPlanAmendment(contract: SessionContract, proposedPlan: AgentPlan): AgentPlanAmendmentRisk;
/**
 * Capture an agent-emitted plan from the live hook path. The initial plan is
 * accepted as revision 1. Later safe refinements apply automatically, while
 * risky agent-authored expansions remain pending until a human decides.
 */
export declare function captureAgentPlan(projectRoot: string, sessionId: string, plan: AgentPlan): AgentPlanCaptureResult | null;
/**
 * Amend the active agent plan for a live session. This is the user/agent
 * re-plan path: it updates `contract.agentPlan` immediately, appends a
 * source-free revision, and records a `plan_amended` event for replay.
 */
export declare function amendAgentPlan(projectRoot: string, input: AgentPlanAmendmentInput): AgentPlanAmendmentResult;
export declare function decideAgentPlanAmendment(projectRoot: string, input: AgentPlanAmendmentDecisionInput): AgentPlanAmendmentDecisionResult;
/**
 * Plan/edit coherence for a session: does this edit follow the agent's own plan?
 *
 * Maps the session's intent-support scope into the deterministic plan-coherence
 * evaluator. Boundary/approval blocks always override this advisory verdict at
 * the call site; an `unplanned` verdict must not block on its own in V1.
 */
export declare function evaluateSessionPlanCoherence(contract: SessionContract, filePath: string): PlanCoherenceResult;
export declare function evaluatePlanCoherencePolicy(mode: PlanCoherenceMode | undefined, planCoherence: PlanCoherenceResult): PlanCoherencePolicyDecision;
export type PlanTimelineEntryKind = 'intent' | 'plan_captured' | 'plan_amended' | 'amendment_proposed' | 'amendment_accepted' | 'amendment_rejected' | 'boundary_block' | 'drift_warning' | 'approval' | 'obligation_waiver';
export interface PlanTimelineEntry {
    kind: PlanTimelineEntryKind;
    ts: string;
    /** Active agent-plan revision in force when this entry occurred (0 = no plan yet). */
    activePlanRevision: number;
    /** Short, source-free label for the entry. */
    label: string;
    /** Plan revision this entry *creates* (only for plan_captured / plan_amended). */
    revision?: number;
    /** Repo-relative path for check / approval entries (never file contents). */
    filePath?: string;
    /** Source / actor metadata (e.g. agent, manual, mcp, human). */
    source?: string;
    /** Boundary verdict for check entries. */
    verdict?: string;
}
export interface PlanTimeline {
    sessionId: string;
    /** Initial captured intent summary (the first intent record). */
    intentSummary: string;
    /** Latest non-reverted plan revision (0 when no plan has been captured). */
    activePlanRevision: number;
    /** Number of plan versions recorded (never decreases; older plans are kept). */
    planVersions: number;
    amendmentCount: number;
    pendingAmendmentCount: number;
    driftWarningCount: number;
    blockedBoundaryCount: number;
    approvalCount: number;
    /** Ordered, source-free milestones: intent → plan vN → amendment → block/warn/approval. */
    entries: PlanTimelineEntry[];
}
/**
 * Latest non-reverted agent-plan revision for a contract. `0` means no agent
 * plan has been captured yet. Public wrapper around the internal resolver so
 * callers (hooks, evidence, dashboard) can record which plan version was active.
 */
export declare function activeAgentPlanRevision(contract: SessionContract): number;
/**
 * Build a source-free plan timeline from a governance session.
 *
 * Derived purely from data already persisted on the session (goal, intent
 * contract, plan revision ledger, amendment proposals, and boundary-check
 * events). No source, diffs, or file contents are read or emitted — only the
 * summaries, paths, and revision numbers that already live in the record.
 *
 * The timeline reads: Intent → Plan v1 → Amendment v2 → Block / Warning /
 * Approval, with every milestone tagged with the plan revision that was active
 * when it occurred.
 */
export declare function buildPlanTimeline(session: GovernanceSession): PlanTimeline;
//# sourceMappingURL=session.d.ts.map