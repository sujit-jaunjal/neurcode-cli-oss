/**
 * V0 session store — lightweight JSON-file-backed governance session.
 *
 * One session per .neurcode/sessions/<id>.json.
 * No daemon required; CLI commands and hooks read/write directly.
 */
import { type OwnershipBoundary, type PlanCoherenceMode, type PlanControlMode, type RepoSymbolDuplicateMode, type RepoGovernanceProfile, type RuntimeBlockType, type RuntimeLocalMode } from './profile';
import { type PlanControlModeDescription, type RuntimeSafetyPhase } from './runtime-safety-kernel';
import { type AgentPlan, type AgentPlanSource, type PlanCoherenceResult } from './agent-plan';
import { type ArchitectureObligation, type ArchitectureObligationPolicy, type ArchitectureObligationWaiver, type ArchitectureObligationWaiverSource } from './architecture-obligations';
import type { RepoArchitectureGraph } from './architecture-graph';
import { type RepositoryTopologyArtifact } from './repository-topology';
import { INTENT_PRIVACY_POLICY_VERSION, type IntentRedactionReasonCode } from './intent-privacy';
export type EventType = 'session_start' | 'check_ok' | 'check_warn' | 'check_block' | 'approval_decision' | 'user_decision' | 'plan_captured' | 'plan_amended' | 'plan_frozen' | 'plan_unfrozen' | 'plan_amendment_proposed' | 'plan_amendment_decision' | 'obligation_state_changed' | 'obligation_waiver_decision' | 'agent_session_launched' | 'agent_handshake' | 'agent_runtime_call' | 'agent_guard_started' | 'agent_guard_status' | 'agent_guard_finished' | 'agent_guard_supervisor_started' | 'agent_guard_supervisor_stopped' | 'structural_understanding' | 'consequence_nudge' | 'session_finish';
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
/**
 * Assurance level for an approval grant — describes how the approver identity
 * was established.
 *
 *  hosted_verified   — authenticated request through the Neurcode API
 *  local_asserted    — operator explicitly passed --approved-by on the CLI
 *  local_derived     — derived from git user.name/email or OS username
 *  unknown           — source provided no identity signal at all
 */
export type ApprovalAssurance = 'hosted_verified' | 'local_asserted' | 'local_derived' | 'unknown';
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
export interface IntentScopeSelection {
    target: string;
    targetType: 'file' | 'glob';
    source: 'explicit_user_path' | 'active_agent_plan' | 'repository_topology' | 'repo_brain' | 'support_surface';
    confidence: IntentConfidence;
    authority: 'deterministic' | 'advisory';
    evidenceType: string;
    factId?: string;
    reason: string;
}
export interface IntentScopeAuthority {
    expectedFiles: string[];
    expectedGlobs: string[];
    expectedSymbols: string[];
    likelyTests: string[];
    provenRequiredFiles: string[];
    advisoryCandidates: string[];
    notEvaluatedRecommendations: Array<{
        target: string;
        reasonCode: string;
        manualDiscoveryRecommendation: string | null;
    }>;
    affectedPackages: string[];
    affectedModules: string[];
    prohibitedBoundaries: string[];
    selections: IntentScopeSelection[];
    unsupportedAreas: string[];
    brain: {
        evaluated: boolean;
        freshness: string | null;
        reason: string;
        coverageComplete?: boolean;
        impactAuthority?: string | null;
    };
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
    scopeAuthority: IntentScopeAuthority;
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
    /** How the approver identity was established. Never null on a newly created grant. */
    assurance?: ApprovalAssurance;
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
    /** Planning-phase runtime safety posture (observe / advise / enforce_after_freeze). */
    planMode?: PlanControlMode;
    /**
     * Explicit plan-freeze state. `undefined` preserves the pre-V1 implicit
     * behavior (the plan is treated as frozen once it has expected files). `true`
     * forces the implementation phase (enforce_after_freeze starts blocking drift);
     * `false` reopens the planning phase so the plan can be amended freely.
     */
    planFrozen?: boolean;
    /** ISO-8601 timestamp the plan was last frozen (null when never frozen). */
    planFrozenAt?: string | null;
    /** Active agent-plan revision in force at the moment of the last freeze. */
    planFrozenRevision?: number | null;
    /** Identity that froze the plan (source-free, local-private sanitized). */
    planFrozenBy?: string | null;
    /** Resolved enterprise runtime safety policy profile for this session. */
    runtimeSafetyPolicyId?: string;
    /** Local in-flow enforcement posture for harmless out-of-scope task expansion. */
    runtimeMode?: RuntimeLocalMode;
    /** Deterministic duplicate symbol-name policy captured from repo governance config. */
    repoSymbolDuplicateMode?: RepoSymbolDuplicateMode;
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
    /** Source-free repository topology authority captured at session start. */
    repositoryTopology?: RepositoryTopologyArtifact;
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
    completionStatus?: SessionCompletionStatus;
    privacy?: {
        policyVersion: typeof INTENT_PRIVACY_POLICY_VERSION;
        classification: 'local_private';
        bounded: true;
        sensitivePatternRedaction: true;
        reasonCodes: IntentRedactionReasonCode[];
        updatedAt: string;
    };
}
export type { RuntimeBlockType, RuntimeLocalMode };
export type SessionCompletionStatus = 'completed' | 'denied' | 'abandoned' | 'attention_required' | 'expired' | 'superseded';
export interface UnresolvedApprovalBlock {
    filePath: string;
    suggestedApprovalPath: string;
}
export interface UnresolvedActionableBlock {
    filePath: string;
    blockType: RuntimeBlockType;
    suggestedApprovalPath?: string | null;
    proposalId?: string | null;
    message?: string | null;
}
export interface FinishSessionOptions {
    unresolvedApprovalBlocks?: UnresolvedApprovalBlock[];
    unresolvedActionableBlocks?: UnresolvedActionableBlock[];
    reason?: string;
    completionStatus?: SessionCompletionStatus;
}
export declare function sessionsDir(projectRoot: string): string;
export declare function sessionPath(projectRoot: string, sessionId: string): string;
/**
 * Publish the active-session pointer. Call ONLY after the session record is durably
 * persisted (P0-D: never publish the pointer before durable persistence). Verifies the
 * referenced session record exists and loads before committing the pointer.
 */
