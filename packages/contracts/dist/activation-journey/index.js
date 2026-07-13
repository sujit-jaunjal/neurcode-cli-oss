"use strict";
/**
 * Canonical account-to-verified-evidence activation journey V2.
 *
 * Clients may choose a workspace, a locally paired repository, and a host.
 * They cannot mark any stage complete. Every completion is derived from
 * durable backend authority scoped to user + workspace + repository + host.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVATION_JOURNEY_STAGE_IDS = exports.ACTIVATION_JOURNEY_SCHEMA_VERSION = void 0;
exports.getActivationHostCapability = getActivationHostCapability;
exports.listActivationHostCapabilities = listActivationHostCapabilities;
exports.activationSessionCommand = activationSessionCommand;
exports.buildActivationJourney = buildActivationJourney;
exports.ACTIVATION_JOURNEY_SCHEMA_VERSION = 'neurcode.activation-journey.v2';
exports.ACTIVATION_JOURNEY_STAGE_IDS = [
    'account_ready',
    'workspace_selected',
    'local_repo_paired',
    'host_selected',
    'host_configured',
    'brain_proof_synced',
    'session_runtime_active',
    'first_governed_action_observed',
    'evidence_verified',
];
const HOST_CAPABILITIES = {
    claude: {
        id: 'claude', label: 'Claude Code', adapter: 'claude-code-hooks',
        automaticPreWriteInterception: true, interception: 'complete_prewrite_boundary',
        governedAction: 'Claude Edit, Write, MultiEdit, and shell write tool calls covered by installed lifecycle hooks.',
        evidenceLevel: 'host_enforced',
        limitation: 'Hard denial applies only while the installed Claude Code hooks are enabled and healthy.',
        setupCommand: 'neurcode activate claude --dir <repository-path>',
        repairCommand: 'neurcode activate claude --dir <repository-path> --force',
    },
    codex: {
        id: 'codex', label: 'Codex', adapter: 'codex-hooks',
        automaticPreWriteInterception: true, interception: 'supported_tool_prewrite_guardrail',
        governedAction: 'Codex PreToolUse calls for apply_patch, simple Bash, and MCP tools covered by the trusted repository hook.',
        evidenceLevel: 'host_guardrail',
        limitation: 'Codex documents PreToolUse as a guardrail, not a complete boundary: unified execution and equivalent tool paths are not fully intercepted.',
        setupCommand: 'neurcode agent bootstrap codex --dir <repository-path>',
        repairCommand: 'neurcode agent bootstrap codex --dir <repository-path>',
    },
    copilot: {
        id: 'copilot', label: 'GitHub Copilot', adapter: 'copilot-hooks',
        automaticPreWriteInterception: true, interception: 'host_dependent_prewrite_hook',
        governedAction: 'Copilot Agent Mode tool calls exposed through repository lifecycle hooks.',
        evidenceLevel: 'host_dependent',
        limitation: 'Pre-write denial exists only in Copilot hosts and versions that discover and honor repository hooks.',
        setupCommand: 'neurcode activate copilot --dir <repository-path>',
        repairCommand: 'neurcode activate copilot --dir <repository-path> --force',
    },
    cursor: {
        id: 'cursor', label: 'Cursor', adapter: 'cursor-mcp',
        automaticPreWriteInterception: false, interception: 'cooperative_prewrite',
        governedAction: 'An edit.before call made through Neurcode MCP, plus supervisor detection of unverified writes.',
        evidenceLevel: 'cooperative',
        limitation: 'Cursor can write without calling MCP; Neurcode cannot claim host-level automatic denial.',
        setupCommand: 'neurcode cursor onboard --strict',
        repairCommand: 'neurcode cursor onboard --strict',
    },
    vscode: {
        id: 'vscode', label: 'VS Code', adapter: 'vscode-extension',
        automaticPreWriteInterception: false, interception: 'post_write_observation',
        governedAction: 'Runtime companion visibility and source-free post-write evidence.',
        evidenceLevel: 'observed',
        limitation: 'The extension does not own Copilot or another agent host write boundary.',
        setupCommand: 'neurcode agent bootstrap vscode --dir <repository-path>',
        repairCommand: 'neurcode agent bootstrap vscode --dir <repository-path>',
    },
    action: {
        id: 'action', label: 'GitHub Action', adapter: 'github-action',
        automaticPreWriteInterception: false, interception: 'ci_backstop',
        governedAction: 'Post-change CI admission and evidence checks.',
        evidenceLevel: 'post_change',
        limitation: 'A CI Action runs after changes exist and is never in-flow host enforcement.',
        setupCommand: 'neurcode activate action --dir <repository-path>',
        repairCommand: 'neurcode activate action --dir <repository-path> --force',
    },
};
function getActivationHostCapability(agent) {
    return { ...HOST_CAPABILITIES[agent] };
}
function listActivationHostCapabilities() {
    return Object.keys(HOST_CAPABILITIES).map(getActivationHostCapability);
}
const STAGE_COPY = {
    account_ready: { label: 'Account ready', description: 'Versioned account onboarding is complete.' },
    workspace_selected: { label: 'Workspace selected', description: 'The authenticated user is a member of this explicit workspace.' },
    local_repo_paired: { label: 'Local repository paired', description: 'An authenticated local-checkout proof or runtime pairing matches the selected repository.' },
    host_selected: { label: 'Host selected', description: 'The intended AI coding host is explicit for this repository.' },
    host_configured: { label: 'Host configured', description: 'Repository-bound setup proof reports the selected host integration installed.' },
    brain_proof_synced: { label: 'Brain proof synced', description: 'The server received fresh repository-bound Brain readiness proof.' },
    session_runtime_active: { label: 'Session runtime active', description: 'A user-owned runtime session reported for this repository and host.' },
    first_governed_action_observed: { label: 'Governed action observed', description: 'The backend observed an allow, warning, or denial from the governed runtime.' },
    evidence_verified: { label: 'Evidence verified', description: 'A backend-signed source-free receipt exists for replayable session evidence.' },
};
function validTimestamp(value) {
    if (!value || Number.isNaN(Date.parse(value)))
        return null;
    return value;
}
function setupCommand(agent) {
    return `npx -y @neurcode-ai/cli@latest setup --repo <repository-path>${agent ? ` --agent ${agent}` : ''}`;
}
function activationSessionCommand(agent) {
    if (agent === 'action')
        return 'neurcode setup --repo <repository-path> --agent <claude|cursor|codex|vscode|copilot>';
    const target = agent || '<claude|cursor|codex|vscode|copilot>';
    return `neurcode agent guard start ${target} --goal "<bounded task>" --plan "<source-free plan>" --no-supervise`;
}
function nextActionFor(input) {
    if (!input.stage)
        return { stage: 'complete', surface: 'web', label: 'Review verified evidence', reason: 'The first repository-bound governed action has a backend-signed replay receipt.', command: null, href: 'runtime-evidence' };
    switch (input.stage) {
        case 'account_ready': return { stage: input.stage, surface: 'web', label: 'Finish account setup', reason: 'Account identity must be complete before workspace activation.', command: null, href: '/onboarding' };
        case 'workspace_selected': return { stage: input.stage, surface: 'hybrid', label: 'Select a workspace', reason: 'Neurcode never guesses a personal or organization tenant.', command: 'neurcode login', href: '/workspaces' };
        case 'local_repo_paired': return { stage: input.stage, surface: 'hybrid', label: input.repositorySelectionRequired ? 'Select a locally paired repository' : 'Pair a local checkout', reason: 'Neurcode never guesses a repository. GitHub visibility is discovery only; run setup inside the checkout or pass its path.', command: setupCommand(null), href: 'workspaces' };
        case 'host_selected': return { stage: input.stage, surface: 'hybrid', label: 'Choose the AI coding host', reason: 'The host and its enforcement limit must be explicit for this repository.', command: 'neurcode setup --repo <repository-path> --agent <claude|cursor|codex|vscode|copilot|action>', href: null };
        case 'host_configured': return { stage: input.stage, surface: 'cli', label: `Configure ${input.agent || 'the selected host'}`, reason: 'Install and verify only the repository-bound integration selected for this checkout.', command: setupCommand(input.agent), href: null };
        case 'brain_proof_synced': return { stage: input.stage, surface: 'cli', label: 'Build and sync Brain proof', reason: 'A local index is not server proof. Setup verifies freshness and syncs a source-free repository-bound proof.', command: setupCommand(input.agent), href: null };
        case 'session_runtime_active': return { stage: input.stage, surface: 'cli', label: 'Start a governed host session', reason: 'Start one real bounded task with the selected host.', command: activationSessionCommand(input.agent), href: null };
        case 'first_governed_action_observed': return { stage: input.stage, surface: 'cli', label: 'Run one governed write check', reason: 'Produce a real allow, warning, or denial through the configured host path.', command: input.sessionStatus === 'active' ? 'Make one bounded change with the selected host, then inspect its Neurcode decision.' : activationSessionCommand(input.agent), href: null };
        case 'evidence_verified': return { stage: input.stage, surface: 'hybrid', label: 'Finish, sync, and verify evidence', reason: 'Finish the session and sync its source-free record for backend signing and replay.', command: input.sessionStatus === 'active' ? 'neurcode agent guard finish --fail-on-unverified && neurcode sync --runtime' : 'neurcode sync --runtime', href: 'runtime-evidence' };
    }
}
function emptySummary(input) {
    return {
        memberCount: Math.max(0, input?.memberCount || 0), repositoryCount: Math.max(0, input?.repositoryCount || 0),
        cliConnectedMemberCount: Math.max(0, input?.cliConnectedMemberCount || 0), activeMemberCount: Math.max(0, input?.activeMemberCount || 0),
        governedSessionCount: Math.max(0, input?.governedSessionCount || 0), evidenceRecordCount: Math.max(0, input?.evidenceRecordCount || 0),
        pendingApprovalCount: Math.max(0, input?.pendingApprovalCount || 0),
    };
}
function buildActivationJourney(input) {
    const generatedAt = validTimestamp(input.generatedAt) || new Date().toISOString();
    const candidates = [...(input.repositoryCandidates || [])];
    const selected = input.selectedRepository || null;
    const selectionRequired = !selected;
    const signals = {
        account_ready: input.accountReady, workspace_selected: input.workspaceSelected,
        local_repo_paired: input.localRepoPaired, host_selected: input.hostSelected,
        host_configured: input.hostConfigured, brain_proof_synced: input.brainProofSynced,
        session_runtime_active: input.sessionRuntimeActive, first_governed_action_observed: input.firstGovernedActionObserved,
        evidence_verified: input.evidenceVerified,
    };
    // The activation journey is a state machine, not a collection of badges.
    // Durable evidence for a later stage remains in its source table, but it
    // cannot visually skip an unproven prerequisite.
    const completed = new Set();
    for (const id of exports.ACTIVATION_JOURNEY_STAGE_IDS) {
        if (!validTimestamp(signals[id]?.completedAt))
            break;
        completed.add(id);
    }
    const currentStage = exports.ACTIVATION_JOURNEY_STAGE_IDS.find((id) => !completed.has(id)) || null;
    const currentIndex = currentStage ? exports.ACTIVATION_JOURNEY_STAGE_IDS.indexOf(currentStage) : -1;
    const stages = exports.ACTIVATION_JOURNEY_STAGE_IDS.map((id, index) => {
        const provenAt = validTimestamp(signals[id]?.completedAt);
        const complete = completed.has(id);
        const completedAt = complete ? provenAt : null;
        const status = complete ? 'complete'
            : id === 'local_repo_paired' && selectionRequired && currentStage === id ? 'blocked'
                : index === currentIndex ? 'current' : 'pending';
        return { id, ...STAGE_COPY[id], status, complete, completedAt, evidence: complete ? signals[id]?.evidence || null : null };
    });
    const progress = stages.filter((stage) => stage.complete).length;
    const sessionStatus = input.sessionStatus || (input.evidenceVerified?.completedAt ? 'evidence_available' : 'not_started');
    const capability = input.selectedAgent ? getActivationHostCapability(input.selectedAgent) : null;
    const host = {
        id: input.selectedAgent || null,
        capability,
        detected: input.hostFacts?.detected === true,
        selected: Boolean(input.hostSelected?.completedAt && input.selectedAgent),
        configured: input.hostFacts?.configured === true,
        authenticated: input.hostFacts?.authenticated === true,
        active: input.hostFacts?.active === true,
        failureReason: input.hostFacts?.failureReason || null,
        repairCommand: capability?.repairCommand || null,
        installation: input.hostFacts?.installation || {
            state: 'unverified', configIntegrity: 'unverified', trustState: 'unknown', checkedAt: null,
            fresh: false, runtimeObserved: false, reasonCodes: ['managed_installation_proof_missing'],
        },
    };
    const verified = currentStage === null;
    const brain = {
        proofStatus: input.brain?.proofStatus || (input.brainProofSynced?.completedAt ? 'verified' : 'unavailable'),
        localStatus: input.brain?.localStatus || 'not_observed',
        uploadedAt: validTimestamp(input.brain?.uploadedAt),
        verifiedAt: validTimestamp(input.brain?.verifiedAt || input.brainProofSynced?.completedAt),
        reason: input.brain?.reason || (input.brainProofSynced?.completedAt
            ? 'Fresh authenticated repository-bound Brain proof is verified by the server.'
            : 'No server-observed Brain proof is available for the selected repository.'),
        repairCommand: input.brain?.repairCommand || 'neurcode setup --repo <repository-path>',
    };
    return {
        schemaVersion: exports.ACTIVATION_JOURNEY_SCHEMA_VERSION,
        generatedAt,
        workspace: input.workspace,
        selectedAgent: input.selectedAgent || null,
        host,
        brain,
        repository: { selected, candidates, selectionRequired },
        session: { status: sessionStatus, startedAt: validTimestamp(input.sessionStartedAt), finishedAt: validTimestamp(input.sessionFinishedAt) },
        stages, currentStage, progress, total: stages.length, firstValueReached: verified,
        nextAction: nextActionFor({ stage: currentStage, agent: input.selectedAgent || null, sessionStatus, repositorySelectionRequired: selectionRequired }),
        summary: emptySummary(input.summary),
        outcome: verified
            ? { verified: true, headline: 'First governed action verified', detail: 'The selected workspace, local repository, host, runtime action, and backend-signed replay receipt are bound.' }
            : { verified: false, headline: 'Activation is not yet verified', detail: 'Only completed backend-derived stages are shown as proven.' },
        privacy: { sourceUploaded: false, promptsStored: false, diffsStored: false, machinePathsStored: false, evidenceDerived: true },
        limitations: capability ? [capability.limitation, 'Local Brain readiness appears only after authenticated source-free proof reaches the workspace.'] : ['No host capability is assumed until a host is explicitly selected for the repository.'],
    };
}
//# sourceMappingURL=index.js.map