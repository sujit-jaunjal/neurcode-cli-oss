"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cursorCommand = cursorCommand;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
const v0_governance_1 = require("../utils/v0-governance");
const agent_adapter_setup_1 = require("../utils/agent-adapter-setup");
const agent_guard_1 = require("../utils/agent-guard");
const session_allowlist_rules_1 = require("../utils/session-allowlist-rules");
const agent_guard_supervisor_1 = require("../utils/agent-guard-supervisor");
const runtime_live_1 = require("../utils/runtime-live");
const cursor_gate_1 = require("../utils/cursor-gate");
const governance_health_1 = require("../utils/governance-health");
const cursor_pilot_readiness_1 = require("../utils/cursor-pilot-readiness");
const runtime_connection_1 = require("../utils/runtime-connection");
const node_crypto_1 = require("node:crypto");
const api_client_1 = require("../api-client");
const config_1 = require("../config");
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
function emitJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function emitError(error, json) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
        emitJson({ ok: false, error: message });
    }
    else {
        console.error(chalk.red(message));
    }
    process.exitCode = 1;
}
function repoRelativeArtifactPath(repoRoot, artifactPath) {
    const root = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalized = artifactPath.replace(/\\/g, '/');
    return normalized.startsWith(`${root}/`)
        ? normalized.slice(root.length + 1)
        : '<external-agent-guard-artifact>';
}
async function publishGuardEvent(input) {
    const updated = (0, governance_runtime_1.appendEvent)(input.repoRoot, input.sessionId, input.event);
    if (updated) {
        await (0, runtime_live_1.publishRuntimeLiveStatus)(input.repoRoot, updated);
    }
}
async function runCursorOnboard(options) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const cliVersionWarning = (0, cursor_gate_1.buildCliVersionStaleWarning)();
    if (cliVersionWarning && !options.json) {
        (0, cursor_gate_1.emitCliVersionStaleWarning)(cliVersionWarning);
    }
    const goal = options.goal || 'Make one bounded change inside the declared task scope';
    const plan = options.plan || 'Capture a source-free plan before edits; call edit.before before every write.';
    const shouldWrite = options.write !== false;
    const shouldWriteInstructions = options.writeInstructions !== false;
    const shouldStartGuard = options.guardStart !== false;
    const strictMode = options.strict === true;
    const shouldInstallGate = options.installGate === true || strictMode;
    const shouldWriteScopeRules = options.scopeRules === true || strictMode;
    const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot, { force: true });
    const capability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)('cursor-mcp');
    const mcpWrite = shouldWrite
        ? options.global === true
            ? (0, agent_adapter_setup_1.writeAgentSetup)({ target: 'cursor', repoRoot, global: true })
            : (() => {
                const repoLocal = (0, agent_adapter_setup_1.writeAgentSetup)({ target: 'cursor', repoRoot, global: false });
                const home = (0, agent_adapter_setup_1.writeAgentSetup)({ target: 'cursor', repoRoot, global: true });
                return {
                    status: repoLocal.status === 'written' || home.status === 'written' ? 'written' : repoLocal.status,
                    configPath: `${repoLocal.configPath ?? '.cursor/mcp.json'} + ${home.configPath ?? '~/.cursor/mcp.json'}`,
                    message: `Repo MCP: ${repoLocal.message} Home MCP: ${home.message}`,
                };
            })()
        : { status: 'not_requested', configPath: null, message: 'Skipped (--no-write).' };
    const instructionsWrite = shouldWriteInstructions
        ? (0, agent_adapter_setup_1.writeAgentInstructions)({ target: 'cursor', repoRoot })
        : { status: 'not_requested', filePath: null, message: 'Skipped (--no-write-instructions).' };
    const mcpInspection = (0, agent_adapter_setup_1.inspectAgentSetup)({ target: 'cursor', repoRoot, global: false });
    const globalMcpInspection = (0, agent_adapter_setup_1.inspectAgentSetup)({ target: 'cursor', repoRoot, global: true });
    const instructionInspection = (0, agent_adapter_setup_1.inspectAgentInstructions)({ target: 'cursor', repoRoot });
    const doctorChecks = [
        {
            id: 'mcp_config',
            status: mcpInspection.configured && globalMcpInspection.configured ? 'pass' : mcpInspection.configured || globalMcpInspection.configured ? 'warn' : 'fail',
            message: mcpInspection.configured && globalMcpInspection.configured
                ? 'Repo-local and Home MCP configs are pinned.'
                : mcpInspection.configured
                    ? `Repo MCP ready; Home MCP needs attention: ${globalMcpInspection.message}`
                    : globalMcpInspection.configured
                        ? `Home MCP ready; repo MCP needs attention: ${mcpInspection.message}`
                        : mcpInspection.message,
        },
        {
            id: 'agent_instructions',
            status: instructionInspection.installed ? 'pass' : 'fail',
            message: instructionInspection.message,
        },
        {
            id: 'profile',
            status: profile.profile.topology.trackedFileCount > 0 ? 'pass' : 'fail',
            message: `Profile ${profile.profile.profileHash} (${profile.profile.topology.trackedFileCount} tracked files).`,
        },
    ];
    const doctorOk = doctorChecks.every((check) => check.status === 'pass');
    let guardPayload;
    if (shouldStartGuard && doctorOk) {
        const launch = await (0, agent_session_launcher_1.launchAgentSession)({
            agent: 'cursor',
            goal,
            dir: repoRoot,
            plan,
            activate: false,
            forceProfile: false,
            actor: 'local_cli_cursor_onboard',
        });
        const artifact = (0, agent_guard_1.createAgentGuardArtifact)({
            repoRoot: launch.repoRoot,
            sessionId: launch.session.sessionId,
            agent: launch.agent.normalized,
            adapter: launch.agent.adapter,
            startedAt: launch.generatedAt,
        });
        const guardPath = (0, agent_guard_1.writeAgentGuardArtifact)(launch.repoRoot, artifact);
        await publishGuardEvent({
            repoRoot: launch.repoRoot,
            sessionId: launch.session.sessionId,
            event: {
                type: 'agent_guard_started',
                ts: artifact.startedAt,
                message: `Agent guard started for cursor (${artifact.adapter}).`,
                detail: {
                    schemaVersion: artifact.schemaVersion,
                    guardId: artifact.guardId,
                    artifactPath: repoRelativeArtifactPath(launch.repoRoot, guardPath),
                    baselineFileCount: artifact.baseline.fileCount,
                    baselineTreeHash: artifact.baseline.treeHash,
                    privacy: artifact.privacy,
                },
            },
        });
        const cliEntry = process.argv[1];
        const supervisorStarted = cliEntry
            ? (0, agent_guard_supervisor_1.startAgentGuardSupervisorDetached)({
                repoRoot: launch.repoRoot,
                sessionId: launch.session.sessionId,
                guardPath,
                cliEntry,
            })
            : null;
        guardPayload = {
            sessionId: launch.session.sessionId,
            adapter: launch.agent.adapter,
            enforcementLevel: launch.agent.enforcementLevel,
            supervisor: supervisorStarted
                ? { enabled: true, ...supervisorStarted }
                : { enabled: false },
        };
    }
    const gateInstall = shouldInstallGate
        ? (0, cursor_gate_1.installCursorGateHook)({
            dir: repoRoot,
            force: false,
            hook: strictMode ? 'both' : 'pre-push',
        })
        : undefined;
    const strictRules = strictMode ? (0, session_allowlist_rules_1.writeStrictCursorRules)({ repoRoot }) : undefined;
    let scopeRules;
    if (shouldWriteScopeRules && guardPayload?.sessionId) {
        const session = (0, governance_runtime_1.loadSession)(repoRoot, String(guardPayload.sessionId));
        if (session) {
            scopeRules = (0, session_allowlist_rules_1.writeSessionScopeRules)({ repoRoot, session });
        }
    }
    const payload = {
        schemaVersion: 'neurcode.cursor-onboard.v1',
        ok: doctorOk,
        strict: strictMode,
        generatedAt: new Date().toISOString(),
        repoRoot,
        cliVersionWarning,
        installedArtifacts: strictMode ? (0, session_allowlist_rules_1.listStrictOnboardArtifacts)(repoRoot) : undefined,
        enforcement: {
            level: capability.enforcementLevel,
            controlLevel: capability.controlLevel,
            honestSummary: 'Cursor uses cooperative MCP edit.before checks plus local guard supervisor containment — not Claude-style hard pre-write deny.',
        },
        profile: {
            profileHash: profile.profile.profileHash,
            trackedFileCount: profile.profile.topology.trackedFileCount,
        },
        setup: {
            schemaVersion: agent_adapter_setup_1.AGENT_ADAPTER_SETUP_SCHEMA_VERSION,
            mcp: mcpWrite,
            instructions: instructionsWrite,
        },
        doctor: {
            schemaVersion: agent_adapter_setup_1.AGENT_ADAPTER_DOCTOR_SCHEMA_VERSION,
            ok: doctorOk,
            checks: doctorChecks,
        },
        guard: guardPayload,
        gateInstall,
        strictRules,
        scopeRules,
        next: [
            'Reload Cursor and enable Home MCP in Settings → MCP (required for Agent tool list).',
            'In Cursor Agent, call neurcode_agent_edit_before before every proposed file write.',
            'Check posture anytime: neurcode cursor health',
            'Before push or merge: neurcode cursor gate (exit 0 = clean, exit 2 = blocked)',
            strictMode
                ? 'Enterprise strict: pre-commit + pre-push hooks installed; finish with cursor gate clean.'
                : shouldInstallGate
                    ? 'Pre-push gate installed via --install-gate.'
                    : 'Optional: neurcode cursor gate install --hook both',
            'Finish with: neurcode agent guard finish --session-id <id> --fail-on-unverified',
            strictMode
                ? 'Demo: bash scripts/cursor-enforcement-stack-demo.sh'
                : 'Demo: bash scripts/cursor-supervised-demo.sh',
        ],
    };
    return payload;
}
function renderCursorGateExplain(payload) {
    console.log('');
    console.log(chalk.bold('Neurcode cursor gate'));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Schema:  ${cursor_gate_1.CURSOR_GATE_SCHEMA_VERSION}`);
    console.log(`Exit:    ${payload.exitCode === 0 ? chalk.green('0 (clean)') : payload.exitCode === 2 ? chalk.red('2 (attention required)') : chalk.red('1 (error)')}`);
    if (payload.sessionId)
        console.log(`Session: ${chalk.white(payload.sessionId)}`);
    if (payload.agentGuardPosture) {
        console.log(`Posture: ${payload.agentGuardPosture.status.replace(/_/g, ' ')}`);
    }
    console.log(chalk.dim(payload.enforcement.honestSummary));
    if (payload.error)
        console.log(chalk.red(`Error: ${payload.error}`));
    if (payload.evaluation) {
        console.log('');
        console.log(`Changed ${payload.summary.changedFiles} · ` +
            `verified ${payload.evaluation.summary.verifiedPrewrite} · ` +
            `unverified ${payload.summary.unverifiedWrites > 0 ? chalk.red(String(payload.summary.unverifiedWrites)) : '0'} · ` +
            `denied-changed ${payload.summary.deniedButChanged > 0 ? chalk.red(String(payload.summary.deniedButChanged)) : '0'}`);
        const actionable = payload.evaluation.changedFiles.filter((file) => file.classification !== 'verified_prewrite');
        if (actionable.length > 0) {
            console.log('');
            console.log(chalk.bold('Files needing attention'));
            for (const file of actionable.slice(0, 10)) {
                const label = file.classification.replace(/_/g, ' ');
                console.log(`  ${chalk.white(file.path)} — ${label} (${file.changeType})`);
                if (file.classification === 'denied_but_changed') {
                    console.log(chalk.dim('    Approve the exact path, then retry the write in the agent.'));
                }
                else if (file.classification === 'unverified_write') {
                    console.log(chalk.dim('    Call neurcode_agent_edit_before before writing this file.'));
                }
            }
        }
    }
    if (payload.remediation.length > 0) {
        console.log('');
        console.log(chalk.bold('Remediation'));
        for (const step of payload.remediation)
            console.log(chalk.dim(`  ${step}`));
    }
    if (payload.exitCode === 2) {
        console.log('');
        console.log(chalk.yellow('Push and CI handoff are blocked until guard is clean (exit 0).'));
    }
    console.log('');
}
async function runCursorGateAction(options) {
    const payload = await (0, cursor_gate_1.evaluateCursorGate)({
        dir: options.dir,
        sessionId: options.sessionId,
        allowNoSession: options.allowNoSession,
        ci: options.ci,
    });
    if (options.ci) {
        for (const line of (0, cursor_gate_1.formatCursorGateCiErrors)(payload))
            console.error(line);
    }
    if (options.json) {
        emitJson(payload);
    }
    else if (options.explain || options.ci) {
        renderCursorGateExplain(payload);
        if (options.ci && payload.exitCode === 0) {
            console.log(chalk.dim('GitHub Actions: add step `npx @neurcode-ai/cli cursor gate --json`'));
            console.log(chalk.dim('Optional output: echo "cursor_gate_exit=$?" >> $GITHUB_OUTPUT'));
        }
    }
    else {
        renderCursorGateExplain(payload);
    }
    process.exitCode = payload.exitCode;
}
function cursorCommand(program) {
    const cmd = program
        .command('cursor')
        .description('Cursor supervised governance onboarding');
    const gate = cmd
        .command('gate')
        .description('Fail-closed push/CI handoff gate for Cursor cooperative enforcement')
        .addHelpText('after', `
Exit codes (CI contract):
  0  Guard clean — all changed files have allowed pre-write evidence
  2  Attention required — unverified or denied-but-changed writes detected
  1  Misconfiguration, no active session, or internal error
`);
    gate
        .command('eval', { isDefault: true, hidden: true })
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Session ID override (default: active guard pointer)')
        .option('--json', 'Output machine-readable JSON (schema: neurcode.cursor-gate.v1)')
        .option('--explain', 'Human-readable reasons and remediation steps')
        .option('--allow-no-session', 'Doctor-only mode: exit 0 when no active guard session')
        .option('--ci', 'GitHub Actions-friendly errors and output hints')
        .action(async (options) => {
        try {
            await runCursorGateAction(options);
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    gate
        .command('ci')
        .description('CI helper — same as cursor gate with GitHub Actions output')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Session ID override (default: active guard pointer)')
        .option('--json', 'Output machine-readable JSON (schema: neurcode.cursor-gate.v1)')
        .option('--explain', 'Human-readable reasons and remediation steps')
        .action(async (options) => {
        try {
            await runCursorGateAction({ ...options, ci: true });
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    gate
        .command('install')
        .description('Install repo-local git hooks (pre-push and/or pre-commit) that run cursor gate')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--hook <kind>', 'Hook to install: pre-push (default), pre-commit, or both', 'pre-push')
        .option('--force', 'Rewrite existing cursor gate hook fragment')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        try {
            const hook = options.hook === 'both' || options.hook === 'pre-commit' || options.hook === 'pre-push'
                ? options.hook
                : 'pre-push';
            const result = (0, cursor_gate_1.installCursorGateHook)({ dir: options.dir, force: options.force, hook });
            const cliVersionWarning = (0, cursor_gate_1.buildCliVersionStaleWarning)();
            if (cliVersionWarning && !options.json) {
                (0, cursor_gate_1.emitCliVersionStaleWarning)(cliVersionWarning);
            }
            if (options.json) {
                emitJson({
                    schemaVersion: 'neurcode.cursor-gate-install.v1',
                    ...result,
                    cliVersionWarning,
                    hookPath: result.hooks[0]?.hookPath,
                    neurcodeHookPath: result.hooks[0]?.neurcodeHookPath,
                });
            }
            else {
                console.log('');
                console.log(chalk.bold('Neurcode cursor gate install'));
                console.log(result.ok ? chalk.green(result.message) : chalk.red(result.message));
                for (const hookResult of result.hooks) {
                    console.log(chalk.dim(`${hookResult.hookKind}: ${hookResult.neurcodeHookPath}`));
                }
                console.log(chalk.dim('Emergency bypass: NEURCODE_CURSOR_GATE_SKIP=1 git push|commit ...'));
                console.log('');
            }
            if (!result.ok)
                process.exitCode = 1;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    gate
        .command('doctor')
        .description('Verify cursor gate hook installation')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        try {
            const result = (0, cursor_gate_1.doctorCursorGateHook)({ dir: options.dir });
            const cliVersionWarning = result.cliVersionWarning ?? (0, cursor_gate_1.buildCliVersionStaleWarning)();
            if (cliVersionWarning && !options.json) {
                (0, cursor_gate_1.emitCliVersionStaleWarning)(cliVersionWarning);
            }
            if (options.json) {
                emitJson({ schemaVersion: 'neurcode.cursor-gate-doctor.v1', ...result, cliVersionWarning });
            }
            else {
                console.log('');
                console.log(chalk.bold('Neurcode cursor gate doctor'));
                console.log(result.ok ? chalk.green('pass') : chalk.red('fail'));
                for (const check of result.checks) {
                    const color = check.status === 'pass'
                        ? chalk.green
                        : check.status === 'skip'
                            ? chalk.dim
                            : chalk.red;
                    console.log(`  ${color(check.id)} ${check.message}`);
                }
                console.log('');
            }
            if (!result.ok)
                process.exitCode = 1;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('onboard')
        .description('One-command Cursor enterprise pilot setup: profile, MCP, rules, doctor, guarded session')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--goal <goal>', 'Task goal for optional guarded session start')
        .option('--plan <text>', 'Source-free plan for optional guarded session start')
        .option('--no-write', 'Skip writing .cursor/mcp.json')
        .option('--no-write-instructions', 'Skip writing .cursor/rules/neurcode.mdc')
        .option('--global', 'Write ~/.cursor/mcp.json instead of repo-local config')
        .option('--no-guard-start', 'Skip starting a guarded Cursor session with supervisor')
        .option('--install-gate', 'Install repo-local pre-push hook (neurcode cursor gate)')
        .option('--strict', 'Enterprise path: guarded session, both git hooks, strict rules, session scope')
        .option('--scope-rules', 'Write .cursor/rules/neurcode-session-scope.mdc from active session')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const payload = await runCursorOnboard(options);
            if (options.json) {
                emitJson(payload);
            }
            else {
                console.log('');
                console.log(chalk.bold('Neurcode Cursor onboard'));
                console.log(chalk.dim('-'.repeat(72)));
                console.log(`Repo:    ${chalk.white(payload.repoRoot)}`);
                console.log(`Mode:    ${chalk.cyan('supervised cooperative')} (${payload.enforcement.level})`);
                console.log(chalk.dim(payload.enforcement.honestSummary));
                console.log(`Doctor:  ${payload.doctor.ok ? chalk.green('pass') : chalk.red('fail')}`);
                for (const check of payload.doctor.checks) {
                    const color = check.status === 'pass' ? chalk.green : chalk.red;
                    console.log(`  ${color(check.id)} ${check.message}`);
                }
                if (payload.guard) {
                    console.log(`Session: ${chalk.cyan(String(payload.guard.sessionId))}`);
                    console.log(`Supervisor: ${payload.guard.supervisor && typeof payload.guard.supervisor === 'object' && payload.guard.supervisor.enabled
                        ? chalk.green('running (default-on)')
                        : chalk.yellow('not started')}`);
                }
                if (payload.strict) {
                    console.log(`Strict:  ${chalk.cyan('enterprise enforcement stack enabled')}`);
                }
                console.log('');
                console.log(chalk.bold('Next'));
                for (const step of payload.next)
                    console.log(chalk.dim(`  - ${step}`));
                console.log('');
            }
            if (!payload.ok)
                process.exitCode = 1;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('health')
        .description('Am I actually governed? Checks MCP, Home MCP, session, guard correlation, and supervisor')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .option('--record', 'Upload this health report to Runtime Control Plane (requires paired repo + API key)')
        .action(async (options) => {
        try {
            const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
            const report = (0, governance_health_1.evaluateGovernanceHealth)(options.dir);
            let recorded = null;
            if (options.record) {
                const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
                if (!connection?.repo?.repoKey) {
                    throw new Error('Repository is not paired with Runtime Control Plane. Run activate --connect first.');
                }
                const config = (0, config_1.loadConfig)();
                config.apiKey = (0, config_1.requireApiKey)(connection.organizationId);
                const client = new api_client_1.ApiClient(config);
                const fingerprint = (0, node_crypto_1.createHash)('sha256').update(repoRoot).digest('hex').slice(0, 32);
                recorded = await client.recordGovernanceHealthReport({
                    schemaVersion: governance_health_1.GOVERNANCE_HEALTH_SCHEMA_VERSION,
                    repoKey: connection.repo.repoKey,
                    verdict: report.verdict,
                    ok: report.ok,
                    summary: report.summary,
                    checks: report.checks,
                    remediation: report.remediation,
                    repoRootFingerprint: fingerprint,
                });
            }
            if (options.json) {
                emitJson(recorded ? { ...report, recorded } : report);
            }
            else {
                console.log('');
                console.log(chalk.bold('Neurcode governance health'));
                console.log(chalk.dim('-'.repeat(72)));
                console.log(`Verdict: ${report.verdict === 'governed' ? chalk.green(report.verdict) : report.verdict === 'ungoverned' ? chalk.red(report.verdict) : chalk.yellow(report.verdict)}`);
                console.log(report.summary);
                console.log('');
                for (const check of report.checks) {
                    const color = check.status === 'pass' ? chalk.green : check.status === 'warn' ? chalk.yellow : chalk.red;
                    console.log(`  ${color(check.id)} ${check.message}`);
                }
                if (report.remediation.length > 0) {
                    console.log('');
                    console.log(chalk.bold('Remediation'));
                    for (const step of report.remediation)
                        console.log(chalk.dim(`  ${step}`));
                }
                if (recorded) {
                    console.log('');
                    console.log(chalk.green(`Recorded to control plane for ${recorded.repoKey} at ${recorded.recordedAt}`));
                }
                console.log('');
            }
            if (!report.ok)
                process.exitCode = 1;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('pilot-readiness')
        .description('Full Cursor pilot readiness gate (repo + MCP + guard correlation)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        try {
            const report = (0, cursor_pilot_readiness_1.runCursorPilotReadinessCheck)(options.dir);
            if (options.json) {
                emitJson(report);
            }
            else {
                console.log('');
                console.log(chalk.bold('Neurcode cursor pilot readiness'));
                console.log(report.ready ? chalk.green('Ready for pilot') : chalk.red('Not ready'));
                console.log(chalk.dim(`Health verdict: ${report.health.verdict} · MCP ok: ${report.mcp.ok}`));
                if (report.blockers.length > 0) {
                    console.log('');
                    console.log(chalk.bold('Blockers'));
                    for (const blocker of report.blockers)
                        console.log(chalk.red(`  ${blocker}`));
                }
                if (report.warnings.length > 0) {
                    console.log('');
                    console.log(chalk.bold('Warnings'));
                    for (const warning of report.warnings)
                        console.log(chalk.yellow(`  ${warning}`));
                }
                console.log('');
            }
            if (!report.ready)
                process.exitCode = 1;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    const scope = cmd
        .command('scope')
        .description('Session-scoped Cursor rules for drift reduction');
    scope
        .command('refresh')
        .description('Regenerate .cursor/rules/neurcode-session-scope.mdc from the active session contract')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Session ID override (default: active session)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        try {
            const result = (0, session_allowlist_rules_1.refreshSessionScopeRules)({
                dir: options.dir,
                sessionId: options.sessionId,
            });
            if (options.json) {
                emitJson({ schemaVersion: 'neurcode.cursor-scope-refresh.v1', ...result });
            }
            else {
                console.log('');
                console.log(chalk.bold('Neurcode cursor scope refresh'));
                console.log(result.ok ? chalk.green(result.message) : chalk.red(result.message));
                if (result.ok && result.allowedGlobs.length > 0) {
                    console.log(chalk.dim(`Globs: ${result.allowedGlobs.slice(0, 5).join(', ')}`));
                }
                console.log('');
            }
            if (!result.ok)
                process.exitCode = 1;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
}
//# sourceMappingURL=cursor.js.map