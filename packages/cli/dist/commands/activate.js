"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateClaudeCommand = activateClaudeCommand;
exports.activateCopilotCommand = activateCopilotCommand;
exports.activateCommand = activateCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const config_1 = require("../config");
const state_1 = require("../utils/state");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_connection_1 = require("../utils/runtime-connection");
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
    let connection;
    if (options.connect) {
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
        connection = {
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
    let connection;
    if (options.connect) {
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
        connection = {
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
function renderActivation(result, mcpSkipped) {
    console.log('');
    console.log(chalk.bold(`Neurcode activation - ${result.agent === 'copilot' ? 'GitHub Copilot' : 'Claude Code'}`));
    console.log(chalk.dim('-'.repeat(64)));
    console.log(`Repo:    ${chalk.white(result.repoRoot)}`);
    console.log(`Profile: ${result.profile.refreshed ? chalk.green('refreshed') : chalk.green('fresh')} ` +
        chalk.dim(`${result.profile.profileHash} / topology ${result.profile.topologyHash}`));
    console.log(`Files:   ${result.profile.trackedFileCount} tracked`);
    if (result.profile.reasons.length > 0) {
        console.log(chalk.dim(`Reason:  ${result.profile.reasons.join('; ')}`));
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
        const agent = (agentArg || 'claude').toLowerCase();
        if (agent !== 'claude' && agent !== 'copilot') {
            const payload = {
                ok: false,
                error: `Unsupported activation target "${agent}".`,
                supportedAgents: ['claude', 'copilot'],
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
        try {
            const result = agent === 'copilot'
                ? await activateCopilotCommand(options)
                : await activateClaudeCommand(options);
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                renderActivation(result, options.mcp === false);
            }
            if (!result.ok)
                process.exitCode = 1;
        }
        catch (error) {
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