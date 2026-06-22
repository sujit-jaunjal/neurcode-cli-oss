"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeDoctorCommand = runtimeDoctorCommand;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const fs_1 = require("fs");
const path_1 = require("path");
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
const agent_guard_supervisor_1 = require("../utils/agent-guard-supervisor");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_connection_1 = require("../utils/runtime-connection");
const runtime_outbox_1 = require("../utils/runtime-outbox");
const hook_heartbeat_1 = require("../utils/hook-heartbeat");
const session_allowlist_rules_1 = require("../utils/session-allowlist-rules");
const profile_drift_recovery_1 = require("../utils/profile-drift-recovery");
const runtime_authority_1 = require("../utils/runtime-authority");
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
function parseCodeownersOwnerTokens(content) {
    const owners = new Set();
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.replace(/\s+#.*$/, '').trim();
        if (!line || line.startsWith('#'))
            continue;
        const parts = line.split(/\s+/);
        for (const owner of parts.slice(1)) {
            if (owner.startsWith('@'))
                owners.add(owner);
        }
    }
    return Array.from(owners).sort();
}
function readJson(path) {
    try {
        if (!(0, fs_1.existsSync)(path))
            return null;
        const parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function ownerTokensFromMappingCache(data) {
    if (!data)
        return [];
    const tokens = new Set();
    const bindings = data.ownerRoleBindings || data.policy?.ownerRoleBindings || data.policy?.owner_role_bindings;
    if (bindings && typeof bindings === 'object' && !Array.isArray(bindings)) {
        for (const key of Object.keys(bindings)) {
            if (key.startsWith('@'))
                tokens.add(key);
        }
    }
    const entries = Array.isArray(data.entries)
        ? data.entries
        : Array.isArray(data.directoryEntries)
            ? data.directoryEntries
            : Array.isArray(data.summary)
                ? data.summary
                : [];
    for (const entry of entries) {
        const token = typeof entry?.ownerToken === 'string'
            ? entry.ownerToken
            : typeof entry?.owner_token === 'string'
                ? entry.owner_token
                : '';
        if (token.startsWith('@'))
            tokens.add(token);
    }
    const mappedOwnerTokens = Array.isArray(data.mappedOwnerTokens) ? data.mappedOwnerTokens : [];
    for (const token of mappedOwnerTokens) {
        if (typeof token === 'string' && token.startsWith('@'))
            tokens.add(token);
    }
    return Array.from(tokens).sort();
}
function inspectAuthorityPosture(repoRoot, connected) {
    const codeownersCandidates = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];
    const ownerTokens = new Set();
    let codeownersPath = null;
    for (const rel of codeownersCandidates) {
        const path = (0, path_1.join)(repoRoot, rel);
        if (!(0, fs_1.existsSync)(path))
            continue;
        codeownersPath ??= rel;
        for (const owner of parseCodeownersOwnerTokens((0, fs_1.readFileSync)(path, 'utf8')))
            ownerTokens.add(owner);
    }
    const cacheCandidates = [
        (0, path_1.join)(repoRoot, '.neurcode', 'authority-policy.json'),
        (0, path_1.join)(repoRoot, '.neurcode', 'authority-mappings.json'),
        (0, path_1.join)(repoRoot, '.neurcode', 'codeowners-directory.json'),
    ];
    let cachePath = null;
    let cache = null;
    for (const candidate of cacheCandidates) {
        const data = readJson(candidate);
        if (!data)
            continue;
        cachePath = candidate;
        cache = data;
        break;
    }
    const owners = Array.from(ownerTokens).sort();
    const mappedOwnerTokens = ownerTokensFromMappingCache(cache).filter((owner) => owners.includes(owner));
    const mapped = new Set(mappedOwnerTokens);
    const unmappedOwnerTokens = owners.filter((owner) => !mapped.has(owner));
    const strictDirectoryMode = Boolean(cache?.strictDirectoryMode || cache?.policy?.strictDirectoryMode || cache?.policy?.strict_directory_mode);
    return {
        codeownersPath,
        ownerTokens: owners,
        mappedOwnerTokens,
        unmappedOwnerTokens,
        strictDirectoryMode,
        cachePath,
        source: owners.length === 0
            ? 'no_codeowners'
            : cache
                ? 'local_cache'
                : connected
                    ? 'dashboard_pairing'
                    : 'unpaired',
    };
}
function runtimeDoctorCommand(options = {}) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const staleness = (0, v0_governance_1.getProfileStaleness)(repoRoot);
    const activation = (0, v0_governance_1.inspectClaudeActivation)(repoRoot);
    const copilotActivation = (0, v0_governance_1.inspectCopilotActivation)(repoRoot);
    const activeSession = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    const profileAction = (0, v0_governance_1.profileFreshnessActionForSession)(staleness, activeSession?.profileHash);
    const pendingProfileDecisions = activeSession
        ? (0, profile_drift_recovery_1.pendingProfileDriftDecisions)(activeSession)
        : [];
    const profileFreshness = (0, v0_governance_1.buildProfileFreshnessSignal)(staleness, profileAction, {
        sessionProfileHash: activeSession?.profileHash,
        ...(profileAction === 'session_restart_required'
            ? {
                recoveryReason: 'active_session_profile_changed',
                recoveryCommand: activeSession
                    ? `neurcode session end --local --session-id ${activeSession.sessionId} --outcome superseded`
                    : profile_drift_recovery_1.PROFILE_DRIFT_RECOVERY_COMMAND,
                unresolvedHumanDecisions: pendingProfileDecisions.length > 0,
            }
            : {}),
    });
    const cursorScopeRules = (0, session_allowlist_rules_1.inspectSessionScopeRules)(repoRoot, activeSession?.sessionId || null);
    const governanceConfig = (0, v0_governance_1.readRuntimeGovernanceConfig)(repoRoot);
    const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
    const transport = (0, runtime_outbox_1.inspectRuntimeOutbox)(repoRoot);
    const privacyAudit = (0, runtime_outbox_1.auditRuntimePrivacy)(repoRoot);
    const heartbeat = (0, hook_heartbeat_1.readHookHeartbeat)(repoRoot);
    const authorityPosture = inspectAuthorityPosture(repoRoot, Boolean(connection));
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
    const runtimeAuthority = (0, runtime_authority_1.inspectRuntimeAuthority)(repoRoot, activeAdapter ?? 'cli');
    checks.push({
        id: 'runtime_identity_authority',
        label: 'Runtime identity authority',
        status: runtimeAuthority.status === 'current_registry_runtime'
            || runtimeAuthority.status === 'current_workspace_runtime'
            || runtimeAuthority.status === 'machine_specific_pinned_hook_valid'
            ? 'pass'
            : runtimeAuthority.status === 'missing_runtime'
                ? 'warn'
                : 'fail',
        message: runtimeAuthority.status === 'machine_specific_pinned_hook_valid'
            ? 'Machine-specific pinned hook is valid for the activated build hash.'
            : runtimeAuthority.ok
                ? `Executing ${runtimeAuthority.status.replace(/_/g, ' ')} matches the activated manifest.`
                : `${runtimeAuthority.status.replace(/_/g, ' ')}: ${runtimeAuthority.mismatches[0]?.message || 'runtime activation is missing or stale'}`,
        recommendation: runtimeAuthority.ok ? undefined : `Run exactly: \`${runtimeAuthority.repairCommand}\`.`,
    });
    checks.push({
        id: 'profile',
        label: 'Governance profile',
        status: staleness.status === 'fresh' ? 'pass' : 'warn',
        message: staleness.status === 'fresh'
            ? `Fresh profile at ${staleness.profilePath} (${staleness.currentProfile.topology.trackedFileCount} tracked files).`
            : `${staleness.status}: ${staleness.reasons.join('; ') || 'profile needs refresh'}.`,
        recommendation: staleness.status === 'fresh' ? undefined : 'Run `neurcode activate claude` or `neurcode activate copilot` to refresh it.',
    });
    checks.push({
        id: 'session_profile_compatibility',
        label: 'Active session profile compatibility',
        status: !activeSession
            ? 'skip'
            : profileFreshness.sessionCompatibility === 'compatible'
                ? 'pass'
                : 'fail',
        message: !activeSession
            ? 'No active local governance session is present.'
            : profileFreshness.sessionCompatibility === 'compatible'
                ? `Session ${activeSession.sessionId} matches current profile ${profileFreshness.currentProfileHash.slice(0, 12)}.`
                : `Enforcement stopped because session profile ${activeSession.profileHash.slice(0, 12)} differs from current profile ${profileFreshness.currentProfileHash.slice(0, 12)}. ` +
                    `${pendingProfileDecisions.length} unresolved human decision${pendingProfileDecisions.length === 1 ? '' : 's'} prevent automatic recovery.`,
        recommendation: activeSession && profileFreshness.sessionCompatibility === 'incompatible'
            ? `Run exactly: \`neurcode session end --local --session-id ${activeSession.sessionId} --outcome superseded\`, then start a new governed session.`
            : undefined,
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
    const hardHooksInstalled = h.installed || ch.installed;
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
            status: hardHooksInstalled ? 'warn' : heartbeat ? 'pass' : 'skip',
            message: heartbeat
                ? `No active governed session is running. ${describeHeartbeat(heartbeat)}. Protected paths fail closed, but task scope and approval evidence need a live session.`
                : hardHooksInstalled
                    ? `Hooks are installed, but no active governed session has run in this repo yet. Protected paths fail closed; ordinary writes are advisory-only until a session starts.`
                    : 'No live hook heartbeat yet (no governed Claude Code session has run in this repo).',
            recommendation: hardHooksInstalled
                ? `Start or restart ${activeHookLabel} in this repo and begin a governed task before demoing protected-path enforcement.`
                : undefined,
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
        status: !sessionActive ? hardHooksInstalled ? 'warn' : 'skip' : overBroadScope ? 'warn' : 'pass',
        message: !sessionActive
            ? hardHooksInstalled
                ? 'No active governed agent session. Hooks are installed, so protected paths fail closed, but ordinary writes are only advisory and dashboard decisions cannot be applied to a session yet.'
                : 'No active governed agent session. This is normal until an agent session starts.'
            : overBroadScope
                ? `Session ${activeSession.sessionId} is active but its scope is over-broad: approvalRequiredGlobs includes "**", so every file needs approval. This usually means the goal/prompt was very long or path-heavy.`
                : `Session ${activeSession.sessionId} is active (${activeSession.contract.scopeMode} scope).`,
        recommendation: !sessionActive
            ? hardHooksInstalled
                ? 'Start a governed agent session before outreach/demo, then rerun `neurcode runtime doctor --json` and confirm active_session is pass.'
                : undefined
            : overBroadScope
                ? 'For demos, start sessions with a short, crisp goal (e.g. "Add retry with backoff to the export task") so scope stays tight.'
                : 'Run `neurcode status` for live session details.',
    });
    checks.push({
        id: 'cursor_session_scope_rules',
        label: 'Cursor session scope rules',
        status: !cursorScopeRules.exists ? 'skip' : cursorScopeRules.stale ? 'warn' : 'pass',
        message: !cursorScopeRules.exists
            ? 'No generated Cursor session scope file is present.'
            : cursorScopeRules.stale
                ? `Generated Cursor scope is stale: ${cursorScopeRules.reasons.join('; ')}.`
                : `Generated Cursor scope is fresh for session ${cursorScopeRules.sessionId}.`,
        recommendation: cursorScopeRules.exists && cursorScopeRules.stale
            ? 'Run `neurcode cursor scope refresh`; with no active session it removes the stale generated file.'
            : undefined,
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
                    ? 'For Codex/Cursor, run `neurcode agent guard start codex --goal "Evaluate exact-path runtime governance" --plan "Safe path first; request exact approval for billing boundary" --no-supervise` or `neurcode agent guard supervise run` before finalizing/committing.'
                    : 'Use cooperative `neurcode runtime-adapter event` calls before edits; this host is not a hard pre-write blocker.'
            : undefined,
    });
    const codexCapability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)('codex-mcp');
    const cursorCapability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)('cursor-mcp');
    const vscodeCapability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)('vscode-extension');
    const actionCapability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)('github-action');
    checks.push({
        id: 'codex_cursor_supervisor_workflow',
        label: 'Codex / Cursor supervised workflow',
        status: activeAdapter === 'codex-mcp' || activeAdapter === 'cursor-mcp'
            ? supervisor?.effectiveStatus === 'running'
                ? 'pass'
                : 'warn'
            : 'skip',
        message: activeAdapter === 'codex-mcp' || activeAdapter === 'cursor-mcp'
            ? `${activeAdapter} is active. Control level: ${compatibilityModeLabel((activeAdapter === 'codex-mcp' ? codexCapability : cursorCapability).compatibilityMode)}; enforceable: ${(activeAdapter === 'codex-mcp' ? codexCapability : cursorCapability).enforceable.join('; ')}.`
            : 'Codex and Cursor are compatibility modes: supervised CLI/MCP workflow plus admission/evidence path, not Claude-style host hooks.',
        recommendation: activeAdapter === 'codex-mcp' || activeAdapter === 'cursor-mcp'
            ? supervisor?.effectiveStatus === 'running'
                ? 'Keep the supervisor running until finish, then export runtime admission.'
                : 'Start with `neurcode agent guard start codex --goal "Evaluate exact-path runtime governance" --plan "Safe path first; request exact approval for billing boundary" --no-supervise` or the same command with `cursor`.'
            : 'Run `neurcode activate codex` or `neurcode activate cursor` to print the workflow commands.',
    });
    checks.push({
        id: 'vscode_companion_workflow',
        label: 'VS Code / Copilot companion workflow',
        status: activeAdapter === 'vscode-extension' ? 'pass' : 'skip',
        message: activeAdapter === 'vscode-extension'
            ? `${vscodeCapability.adapter} is active as ${compatibilityModeLabel(vscodeCapability.compatibilityMode)}.`
            : 'VS Code is an observe-only Runtime Companion; Copilot hooks require `neurcode activate copilot` and host hook discovery.',
        recommendation: activeAdapter === 'vscode-extension'
            ? 'Use the extension for visibility and exact-path approval UX; pair it with a hooked or supervised agent for write accountability.'
            : 'Run `neurcode activate vscode` for companion guidance or `neurcode activate copilot` when using Copilot Agent Mode hooks.',
    });
    checks.push({
        id: 'github_action_admission_workflow',
        label: 'GitHub Action / runtime admission',
        status: 'skip',
        message: `${actionCapability.adapter} is ${compatibilityModeLabel(actionCapability.compatibilityMode)}: PR-time advisory routing plus admission display when .neurcode-admission records are committed.`,
        recommendation: 'Run `neurcode admission doctor`, then `neurcode session export-admission --explain` before opening a PR with the public Action.',
    });
    checks.push({
        id: 'governance_config',
        label: 'Runtime governance config',
        status: governanceConfig.error ? 'warn' : governanceConfig.exists ? 'pass' : 'skip',
        message: governanceConfig.error
            ? `Malformed config at ${governanceConfig.path}: ${governanceConfig.error}`
            : governanceConfig.exists
                ? `Config loaded from ${governanceConfig.path}. Local mode: ${governanceConfig.config.localMode || 'advisory'}.`
                : 'No .neurcode/governance.json file. Local mode defaults to advisory for harmless task expansion; detected CODEOWNERS/sensitive boundaries still block.',
        recommendation: governanceConfig.error
            ? 'Fix .neurcode/governance.json. Expected arrays: approvalRequiredGlobs, sensitiveGlobs, safeSupportGlobs, ignoredGlobs; optional planCoherence: off|warn|block; optional localMode: strict|advisory|paused.'
            : undefined,
    });
    const ownerPreview = authorityPosture.ownerTokens.slice(0, 5).join(', ');
    const unmappedPreview = authorityPosture.unmappedOwnerTokens.slice(0, 5).join(', ');
    checks.push({
        id: 'approval_authority_posture',
        label: 'Approval authority posture',
        status: authorityPosture.ownerTokens.length === 0
            ? 'skip'
            : authorityPosture.source === 'local_cache' && authorityPosture.unmappedOwnerTokens.length === 0
                ? 'pass'
                : authorityPosture.strictDirectoryMode && authorityPosture.unmappedOwnerTokens.length > 0
                    ? 'fail'
                    : 'warn',
        message: authorityPosture.ownerTokens.length === 0
            ? 'No CODEOWNERS owner tokens detected locally; exact-path approvals use local/session policy only.'
            : authorityPosture.source === 'local_cache'
                ? authorityPosture.unmappedOwnerTokens.length === 0
                    ? `CODEOWNERS owners are mapped in local authority metadata: ${ownerPreview}.`
                    : `CODEOWNERS owners detected (${ownerPreview}); unmapped locally: ${unmappedPreview}. Strict enterprise mode ${authorityPosture.strictDirectoryMode ? 'is on' : 'is not proven on locally'}.`
                : authorityPosture.source === 'dashboard_pairing'
                    ? `CODEOWNERS owners detected (${ownerPreview}); this repo is dashboard-paired, but local doctor has no authority mapping cache to prove owner bindings.`
                    : `CODEOWNERS owners detected (${ownerPreview}); this repo is not paired, so Neurcode cannot map owners to workspace users/groups yet.`,
        recommendation: authorityPosture.ownerTokens.length === 0
            ? undefined
            : authorityPosture.source === 'unpaired'
                ? 'Run `neurcode activate claude --dir .` to pair the repo, then open Runtime Control Plane > Policy & health > CODEOWNERS token bindings.'
                : authorityPosture.unmappedOwnerTokens.length > 0 || authorityPosture.source === 'dashboard_pairing'
                    ? `Open Runtime Control Plane > Policy & health > CODEOWNERS token bindings; add ${authorityPosture.unmappedOwnerTokens[0] || authorityPosture.ownerTokens[0]}: owner, admin; then Sync GitHub directory or Link directory entry.`
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
            ? 'From Runtime Evidence, copy the activation command when available, or run `neurcode activate claude --dir .` for local-only activation.'
            : dashboardSyncFailed
                ? dashboardSyncRecovered
                    ? 'Run `neurcode sync --runtime --json` to refresh bulk evidence metadata after recovery. Live approvals can still be visible while this is pending.'
                    : `Run \`neurcode sync --runtime --json\` and inspect the bulk evidence error${connection.autoSync.lastError ? ` (${connection.autoSync.lastError})` : ''}.`
                : undefined,
    });
    checks.push({
        id: 'runtime_privacy',
        label: 'Intent privacy boundary',
        status: privacyAudit.quarantined > 0 || privacyAudit.rejected > 0
            ? 'fail'
            : privacyAudit.migrated > 0
                ? 'warn'
                : 'pass',
        message: `${privacyAudit.entriesScanned} local entr${privacyAudit.entriesScanned === 1 ? 'y' : 'ies'} scanned: ${privacyAudit.safe} safe, ${privacyAudit.migrated} legacy projection${privacyAudit.migrated === 1 ? '' : 's'}, ${privacyAudit.quarantined} quarantined, ${privacyAudit.rejected} rejected.`,
        recommendation: privacyAudit.nextRecoveryAction,
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
                ? `${transport.deadLetterEvents} source-free event${transport.deadLetterEvents === 1 ? '' : 's'} dead-lettered and ${transport.quarantinedEvents} privacy-rejected event${transport.quarantinedEvents === 1 ? '' : 's'} quarantined locally.`
                : transport.pendingEvents > 0
                    ? `${transport.pendingEvents} source-free event${transport.pendingEvents === 1 ? '' : 's'} queued locally (${transport.retryingEvents} retrying, ${transport.pendingSessionSnapshots} session snapshot${transport.pendingSessionSnapshots === 1 ? '' : 's'}, ${transport.pendingApprovalAcks} approval acknowledgement${transport.pendingApprovalAcks === 1 ? '' : 's'}).`
                    : transport.lastDeliveredAt
                        ? `Outbox empty. Last cloud delivery: ${transport.lastDeliveredAt}.`
                        : 'Outbox empty. No live runtime event has needed cloud delivery yet.',
        recommendation: transport.health === 'degraded'
            ? transport.quarantinedEvents > 0
                ? 'Run `neurcode runtime privacy-audit`; generate a new privacy-safe snapshot. Quarantined payload bodies remain local and are never printed or uploaded.'
                : `Inspect the delivery status, then run \`neurcode sync --runtime --retry-dead-letters\`.`
            : transport.lastError
                ? `Cloud delivery will retry automatically. Last error: ${transport.lastError}`
                : transport.lastRecoveredAt
                    ? `Transport recovered after a previous delivery failure at ${transport.lastRecoveredAt}.`
                    : undefined,
    });
    const latestBlock = activeSession
        ? [...activeSession.events].reverse().find((event) => event.type === 'check_block')
        : null;
    const latestApprovalOrAmendment = activeSession
        ? [...activeSession.events].reverse().find((event) => event.type === 'approval_decision' ||
            event.type === 'plan_amended' ||
            event.type === 'plan_amendment_decision')
        : null;
    checks.push({
        id: 'runtime_pending_actions',
        label: 'Pending dashboard actions',
        status: !connection
            ? 'skip'
            : transport.pendingApprovalAcks > 0 || transport.deadLetterApprovalAcks > 0
                ? transport.deadLetterApprovalAcks > 0 ? 'fail' : 'warn'
                : latestBlock && (!latestApprovalOrAmendment || latestApprovalOrAmendment.ts < latestBlock.ts)
                    ? 'warn'
                    : 'pass',
        message: !connection
            ? 'Pending cloud actions are available after dashboard pairing.'
            : transport.pendingApprovalAcks > 0 || transport.deadLetterApprovalAcks > 0
                ? `${transport.pendingApprovalAcks} local action acknowledgement${transport.pendingApprovalAcks === 1 ? '' : 's'} pending; ${transport.deadLetterApprovalAcks} dead-lettered.`
                : latestBlock && (!latestApprovalOrAmendment || latestApprovalOrAmendment.ts < latestBlock.ts)
                    ? `Active session ${activeSession?.sessionId} has an unresolved block at ${latestBlock.filePath || 'unknown path'}.`
                    : 'No locally visible unapplied dashboard actions.',
        recommendation: !connection
            ? undefined
            : transport.pendingApprovalAcks > 0 || transport.deadLetterApprovalAcks > 0
                ? 'Run `neurcode runtime actions apply --force`, then `neurcode runtime cloud-status`.'
                : latestBlock && (!latestApprovalOrAmendment || latestApprovalOrAmendment.ts < latestBlock.ts)
                    ? 'Run `neurcode runtime actions list`; if an operator has approved/amended scope, run `neurcode runtime actions apply` and retry the blocked path.'
                    : undefined,
    });
    checks.push({
        id: 'cursor_scope_rules',
        label: 'Cursor session scope file',
        status: !cursorScopeRules.exists ? 'skip' : cursorScopeRules.stale ? 'warn' : 'pass',
        message: !cursorScopeRules.exists
            ? 'No Cursor session scope file is present.'
            : cursorScopeRules.stale
                ? `Stale Cursor scope file at ${cursorScopeRules.filePath}: ${cursorScopeRules.reasons.join('; ')}.`
                : `Cursor scope file matches active session ${cursorScopeRules.sessionId || activeSession?.sessionId || 'unknown'}.`,
        recommendation: cursorScopeRules.exists && cursorScopeRules.stale
            ? 'Run `neurcode runtime reset-stale-cloud --force` for stale cloud state, or restart/onboard Cursor strict mode to regenerate session scope.'
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
        profileFreshness,
        runtimeAuthority,
        restartRequired: liveness.status === 'fail' ||
            profileFreshness.sessionCompatibility === 'incompatible',
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
        authorityPosture,
        privacyAudit,
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