/**
 * Self-Serve Pilot Operating System — source-free funnel contract.
 *
 * Machine-readable milestone model for signup → governed value → manager review.
 * No hardcoded repository paths, languages, teams, or billing directories.
 */
export declare const PILOT_FUNNEL_SCHEMA_VERSION: "neurcode.pilot-funnel.v1";
/** Privacy-safe activation milestones tracked across dashboard, API, and CLI. */
export declare const PILOT_ACTIVATION_MILESTONES: readonly ["signup_completed", "workspace_selected", "organization_created", "organization_joined", "repository_connected", "cli_authenticated", "brain_not_started", "brain_discovering", "brain_parsing", "brain_indexing", "brain_ready", "brain_partial", "brain_stale", "brain_corrupt", "brain_canceled", "brain_failed", "agent_configured", "governed_session_started", "first_block_observed", "first_exact_approval", "first_completed_ai_change_record", "teammate_invited", "seven_day_return"];
export type PilotActivationMilestone = (typeof PILOT_ACTIVATION_MILESTONES)[number];
/** Ordered funnel stages a first-time user traverses. */
export declare const PILOT_FUNNEL_STAGES: readonly [{
    readonly id: "account";
    readonly label: "Account";
    readonly milestones: readonly ["signup_completed"];
    readonly nextAction: "Choose personal workspace or create/join an organization.";
}, {
    readonly id: "workspace";
    readonly label: "Workspace";
    readonly milestones: readonly ["workspace_selected", "organization_created", "organization_joined"];
    readonly nextAction: "Connect a repository and select your AI agent.";
}, {
    readonly id: "repository";
    readonly label: "Repository & agent";
    readonly milestones: readonly ["repository_connected", "cli_authenticated", "agent_configured"];
    readonly nextAction: "Index repository Brain and start a governed session.";
}, {
    readonly id: "brain";
    readonly label: "Repository Brain";
    readonly milestones: readonly ["brain_not_started", "brain_discovering", "brain_parsing", "brain_indexing", "brain_ready", "brain_partial", "brain_stale", "brain_corrupt", "brain_canceled", "brain_failed"];
    readonly nextAction: "Run the repository-native evaluation to prove governed value.";
}, {
    readonly id: "governance";
    readonly label: "Governed value";
    readonly milestones: readonly ["governed_session_started", "first_block_observed", "first_exact_approval", "first_completed_ai_change_record"];
    readonly nextAction: "Review evidence in the manager dashboard or invite a teammate.";
}, {
    readonly id: "team";
    readonly label: "Team & retention";
    readonly milestones: readonly ["teammate_invited", "seven_day_return"];
    readonly nextAction: "Continue pilot rollout across repositories.";
}];
export type PilotFunnelStageId = (typeof PILOT_FUNNEL_STAGES)[number]['id'];
/** Brain lifecycle states exposed to operators (maps CLI brain-lifecycle.v2). */
export declare const PILOT_BRAIN_STATES: readonly ["not_started", "discovering", "parsing", "indexing", "ready", "partial", "stale", "corrupt", "canceled", "failed"];
export type PilotBrainState = (typeof PILOT_BRAIN_STATES)[number];
/** Map CLI brain-lifecycle state to pilot Brain state vocabulary. */
export declare function mapBrainLifecycleToPilotState(input: {
    lifecycleState?: string | null;
    progressPhase?: string | null;
}): PilotBrainState;
export declare function brainStateToMilestone(state: PilotBrainState): PilotActivationMilestone;
export type PilotEnforcementPosture = 'hard_pre_write_deny' | 'cooperative_supervision' | 'post_pr_advisory' | 'unsupported';
export interface PilotHostCapability {
    agent: string;
    enforcementPosture: PilotEnforcementPosture;
    automatic: boolean;
    description: string;
}
export interface PilotFunnelStageProgress {
    stageId: PilotFunnelStageId;
    label: string;
    complete: boolean;
    currentMilestone: PilotActivationMilestone | null;
    nextAction: string;
}
export interface PilotFunnelState {
    schemaVersion: typeof PILOT_FUNNEL_SCHEMA_VERSION;
    organizationId: string;
    userIdPrefix: string;
    completedMilestones: PilotActivationMilestone[];
    currentStage: PilotFunnelStageId;
    stages: PilotFunnelStageProgress[];
    progressPercent: number;
    failureReasonCodes: string[];
    updatedAt: string;
}
export interface PilotRecoveryAction {
    code: string;
    label: string;
    command: string;
    safeLocalSource: boolean;
}
export interface PilotFailureRecovery {
    whatFailed: string;
    reasonCode: string;
    safeLocalSource: boolean;
    recommendedAction: PilotRecoveryAction;
    diagnosticExportCommand: string;
}
/** Source-free fields allowed in activation analytics payloads. */
export declare const PILOT_ANALYTICS_ALLOWED_FIELDS: readonly ["milestone", "reasonCode", "stageId", "agent", "enforcementPosture", "brainState", "workspaceKind", "durationMs", "attempt"];
export declare function isPilotActivationMilestone(value: unknown): value is PilotActivationMilestone;
export declare function resolveCurrentFunnelStage(completed: ReadonlySet<PilotActivationMilestone>): PilotFunnelStageId;
export declare function buildFunnelStageProgress(completed: ReadonlySet<PilotActivationMilestone>): PilotFunnelStageProgress[];
//# sourceMappingURL=index.d.ts.map