"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ATOMIC_RUNTIME_BOOTSTRAP_SCHEMA_VERSION = void 0;
exports.atomicRuntimeBootstrap = atomicRuntimeBootstrap;
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const v0_governance_1 = require("./v0-governance");
const runtime_authority_1 = require("./runtime-authority");
const runtime_state_1 = require("./runtime-state");
const agent_session_launcher_1 = require("./agent-session-launcher");
const agent_adapter_setup_1 = require("./agent-adapter-setup");
exports.ATOMIC_RUNTIME_BOOTSTRAP_SCHEMA_VERSION = 'neurcode.atomic-runtime-bootstrap.v1';
function throwIfTestBootstrapFail(phase) {
    const target = process.env.NEURCODE_TEST_BOOTSTRAP_FAIL?.trim();
    if (target === phase) {
        throw new Error(`neurcode_test_bootstrap_fail:${phase}`);
    }
}
function adaptersForAgent(agent) {
    const adapter = (0, agent_session_launcher_1.adapterForLauncherAgent)(agent);
    const base = ['cli', 'supervisor', 'daemon', 'github-action'];
    if (adapter === 'claude-code-hooks')
        return [...base, 'claude-code-hooks', 'generic-mcp', 'cursor-mcp', 'codex-mcp'];
    if (adapter === 'copilot-hooks')
        return [...base, 'copilot-hooks', 'vscode-extension'];
    if (adapter === 'vscode-extension')
        return [...base, 'vscode-extension'];
    if (adapter === 'cursor-mcp')
        return [...base, 'cursor-mcp', 'generic-mcp'];
    if (adapter === 'codex-mcp')
        return [...base, 'codex-hooks', 'codex-mcp', 'generic-mcp'];
    return [...base, 'generic-mcp'];
}
function protectedAdapterForAgent(agent) {
    const adapter = (0, agent_session_launcher_1.adapterForLauncherAgent)(agent);
    if (adapter === 'claude-code-hooks' || adapter === 'copilot-hooks')
        return adapter;
    if (agent === 'codex')
        return 'codex-hooks';
    return 'cli';
}
async function atomicRuntimeBootstrap(repoRootInput, input) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(repoRootInput);
    const repaired = [];
    const preserved = [];
    const reasonCodes = [];
    let attempted = false;
    if (input.activate !== false) {
        attempted = true;
        throwIfTestBootstrapFail('hook_install');
        if (input.agent === 'claude') {
            const hooks = (0, v0_governance_1.installClaudeGovernanceHooks)(repoRoot, { force: input.forceProfile === true });
            repaired.push(...hooks.repaired, ...hooks.added);
            preserved.push(...hooks.preserved);
            const mcp = (0, v0_governance_1.installClaudeMcpConfig)({ force: input.forceProfile === true });
            repaired.push(...mcp.repaired, ...mcp.added);
            preserved.push(...mcp.preserved);
        }
        if (input.agent === 'copilot') {
            const hooks = (0, v0_governance_1.installCopilotGovernanceHooks)(repoRoot, { force: input.forceProfile === true });
            repaired.push(...hooks.repaired, ...hooks.added);
            preserved.push(...hooks.preserved);
        }
        if (input.agent === 'codex') {
            const setup = (0, agent_adapter_setup_1.writeAgentSetup)({ target: 'codex', repoRoot });
            const instructions = (0, agent_adapter_setup_1.writeAgentInstructions)({ target: 'codex', repoRoot });
            (setup.status === 'written' ? repaired : preserved).push(`codex:${setup.configPath || 'configuration'}`);
            (instructions.status === 'written' ? repaired : preserved).push(`codex:${instructions.filePath || 'instructions'}`);
        }
    }
    const adapters = adaptersForAgent(input.agent);
    const beforeManifest = (0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot);
    throwIfTestBootstrapFail('manifest_write');
    const activation = await (0, runtime_authority_1.recordActivatedRuntime)(repoRoot, adapters, { scheduleBrain: false });
    if (activation.changed) {
        repaired.push('runtime-manifest', 'runtime-wiring');
        reasonCodes.push('runtime_manifest_refreshed');
    }
    else {
        preserved.push('runtime-manifest', 'runtime-wiring');
    }
    if (!beforeManifest)
        reasonCodes.push('runtime_manifest_created');
    else if (!activation.changed)
        reasonCodes.push('runtime_manifest_idempotent');
    const assessment = (0, runtime_authority_1.inspectRuntimeAuthority)(repoRoot, protectedAdapterForAgent(input.agent), true);
    const runtimeAssessment = (0, runtime_state_1.classifyRuntimeState)(repoRoot);
    const runtimeState = runtimeAssessment.state;
    reasonCodes.push(...runtimeAssessment.evidence.reasonCodes);
    let manifestStatus = 'healthy';
    if (!(0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot)) {
        manifestStatus = 'missing';
        reasonCodes.push('missing_runtime_manifest');
    }
    else if (!assessment.protectedOperationAllowed) {
        manifestStatus = 'incompatible';
        reasonCodes.push('runtime_identity_incompatible');
    }
    else if (activation.changed) {
        manifestStatus = 'repaired';
    }
    const missingRuntime = runtimeState === 'runtime_unavailable'
        || runtimeState === 'not_installed'
        || manifestStatus === 'missing'
        || manifestStatus === 'incompatible'
        || !assessment.protectedOperationAllowed;
    const recoveryCommand = missingRuntime
        ? assessment.repairCommand || runtimeAssessment.recoveryCommand
        : null;
    return {
        schemaVersion: exports.ATOMIC_RUNTIME_BOOTSTRAP_SCHEMA_VERSION,
        attempted,
        repaired: [...new Set(repaired)].sort(),
        preserved: [...new Set(preserved)].sort(),
        runtimeState,
        manifestStatus,
        sessionCreated: false,
        recoveryCommand,
        reasonCodes: [...new Set(reasonCodes)].sort(),
        manifestPath: activation.manifestPath,
        manifestHash: activation.manifestHash,
        ok: !missingRuntime,
    };
}
//# sourceMappingURL=atomic-runtime-bootstrap.js.map