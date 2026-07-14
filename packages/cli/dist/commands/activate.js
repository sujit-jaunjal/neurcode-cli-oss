"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateClaudeCommand = activateClaudeCommand;
exports.activateCopilotCommand = activateCopilotCommand;
exports.activateCompatibilityCommand = activateCompatibilityCommand;
exports.activateCommand = activateCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const config_1 = require("../config");
const state_1 = require("../utils/state");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_connection_1 = require("../utils/runtime-connection");
const runtime_authority_1 = require("../utils/runtime-authority");
const activation_telemetry_1 = require("../utils/activation-telemetry");
const agent_adapter_setup_1 = require("../utils/agent-adapter-setup");
const enterprise_trust_1 = require("../utils/enterprise-trust");
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
        cyan: (s) => s,
        white: (s) => s,
    };
}
const COMPATIBILITY_ACTIVATIONS = {
    codex: {
        label: 'Codex supported-tool hook guardrail + MCP',
        controlLevel: 'automatic deny for intercepted tools + cooperative MCP/supervisor coverage',
        enforced: [
            'trusted PreToolUse hook can deny intercepted apply_patch, simple Bash, and MCP calls before write',
            'cooperative pre-write checks remain available through Neurcode MCP',
            'local guard supervisor detects unverified or denied writes before handoff',
            'source-free admission export can travel with the PR',
        ],
        advisory: [
            'Codex documents hooks as a guardrail rather than a complete enforcement boundary',
            'unified execution and equivalent write paths may bypass hook interception',
            'project hooks must be reviewed, trusted, and enabled with /hooks',
            'the GitHub Action remains post-PR advisory unless admission records are committed',
        ],
        commands: [
            'neurcode agent walkthrough codex',
            'neurcode agent bootstrap codex',
            'neurcode agent doctor codex',
            'neurcode agent guard start codex --goal "Evaluate exact-path runtime governance" --plan "Safe path first; request exact approval for billing boundary" --no-supervise',
            'neurcode session export-admission --explain',
        ],
        next: [
            'Run `/hooks` in Codex and review/trust the repository hook installed by activation.',
            'Start with `neurcode agent guard start codex --goal "Evaluate exact-path runtime governance" --plan "Safe path first; request exact approval for billing boundary" --no-supervise`.',
            'Finish with `neurcode agent guard finish --fail-on-unverified`, then export admission for the PR.',
        ],
        nextCheck: 'neurcode agent doctor codex',
    },
    cursor: {
        label: 'Cursor supervised workflow',
        controlLevel: 'supervised CLI workflow + admission/evidence path',
        enforced: [
            'cooperative pre-write checks when Cursor calls the Neurcode runtime',
            'local guard supervisor detects unverified or denied writes before handoff',
            'source-free admission export can travel with the PR',
        ],
        advisory: [
            'no Claude-like host hook is installed by activate cursor',
            'repo-local or global Cursor MCP config depends on local Cursor configuration',
            'bypassed filesystem writes are detected and reported, not prevented by the host',
        ],
        commands: [
            'neurcode cursor onboard',
            'neurcode agent walkthrough cursor',
            'neurcode agent bootstrap cursor',
            'neurcode agent doctor cursor',
            'neurcode agent guard start cursor --goal "Evaluate exact-path runtime governance" --plan "Safe path first; request exact approval for billing boundary" --no-supervise',
            'bash scripts/cursor-supervised-demo.sh',
            'neurcode session export-admission --explain',
        ],
        next: [
            'Run `neurcode cursor onboard` for one-command MCP + rules + guarded session (supervisor default-on).',
            'Or run `bash scripts/cursor-supervised-demo.sh` for an honest supervised walkthrough.',
            'Finish with `neurcode agent guard finish --fail-on-unverified`.',
        ],
        nextCheck: 'neurcode agent doctor cursor',
    },
    vscode: {
        label: 'VS Code / Copilot companion workflow',
        controlLevel: 'operator companion + host-dependent Copilot hooks',
        enforced: [
            'VS Code extension shows live runtime state and exact-path approval UX',
            'Copilot hooks are available through `neurcode activate copilot` when the host discovers repo hooks',
            'CLI guard supervisor can detect unverified writes for non-hooked work',
        ],
        advisory: [
            'the VS Code extension itself is observe-only and does not hard-deny editor writes',
            'Copilot hook behavior depends on host lifecycle hook support and reload state',
            'use admission export and the Action for PR-time runtime context',
        ],
        commands: [
            'neurcode daemon',
            'neurcode doctor --runtime',
            'neurcode activate copilot --dir .',
            'neurcode agent start vscode --goal "Evaluate exact-path runtime governance"',
            'neurcode session export-admission --explain',
        ],
        next: [
            'Open VS Code in this repository and run the Neurcode Runtime Companion.',
            'For Copilot Agent Mode hooks, run `neurcode activate copilot --dir .` and reload VS Code.',
            'For observe-only companion mode, start the daemon and pair it with a supervised agent workflow.',
        ],
        nextCheck: 'neurcode doctor --runtime',
    },
    action: {
        label: 'GitHub Action advisory workflow',
        controlLevel: 'post-PR advisory routing + admission display',
        enforced: [
            'the Action deterministically routes review from PR metadata',
            'when committed, .neurcode-admission records add source-free governed runtime context',
            'workflow outputs expose admission trust level, session count, counts, and receipt posture',
        ],
        advisory: [
            'the Action cannot govern work before the pull request exists',
            'Action-only runs do not prove a governed local runtime session occurred',
            'self-attested admission records are review context unless backend receipt metadata is attached and verified',
        ],
        commands: [
            'neurcode admission doctor',
            'gh run list --workflow neurcode.yml --limit 3',
            'neurcode session export-admission --explain',
            'git add .neurcode-admission/*.json',
        ],
        next: [
            'Install the public Action workflow from the dashboard/docs, then run `neurcode admission doctor`.',
            'For runtime context, run `neurcode session export-admission --explain` after a governed local session.',
            'Read the Action report as advisory routing plus explicit admission trust boundary.',
        ],
        nextCheck: 'neurcode admission doctor',
    },
};
function readCliVersion() {
    try {
        const pkg = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', '..', 'package.json'), 'utf8'));
        return pkg.version || 'unknown';
    }
    catch {
        return 'unknown';
    }
}
function parseConnectToken(input, explicitApiUrl) {
    const trimmed = input.trim();
    if (!trimmed)
        throw new Error('--connect requires an activation token or connect URL');
    if (/^https?:\/\//i.test(trimmed)) {
        const parsed = new URL(trimmed);
        const token = parsed.searchParams.get('token') ||
            parsed.searchParams.get('connect') ||
            parsed.pathname.split('/').filter(Boolean).pop() ||
            '';
        if (!token)
            throw new Error('Connect URL did not include an activation token');
        return {
            token,
            apiUrl: (explicitApiUrl || parsed.origin || config_1.DEFAULT_API_URL).replace(/\/$/, ''),
        };
    }
    return {
        token: trimmed,
        apiUrl: (explicitApiUrl || config_1.DEFAULT_API_URL).replace(/\/$/, ''),
    };
}
async function completeRuntimeRepoActivation(input) {
    const repo = (0, runtime_connection_1.collectRuntimeRepoMetadata)(input.repoRoot, input.profileFreshness);
    const response = await fetch(`${input.apiUrl.replace(/\/$/, '')}/api/v1/runtime/repo-activations/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: input.token,
            cliVersion: readCliVersion(),
            repo,
        }),
    });
    if (!response.ok) {
        let message = `Activation failed with HTTP ${response.status}`;
        try {
            const body = await response.json();
            message = body.message || body.error || message;
        }
        catch {
            try {
                const text = await response.text();
                if (text.trim())
                    message = text.trim();
            }
            catch {
                // keep generic message
            }
        }
        throw new Error(message);
    }
    const body = await response.json();
    if (!body.ok || !body.apiKey || !body.organizationId || !body.repo?.id) {
        throw new Error('Activation response was missing runtime connection credentials');
    }
    return body;
}
async function connectRuntimeIfRequested(options, repoRoot, profile) {
    if (!options.connect)
        return undefined;
    const parsed = parseConnectToken(options.connect, options.apiUrl);
    const activation = await completeRuntimeRepoActivation({
        token: parsed.token,
        apiUrl: parsed.apiUrl,
        repoRoot,
        profileFreshness: (0, v0_governance_1.buildProfileFreshnessSignal)(profile, profile.refreshed ? 'auto_refreshed' : 'none'),
    });
    const autoSyncEnabled = options.autoSync !== false && activation.autoSync?.enabled !== false;
    (0, config_1.saveGlobalAuth)(activation.apiKey, parsed.apiUrl, activation.organizationId);
    (0, state_1.setWorkspaceContext)({
        orgId: activation.organizationId,
        ...(activation.projectId ? { projectId: activation.projectId } : {}),
    });
    const localConnection = {
        schemaVersion: 1,
        apiUrl: parsed.apiUrl,
        organizationId: activation.organizationId,
        projectId: activation.projectId || null,
        repo: activation.repo,
        profileHash: profile.profile.profileHash,
        topologyHash: profile.profile.topology.hash,
        keyPrefix: activation.keyPrefix,
        connectedAt: new Date().toISOString(),
        autoSync: {
            enabled: autoSyncEnabled,
            lastStatus: 'skipped',
        },
    };
    (0, runtime_connection_1.saveRuntimeConnection)(repoRoot, localConnection);
    return {
        connected: true,
        apiUrl: parsed.apiUrl,
        organizationId: activation.organizationId,
        projectId: activation.projectId || null,
        repoId: activation.repo.id,
        repoName: activation.repo.name,
        repoKey: activation.repo.repoKey,
        autoSyncEnabled,
        keyPrefix: activation.keyPrefix,
    };
}
async function activateClaudeCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot, { force: options.force === true });
    const hookResult = (0, v0_governance_1.installClaudeGovernanceHooks)(repoRoot, { force: options.force === true });
    const mcpResult = options.mcp !== false
        ? (0, v0_governance_1.installClaudeMcpConfig)({ force: options.force === true })
        : null;
    const inspection = (0, v0_governance_1.inspectClaudeActivation)(repoRoot);
    const ok = inspection.hooks.installed &&
        (options.mcp === false || inspection.mcp.configured) &&
        profile.profile.topology.trackedFileCount > 0;
    const connection = await connectRuntimeIfRequested(options, repoRoot, profile);
    return {
        ok,
        agent: 'claude',
        repoRoot,
        profile: {
            status: profile.status,
            refreshed: profile.refreshed,
            profileHash: profile.profile.profileHash,
            topologyHash: profile.profile.topology.hash,
            trackedFileCount: profile.profile.topology.trackedFileCount,
            path: profile.profilePath,
            reasons: profile.reasons,
        },
        claude: {
            hooksInstalled: inspection.hooks.installed,
            settingsPath: inspection.hooks.settingsPath,
            hookEvents: inspection.hooks.events,
            hooksAdded: hookResult.added,
            hooksPreserved: hookResult.preserved,
            hooksRepaired: hookResult.repaired,
            mcpConfigured: inspection.mcp.configured,
            mcpPresent: inspection.mcp.present,
            mcpStale: inspection.mcp.stale,
            mcpConfigPath: inspection.mcp.configPath,
            mcpAdded: mcpResult?.added ?? [],
            mcpPreserved: mcpResult?.preserved ?? [],
            mcpRepaired: mcpResult?.repaired ?? [],
            mcpRestartRequired: mcpResult?.restartRequired ?? false,
            mcpStaleReasons: inspection.mcp.staleReasons,
        },
        restartRequired: hookResult.restartRequired || (mcpResult?.restartRequired ?? false),
        nextCheck: 'neurcode doctor --runtime',
        connection,
        next: [
            ...(hookResult.restartRequired
                ? ['IMPORTANT: if Claude Code is already open in this repo, restart it now — hooks load at startup and do not hot-reload.']
                : []),
            ...(mcpResult?.restartRequired
                ? ['IMPORTANT: Claude MCP approval config changed. Reload Claude MCP servers or restart Claude Code before relying on in-app approvals.']
                : []),
            'Open (or restart) Claude Code in this repository.',
            'Run `neurcode doctor --runtime` and confirm it is green (no FAIL, no restart warning).',
            'Give Claude Code a short, crisp goal, then make a bounded change to confirm in-flow governance.',
        ],
    };
}
async function activateCopilotCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot, { force: options.force === true });
    const hookResult = (0, v0_governance_1.installCopilotGovernanceHooks)(repoRoot, { force: options.force === true });
    const inspection = (0, v0_governance_1.inspectCopilotActivation)(repoRoot);
    const ok = inspection.hooks.installed && profile.profile.topology.trackedFileCount > 0;
    const connection = await connectRuntimeIfRequested(options, repoRoot, profile);
    return {
        ok,
        agent: 'copilot',
        repoRoot,
        profile: {
            status: profile.status,
            refreshed: profile.refreshed,
            profileHash: profile.profile.profileHash,
            topologyHash: profile.profile.topology.hash,
            trackedFileCount: profile.profile.topology.trackedFileCount,
            path: profile.profilePath,
            reasons: profile.reasons,
        },
        copilot: {
            hooksInstalled: inspection.hooks.installed,
            hooksPath: inspection.hooks.hooksPath,
            hookEvents: inspection.hooks.events,
            hooksAdded: hookResult.added,
            hooksPreserved: hookResult.preserved,
            hooksRepaired: hookResult.repaired,
        },
        restartRequired: hookResult.restartRequired,
        nextCheck: 'neurcode doctor --runtime',
        connection,
        next: [
            ...(hookResult.restartRequired
                ? ['IMPORTANT: if VS Code/Copilot Agent Mode is already open in this repo, reload the window so hooks are rediscovered.']
                : []),
            'Open VS Code in this repository and use Copilot Agent Mode.',
            'Run `neurcode doctor --runtime` and confirm Copilot hooks are green.',
            'Give Copilot a short, crisp goal; Neurcode will govern UserPromptSubmit, PreToolUse, and Stop.',
        ],
    };
}
async function activateCompatibilityCommand(agent, options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot, { force: options.force === true });
    if (agent === 'codex') {
        (0, agent_adapter_setup_1.writeAgentSetup)({ target: 'codex', repoRoot });
        (0, agent_adapter_setup_1.writeAgentInstructions)({ target: 'codex', repoRoot });
    }
    const connection = await connectRuntimeIfRequested(options, repoRoot, profile);
    const compatibility = COMPATIBILITY_ACTIVATIONS[agent];
    return {
        ok: profile.profile.topology.trackedFileCount > 0,
        agent,
        repoRoot,
        profile: {
            status: profile.status,
            refreshed: profile.refreshed,
            profileHash: profile.profile.profileHash,
            topologyHash: profile.profile.topology.hash,
            trackedFileCount: profile.profile.topology.trackedFileCount,
            path: profile.profilePath,
            reasons: profile.reasons,
        },
        restartRequired: false,
        nextCheck: compatibility.nextCheck,
        compatibility,
        connection,
        next: compatibility.next,
    };
}
function agentLabel(agent) {
    if (agent === 'claude')
        return 'Claude Code';
    if (agent === 'copilot')
        return 'GitHub Copilot';
    if (agent === 'codex')
        return 'Codex';
    if (agent === 'cursor')
        return 'Cursor';
    if (agent === 'vscode')
        return 'VS Code / Copilot';
    return 'GitHub Action';
}
function renderActivation(result, mcpSkipped) {
    console.log('');
    console.log(chalk.bold(`Neurcode activation - ${agentLabel(result.agent)}`));
    console.log(chalk.dim('-'.repeat(64)));
    console.log(`Repo:    ${chalk.white(result.repoRoot)}`);
    console.log(`Profile: ${result.profile.refreshed ? chalk.green('refreshed') : chalk.green('fresh')} ` +
        chalk.dim(`${result.profile.profileHash} / topology ${result.profile.topologyHash}`));
    console.log(`Files:   ${result.profile.trackedFileCount} tracked`);
    if (result.runtimeAuthority) {
        console.log(`Runtime: ${chalk.green('activated')} ${chalk.dim(result.runtimeAuthority.manifestHash)} · Brain ${result.runtimeAuthority.brainState}`);
    }
    if (result.profile.reasons.length > 0) {
        console.log(chalk.dim(`Reason:  ${result.profile.reasons.join('; ')}`));
    }
    if (result.compatibility) {
        console.log(`Control: ${chalk.cyan(result.compatibility.controlLevel)}`);
        console.log(`Mode:    ${result.compatibility.label}`);
        console.log('');
        console.log(chalk.bold('Enforced / recorded'));
        for (const item of result.compatibility.enforced)
            console.log(chalk.dim(`  - ${item}`));
        console.log(chalk.bold('Advisory / not claimed'));
        for (const item of result.compatibility.advisory)
            console.log(chalk.dim(`  - ${item}`));
        if (result.connection?.connected) {
            console.log('');
            console.log(`Cloud:   ${chalk.green('connected')} ${chalk.dim(result.connection.repoName)} ` +
                chalk.dim(`(${result.connection.keyPrefix || 'runtime key'})`));
            console.log(`Sync:    ${result.connection.autoSyncEnabled ? chalk.green('automatic') : chalk.yellow('manual')} ` +
                chalk.dim(result.connection.apiUrl));
        }
        console.log(chalk.dim('-'.repeat(64)));
        console.log(chalk.green('Ready:') + ` ${result.compatibility.label} prepared. No hard hooks were installed by this command.`);
        console.log(chalk.dim(`Verify: run \`${result.nextCheck}\`.`));
        console.log('');
        console.log(chalk.bold('Useful commands'));
        for (const command of result.compatibility.commands)
            console.log(chalk.dim(`  - ${command}`));
        console.log('');
        console.log(chalk.bold('Next'));
        for (const step of result.next)
            console.log(chalk.dim(`  - ${step}`));
        console.log('');
        return;
    }
    const hookStats = result.agent === 'copilot'
        ? result.copilot
        : result.claude;
    const hookPath = result.agent === 'copilot'
        ? result.copilot.hooksPath
        : result.claude.settingsPath;
    const hooksInstalled = result.agent === 'copilot'
        ? result.copilot.hooksInstalled
        : result.claude.hooksInstalled;
    const hookChange = hookStats.hooksRepaired.length > 0
        ? chalk.yellow(`repaired ${hookStats.hooksRepaired.length}`)
        : hookStats.hooksAdded.length > 0
            ? chalk.green(`added ${hookStats.hooksAdded.length}`)
            : chalk.green('already current');
    console.log(`Hooks:   ${hooksInstalled ? chalk.green('installed') : chalk.red('not installed')} ` +
        `(${hookChange}, ${hookStats.hooksPreserved.length} preserved) ` +
        chalk.dim(hookPath));
    if (result.agent === 'claude') {
        console.log(`MCP:     ${mcpSkipped
            ? chalk.yellow('skipped')
            : result.claude.mcpConfigured
                ? chalk.green('configured')
                : result.claude.mcpStale
                    ? chalk.yellow('stale')
                    : chalk.red('not configured')} ${chalk.dim(result.claude.mcpConfigPath)}`);
    }
    else {
        console.log(chalk.dim('MCP:     Copilot can use MCP tools separately; hook-backed governance depends on host lifecycle hook support.'));
    }
    if (result.connection?.connected) {
        console.log(`Cloud:   ${chalk.green('connected')} ${chalk.dim(result.connection.repoName)} ` +
            chalk.dim(`(${result.connection.keyPrefix || 'runtime key'})`));
        console.log(`Sync:    ${result.connection.autoSyncEnabled ? chalk.green('automatic') : chalk.yellow('manual')} ` +
            chalk.dim(result.connection.apiUrl));
    }
    console.log(chalk.dim('-'.repeat(64)));
    if (result.restartRequired) {
        console.log(chalk.yellow('Restart required: ') +
            (result.agent === 'copilot'
                ? 'runtime config changed. If VS Code/Copilot Agent Mode is already open in this repo, reload the window.'
                : 'runtime config changed. If Claude Code is already open in this repo, restart it or reload MCP servers.'));
    }
    else {
        console.log(chalk.green('Ready:') + ` ${result.agent === 'copilot' ? 'Copilot Agent Mode' : 'Claude Code'} edits in this repo are governed in-flow.`);
    }
    console.log(chalk.dim(`Verify: run \`${result.nextCheck}\` and confirm it is green before relying on governance.`));
    console.log('');
    console.log(chalk.bold('Next'));
    for (const step of result.next) {
        console.log(chalk.dim(`  - ${step}`));
    }
    console.log(chalk.dim('  - Blocked approvals can use dashboard approval or `neurcode session approve --path <path>`.'));
    console.log('');
}
function normalizeActivationAgent(input) {
    const agent = (input || 'claude').toLowerCase();
    if (agent === 'claude' || agent === 'claude-code')
        return 'claude';
    if (agent === 'copilot' || agent === 'github-copilot')
        return 'copilot';
    if (agent === 'codex')
        return 'codex';
    if (agent === 'cursor')
        return 'cursor';
    if (agent === 'vscode' || agent === 'vs-code' || agent === 'code')
        return 'vscode';
    if (agent === 'action' || agent === 'github-action' || agent === 'github-actions')
        return 'action';
    return null;
}
function runtimeAdaptersForActivation(agent) {
    if (agent === 'claude')
        return ['claude-code-hooks', 'generic-mcp'];
    if (agent === 'copilot')
        return ['copilot-hooks'];
    if (agent === 'codex')
        return ['codex-hooks', 'codex-mcp', 'supervisor'];
    if (agent === 'cursor')
        return ['cursor-mcp', 'supervisor'];
    if (agent === 'vscode')
        return ['vscode-extension', 'daemon'];
    return ['github-action'];
}
function activationAgentTarget(agent) {
    return agent;
}
function activateCommand(program) {
    program
        .command('activate [agent]')
        .description('First-run in-flow governance activation for a coding agent')
        .option('--force', 'Refresh profile and replace existing Neurcode hook/MCP entries')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--no-mcp', 'Skip writing the Claude MCP server entry to ~/.claude.json')
        .option('--connect <token-or-url>', 'Pair this repo with the Neurcode dashboard and enable runtime evidence sync')
        .option('--api-url <url>', 'Neurcode API URL for activation token redemption')
        .option('--no-auto-sync', 'Pair the repo but leave automatic session upload disabled')
        .option('--json', 'Output machine-readable JSON')
        .action(async (agentArg, options) => {
        const agent = normalizeActivationAgent(agentArg);
        if (!agent) {
            const payload = {
                ok: false,
                error: `Unsupported activation target "${agentArg || 'claude'}".`,
                supportedAgents: ['claude', 'copilot', 'codex', 'cursor', 'vscode', 'action'],
            };
            if (options.json) {
                console.log(JSON.stringify(payload, null, 2));
            }
            else {
                console.error(chalk.red(payload.error));
            }
            process.exitCode = 2;
            return;
        }
        const agentTarget = activationAgentTarget(agent);
        (0, activation_telemetry_1.trackActivationEvent)({
            eventType: 'agent_setup_started',
            commandFamily: 'activate',
            agentTarget,
            reasonCode: 'agent_setup.started',
        });
        try {
            const result = agent === 'copilot'
                ? await activateCopilotCommand(options)
                : agent === 'claude'
                    ? await activateClaudeCommand(options)
                    : await activateCompatibilityCommand(agent, options);
            const runtimeAuthority = await (0, runtime_authority_1.recordActivatedRuntime)(result.repoRoot, runtimeAdaptersForActivation(agent));
            result.runtimeAuthority = {
                manifestPath: runtimeAuthority.manifestPath,
                manifestHash: runtimeAuthority.manifestHash,
                changed: runtimeAuthority.changed,
                brainState: runtimeAuthority.brain.state,
            };
            if (result.connection?.connected) {
                await (0, enterprise_trust_1.reportEnterprisePostureBestEffort)({ repoRoot: result.repoRoot, host: agent });
            }
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                renderActivation(result, options.mcp === false);
            }
            await (0, activation_telemetry_1.trackActivationEventAndFlush)({
                eventType: 'agent_setup_completed',
                commandFamily: 'activate',
                agentTarget,
                reasonCode: result.ok ? 'agent_setup.completed' : 'agent_setup.failed',
                success: result.ok,
            });
            if (!result.ok)
                process.exitCode = 1;
        }
        catch (error) {
            await (0, activation_telemetry_1.trackActivationEventAndFlush)({
                eventType: 'agent_setup_completed',
                commandFamily: 'activate',
                agentTarget,
                reasonCode: 'agent_setup.failed',
                success: false,
            });
            const message = error instanceof Error ? error.message : String(error);
            if (options.json) {
                console.log(JSON.stringify({ ok: false, error: message }, null, 2));
            }
            else {
                console.error(chalk.red(`Activation failed: ${message}`));
            }
            process.exitCode = 1;
        }
    });
}
//# sourceMappingURL=activate.js.map