"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordActivatedRuntime = recordActivatedRuntime;
exports.repairRuntimeAuthority = repairRuntimeAuthority;
exports.inspectRuntimeAuthority = inspectRuntimeAuthority;
exports.assertProtectedRuntimeAuthority = assertProtectedRuntimeAuthority;
exports.runtimeManifestExists = runtimeManifestExists;
exports.activeRuntimeEntrypoint = activeRuntimeEntrypoint;
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const v0_governance_1 = require("./v0-governance");
const cli_entry_1 = require("./cli-entry");
const brain_lifecycle_1 = require("./brain-lifecycle");
const agent_adapter_setup_1 = require("./agent-adapter-setup");
const TARGETS = [
    { adapter: 'cli', enforcementLevel: 'cooperative' },
    { adapter: 'claude-code-hooks', enforcementLevel: 'hard_hook' },
    { adapter: 'copilot-hooks', enforcementLevel: 'hard_hook' },
    { adapter: 'codex-mcp', enforcementLevel: 'cooperative' },
    { adapter: 'cursor-mcp', enforcementLevel: 'cooperative' },
    { adapter: 'generic-mcp', enforcementLevel: 'cooperative' },
    { adapter: 'supervisor', enforcementLevel: 'supervised' },
    { adapter: 'daemon', enforcementLevel: 'observe_only' },
    { adapter: 'vscode-extension', enforcementLevel: 'observe_only' },
    { adapter: 'github-action', enforcementLevel: 'post_pr' },
];
function writeRuntimeWiring(repoRoot, entrypoint) {
    const path = (0, node_path_1.join)(repoRoot, '.neurcode', 'runtime-wiring.json');
    const payload = {
        schemaVersion: 'neurcode.runtime-wiring.v1',
        cliEntrypoint: entrypoint,
        supervisor: { command: process.execPath, argsPrefix: [entrypoint] },
        daemon: { command: process.execPath, argsPrefix: [entrypoint, 'daemon'] },
        vscode: { command: process.execPath, argsPrefix: [entrypoint] },
        action: { authority: 'post_pr', localRuntimeEntrypoint: entrypoint },
    };
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    const temporary = `${path}.tmp.${process.pid}`;
    (0, node_fs_1.writeFileSync)(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    (0, node_fs_1.renameSync)(temporary, path);
    return path;
}
function integrationsForCurrentRuntime(adapters) {
    const identity = (0, cli_runtime_1.collectCliRuntimeIdentity)({ bundledCliDir: (0, cli_entry_1.bundledCliDir)() });
    const activatedAt = new Date().toISOString();
    return TARGETS
        .filter((target) => adapters.includes(target.adapter))
        .map((target) => ({
        adapter: target.adapter,
        enforcementLevel: target.enforcementLevel,
        activatedAt,
        absoluteEntrypoint: identity.entryRealPath,
        buildHash: identity.buildFingerprint,
        installationSource: identity.source === 'workspace' ? 'workspace_build' : identity.source === 'packaged' ? 'packaged_artifact' : 'registry',
        machinePinned: target.adapter === 'claude-code-hooks' || target.adapter === 'copilot-hooks',
    }));
}
function sameActivation(existing, next) {
    if (!existing)
        return false;
    return existing.repositoryHash === next.repositoryHash
        && existing.profileHash === next.profileHash
        && existing.runtime.cliVersion === next.runtime.cliVersion
        && existing.runtime.packageOrBuildHash === next.runtime.packageOrBuildHash
        && existing.runtime.absoluteEntrypoint === next.runtime.absoluteEntrypoint
        && JSON.stringify(existing.integrations.map(({ activatedAt: _activatedAt, ...rest }) => rest))
            === JSON.stringify(next.integrations.map(({ activatedAt: _activatedAt, ...rest }) => rest));
}
async function recordActivatedRuntime(repoRootInput, adapters, options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(repoRootInput);
    const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot).profile;
    const identity = (0, cli_runtime_1.collectCliRuntimeIdentity)({ bundledCliDir: (0, cli_entry_1.bundledCliDir)() });
    const existing = (0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot);
    const existingAdapters = existing?.integrations.map((integration) => integration.adapter) ?? [];
    const allAdapters = Array.from(new Set([...existingAdapters, ...adapters, 'cli']));
    const next = (0, cli_runtime_1.createActivatedRuntimeManifest)({
        repoRoot,
        profileHash: profile.profileHash,
        identity,
        integrations: integrationsForCurrentRuntime(allAdapters),
    });
    const changed = !sameActivation(existing, next);
    const manifest = changed ? next : existing;
    if (changed)
        (0, cli_runtime_1.writeActivatedRuntimeManifest)(repoRoot, manifest);
    writeRuntimeWiring(repoRoot, identity.entryRealPath);
    // Session start reuses the immutable Brain generation and must remain
    // bounded. Explicit activation/repair may schedule indexing separately.
    const brain = options.scheduleBrain === false
        ? (0, brain_lifecycle_1.readBrainLifecycle)(repoRoot) ?? await (0, brain_lifecycle_1.inspectBrainLifecycle)(repoRoot)
        : await (0, brain_lifecycle_1.scheduleBrainIndex)(repoRoot);
    return {
        manifestPath: (0, cli_runtime_1.runtimeManifestPath)(repoRoot),
        manifestHash: manifest.manifestHash,
        changed,
        brain,
    };
}
async function repairRuntimeAuthority(repoRootInput) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(repoRootInput);
    const repaired = [];
    const preserved = [];
    const claudeHooks = (0, v0_governance_1.installClaudeGovernanceHooks)(repoRoot, { force: true });
    repaired.push(...claudeHooks.repaired, ...claudeHooks.added);
    preserved.push(...claudeHooks.preserved);
    const claudeMcp = (0, v0_governance_1.installClaudeMcpConfig)({ force: true });
    repaired.push(...claudeMcp.repaired, ...claudeMcp.added);
    preserved.push(...claudeMcp.preserved);
    const copilot = (0, v0_governance_1.installCopilotGovernanceHooks)(repoRoot, { force: true });
    repaired.push(...copilot.repaired, ...copilot.added);
    preserved.push(...copilot.preserved);
    for (const target of ['codex', 'cursor', 'vscode']) {
        const result = (0, agent_adapter_setup_1.writeAgentSetup)({ target, repoRoot });
        if (result.status === 'written')
            repaired.push(`${target}:${result.configPath ?? 'configuration'}`);
        else
            preserved.push(`${target}:${result.configPath ?? 'configuration'}`);
    }
    const activation = await recordActivatedRuntime(repoRoot, TARGETS.map((target) => target.adapter));
    if (activation.changed)
        repaired.push('runtime-manifest', 'runtime-wiring');
    else
        preserved.push('runtime-manifest', 'runtime-wiring');
    return {
        ok: true,
        repoRoot,
        manifestPath: activation.manifestPath,
        manifestHash: activation.manifestHash,
        changed: activation.changed || repaired.length > 0,
        integrations: (0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot)?.integrations ?? [],
        repaired: Array.from(new Set(repaired)).sort(),
        preserved: Array.from(new Set(preserved)).sort(),
        brain: activation.brain,
        restartRequired: claudeHooks.restartRequired || claudeMcp.restartRequired || copilot.restartRequired,
        nextCheck: 'neurcode runtime identity --json',
    };
}
function inspectRuntimeAuthority(repoRootInput, adapter = 'cli', protectedOperation = false) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(repoRootInput);
    const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot).profile;
    const current = (0, cli_runtime_1.collectCliRuntimeIdentity)({ bundledCliDir: (0, cli_entry_1.bundledCliDir)() });
    return (0, cli_runtime_1.assessRuntimeAuthority)({
        repoRoot,
        profileHash: profile.profileHash,
        current,
        adapter,
        protectedOperation,
        installations: (0, cli_runtime_1.discoverCliInstallations)({ repoRoot, bundledCliDir: (0, cli_entry_1.bundledCliDir)() }),
    });
}
function assertProtectedRuntimeAuthority(repoRootInput, adapter) {
    const assessment = inspectRuntimeAuthority(repoRootInput, adapter === 'neurcode-cli' ? 'cli' : adapter, true);
    if (!assessment.protectedOperationAllowed) {
        const detail = assessment.mismatches.map((mismatch) => `- ${mismatch.message}`).join('\n');
        throw new Error(`Protected operation denied by runtime identity authority.\n${detail}\nRun \`${assessment.repairCommand}\`.`);
    }
    return assessment;
}
function runtimeManifestExists(repoRootInput) {
    return (0, node_fs_1.existsSync)((0, cli_runtime_1.runtimeManifestPath)((0, v0_governance_1.resolveRepoRoot)(repoRootInput)));
}
function activeRuntimeEntrypoint() {
    return (0, cli_entry_1.getActiveCliEntry)();
}
//# sourceMappingURL=runtime-authority.js.map