export declare function activateSession(projectRoot: string, sessionId: string): void;
/** Clear the active-session pointer (idempotent). */
export declare function clearActiveSession(projectRoot: string, expectedSessionId?: string): void;
/**
 * Roll back a session: remove its durable record and clear the active pointer if it
 * points at this session. Used to undo a session whose start failed validation so no
 * partial session and no dangling active pointer survive (P0-D).
 */
export declare function removeSession(projectRoot: string, sessionId: string): void;
export declare function createSession(projectRoot: string, profile: RepoGovernanceProfile, goal: string, options?: {
    activate?: boolean;
}): GovernanceSession;
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
    /** How the approver identity was established. */
    assurance?: ApprovalAssurance;
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
/**
 * Resolve the runtime-safety phase for a session from its explicit freeze state.
 *
 * Backward-compatible: when `planFrozen` is undefined (every pre-V1 session),
 * this reproduces the original implicit rule used at the hook call site — a plan
 * with expected files is treated as the implementation phase. An explicit
 * freeze (`true`) forces implementation; an explicit unfreeze (`false`) reopens
 * planning so the agent/human can amend the plan without plan-drift blocking.
 */
export declare function derivePlanPhase(contract: SessionContract): RuntimeSafetyPhase;
export interface PlanFreezeOptions {
    sessionId?: string;
    /** Identity that froze/unfroze the plan (sanitized, source-free). */
    by?: string | null;
    reason?: string;
    /** Override timestamp (mainly for deterministic tests). */
    at?: string;
}
export interface PlanFreezeResult {
    sessionId: string;
    /** Whether the plan is now in the frozen (implementation) phase. */
    frozen: boolean;
    /** True when this call changed the freeze state (idempotent otherwise). */
    changed: boolean;
    planMode: PlanControlMode;
    phase: RuntimeSafetyPhase;
    activePlanRevision: number;
    frozenRevision: number | null;
    planFileCount: number;
    frozenAt: string | null;
    frozenBy: string | null;
    eventId: string | null;
}
/**
 * Freeze the active (or named) plan. After a freeze, a session running under
 * `enforce_after_freeze` blocks writes outside the frozen plan; under `advise`
 * sensitive surfaces escalate from warn to exact-path approval. Idempotent.
 */
export declare function freezePlan(projectRoot: string, options?: PlanFreezeOptions): PlanFreezeResult;
/**
 * Reopen the plan for planning. Plan-drift blocking is suspended so the plan can
 * be amended freely; credential/secret guards remain in force regardless of
 * phase. Idempotent.
 */
export declare function unfreezePlan(projectRoot: string, options?: PlanFreezeOptions): PlanFreezeResult;
export interface PlanNegotiationPendingAmendment {
    proposalId: string;
    risk: AgentPlanAmendmentRiskLevel;
    reason: string;
}
export interface PlanNegotiationView {
    sessionId: string;
    status: GovernanceSession['status'];
    planMode: PlanControlMode;
    planModeDescription: PlanControlModeDescription;
    /** Currently in the frozen (implementation) phase — enforcement-relevant. */
    frozen: boolean;
    /** True when an explicit freeze/unfreeze was recorded (vs implicit phase). */
    frozenExplicit: boolean;
    frozenAt: string | null;
    frozenBy: string | null;
    frozenRevision: number | null;
    phase: RuntimeSafetyPhase;
    activePlanRevision: number;
    planVersions: number;
    hasPlan: boolean;
    summary: string | null;
    steps: string[];
    expectedFiles: string[];
    expectedGlobs: string[];
    constraints: string[];
    risks: string[];
    pendingAmendments: PlanNegotiationPendingAmendment[];
    driftWarningCount: number;
    blockedBoundaryCount: number;
    approvedPaths: string[];
    planCoherenceMode: PlanCoherenceMode;
    enforceAfterFreeze: boolean;
}
/**
 * Source-free "view active plan" model: the active plan summary/steps/scope,
 * its revision and freeze state, the plan mode (with plain-language copy), and
 * negotiation counters (pending amendments, drift, blocks). Derived entirely
 * from data already persisted on the session — no source, diffs, or prose
 * beyond the already-source-free plan summary.
 */
export declare function buildPlanNegotiationView(session: GovernanceSession): PlanNegotiationView;
//# sourceMappingURL=session.d.ts.map