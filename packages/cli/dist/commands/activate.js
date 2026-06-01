"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateClaudeCommand = activateClaudeCommand;
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
    (0, v0_governance_1.installClaudeGovernanceHooks)(repoRoot, { force: options.force === true });
    if (options.mcp !== false) {
        (0, v0_governance_1.installClaudeMcpConfig)({ force: options.force === true });
    }
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
            mcpConfigured: inspection.mcp.configured,
            mcpConfigPath: inspection.mcp.configPath,
        },
        connection,
        next: [
            'Open Claude Code in this repository.',
            'Ask it to make a bounded code change.',
            'Run `neurcode status` while the session is active.',
        ],
    };
}
function renderActivation(result, mcpSkipped) {
    console.log('');
    console.log(chalk.bold('Neurcode activation - Claude Code'));
    console.log(chalk.dim('-'.repeat(64)));
    console.log(`Repo:    ${chalk.white(result.repoRoot)}`);
    console.log(`Profile: ${result.profile.refreshed ? chalk.green('refreshed') : chalk.green('fresh')} ` +
        chalk.dim(`${result.profile.profileHash} / topology ${result.profile.topologyHash}`));
    console.log(`Files:   ${result.profile.trackedFileCount} tracked`);
    if (result.profile.reasons.length > 0) {
        console.log(chalk.dim(`Reason:  ${result.profile.reasons.join('; ')}`));
    }
    console.log(`Hooks:   ${result.claude.hooksInstalled ? chalk.green('installed') : chalk.red('not installed')} ` +
        chalk.dim(result.claude.settingsPath));
    console.log(`MCP:     ${mcpSkipped
        ? chalk.yellow('skipped')
        : result.claude.mcpConfigured
            ? chalk.green('configured')
            : chalk.red('not configured')} ${chalk.dim(result.claude.mcpConfigPath)}`);
    if (result.connection?.connected) {
        console.log(`Cloud:   ${chalk.green('connected')} ${chalk.dim(result.connection.repoName)} ` +
            chalk.dim(`(${result.connection.keyPrefix || 'runtime key'})`));
        console.log(`Sync:    ${result.connection.autoSyncEnabled ? chalk.green('automatic') : chalk.yellow('manual')} ` +
            chalk.dim(result.connection.apiUrl));
    }
    console.log(chalk.dim('-'.repeat(64)));
    console.log(chalk.green('Ready:') + ' Claude Code edits in this repo are governed in-flow.');
    console.log('');
    console.log(chalk.bold('Next'));
    for (const step of result.next) {
        console.log(chalk.dim(`  - ${step}`));
    }
    console.log(chalk.dim('  - Blocked approvals can use `neurcode session approve --path <path>`.'));
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
        if (agent !== 'claude') {
            const payload = {
                ok: false,
                error: `Unsupported activation target "${agent}". V0.1 hard enforcement is Claude Code only.`,
                supportedAgents: ['claude'],
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
            const result = await activateClaudeCommand(options);
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