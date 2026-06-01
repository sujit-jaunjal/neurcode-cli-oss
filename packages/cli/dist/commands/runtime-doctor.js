"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeDoctorCommand = runtimeDoctorCommand;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_connection_1 = require("../utils/runtime-connection");
const runtime_outbox_1 = require("../utils/runtime-outbox");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (s) => s,
        yellow: (s) => s,
        red: (s) => s,
        bold: (s) => s,
        dim: (s) => s,
        white: (s) => s,
    };
}
function statusLabel(status) {
    if (status === 'pass')
        return chalk.green('PASS');
    if (status === 'warn')
        return chalk.yellow('WARN');
    if (status === 'fail')
        return chalk.red('FAIL');
    return chalk.dim('SKIP');
}
function printCheck(check) {
    console.log(`${statusLabel(check.status)} ${chalk.bold(check.label)}`);
    console.log(chalk.dim(`  ${check.message}`));
    if (check.recommendation) {
        console.log(chalk.dim(`  Next: ${check.recommendation}`));
    }
    console.log('');
}
function runtimeDoctorCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const staleness = (0, v0_governance_1.getProfileStaleness)(repoRoot);
    const activation = (0, v0_governance_1.inspectClaudeActivation)(repoRoot);
    const activeSession = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    const governanceConfig = (0, v0_governance_1.readRuntimeGovernanceConfig)(repoRoot);
    const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
    const transport = (0, runtime_outbox_1.inspectRuntimeOutbox)(repoRoot);
    const checks = [];
    checks.push({
        id: 'profile',
        label: 'Governance profile',
        status: staleness.status === 'fresh' ? 'pass' : 'warn',
        message: staleness.status === 'fresh'
            ? `Fresh profile at ${staleness.profilePath} (${staleness.currentProfile.topology.trackedFileCount} tracked files).`
            : `${staleness.status}: ${staleness.reasons.join('; ') || 'profile needs refresh'}.`,
        recommendation: staleness.status === 'fresh' ? undefined : 'Run `neurcode activate claude` to refresh it.',
    });
    checks.push({
        id: 'claude_hooks',
        label: 'Claude Code hooks',
        status: activation.hooks.error ? 'fail' : activation.hooks.installed ? 'pass' : 'warn',
        message: activation.hooks.error
            ? `Could not parse ${activation.hooks.settingsPath}: ${activation.hooks.error}`
            : activation.hooks.installed
                ? `Installed in ${activation.hooks.settingsPath}.`
                : `Missing one or more hooks in ${activation.hooks.settingsPath}.`,
        recommendation: activation.hooks.installed ? undefined : 'Run `neurcode activate claude`.',
    });
    checks.push({
        id: 'claude_mcp',
        label: 'Claude MCP approval tool',
        status: activation.mcp.error ? 'fail' : activation.mcp.configured ? 'pass' : 'warn',
        message: activation.mcp.error
            ? `Could not parse ${activation.mcp.configPath}: ${activation.mcp.error}`
            : activation.mcp.configured
                ? `Configured in ${activation.mcp.configPath}.`
                : `neurcode MCP server entry is missing from ${activation.mcp.configPath}.`,
        recommendation: activation.mcp.configured ? undefined : 'Run `neurcode activate claude` or use `neurcode session approve --path <path>` locally.',
    });
    checks.push({
        id: 'active_session',
        label: 'Active governance session',
        status: activeSession && activeSession.status === 'active' ? 'pass' : 'skip',
        message: activeSession && activeSession.status === 'active'
            ? `Session ${activeSession.sessionId} is active (${activeSession.contract.scopeMode} scope).`
            : 'No active in-flow session. This is normal until Claude Code receives a prompt.',
        recommendation: activeSession ? 'Run `neurcode status` for live session details.' : undefined,
    });
    checks.push({
        id: 'governance_config',
        label: 'Runtime governance config',
        status: governanceConfig.error ? 'warn' : governanceConfig.exists ? 'pass' : 'skip',
        message: governanceConfig.error
            ? `Malformed config at ${governanceConfig.path}: ${governanceConfig.error}`
            : governanceConfig.exists
                ? `Config loaded from ${governanceConfig.path}.`
                : 'No .neurcode/governance.json file. Using detected CODEOWNERS/sensitive boundaries only.',
        recommendation: governanceConfig.error
            ? 'Fix .neurcode/governance.json. Expected arrays: approvalRequiredGlobs, sensitiveGlobs, safeSupportGlobs, ignoredGlobs; optional planCoherence: off|warn|block.'
            : undefined,
    });
    checks.push({
        id: 'approval_ux',
        label: 'Approval UX',
        status: activation.mcp.configured ? 'pass' : 'warn',
        message: activation.mcp.configured
            ? 'MCP tool `neurcode_session_approve` and CLI command `neurcode session approve` are available.'
            : 'CLI approval is available; MCP approval is not configured yet.',
        recommendation: activation.mcp.configured ? undefined : 'Run `neurcode activate claude` to configure MCP approval.',
    });
    checks.push({
        id: 'dashboard_connection',
        label: 'Dashboard connection',
        status: connection ? 'pass' : 'warn',
        message: connection
            ? `Connected to ${connection.repo.name}; auto-sync is ${connection.autoSync.enabled ? 'enabled' : 'disabled'} (${connection.autoSync.lastStatus || 'never synced'}).`
            : 'This repo is not paired with the Neurcode dashboard yet.',
        recommendation: connection ? undefined : 'From Runtime Evidence, copy the activation command or run `neurcode activate claude --connect <token>`.',
    });
    checks.push({
        id: 'runtime_transport',
        label: 'Live runtime transport',
        status: !connection
            ? 'skip'
            : transport.lastError
                ? 'warn'
                : 'pass',
        message: !connection
            ? 'Runtime transport activates after this repo is paired with the dashboard.'
            : transport.pendingEvents > 0
                ? `${transport.pendingEvents} source-free event${transport.pendingEvents === 1 ? '' : 's'} queued locally (${transport.pendingSessionSnapshots} session snapshot${transport.pendingSessionSnapshots === 1 ? '' : 's'}, ${transport.pendingApprovalAcks} approval acknowledgement${transport.pendingApprovalAcks === 1 ? '' : 's'}).`
                : transport.lastDeliveredAt
                    ? `Outbox empty. Last cloud delivery: ${transport.lastDeliveredAt}.`
                    : 'Outbox empty. No live runtime event has needed cloud delivery yet.',
        recommendation: transport.lastError
            ? `Cloud delivery will retry automatically. Last error: ${transport.lastError}`
            : undefined,
    });
    const summary = {
        pass: checks.filter((c) => c.status === 'pass').length,
        warn: checks.filter((c) => c.status === 'warn').length,
        fail: checks.filter((c) => c.status === 'fail').length,
        skip: checks.filter((c) => c.status === 'skip').length,
    };
    const payload = {
        ok: summary.fail === 0,
        repoRoot,
        profileStatus: staleness.status,
        checks,
        summary,
    };
    if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
    }
    else {
        console.log('');
        console.log(chalk.bold('Neurcode runtime doctor'));
        console.log(chalk.dim('-'.repeat(64)));
        console.log(`Repo: ${chalk.white(repoRoot)}`);
        console.log('');
        for (const check of checks)
            printCheck(check);
        console.log(chalk.dim('-'.repeat(64)));
        console.log(`Pass ${summary.pass} | Warn ${summary.warn} | Fail ${summary.fail} | Skip ${summary.skip}`);
        console.log('');
    }
    if (summary.fail > 0)
        process.exitCode = 1;
}
//# sourceMappingURL=runtime-doctor.js.map