"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeDoctorCommand = runtimeDoctorCommand;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
const agent_guard_supervisor_1 = require("../utils/agent-guard-supervisor");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_connection_1 = require("../utils/runtime-connection");
const runtime_outbox_1 = require("../utils/runtime-outbox");
const hook_heartbeat_1 = require("../utils/hook-heartbeat");
/** True when the goal produced an over-broad approval scope (e.g. `**`). */
function hasOverBroadApprovalScope(session) {
    const globs = session.contract?.approvalRequiredGlobs ?? [];
    return globs.includes('**');
}
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
function compatibilityModeLabel(value) {
    return value.replace(/_/g, ' ');
}
function runtimeDoctorCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const staleness = (0, v0_governance_1.getProfileStaleness)(repoRoot);
    const activation = (0, v0_governance_1.inspectClaudeActivation)(repoRoot);
    const copilotActivation = (0, v0_governance_1.inspectCopilotActivation)(repoRoot);
    const activeSession = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    const governanceConfig = (0, v0_governance_1.readRuntimeGovernanceConfig)(repoRoot);
    const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
    const transport = (0, runtime_outbox_1.inspectRuntimeOutbox)(repoRoot);
    const heartbeat = (0, hook_heartbeat_1.readHookHeartbeat)(repoRoot);
    const h = activation.hooks;
    const ch = copilotActivation.hooks;
    const launcherState = activeSession ? (0, agent_session_launcher_1.latestAgentLauncherState)(activeSession) : null;
    const activeAdapter = launcherState?.agent.adapter
        || (activeSession && h.installed ? 'claude-code-hooks' : activeSession && ch.installed ? 'copilot-hooks' : null);
    const activeCapability = activeAdapter ? (0, governance_runtime_1.getAgentRuntimeAdapterCapability)(activeAdapter) : null;
    const supervisor = activeSession ? (0, agent_guard_supervisor_1.inspectAgentGuardSupervisor)(repoRoot, activeSession.sessionId) : null;
    const checks = [];
    const dashboardSyncFailed = Boolean(connection?.autoSync.enabled && connection.autoSync.lastStatus === 'failed');
    const dashboardSyncRecovered = dashboardSyncFailed && transport.health === 'healthy' && Boolean(transport.lastDeliveredAt);
    checks.push({
        id: 'profile',
        label: 'Governance profile',
        status: staleness.status === 'fresh' ? 'pass' : 'warn',
        message: staleness.status === 'fresh'
            ? `Fresh profile at ${staleness.profilePath} (${staleness.currentProfile.topology.trackedFileCount} tracked files).`
            : `${staleness.status}: ${staleness.reasons.join('; ') || 'profile needs refresh'}.`,
        recommendation: staleness.status === 'fresh' ? undefined : 'Run `neurcode activate claude` or `neurcode activate copilot` to refresh it.',
    });
    // ── Claude Code hooks (on-disk correctness) ────────────────────────────────
    // Priority: parse error > stale bare hooks > missing pinned entrypoint > installed > missing.
    const entrypointMissing = h.entrypoint !== null && h.entrypointExists === false;
    let hooksStatus;
    let hooksMessage;
    let hooksRec;
    if (h.error) {
        hooksStatus = 'fail';
        hooksMessage = `Could not parse ${h.settingsPath}: ${h.error}`;
        hooksRec = 'Fix the JSON in .claude/settings.json, then run `neurcode activate claude`.';
    }
    else if (entrypointMissing) {
        hooksStatus = 'fail';
        hooksMessage = `Pinned hook entrypoint is missing on disk: ${h.entrypoint}. Claude Code cannot run governance and FAILS OPEN (writes proceed ungoverned).`;
        hooksRec = 'Run `pnpm build:cli` to produce dist/index.js, then `neurcode activate claude`.';
    }
    else if (h.stale) {
        hooksStatus = 'fail';
        hooksMessage = `Stale Neurcode hooks in ${h.settingsPath}: ${h.staleCommands.join('; ')}.`;
        hooksRec = 'Run `neurcode activate claude`, then restart Claude Code in this repo.';
    }
    else if (h.installed) {
        hooksStatus = 'pass';
        hooksMessage = `Installed in ${h.settingsPath}${h.entrypoint ? ` (pinned: ${h.entrypoint})` : ''}.`;
        // Portability is advisory: absolute machine paths don't travel to other machines/CI.
        if (h.entrypointPortable === false) {
            hooksRec = `Pinned hook path is absolute and machine-specific; it will not work for teammates/CI on a different checkout. Each machine must run \`neurcode activate claude\` locally.`;
        }
    }
    else {
        hooksStatus = 'warn';
        hooksMessage = `Missing one or more hooks in ${h.settingsPath}.`;
        hooksRec = 'Run `neurcode activate claude`.';
    }
    checks.push({
        id: 'claude_hooks',
        label: 'Claude Code hooks',
        status: hooksStatus,
        message: hooksMessage,
        recommendation: hooksRec,
    });
    const copilotEntrypointMissing = ch.entrypoint !== null && ch.entrypointExists === false;
    let copilotHooksStatus;
    let copilotHooksMessage;
    let copilotHooksRec;
    if (ch.error) {
        copilotHooksStatus = 'fail';
        copilotHooksMessage = `Could not parse ${ch.hooksPath}: ${ch.error}`;
        copilotHooksRec = 'Fix the JSON in .github/hooks/neurcode.json, then run `neurcode activate copilot`.';
    }
    else if (copilotEntrypointMissing) {
        copilotHooksStatus = 'fail';
        copilotHooksMessage = `Pinned Copilot hook entrypoint is missing on disk: ${ch.entrypoint}. Copilot cannot run governance and FAILS OPEN (writes proceed ungoverned).`;
        copilotHooksRec = 'Run `pnpm build:cli` to produce dist/index.js, then `neurcode activate copilot`.';
    }
    else if (ch.stale) {
        copilotHooksStatus = 'fail';
        copilotHooksMessage = `Stale Neurcode hooks in ${ch.hooksPath}: ${ch.staleCommands.join('; ')}.`;
        copilotHooksRec = 'Run `neurcode activate copilot`, then reload VS Code / Copilot Agent Mode in this repo.';
    }
    else if (ch.installed) {
        copilotHooksStatus = 'pass';
        copilotHooksMessage = `Installed in ${ch.hooksPath}${ch.entrypoint ? ` (pinned: ${ch.entrypoint})` : ''}.`;
        if (ch.entrypointPortable === false) {
            copilotHooksRec = 'Pinned hook path is absolute and machine-specific; each machine should run `neurcode activate copilot` locally.';
        }
    }
    else {
        copilotHooksStatus = 'skip';
        copilotHooksMessage = `No Copilot hooks installed in ${ch.hooksPath}.`;
        copilotHooksRec = 'Run `neurcode activate copilot` to govern VS Code Copilot Agent Mode.';
    }
    checks.push({
        id: 'copilot_hooks',
        label: 'GitHub Copilot hooks',
        status: copilotHooksStatus,
        message: copilotHooksMessage,
        recommendation: copilotHooksRec,
    });
    // ── Live hook liveness / restart detection ─────────────────────────────────
    // Hooks load at Claude Code startup and do NOT hot-reload. doctor green on disk does
    // not prove the *running* session is governed. Compare the live heartbeat (written by
    // the hook that is actually executing) against what is installed on disk now.
    const activeHookEntrypoint = h.installed ? h.entrypoint : ch.installed ? ch.entrypoint : h.entrypoint || ch.entrypoint;
    const activeHookLabel = h.installed ? 'Claude Code' : ch.installed ? 'GitHub Copilot' : 'agent';
    const installedFingerprint = activeHookEntrypoint ? (0, hook_heartbeat_1.fingerprintEntrypoint)(activeHookEntrypoint) : null;
    let liveness;
    const RESTART_MSG = 'restart or reload the coding agent in this repo before demoing governance.';
    const describeHeartbeat = (hb) => `last live hook: ${hb.lastEvent.type} @ ${hb.lastEvent.ts} (cli ${hb.cliVersion})`;
    if ((h.stale || entrypointMissing || h.error) && !ch.installed) {
        liveness = {
            status: 'skip',
            message: 'Resolve a hard-hook agent check above before live governance can be confirmed.',
        };
    }
    else if (activeSession && activeSession.status === 'active') {
        if (!heartbeat) {
            liveness = {
                status: 'warn',
                message: `A Neurcode session is active but no live hook heartbeat has been recorded yet (the running ${activeHookLabel} session may not be executing the installed hooks).`,
                recommendation: `If the agent was open before activation, ${RESTART_MSG}`,
            };
        }
        else if (installedFingerprint && heartbeat.entrypointFingerprint !== installedFingerprint) {
            // The live hook runs a different entrypoint than what is installed on disk now —
            // hooks were changed after the running Claude session loaded them.
            liveness = {
                status: 'fail',
                message: `Installed hooks changed after the active session started — the live hook runs ${heartbeat.entrypoint}, but disk now pins a different ${activeHookLabel} entrypoint. The running session is governed by stale hooks.`,
                recommendation: RESTART_MSG,
            };
        }
        else {
            liveness = {
                status: 'pass',
                message: `Live governance confirmed: ${describeHeartbeat(heartbeat)}; running entrypoint matches disk.`,
            };
        }
    }
    else {
        liveness = {
            status: heartbeat ? 'pass' : 'skip',
            message: heartbeat
                ? `No active session. ${describeHeartbeat(heartbeat)}.`
                : 'No live hook heartbeat yet (no governed Claude Code session has run in this repo).',
        };
    }
    checks.push({ id: 'hook_liveness', label: 'Live hook heartbeat / restart', ...liveness });
    checks.push({
        id: 'claude_mcp',
        label: 'Claude MCP approval tool',
        status: activation.mcp.error
            ? 'fail'
            : activation.mcp.configured
                ? 'pass'
                : activation.mcp.stale
                    ? 'fail'
                    : 'warn',
        message: activation.mcp.error
            ? `Could not parse ${activation.mcp.configPath}: ${activation.mcp.error}`
            : activation.mcp.configured
                ? `Configured in ${activation.mcp.configPath}: npx -y @neurcode-ai/mcp-server.`
                : activation.mcp.stale
                    ? `Stale neurcode MCP server entry in ${activation.mcp.configPath}: ${activation.mcp.staleReasons.join('; ')}. Claude may not expose neurcode_session_approve.`
                    : `neurcode MCP server entry is missing from ${activation.mcp.configPath}.`,
        recommendation: activation.mcp.configured
            ? undefined
            : activation.mcp.stale
                ? 'Run `neurcode activate claude`, then reload Claude MCP servers or restart Claude Code.'
                : 'Run `neurcode activate claude` or use `neurcode session approve --path <path>` locally.',
    });
    const sessionActive = Boolean(activeSession && activeSession.status === 'active');
    const overBroadScope = sessionActive && activeSession ? hasOverBroadApprovalScope(activeSession) : false;
    checks.push({
        id: 'active_session',
        label: 'Active governance session',
        status: !sessionActive ? 'skip' : overBroadScope ? 'warn' : 'pass',
        message: !sessionActive
            ? 'No active governed agent session. This is normal until an agent session starts.'
            : overBroadScope
                ? `Session ${activeSession.sessionId} is active but its scope is over-broad: approvalRequiredGlobs includes "**", so every file needs approval. This usually means the goal/prompt was very long or path-heavy.`
                : `Session ${activeSession.sessionId} is active (${activeSession.contract.scopeMode} scope).`,
        recommendation: !sessionActive
            ? undefined
            : overBroadScope
                ? 'For demos, start sessions with a short, crisp goal (e.g. "Add retry with backoff to the export task") so scope stays tight.'
                : 'Run `neurcode status` for live session details.',
    });
    checks.push({
        id: 'agent_compatibility',
        label: 'Agent compatibility / enforcement truth',
        status: activeCapability
            ? activeCapability.enforcementLevel === 'hard_deny'
                ? 'pass'
                : supervisor?.effectiveStatus === 'running'
                    ? 'pass'
                    : activeCapability.supervisorSupported
                        ? 'warn'
                        : 'warn'
            : 'skip',
        message: activeCapability
            ? `${launcherState?.agent.normalized || activeCapability.adapter} uses ${compatibilityModeLabel(activeCapability.compatibilityMode)}. Actually enforceable: ${activeCapability.enforceable.join('; ')}. Advisory only: ${activeCapability.advisoryOnly.join('; ')}.`
            : 'No active agent adapter was detected. Claude Code hard hooks can be checked above; Codex/Cursor need cooperative runtime calls or supervisor mode.',
        recommendation: activeCapability && activeCapability.enforcementLevel !== 'hard_deny'
            ? supervisor?.effectiveStatus === 'running'
                ? `Supervisor/diff-watch is running for session ${activeSession?.sessionId}; last pass: ${supervisor.state?.lastPass === null ? 'pending' : supervisor.state?.lastPass ? 'yes' : 'no'}.`
                : activeCapability.supervisorSupported && activeSession
                    ? 'For Codex/Cursor, run `neurcode agent guard start --supervise --goal "<task>"` or `neurcode agent guard supervise run` before finalizing/committing.'
                    : 'Use cooperative `neurcode runtime-adapter event` calls before edits; this host is not a hard pre-write blocker.'
            : undefined,
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
        status: activation.mcp.configured ? 'pass' : activation.mcp.stale ? 'fail' : 'warn',
        message: activation.mcp.configured
            ? 'MCP tool `neurcode_session_approve` and CLI command `neurcode session approve` are available.'
            : activation.mcp.stale
                ? 'CLI approval is available; MCP approval config is stale, so Claude may not expose `neurcode_session_approve`.'
                : 'CLI approval is available; MCP approval is not configured yet.',
        recommendation: activation.mcp.configured
            ? undefined
            : activation.mcp.stale
                ? 'Run `neurcode activate claude`, then reload Claude MCP servers or restart Claude Code.'
                : 'Run `neurcode activate claude` to configure MCP approval.',
    });
    checks.push({
        id: 'dashboard_connection',
        label: 'Dashboard pairing / bulk evidence sync',
        status: !connection ? 'warn' : dashboardSyncFailed ? dashboardSyncRecovered ? 'warn' : 'fail' : 'pass',
        message: connection
            ? `Connected to ${connection.repo.name}; bulk evidence sync is ${connection.autoSync.enabled ? 'enabled' : 'disabled'} (${connection.autoSync.lastStatus || 'never synced'}).` +
                (dashboardSyncRecovered ? ` Live block/approval transport is separate and recovered at ${transport.lastDeliveredAt}.` : '')
            : 'This repo is not paired with the Neurcode dashboard yet.',
        recommendation: !connection
            ? 'From Runtime Evidence, copy the activation command or run `neurcode activate claude --connect <token>`.'
            : dashboardSyncFailed
                ? dashboardSyncRecovered
                    ? 'Run `neurcode sync --runtime --json` to refresh bulk evidence metadata after recovery. Live approvals can still be visible while this is pending.'
                    : `Run \`neurcode sync --runtime --json\` and inspect the bulk evidence error${connection.autoSync.lastError ? ` (${connection.autoSync.lastError})` : ''}.`
                : undefined,
    });
    checks.push({
        id: 'runtime_transport',
        label: 'Live runtime transport',
        status: !connection
            ? 'skip'
            : transport.health === 'degraded'
                ? 'fail'
                : transport.health === 'retrying'
                    ? 'warn'
                    : 'pass',
        message: !connection
            ? 'Runtime transport activates after this repo is paired with the dashboard.'
            : transport.health === 'degraded'
                ? `${transport.deadLetterEvents} source-free event${transport.deadLetterEvents === 1 ? '' : 's'} moved to the local dead-letter queue after bounded delivery attempts.`
                : transport.pendingEvents > 0
                    ? `${transport.pendingEvents} source-free event${transport.pendingEvents === 1 ? '' : 's'} queued locally (${transport.retryingEvents} retrying, ${transport.pendingSessionSnapshots} session snapshot${transport.pendingSessionSnapshots === 1 ? '' : 's'}, ${transport.pendingApprovalAcks} approval acknowledgement${transport.pendingApprovalAcks === 1 ? '' : 's'}).`
                    : transport.lastDeliveredAt
                        ? `Outbox empty. Last cloud delivery: ${transport.lastDeliveredAt}.`
                        : 'Outbox empty. No live runtime event has needed cloud delivery yet.',
        recommendation: transport.health === 'degraded'
            ? `Inspect the delivery error, then run \`neurcode sync --runtime --retry-dead-letters\`. Last dead-letter error: ${transport.lastDeadLetterError || 'unknown'}`
            : transport.lastError
                ? `Cloud delivery will retry automatically. Last error: ${transport.lastError}`
                : transport.lastRecoveredAt
                    ? `Transport recovered after a previous delivery failure at ${transport.lastRecoveredAt}.`
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
        restartRequired: liveness.status === 'fail',
        hooks: {
            installed: h.installed,
            stale: h.stale,
            entrypoint: h.entrypoint,
            entrypointExists: h.entrypointExists,
            entrypointPortable: h.entrypointPortable,
        },
        copilotHooks: {
            installed: ch.installed,
            stale: ch.stale,
            hooksPath: ch.hooksPath,
            entrypoint: ch.entrypoint,
            entrypointExists: ch.entrypointExists,
            entrypointPortable: ch.entrypointPortable,
        },
        mcp: {
            configured: activation.mcp.configured,
            present: activation.mcp.present,
            stale: activation.mcp.stale,
            configPath: activation.mcp.configPath,
            entry: activation.mcp.entry,
            expectedEntry: activation.mcp.expectedEntry,
            staleReasons: activation.mcp.staleReasons,
        },
        hookHeartbeat: heartbeat
            ? {
                cliVersion: heartbeat.cliVersion,
                entrypoint: heartbeat.entrypoint,
                entrypointFingerprint: heartbeat.entrypointFingerprint,
                lastEvent: heartbeat.lastEvent,
                events: heartbeat.events,
                matchesInstalled: installedFingerprint
                    ? heartbeat.entrypointFingerprint === installedFingerprint
                    : null,
            }
            : null,
        agentCompatibility: activeCapability
            ? {
                currentAgent: launcherState?.agent.normalized || null,
                adapter: activeCapability.adapter,
                enforcementLevel: activeCapability.enforcementLevel,
                compatibilityMode: activeCapability.compatibilityMode,
                enforceable: activeCapability.enforceable,
                advisoryOnly: activeCapability.advisoryOnly,
                supervisorSupported: activeCapability.supervisorSupported,
                supervisor: supervisor
                    ? {
                        effectiveStatus: supervisor.effectiveStatus,
                        alive: supervisor.alive,
                        statePath: supervisor.statePath,
                        lastPass: supervisor.state?.lastPass ?? null,
                        lastEvaluatedAt: supervisor.state?.lastEvaluatedAt ?? null,
                        lastChangedFiles: supervisor.state?.lastChangedFiles ?? 0,
                    }
                    : null,
            }
            : null,
        dashboardPairing: connection
            ? {
                repoName: connection.repo.name,
                autoSyncEnabled: connection.autoSync.enabled,
                lastStatus: connection.autoSync.lastStatus || null,
                lastDeliveredAt: transport.lastDeliveredAt || null,
                outboxHealth: transport.health,
            }
            : null,
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