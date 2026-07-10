"use strict";
/**
 * Self-Serve Pilot Operating System — source-free funnel contract.
 *
 * Machine-readable milestone model for signup → governed value → manager review.
 * No hardcoded repository paths, languages, teams, or billing directories.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PILOT_ANALYTICS_ALLOWED_FIELDS = exports.PILOT_BRAIN_STATES = exports.PILOT_FUNNEL_STAGES = exports.PILOT_ACTIVATION_MILESTONES = exports.PILOT_FUNNEL_SCHEMA_VERSION = void 0;
exports.mapBrainLifecycleToPilotState = mapBrainLifecycleToPilotState;
exports.brainStateToMilestone = brainStateToMilestone;
exports.isPilotActivationMilestone = isPilotActivationMilestone;
exports.resolveCurrentFunnelStage = resolveCurrentFunnelStage;
exports.buildFunnelStageProgress = buildFunnelStageProgress;
exports.PILOT_FUNNEL_SCHEMA_VERSION = 'neurcode.pilot-funnel.v1';
/** Privacy-safe activation milestones tracked across dashboard, API, and CLI. */
exports.PILOT_ACTIVATION_MILESTONES = [
    'signup_completed',
    'workspace_selected',
    'organization_created',
    'organization_joined',
    'repository_connected',
    'cli_authenticated',
    'brain_not_started',
    'brain_discovering',
    'brain_parsing',
    'brain_indexing',
    'brain_ready',
    'brain_partial',
    'brain_stale',
    'brain_corrupt',
    'brain_canceled',
    'brain_failed',
    'agent_configured',
    'governed_session_started',
    'first_block_observed',
    'first_exact_approval',
    'first_completed_ai_change_record',
    'teammate_invited',
    'seven_day_return',
];
/** Ordered funnel stages a first-time user traverses. */
exports.PILOT_FUNNEL_STAGES = [
    {
        id: 'account',
        label: 'Account',
        milestones: ['signup_completed'],
        nextAction: 'Choose personal workspace or create/join an organization.',
    },
    {
        id: 'workspace',
        label: 'Workspace',
        milestones: ['workspace_selected', 'organization_created', 'organization_joined'],
        nextAction: 'Connect a repository and select your AI agent.',
    },
    {
        id: 'repository',
        label: 'Repository & agent',
        milestones: ['repository_connected', 'cli_authenticated', 'agent_configured'],
        nextAction: 'Index repository Brain and start a governed session.',
    },
    {
        id: 'brain',
        label: 'Repository Brain',
        milestones: [
            'brain_not_started',
            'brain_discovering',
            'brain_parsing',
            'brain_indexing',
            'brain_ready',
            'brain_partial',
            'brain_stale',
            'brain_corrupt',
            'brain_canceled',
            'brain_failed',
        ],
        nextAction: 'Run the repository-native evaluation to prove governed value.',
    },
    {
        id: 'governance',
        label: 'Governed value',
        milestones: [
            'governed_session_started',
            'first_block_observed',
            'first_exact_approval',
            'first_completed_ai_change_record',
        ],
        nextAction: 'Review evidence in the manager dashboard or invite a teammate.',
    },
    {
        id: 'team',
        label: 'Team & retention',
        milestones: ['teammate_invited', 'seven_day_return'],
        nextAction: 'Continue pilot rollout across repositories.',
    },
];
/** Brain lifecycle states exposed to operators (maps CLI brain-lifecycle.v2). */
exports.PILOT_BRAIN_STATES = [
    'not_started',
    'discovering',
    'parsing',
    'indexing',
    'ready',
    'partial',
    'stale',
    'corrupt',
    'canceled',
    'failed',
];
/** Map CLI brain-lifecycle state to pilot Brain state vocabulary. */
function mapBrainLifecycleToPilotState(input) {
    const lifecycle = input.lifecycleState ?? 'missing';
    const phase = input.progressPhase ?? null;
    if (lifecycle === 'missing')
        return 'not_started';
    if (lifecycle === 'scheduled')
        return 'discovering';
    if (lifecycle === 'building') {
        if (phase === 'discovering' || phase === 'scanning')
            return 'discovering';
        if (phase === 'parsing')
            return 'parsing';
        return 'indexing';
    }
    if (lifecycle === 'fresh')
        return 'ready';
    if (lifecycle === 'partial')
        return 'partial';
    if (lifecycle === 'stale')
        return 'stale';
    if (lifecycle === 'failed') {
        if (input.progressPhase === 'cancelled_by_operator')
            return 'canceled';
        return 'failed';
    }
    if (lifecycle === 'unsupported')
        return 'partial';
    return 'corrupt';
}
function brainStateToMilestone(state) {
    switch (state) {
        case 'not_started': return 'brain_not_started';
        case 'discovering': return 'brain_discovering';
        case 'parsing': return 'brain_parsing';
        case 'indexing': return 'brain_indexing';
        case 'ready': return 'brain_ready';
        case 'partial': return 'brain_partial';
        case 'stale': return 'brain_stale';
        case 'corrupt': return 'brain_corrupt';
        case 'canceled': return 'brain_canceled';
        case 'failed': return 'brain_failed';
    }
}
/** Source-free fields allowed in activation analytics payloads. */
exports.PILOT_ANALYTICS_ALLOWED_FIELDS = [
    'milestone',
    'reasonCode',
    'stageId',
    'agent',
    'enforcementPosture',
    'brainState',
    'workspaceKind',
    'durationMs',
    'attempt',
];
function isPilotActivationMilestone(value) {
    return typeof value === 'string' && exports.PILOT_ACTIVATION_MILESTONES.includes(value);
}
function resolveCurrentFunnelStage(completed) {
    for (const stage of exports.PILOT_FUNNEL_STAGES) {
        const stageMilestones = stage.milestones;
        let stageComplete = false;
        if (stage.id === 'brain') {
            stageComplete = completed.has('brain_ready') || completed.has('brain_partial');
        }
        else if (stage.id === 'workspace') {
            stageComplete = completed.has('workspace_selected')
                || completed.has('organization_created')
                || completed.has('organization_joined');
        }
        else if (stage.id === 'account') {
            stageComplete = completed.has('signup_completed');
        }
        else if (stage.id === 'repository') {
            stageComplete = stageMilestones.every((m) => completed.has(m));
        }
        else if (stage.id === 'governance') {
            stageComplete = completed.has('first_completed_ai_change_record');
        }
        else if (stage.id === 'team') {
            stageComplete = completed.has('seven_day_return');
        }
        else {
            stageComplete = stageMilestones.some((m) => completed.has(m));
        }
        if (!stageComplete)
            return stage.id;
    }
    return 'team';
}
function buildFunnelStageProgress(completed) {
    const current = resolveCurrentFunnelStage(completed);
    return exports.PILOT_FUNNEL_STAGES.map((stage) => {
        const stageMilestones = stage.milestones;
        let complete = false;
        if (stage.id === 'brain') {
            complete = completed.has('brain_ready') || completed.has('brain_partial');
        }
        else if (stage.id === 'workspace') {
            complete = completed.has('workspace_selected')
                || completed.has('organization_created')
                || completed.has('organization_joined');
        }
        else {
            complete = stageMilestones.some((m) => completed.has(m));
        }
        const currentMilestone = stageMilestones.find((m) => !completed.has(m)) ?? null;
        return {
            stageId: stage.id,
            label: stage.label,
            complete,
            currentMilestone: stage.id === current ? currentMilestone : null,
            nextAction: stage.nextAction,
        };
    });
}
//# sourceMappingURL=index.js.map