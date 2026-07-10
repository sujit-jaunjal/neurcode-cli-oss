"use strict";
/**
 * Canonical account-to-first-evidence activation journey.
 *
 * This read model is intentionally evidence-derived. Clients may select an
 * agent or repository, but they cannot mark a stage complete. Completion is
 * built from durable account, credential, repository, Brain, runtime-session,
 * and evidence facts owned by the API.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVATION_JOURNEY_STAGE_IDS = exports.ACTIVATION_JOURNEY_SCHEMA_VERSION = void 0;
exports.activationSessionCommand = activationSessionCommand;
exports.buildActivationJourney = buildActivationJourney;
exports.ACTIVATION_JOURNEY_SCHEMA_VERSION = 'neurcode.activation-journey.v1';
exports.ACTIVATION_JOURNEY_STAGE_IDS = [
    'account_onboarded',
    'cli_authenticated',
    'agent_selected',
    'repository_connected',
    'brain_ready',
    'runtime_active',
    'first_governed_session',
    'evidence_available',
];
const STAGE_COPY = {
    account_onboarded: {
        label: 'Account ready',
        description: 'Profile, workspace intent, and orientation are complete.',
    },
    cli_authenticated: {
        label: 'CLI connected',
        description: 'This user has an active CLI credential scoped to this workspace.',
    },
    agent_selected: {
        label: 'Agent selected',
        description: 'The coding environment is explicit, so setup never installs the wrong integration.',
    },
    repository_connected: {
        label: 'Repository connected',
        description: 'A repository ownership record is selected for this activation journey.',
    },
    brain_ready: {
        label: 'Brain ready',
        description: 'The selected repository has a fresh or bounded-partial local Brain proof.',
    },
    runtime_active: {
        label: 'Runtime active',
        description: 'The selected agent integration is installed and has reported runtime readiness.',
    },
    first_governed_session: {
        label: 'First governed session',
        description: 'This user has completed a governed session for the selected repository.',
    },
    evidence_available: {
        label: 'Evidence available',
        description: 'Source-free governed-session evidence is available in the workspace.',
    },
};
function validTimestamp(value) {
    if (!value || Number.isNaN(Date.parse(value)))
        return null;
    return value;
}
function selectedAgentFlag(agent) {
    return agent ? ` --agent ${agent}` : '';
}
function setupCommand(agent, requireRepo) {
    return `npx -y @neurcode-ai/cli@latest setup${requireRepo ? ' --repo <repository-path>' : ''}${selectedAgentFlag(agent)}`;
}
function activationSessionCommand(agent) {
    if (agent === 'action') {
        return 'neurcode setup --repo <repository-path> --agent <claude|cursor|codex|vscode|copilot>';
    }
    const target = agent || '<claude|cursor|codex|vscode|copilot>';
    return `neurcode agent guard start ${target} --goal "<bounded task>" --plan "<source-free plan>" --no-supervise`;
}
function nextActionFor(input) {
    const stage = input.stage;
    if (!stage) {
        return {
            stage: 'complete',
            surface: 'web',
            label: 'Open Runtime Control Plane',
            reason: 'The first governed evidence loop is complete. Continue with live sessions, policies, and approvals.',
            command: null,
            href: 'runtime-control-plane',
        };
    }
    if (stage === 'account_onboarded') {
        return {
            stage,
            surface: 'web',
            label: 'Finish account onboarding',
            reason: 'Profile and workspace authority must be explicit before local activation begins.',
            command: null,
            href: '/onboarding',
        };
    }
    if (stage === 'cli_authenticated') {
        return {
            stage,
            surface: 'cli',
            label: 'Connect this machine',
            reason: 'Setup can start from any terminal. It will authenticate first and will not mutate a directory until a repository is explicit.',
            command: setupCommand(input.agent, false),
            href: null,
        };
    }
    if (stage === 'agent_selected') {
        return {
            stage,
            surface: 'hybrid',
            label: 'Choose the coding agent',
            reason: 'Neurcode does not guess an integration or overstate its enforcement capability.',
            command: 'neurcode setup --agent <claude|cursor|codex|vscode|copilot|action>',
            href: 'setup',
        };
    }
    if (stage === 'repository_connected') {
        return {
            stage,
            surface: input.repositorySelectionRequired ? 'hybrid' : 'cli',
            label: input.repositorySelectionRequired ? 'Select the repository to activate' : 'Connect a repository',
            reason: input.repositorySelectionRequired
                ? 'This workspace has multiple repositories. Select one so another repository cannot complete this journey accidentally.'
                : 'Run setup inside the repository or pass its path explicitly from any terminal.',
            command: setupCommand(input.agent, true),
            href: input.repositorySelectionRequired ? 'home' : null,
        };
    }
    if (stage === 'brain_ready') {
        return {
            stage,
            surface: 'cli',
            label: 'Build repository intelligence',
            reason: 'A fresh source-free repository graph is required before runtime activation is claimed.',
            command: setupCommand(input.agent, true),
            href: null,
        };
    }
    if (stage === 'runtime_active') {
        return {
            stage,
            surface: 'cli',
            label: `Activate ${input.agent || 'the selected agent'}`,
            reason: 'Setup installs only the integration selected for this repository and reports its honest enforcement posture.',
            command: setupCommand(input.agent, true),
            href: null,
        };
    }
    if (stage === 'first_governed_session') {
        if (input.agent === 'action') {
            return {
                stage,
                surface: 'hybrid',
                label: 'Choose a local agent for the governed session',
                reason: 'GitHub Action is a post-change CI backstop, not an in-flow coding agent. Select a local agent to produce a real governed session; keep the Action as the later admission check.',
                command: activationSessionCommand(input.agent),
                href: 'home',
            };
        }
        if (input.sessionStatus === 'active') {
            return {
                stage,
                surface: 'cli',
                label: 'Finish the active governed task',
                reason: 'A user-owned session is live for this repository. Finish it after the agent completes the bounded task so its final guard posture can be recorded.',
                command: 'neurcode agent guard finish --fail-on-unverified',
                href: null,
            };
        }
        if (input.sessionStatus === 'finished_pending_evidence') {
            return {
                stage,
                surface: 'cli',
                label: 'Sync the finished governed session',
                reason: 'The session finished locally. Sync its source-free record so the workspace can verify completion and expose evidence.',
                command: 'neurcode sync --runtime',
                href: null,
            };
        }
        return {
            stage,
            surface: 'cli',
            label: 'Start one bounded governed task',
            reason: 'First value requires a real user-owned governed session, not a manually completed checklist.',
            command: activationSessionCommand(input.agent),
            href: null,
        };
    }
    return {
        stage,
        surface: 'hybrid',
        label: 'Sync and inspect the first evidence',
        reason: 'Finish the governed session and sync its source-free record to the workspace.',
        command: 'neurcode sync --runtime',
        href: 'runtime-evidence',
    };
}
function emptySummary(input) {
    return {
        memberCount: Math.max(0, input?.memberCount || 0),
        repositoryCount: Math.max(0, input?.repositoryCount || 0),
        cliConnectedMemberCount: Math.max(0, input?.cliConnectedMemberCount || 0),
        activeMemberCount: Math.max(0, input?.activeMemberCount || 0),
        governedSessionCount: Math.max(0, input?.governedSessionCount || 0),
        evidenceRecordCount: Math.max(0, input?.evidenceRecordCount || 0),
        pendingApprovalCount: Math.max(0, input?.pendingApprovalCount || 0),
    };
}
function buildActivationJourney(input) {
    const generatedAt = validTimestamp(input.generatedAt) || new Date().toISOString();
    const candidates = [...(input.repositoryCandidates || [])];
    const selected = input.selectedRepository || null;
    const selectionRequired = !selected && candidates.length > 1;
    const signals = {
        account_onboarded: input.accountOnboarded,
        cli_authenticated: input.cliAuthenticated,
        agent_selected: input.agentSelected,
        repository_connected: input.repositoryConnected,
        brain_ready: input.brainReady,
        runtime_active: input.runtimeActive,
        first_governed_session: input.firstGovernedSession,
        evidence_available: input.evidenceAvailable,
    };
    const completed = new Set();
    for (const id of exports.ACTIVATION_JOURNEY_STAGE_IDS) {
        if (validTimestamp(signals[id]?.completedAt))
            completed.add(id);
    }
    const currentStage = exports.ACTIVATION_JOURNEY_STAGE_IDS.find((id) => !completed.has(id)) || null;
    const currentIndex = currentStage ? exports.ACTIVATION_JOURNEY_STAGE_IDS.indexOf(currentStage) : -1;
    const stages = exports.ACTIVATION_JOURNEY_STAGE_IDS.map((id, index) => {
        const completedAt = validTimestamp(signals[id]?.completedAt);
        const complete = Boolean(completedAt);
        const status = complete
            ? 'complete'
            : id === 'repository_connected' && selectionRequired && currentStage === id
                ? 'blocked'
                : index === currentIndex
                    ? 'current'
                    : 'pending';
        return {
            id,
            ...STAGE_COPY[id],
            status,
            complete,
            completedAt,
            evidence: complete ? signals[id]?.evidence || null : null,
        };
    });
    const progress = stages.filter((stage) => stage.complete).length;
    const sessionStatus = input.sessionStatus || (input.evidenceAvailable?.completedAt
        ? 'evidence_available'
        : input.firstGovernedSession?.completedAt
            ? 'finished_pending_evidence'
            : 'not_started');
    return {
        schemaVersion: exports.ACTIVATION_JOURNEY_SCHEMA_VERSION,
        generatedAt,
        workspace: input.workspace,
        selectedAgent: input.selectedAgent || null,
        repository: { selected, candidates, selectionRequired },
        session: {
            status: sessionStatus,
            startedAt: validTimestamp(input.sessionStartedAt),
            finishedAt: validTimestamp(input.sessionFinishedAt),
        },
        stages,
        currentStage,
        progress,
        total: stages.length,
        firstValueReached: currentStage === null,
        nextAction: nextActionFor({
            stage: currentStage,
            agent: input.selectedAgent || null,
            repositorySelectionRequired: selectionRequired,
            sessionStatus,
        }),
        summary: emptySummary(input.summary),
        privacy: {
            sourceUploaded: false,
            promptsStored: false,
            diffsStored: false,
            machinePathsStored: false,
            evidenceDerived: true,
        },
        limitations: [
            'Local Brain readiness appears only after authenticated source-free proof reaches the workspace.',
            'A team repository can be shared, but governed-session completion is scoped to the current user.',
            'Cursor and Codex use cooperative guard evidence; only supported hook hosts may claim hard pre-write denial.',
        ],
    };
}
//# sourceMappingURL=index.js.map