"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOVERNANCE_HEALTH_SCHEMA_VERSION = void 0;
exports.evaluateGovernanceHealth = evaluateGovernanceHealth;
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const agent_guard_1 = require("./agent-guard");
const agent_guard_supervisor_1 = require("./agent-guard-supervisor");
const agent_adapter_setup_1 = require("./agent-adapter-setup");
const v0_governance_1 = require("./v0-governance");
const cursor_gate_1 = require("./cursor-gate");
exports.GOVERNANCE_HEALTH_SCHEMA_VERSION = 'neurcode.governance-health.v1';
function globalCursorMcpPath() {
    return (0, node_path_1.join)((0, node_os_1.homedir)(), '.cursor', 'mcp.json');
}
function evaluateGovernanceHealth(dir) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(dir || process.cwd());
    const checks = [];
    const remediation = [];
    const cliWarning = (0, cursor_gate_1.buildCliVersionStaleWarning)();
    if (cliWarning) {
        checks.push({
            id: 'cli_version',
            status: 'warn',
            message: cliWarning.message,
        });
        remediation.push(...cliWarning.remediation);
    }
    else {
        checks.push({
            id: 'cli_version',
            status: 'pass',
            message: 'CLI version supports cursor gate and pinned MCP setup.',
        });
    }
    const repoMcp = (0, agent_adapter_setup_1.inspectAgentSetup)({ target: 'cursor', repoRoot, global: false });
    checks.push({
        id: 'repo_mcp',
        status: repoMcp.configured ? 'pass' : 'warn',
        message: repoMcp.message,
    });
    const globalMcp = (0, agent_adapter_setup_1.inspectAgentSetup)({ target: 'cursor', repoRoot, global: true });
    const globalConfigured = globalMcp.configured === true;
    checks.push({
        id: 'global_home_mcp',
        status: globalConfigured ? 'pass' : 'warn',
        message: globalConfigured
            ? `Home MCP configured at ${globalCursorMcpPath()}. Enable Home MCP in Cursor Settings → MCP.`
            : `Missing or stale Home MCP at ${globalCursorMcpPath()}. Run: neurcode cursor onboard (writes global + repo MCP).`,
    });
    if (!globalConfigured) {
        remediation.push('neurcode cursor onboard --strict');
        remediation.push('Cursor Settings → MCP → enable Home MCP, then reload the window');
    }
    const session = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    checks.push({
        id: 'active_session',
        status: session ? 'pass' : 'warn',
        message: session
            ? `Active governed session ${session.sessionId}.`
            : 'No active governed session. Start one with neurcode cursor onboard or neurcode agent guard start cursor.',
    });
    const guardRead = (0, agent_guard_1.readAgentGuardArtifact)({ repoRoot });
    const guardActive = Boolean(guardRead.artifact?.active);
    checks.push({
        id: 'agent_guard',
        status: guardActive ? 'pass' : 'warn',
        message: guardActive
            ? `Agent guard active for session ${guardRead.artifact?.sessionId}.`
            : 'No active agent guard baseline. Cooperative writes cannot be correlated at commit time.',
    });
    if (guardRead.artifact?.active && session) {
        const evaluation = (0, agent_guard_1.evaluateAgentGuard)(repoRoot, guardRead.artifact, session);
        checks.push({
            id: 'guard_correlation',
            status: evaluation.pass ? 'pass' : evaluation.summary.prewriteCallsWithoutVerdict > 0 ? 'warn' : 'fail',
            message: evaluation.pass
                ? `${evaluation.summary.verifiedPrewrite} verified pre-write file(s); guard correlation healthy.`
                : `${evaluation.summary.unverifiedWrites} unverified, ${evaluation.summary.deniedButChanged} denied-but-changed, ${evaluation.summary.prewriteCallsWithoutVerdict} MCP call(s) without verdict.`,
        });
        if (!evaluation.pass) {
            remediation.push('Call neurcode_agent_edit_before before every write, then retry blocked paths after exact-path approval.');
            remediation.push(`neurcode agent guard status --session-id ${session.sessionId} --fail-on-unverified --explain`);
        }
    }
    if (guardRead.artifact?.sessionId) {
        const supervisor = (0, agent_guard_supervisor_1.inspectAgentGuardSupervisor)(repoRoot, guardRead.artifact.sessionId);
        checks.push({
            id: 'guard_supervisor',
            status: supervisor.alive ? 'pass' : supervisor.exists ? 'warn' : 'warn',
            message: supervisor.alive
                ? 'Guard supervisor is watching filesystem changes.'
                : supervisor.exists
                    ? `Guard supervisor stale: ${supervisor.error || supervisor.effectiveStatus}`
                    : 'Guard supervisor not running. Start via neurcode cursor onboard.',
        });
    }
    const failCount = checks.filter((check) => check.status === 'fail').length;
    const warnCount = checks.filter((check) => check.status === 'warn').length;
    const hasSession = Boolean(session);
    const hasGuard = guardActive;
    const hasGlobalMcp = globalConfigured;
    const hasRepoMcp = repoMcp.configured === true;
    let verdict = 'ungoverned';
    if (hasSession && hasGuard && (hasGlobalMcp || hasRepoMcp)) {
        verdict = failCount > 0 || warnCount >= 2 ? 'cooperative_only' : 'governed';
    }
    else if (hasGuard || hasSession) {
        verdict = 'gate_only';
    }
    const summary = verdict === 'governed'
        ? 'Runtime loop is armed: MCP + guard + session are aligned.'
        : verdict === 'cooperative_only'
            ? 'Partially governed — MCP/guard correlation or Home MCP still needs attention.'
            : verdict === 'gate_only'
                ? 'Merge-time gate only until MCP and Home MCP are fully configured.'
                : 'Ungoverned — agent writes will not be correlated until you onboard.';
    return {
        schemaVersion: exports.GOVERNANCE_HEALTH_SCHEMA_VERSION,
        ok: verdict === 'governed' && failCount === 0,
        verdict,
        repoRoot,
        summary,
        checks,
        remediation: [...new Set(remediation)],
    };
}
//# sourceMappingURL=governance-health.js.map