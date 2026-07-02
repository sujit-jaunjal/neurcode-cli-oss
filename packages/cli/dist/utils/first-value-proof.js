"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFirstValueCliState = buildFirstValueCliState;
exports.renderFirstValueStart = renderFirstValueStart;
exports.renderFirstValueReport = renderFirstValueReport;
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const contracts_1 = require("@neurcode-ai/contracts");
const config_1 = require("../config");
const v0_governance_1 = require("./v0-governance");
const brain_lifecycle_1 = require("./brain-lifecycle");
const runtime_connection_1 = require("./runtime-connection");
const onboard_1 = require("../commands/onboard");
const agent_adapter_setup_1 = require("./agent-adapter-setup");
const activation_proof_1 = require("./activation-proof");
function sha(input) {
    return (0, node_crypto_1.createHash)('sha256').update(input).digest('hex').slice(0, 32);
}
function gitValue(repoRoot, args) {
    try {
        const value = (0, node_child_process_1.execFileSync)('git', args, {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
        }).trim();
        return value || null;
    }
    catch {
        return null;
    }
}
function readRepoConfig(repoRoot) {
    try {
        const path = (0, node_path_1.join)(repoRoot, '.neurcode', 'config.json');
        if (!(0, node_fs_1.existsSync)(path))
            return { orgId: null, projectId: null };
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        return {
            orgId: typeof parsed.orgId === 'string' && parsed.orgId.trim() ? parsed.orgId.trim() : null,
            projectId: typeof parsed.projectId === 'string' && parsed.projectId.trim() ? parsed.projectId.trim() : null,
        };
    }
    catch {
        return { orgId: null, projectId: null };
    }
}
function isGitRepo(repoRoot) {
    return gitValue(repoRoot, ['rev-parse', '--is-inside-work-tree']) === 'true';
}
function setupTargetForEnvironment(target) {
    if (target === 'claude')
        return 'claude';
    if (target === 'cursor')
        return 'cursor';
    if (target === 'vscode')
        return 'vscode';
    if (target === 'copilot')
        return 'copilot';
    if (target === 'codex' || target === 'terminal')
        return 'codex';
    return 'generic-mcp';
}
function agentForCommand(target) {
    if (target === 'claude' || target === 'cursor' || target === 'vscode' || target === 'copilot' || target === 'codex') {
        return target;
    }
    return 'terminal';
}
function agentGuardCommandFor(target) {
    const agent = agentForCommand(target);
    const agentId = agent === 'terminal' ? 'codex' : agent;
    return `neurcode agent guard start ${agentId} --goal "<bounded task>"`;
}
function brainStatusFromLifecycle(state) {
    if (state === 'fresh')
        return 'fresh';
    if (state === 'missing')
        return 'missing';
    if (state === 'stale' || state === 'partial' || state === 'scheduled' || state === 'building')
        return 'stale';
    return 'not_evaluated';
}
function runtimeAtLeast(status, minimum) {
    const rank = {
        not_configured: 0,
        configured: 1,
        governed_check_seen: 2,
        block_seen: 3,
        approval_seen: 4,
    };
    return rank[status ?? 'not_configured'] >= rank[minimum];
}
function evidenceAtLeast(status, minimum) {
    const rank = { none: 0, synced: 1, viewed: 2 };
    return rank[status ?? 'none'] >= rank[minimum];
}
function repoIntelSynced(status) {
    return status === 'synced';
}
async function fetchCloudFirstValueState(input) {
    const apiKey = (0, config_1.getApiKey)(input.orgId || undefined) || (0, config_1.getApiKey)();
    if (!apiKey)
        return { state: null, reachable: null };
    const config = (0, config_1.loadConfig)();
    const apiUrl = (input.apiUrl || config.apiUrl || config_1.DEFAULT_API_URL).replace(/\/$/, '');
    const headers = {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
    };
    if (input.orgId)
        headers['x-org-id'] = input.orgId;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
        const response = await fetch(`${apiUrl}/api/v1/activation/first-value-state`, {
            method: 'GET',
            headers,
            signal: controller.signal,
        });
        if (!response.ok)
            return { state: null, reachable: false };
        return { state: await response.json(), reachable: true };
    }
    catch {
        return { state: null, reachable: false };
    }
    finally {
        clearTimeout(timeout);
    }
}
function localAgentReady(repoRoot, target) {
    try {
        const manifest = (0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot);
        if (manifest?.integrations?.length)
            return true;
    }
    catch {
        // Best-effort; fall through to adapter-specific checks.
    }
    if (target === 'claude') {
        try {
            const claude = (0, v0_governance_1.inspectClaudeActivation)(repoRoot);
            return claude.hooks.installed || claude.mcp.configured;
        }
        catch {
            return false;
        }
    }
    try {
        const setup = (0, agent_adapter_setup_1.inspectAgentSetup)({ target, repoRoot, global: target === 'codex' });
        const instructions = (0, agent_adapter_setup_1.inspectAgentInstructions)({ target, repoRoot });
        return setup.configured === true || instructions.installed === true;
    }
    catch {
        return false;
    }
}
async function buildFirstValueCliState(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const repoDetected = isGitRepo(repoRoot);
    const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
    const repoConfig = readRepoConfig(repoRoot);
    const environment = (0, onboard_1.detectOnboardEnvironment)(repoRoot);
    const commandAgent = options.agent ? agentForCommand(options.agent) : environment.target;
    const setupTarget = setupTargetForEnvironment(commandAgent);
    const runtimeAdapterReady = localAgentReady(repoRoot, setupTarget);
    const orgId = repoConfig.orgId || connection?.organizationId || null;
    const projectId = repoConfig.projectId || connection?.projectId || null;
    const apiKey = (0, config_1.getApiKey)(orgId || undefined) || (0, config_1.getApiKey)();
    const cloud = await fetchCloudFirstValueState({ orgId, apiUrl: connection?.apiUrl });
    const proofQueue = (0, activation_proof_1.getFirstValueActivationProofQueueStatus)(projectId);
    let brainStatus = 'not_evaluated';
    try {
        brainStatus = brainStatusFromLifecycle((await (0, brain_lifecycle_1.inspectBrainLifecycle)(repoRoot)).state);
    }
    catch {
        brainStatus = 'not_evaluated';
    }
    if (brainStatus === 'not_evaluated' && cloud.state?.proof.brainStatus) {
        brainStatus = cloud.state.proof.brainStatus;
    }
    const remote = repoDetected ? gitValue(repoRoot, ['config', '--get', 'remote.origin.url']) : null;
    const repoLabel = connection?.repo?.name || (repoDetected ? (0, node_path_1.basename)(repoRoot) : null);
    const repoHash = connection?.repo?.repoKey || (repoDetected ? sha(remote || repoRoot) : null);
    const cloudProof = cloud.state?.proof;
    const cloudRepoConnected = cloudProof?.steps.find((step) => step.id === 'repo_connect')?.complete === true
        && cloudProof.repoConnection.status !== 'local_proof_queued';
    const localRepoConnected = Boolean(connection || projectId);
    const localProofQueued = proofQueue.matchingProjectQueued || (localRepoConnected && !cloudRepoConnected);
    const repoConnectionStatus = cloudRepoConnected
        ? cloudProof?.repoConnection.status || 'cloud_proof_synced'
        : localProofQueued
            ? 'local_proof_queued'
            : 'missing';
    const repoConnectionSource = cloudRepoConnected
        ? cloudProof?.repoConnection.source || 'activation_proof'
        : localProofQueued
            ? 'local_config'
            : 'none';
    const state = (0, contracts_1.buildFirstValueState)({
        workspaceId: orgId || cloudProof?.workspaceId || null,
        repoLabel: cloudProof?.repo.label || repoLabel,
        repoHash: cloudProof?.repo.hash || repoHash,
        projectId: projectId || cloudProof?.repoConnection.projectId || null,
        repoId: cloudProof?.repoConnection.repoId || null,
        repoConnectionStatus,
        repoConnectionSource,
        repoProofSyncedAt: cloudProof?.repoConnection.cloudProofSyncedAt || null,
        repoProofQueued: localProofQueued,
        loggedIn: Boolean(apiKey || cloudProof?.workspaceId),
        repoConnected: localRepoConnected || cloudRepoConnected,
        brainStatus,
        agentConfigured: runtimeAdapterReady || runtimeAtLeast(cloudProof?.runtimeStatus, 'configured'),
        governedCheckSeen: runtimeAtLeast(cloudProof?.runtimeStatus, 'governed_check_seen'),
        blockSeen: runtimeAtLeast(cloudProof?.runtimeStatus, 'block_seen'),
        approvalSeen: runtimeAtLeast(cloudProof?.runtimeStatus, 'approval_seen'),
        evidenceSynced: evidenceAtLeast(cloudProof?.evidenceStatus, 'synced') || Boolean(connection?.autoSync?.lastSyncedAt),
        evidenceViewed: evidenceAtLeast(cloudProof?.evidenceStatus, 'viewed'),
        repoIntelligenceSynced: repoIntelSynced(cloudProof?.repoIntelligenceStatus),
        repoIntelligenceNotEvaluated: cloudProof?.repoIntelligenceStatus === 'not_evaluated',
    });
    const adjusted = {
        ...state,
        proof: {
            ...state.proof,
            steps: state.proof.steps.map((step) => {
                if (step.id === 'governed_check') {
                    return {
                        ...step,
                        recommendedCommand: agentGuardCommandFor(commandAgent),
                    };
                }
                if (step.id !== 'agent_setup')
                    return step;
                return {
                    ...step,
                    recommendedCommand: (0, onboard_1.agentSetupCommandFor)(commandAgent),
                };
            }),
        },
        local: {
            cliInstalled: true,
            repoDetected,
            environment: {
                target: environment.target,
                label: environment.label,
                basis: environment.source,
            },
            runtimeAdapterReady,
            apiReachable: cloud.reachable,
        },
    };
    const nextStep = adjusted.proof.steps.find((step) => !step.complete);
    if (nextStep?.id === 'agent_setup') {
        adjusted.proof.nextRecommendedCommand = (0, onboard_1.agentSetupCommandFor)(commandAgent);
    }
    else if (nextStep?.id === 'governed_check') {
        adjusted.proof.nextRecommendedCommand = agentGuardCommandFor(commandAgent);
    }
    return adjusted;
}
function renderFirstValueStart(state) {
    const proof = state.proof;
    const next = proof.steps.find((step) => !step.complete);
    const lines = [];
    lines.push('');
    lines.push('Neurcode First Value Proof');
    lines.push('');
    lines.push('What Neurcode will prove');
    lines.push('- A governed AI coding check can run in this repo.');
    lines.push('- Sensitive boundaries can be blocked or routed to exact-path approval.');
    lines.push('- Runtime Evidence and Repo Intelligence stay source-free.');
    lines.push('');
    lines.push('What stays local');
    lines.push('- Source code, prompts, diffs, raw args, secrets, and absolute paths.');
    lines.push('- The Brain index is local; cloud evidence receives only source-free records after sync.');
    lines.push('');
    lines.push(`CLI installed: yes`);
    lines.push(`Repo detected: ${state.local.repoDetected ? 'yes' : 'no'}`);
    lines.push(`Login: ${proof.steps.find((step) => step.id === 'login')?.complete ? 'connected' : 'not connected'}`);
    lines.push(`Brain: ${proof.brainStatus}`);
    lines.push(`Agent environment: ${state.local.environment.label}`);
    lines.push(`Runtime adapter: ${state.local.runtimeAdapterReady ? 'ready' : 'not configured'}`);
    lines.push(`Evidence: ${proof.evidenceStatus}`);
    lines.push(`Repo Intelligence: ${proof.repoIntelligenceStatus}`);
    lines.push('');
    lines.push('Next command');
    lines.push(proof.nextRecommendedCommand);
    lines.push('');
    lines.push('What you should see after this');
    lines.push(next?.expectedOutcome || 'The First Value page shows all proof steps complete.');
    lines.push('');
    return lines.join('\n');
}
function renderFirstValueReport(state) {
    const proof = state.proof;
    const complete = new Set(proof.steps.filter((step) => step.complete).map((step) => step.id));
    const lines = [];
    lines.push('');
    lines.push('Neurcode First Value Report');
    lines.push('');
    lines.push(`Proof ID: ${proof.proofId}`);
    lines.push(`Workspace: ${proof.workspaceId ? 'authenticated' : 'not authenticated'}`);
    lines.push(`Repository: ${proof.repo.label || proof.repo.hash || 'not connected'}`);
    lines.push(`Repo connection: ${proof.repoConnection.status}`);
    lines.push(`Cloud proof synced: ${proof.repoConnection.cloudProofSyncedAt ? 'yes' : 'no'}`);
    lines.push(`Cloud proof queued: ${proof.repoConnection.proofQueued ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('Activation milestones');
    for (const step of proof.steps) {
        lines.push(`- ${step.label}: ${step.complete ? 'complete' : 'missing'}`);
    }
    lines.push('');
    lines.push(`First governed check: ${complete.has('governed_check') ? 'seen' : 'missing'}`);
    lines.push(`First block or approval: ${runtimeAtLeast(proof.runtimeStatus, 'block_seen') ? proof.runtimeStatus : 'missing'}`);
    lines.push(`Repo intelligence synced: ${proof.repoIntelligenceStatus === 'synced' ? 'yes' : proof.repoIntelligenceStatus}`);
    lines.push('Source uploaded: false');
    lines.push('');
    lines.push(`Next missing step: ${proof.missingSteps[0] || 'none'}`);
    lines.push(`Next command: ${proof.nextRecommendedCommand}`);
    lines.push('');
    lines.push('Limitations');
    for (const limitation of proof.limitations)
        lines.push(`- ${limitation}`);
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=first-value-proof.js.map