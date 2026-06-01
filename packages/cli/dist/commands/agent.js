"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentCommand = agentCommand;
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
const v0_governance_1 = require("../utils/v0-governance");
const agent_adapter_setup_1 = require("../utils/agent-adapter-setup");
const agent_guard_1 = require("../utils/agent-guard");
const runtime_live_1 = require("../utils/runtime-live");
const runtime_adapter_1 = require("./runtime-adapter");
const session_1 = require("./session");
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
const AGENT_TO_ADAPTER = {
    claude: 'claude-code-hooks',
    'claude-code': 'claude-code-hooks',
    codex: 'codex-mcp',
    cursor: 'cursor-mcp',
    gemini: 'generic-mcp',
    generic: 'generic-mcp',
    mcp: 'generic-mcp',
    'generic-mcp': 'generic-mcp',
    vscode: 'vscode-extension',
    'vs-code': 'vscode-extension',
    'vscode-extension': 'vscode-extension',
};
function compact(values, max = 5) {
    if (values.length === 0)
        return 'none';
    const shown = values.slice(0, max).join(', ');
    return values.length > max ? `${shown} +${values.length - max} more` : shown;
}
function collect(value, previous = []) {
    return [...previous, value];
}
function readPlan(options) {
    if (options.planFile)
        return (0, node_fs_1.readFileSync)(options.planFile, 'utf8');
    return options.plan;
}
function normalizeAdapter(value) {
    if (!value)
        return null;
    const key = value.trim().toLowerCase();
    return AGENT_TO_ADAPTER[key] ?? ((0, governance_runtime_1.listAgentRuntimeAdapterCapabilities)().some((capability) => capability.adapter === key)
        ? key
        : null);
}
function adapterFromOptions(options, fallbackAgent) {
    const direct = normalizeAdapter(options.adapter);
    if (direct)
        return direct;
    const agent = normalizeAdapter(options.agent || fallbackAgent);
    if (agent)
        return agent;
    throw new Error(`Unsupported agent/adapter. Use one of: claude, codex, cursor, generic-mcp, vscode.`);
}
function repoRootFrom(options) {
    return (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
}
async function submitAgentEvent(input) {
    const repoRoot = repoRootFrom({ dir: input.dir });
    const normalized = (0, governance_runtime_1.normalizeAgentRuntimeEvent)({
        schemaVersion: governance_runtime_1.AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION,
        adapter: input.adapter,
        eventType: input.eventType,
        cwd: repoRoot,
        payload: input.payload ?? {},
    });
    return (0, runtime_adapter_1.submitAgentRuntimeEvent)({ ...normalized, cwd: repoRoot });
}
function emitJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
function emitError(error, json) {
    const message = error instanceof Error ? error.message : String(error);
    if (json)
        emitJson({ ok: false, error: message });
    else
        console.error(chalk.red(`Neurcode agent command failed: ${message}`));
    process.exitCode = 1;
}
function renderLaunch(result) {
    console.log('');
    console.log(chalk.bold('Neurcode universal agent session'));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Repo:     ${chalk.white(result.repoRoot)}`);
    console.log(`Session:  ${chalk.cyan(result.session.sessionId)}`);
    console.log(`Agent:    ${result.agent.normalized} -> ${result.agent.adapter} ${chalk.dim(`(${result.agent.enforcementLevel})`)}`);
    console.log(`Goal:     ${result.session.goal}`);
    console.log(`Scope:    ${result.session.scopeMode} · ${compact(result.session.allowedGlobs)}`);
    console.log(`Gates:    ${compact(result.session.approvalRequiredGlobs)}`);
    console.log(`Next:     ${result.handshake.nextEvent ?? 'status'} · ${result.handshake.status}`);
    console.log('');
    console.log(chalk.bold('Starter prompt'));
    console.log(result.handshake.starterPrompt);
    console.log('');
    console.log(chalk.bold('Agent commands'));
    console.log(chalk.dim(`  neurcode agent handshake --adapter ${result.agent.adapter} --session-id ${result.session.sessionId}`));
    console.log(chalk.dim(`  neurcode agent plan --adapter ${result.agent.adapter} --plan "<source-free plan>" --session-id ${result.session.sessionId}`));
    console.log(chalk.dim(`  neurcode agent check <repo-relative-path> --adapter ${result.agent.adapter} --session-id ${result.session.sessionId}`));
    console.log('');
}
function renderDecision(result, target) {
    const color = result.decision === 'deny'
        ? chalk.red
        : result.decision === 'warn'
            ? chalk.yellow
            : chalk.green;
    console.log(color(`${result.decision.toUpperCase()}: ${result.message}`));
    if (target)
        console.log(chalk.dim(`Path: ${target}`));
    console.log(chalk.dim(`Adapter: ${result.adapter} · ${result.enforcementLevel} · ${result.eventType}`));
}
function capabilityFor(adapter) {
    return (0, governance_runtime_1.listAgentRuntimeAdapterCapabilities)().find((capability) => capability.adapter === adapter);
}
function firstRunCommands(input) {
    const session = input.sessionIdPlaceholder || '<session-id>';
    if (input.target === 'claude') {
        return {
            activate: 'neurcode activate claude',
            start: `neurcode run claude --goal "${input.goal}"`,
            status: 'neurcode status',
            approve: 'neurcode session approve --path <exact-path> --reason "<reason>"',
        };
    }
    return {
        setup: `neurcode agent setup ${input.target} --write --write-instructions`,
        start: `neurcode agent start ${input.target} --goal "${input.goal}"`,
        handshake: `neurcode agent handshake --adapter ${input.adapter} --session-id ${session}`,
        plan: `neurcode agent plan --adapter ${input.adapter} --session-id ${session} --plan "<source-free plan>"`,
        check: `neurcode agent check <repo-relative-path> --adapter ${input.adapter} --session-id ${session}`,
        approve: `neurcode agent approve <exact-path> --adapter ${input.adapter} --session-id ${session} --reason "<reason>"`,
        finish: `neurcode agent finish --adapter ${input.adapter} --session-id ${session}`,
    };
}
function buildSetupPayload(agentArg, options) {
    const repoRoot = repoRootFrom({ dir: options.dir });
    const target = (0, agent_adapter_setup_1.normalizeAgentSetupTarget)(agentArg);
    const snippet = (0, agent_adapter_setup_1.buildAgentSetupSnippet)({
        target,
        repoRoot,
        global: options.global === true,
    });
    const instructionArtifact = (0, agent_adapter_setup_1.buildAgentInstructionArtifact)({ target, repoRoot });
    const capability = capabilityFor(snippet.adapter);
    const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot, { force: options.forceProfile === true });
    const before = (0, agent_adapter_setup_1.inspectAgentSetup)({
        target,
        repoRoot,
        global: options.global === true,
    });
    const instructionsBefore = (0, agent_adapter_setup_1.inspectAgentInstructions)({ target, repoRoot });
    const write = options.write
        ? (0, agent_adapter_setup_1.writeAgentSetup)({
            target,
            repoRoot,
            global: options.global === true,
        })
        : {
            status: 'not_requested',
            configPath: snippet.configPath,
            message: 'Run with --write to update known Codex/Cursor MCP config automatically.',
        };
    const instructionWrite = options.writeInstructions
        ? (0, agent_adapter_setup_1.writeAgentInstructions)({ target, repoRoot })
        : {
            status: 'not_requested',
            filePath: instructionArtifact.filePath,
            message: 'Run with --write-instructions to add repo-native agent runtime instructions.',
        };
    const after = (0, agent_adapter_setup_1.inspectAgentSetup)({
        target,
        repoRoot,
        global: options.global === true,
    });
    const instructionsAfter = (0, agent_adapter_setup_1.inspectAgentInstructions)({ target, repoRoot });
    const goal = options.goal || 'modify src/tasks/export.py';
    return {
        schemaVersion: agent_adapter_setup_1.AGENT_ADAPTER_SETUP_SCHEMA_VERSION,
        ok: true,
        generatedAt: new Date().toISOString(),
        repoRoot,
        privacy: {
            metadataOnly: true,
            sourceUploaded: false,
            sourceIncluded: false,
        },
        target,
        adapter: snippet.adapter,
        enforcement: {
            level: capability?.enforcementLevel ?? 'cooperative',
            automatic: capability?.automatic ?? false,
            description: capability?.description ?? 'Portable MCP runtime adapter.',
        },
        profile: {
            status: profile.status,
            refreshed: profile.refreshed,
            profileHash: profile.profile.profileHash,
            topologyHash: profile.profile.topology.hash,
            trackedFileCount: profile.profile.topology.trackedFileCount,
            reasons: [...profile.reasons],
        },
        mcp: {
            before,
            after,
            snippet,
            write,
        },
        instructions: {
            before: instructionsBefore,
            after: instructionsAfter,
            artifact: instructionArtifact,
            write: instructionWrite,
        },
        firstRun: {
            goal,
            commands: firstRunCommands({ target, adapter: snippet.adapter, goal }),
            expectedFlow: [
                'start governed session',
                'agent handshakes into session',
                'agent captures source-free plan',
                'agent calls check before each write',
                'human approves exact path only when needed',
                'session finishes with replayable evidence',
            ],
        },
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
function renderSetup(payload) {
    console.log('');
    console.log(chalk.bold(`Neurcode agent setup - ${payload.target}`));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Repo:     ${chalk.white(payload.repoRoot)}`);
    console.log(`Adapter:  ${payload.adapter} ${chalk.dim(`(${payload.enforcement.level}${payload.enforcement.automatic ? ', automatic' : ', explicit'})`)}`);
    console.log(`Profile:  ${payload.profile.refreshed ? chalk.green('refreshed') : chalk.green(payload.profile.status)} ${chalk.dim(payload.profile.profileHash)}`);
    console.log(`MCP:      ${payload.mcp.after.configured === true ? chalk.green('configured') : payload.mcp.after.configured === false ? chalk.yellow('not configured') : chalk.dim('manual')}`);
    console.log(`Rules:    ${payload.instructions.after.installed === true ? chalk.green('installed') : payload.instructions.after.installed === false ? chalk.yellow('missing') : chalk.dim('optional')}`);
    if (payload.mcp.snippet.configPath) {
        console.log(`Config:   ${chalk.white(payload.mcp.snippet.configPath)}`);
    }
    console.log(`Write:    ${payload.mcp.write.status} ${chalk.dim(payload.mcp.write.message)}`);
    console.log(`Instr:    ${payload.instructions.write.status} ${chalk.dim(payload.instructions.write.message)}`);
    console.log(chalk.dim('-'.repeat(72)));
    console.log(chalk.bold('MCP config'));
    console.log(chalk.dim(`# Destination: ${payload.mcp.snippet.destination}`));
    console.log(chalk.dim(`# Action: ${payload.mcp.snippet.instruction}`));
    console.log(payload.mcp.snippet.body.trimEnd());
    console.log('');
    console.log(chalk.bold('Agent instructions'));
    console.log(chalk.dim(`# Destination: ${payload.instructions.artifact.destination}`));
    console.log(chalk.dim(`# Action: ${payload.instructions.artifact.instruction}`));
    console.log(payload.instructions.artifact.body.trimEnd());
    console.log('');
    console.log(chalk.bold('First governed session'));
    for (const [name, command] of Object.entries(payload.firstRun.commands)) {
        console.log(chalk.dim(`  ${name.padEnd(10)} ${command}`));
    }
    console.log('');
}
function npxCheck() {
    const result = (0, node_child_process_1.spawnSync)('npx', ['--version'], { encoding: 'utf8' });
    if (result.status === 0) {
        return {
            id: 'npx',
            label: 'npx',
            status: 'pass',
            message: `npx ${String(result.stdout || '').trim()} is available for zero-install MCP startup.`,
        };
    }
    return {
        id: 'npx',
        label: 'npx',
        status: 'fail',
        message: 'npx is not available, so agent MCP clients cannot start @neurcode-ai/mcp-server with the generated config.',
        recommendation: 'Install Node.js >=18 or configure your MCP client to use a locally installed neurcode-mcp binary.',
    };
}
function configCheck(inspection) {
    if (inspection.configured === true) {
        return {
            id: 'mcp_config',
            label: 'MCP config',
            status: 'pass',
            message: inspection.message,
        };
    }
    if (inspection.configured === false) {
        return {
            id: 'mcp_config',
            label: 'MCP config',
            status: 'warn',
            message: inspection.message,
            recommendation: `Run neurcode agent setup ${inspection.target} --write, or paste the emitted snippet manually.`,
        };
    }
    return {
        id: 'mcp_config',
        label: 'MCP config',
        status: 'skip',
        message: inspection.message,
    };
}
function instructionCheck(inspection) {
    if (inspection.installed === true) {
        return {
            id: 'agent_instructions',
            label: 'Agent instructions',
            status: 'pass',
            message: inspection.message,
        };
    }
    if (inspection.installed === false) {
        return {
            id: 'agent_instructions',
            label: 'Agent instructions',
            status: 'warn',
            message: inspection.message,
            recommendation: `Run neurcode agent setup ${inspection.target} --write-instructions, or paste the emitted instruction block manually.`,
        };
    }
    return {
        id: 'agent_instructions',
        label: 'Agent instructions',
        status: 'skip',
        message: inspection.message,
    };
}
function buildDoctorPayload(agentArg, options) {
    const repoRoot = repoRootFrom({ dir: options.dir });
    const target = (0, agent_adapter_setup_1.normalizeAgentSetupTarget)(agentArg);
    const inspection = (0, agent_adapter_setup_1.inspectAgentSetup)({
        target,
        repoRoot,
        global: options.global === true,
    });
    const instructionInspection = (0, agent_adapter_setup_1.inspectAgentInstructions)({ target, repoRoot });
    const staleness = (0, v0_governance_1.getProfileStaleness)(repoRoot);
    const activeSession = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    const capability = capabilityFor(inspection.adapter);
    const checks = [
        {
            id: 'adapter',
            label: 'Adapter capability',
            status: 'pass',
            message: `${inspection.adapter} reports ${capability?.enforcementLevel ?? 'cooperative'} enforcement (${capability?.automatic ? 'automatic' : 'explicit agent calls'}).`,
        },
        configCheck(inspection),
        instructionCheck(instructionInspection),
        npxCheck(),
        {
            id: 'profile',
            label: 'Governance profile',
            status: staleness.status === 'fresh' ? 'pass' : 'warn',
            message: staleness.status === 'fresh'
                ? `Fresh profile at ${staleness.profilePath} (${staleness.currentProfile.topology.trackedFileCount} tracked files).`
                : `${staleness.status}: ${staleness.reasons.join('; ') || 'profile needs refresh'}.`,
            recommendation: staleness.status === 'fresh' ? undefined : `Run neurcode agent setup ${target} --force-profile.`,
        },
        {
            id: 'active_session',
            label: 'Active session',
            status: activeSession?.status === 'active' ? 'pass' : 'skip',
            message: activeSession?.status === 'active'
                ? `Session ${activeSession.sessionId} is active (${activeSession.contract.scopeMode} scope).`
                : 'No active governed session. Start one with neurcode agent start.',
        },
    ];
    const summary = {
        pass: checks.filter((item) => item.status === 'pass').length,
        warn: checks.filter((item) => item.status === 'warn').length,
        fail: checks.filter((item) => item.status === 'fail').length,
        skip: checks.filter((item) => item.status === 'skip').length,
    };
    return {
        schemaVersion: agent_adapter_setup_1.AGENT_ADAPTER_DOCTOR_SCHEMA_VERSION,
        ok: summary.fail === 0,
        generatedAt: new Date().toISOString(),
        repoRoot,
        target,
        adapter: inspection.adapter,
        checks,
        summary,
        next: summary.fail > 0
            ? 'Resolve failed checks before relying on agent MCP calls.'
            : inspection.configured === false
                ? `Run neurcode agent setup ${target} --write or paste the MCP snippet.`
                : instructionInspection.installed === false
                    ? `Run neurcode agent setup ${target} --write-instructions or paste the agent instruction block.`
                    : `Run neurcode agent start ${target} --goal "<task>".`,
    };
}
function renderDoctor(payload) {
    console.log('');
    console.log(chalk.bold(`Neurcode agent doctor - ${payload.target}`));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Repo:    ${chalk.white(payload.repoRoot)}`);
    console.log(`Adapter: ${payload.adapter}`);
    console.log('');
    for (const check of payload.checks) {
        console.log(`${statusLabel(check.status)} ${chalk.bold(check.label)}`);
        console.log(chalk.dim(`  ${check.message}`));
        if (check.recommendation)
            console.log(chalk.dim(`  Next: ${check.recommendation}`));
        console.log('');
    }
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Pass ${payload.summary.pass} | Warn ${payload.summary.warn} | Fail ${payload.summary.fail} | Skip ${payload.summary.skip}`);
    console.log(chalk.dim(`Next: ${payload.next}`));
    console.log('');
}
function loadGuardSession(repoRoot, sessionId) {
    return sessionId ? (0, governance_runtime_1.loadSession)(repoRoot, sessionId) : (0, governance_runtime_1.loadActiveSession)(repoRoot);
}
function renderGuardStart(input) {
    console.log('');
    console.log(chalk.bold('Neurcode agent guard started'));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Repo:     ${chalk.white(input.launch.repoRoot)}`);
    console.log(`Session:  ${chalk.cyan(input.launch.session.sessionId)}`);
    console.log(`Agent:    ${input.launch.agent.normalized} -> ${input.launch.agent.adapter}`);
    console.log(`Guard:    ${chalk.white(input.guardPath)}`);
    console.log(`Baseline: ${input.baselineFileCount} files ${chalk.dim(input.baselineTreeHash.slice(0, 12))}`);
    console.log('');
    console.log(chalk.bold('Next'));
    console.log(chalk.dim(`  neurcode agent handshake --adapter ${input.launch.agent.adapter} --session-id ${input.launch.session.sessionId}`));
    console.log(chalk.dim(`  neurcode agent plan --adapter ${input.launch.agent.adapter} --session-id ${input.launch.session.sessionId} --plan "<source-free plan>"`));
    console.log(chalk.dim(`  neurcode agent check <repo-relative-path> --adapter ${input.launch.agent.adapter} --session-id ${input.launch.session.sessionId}`));
    console.log(chalk.dim(`  neurcode agent guard status --session-id ${input.launch.session.sessionId}`));
    console.log('');
    console.log(chalk.dim('Guard truth: this catches bypassed or denied writes by comparing repo changes to runtime events. It is not hard-deny unless the agent host supports pre-write hooks.'));
    console.log('');
}
function classificationLabel(classification) {
    if (classification === 'verified_prewrite')
        return chalk.green('verified');
    if (classification === 'denied_but_changed')
        return chalk.red('denied-changed');
    if (classification === 'observed_after_only')
        return chalk.yellow('after-only');
    if (classification === 'prewrite_call_without_verdict')
        return chalk.yellow('no-verdict');
    return chalk.red('unverified');
}
function repoRelativeArtifactPath(repoRoot, artifactPath) {
    const root = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalized = artifactPath.replace(/\\/g, '/');
    return normalized.startsWith(`${root}/`)
        ? normalized.slice(root.length + 1)
        : '<external-agent-guard-artifact>';
}
function renderGuardEvaluation(evaluation, artifactPath) {
    console.log('');
    console.log(chalk.bold('Neurcode agent guard status'));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Session: ${chalk.white(evaluation.sessionId)}`);
    console.log(`Agent:   ${evaluation.agent} -> ${evaluation.adapter}`);
    console.log(`Guard:   ${chalk.white(artifactPath)}`);
    console.log(`Status:  ${evaluation.pass ? chalk.green('following contract') : chalk.red('attention required')}`);
    console.log('');
    console.log(`Changed ${evaluation.summary.changedFiles} · ` +
        `verified ${chalk.green(String(evaluation.summary.verifiedPrewrite))} · ` +
        `unverified ${evaluation.summary.unverifiedWrites > 0 ? chalk.red(String(evaluation.summary.unverifiedWrites)) : '0'} · ` +
        `denied-changed ${evaluation.summary.deniedButChanged > 0 ? chalk.red(String(evaluation.summary.deniedButChanged)) : '0'}`);
    if (evaluation.changedFiles.length > 0) {
        console.log('');
        for (const file of evaluation.changedFiles.slice(0, 12)) {
            console.log(`${classificationLabel(file.classification)} ${file.changeType.padEnd(8)} ${file.path} ` +
                chalk.dim(`(prewrite ${file.evidence.allowedPreWriteCheckCount}, denied ${file.evidence.deniedPreWriteCheckCount}, after ${file.evidence.postWriteObservationCount})`));
        }
        if (evaluation.changedFiles.length > 12) {
            console.log(chalk.dim(`... +${evaluation.changedFiles.length - 12} more`));
        }
    }
    console.log('');
    console.log(chalk.dim(`Next: ${evaluation.nextAction}`));
    console.log('');
}
async function publishGuardEvent(input) {
    const updated = (0, governance_runtime_1.appendEvent)(input.repoRoot, input.sessionId, input.event);
    if (updated) {
        await (0, runtime_live_1.publishRuntimeLiveStatus)(input.repoRoot, updated);
    }
}
function agentCommand(program) {
    const cmd = program
        .command('agent')
        .description('Universal local runtime ingress for AI coding agents');
    cmd
        .command('capabilities')
        .description('List agent adapters and their enforcement guarantees')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const capabilities = (0, governance_runtime_1.listAgentRuntimeAdapterCapabilities)();
        if (options.json) {
            emitJson({ ok: true, capabilities });
            return;
        }
        for (const capability of capabilities) {
            console.log(`${capability.adapter.padEnd(18)} ${capability.enforcementLevel.padEnd(20)} ` +
                `${capability.automatic ? 'automatic' : 'explicit'} · ${capability.description}`);
        }
    });
    cmd
        .command('setup [agent]')
        .description('Prepare MCP config and first-run commands for Codex, Cursor, Claude, or generic MCP')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--goal <goal>', 'Example first governed task for generated commands')
        .option('--write', 'Write known MCP config entries for Codex/Cursor')
        .option('--write-instructions', 'Write repo-native agent instructions (AGENTS.md, Cursor rules, or NEURCODE_AGENT.md)')
        .option('--global', 'For Cursor, write/check ~/.cursor/mcp.json instead of repo-local .cursor/mcp.json')
        .option('--force-profile', 'Force refresh the repo governance profile')
        .option('--json', 'Output machine-readable JSON')
        .action((agent, options) => {
        try {
            const payload = buildSetupPayload(agent, options);
            if (options.json)
                emitJson(payload);
            else
                renderSetup(payload);
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('doctor [agent]')
        .description('Check whether an agent adapter is ready to call the Neurcode runtime')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--global', 'For Cursor, check ~/.cursor/mcp.json instead of repo-local .cursor/mcp.json')
        .option('--json', 'Output machine-readable JSON')
        .action((agent, options) => {
        try {
            const payload = buildDoctorPayload(agent, options);
            if (options.json)
                emitJson(payload);
            else
                renderDoctor(payload);
            if (!payload.ok)
                process.exitCode = 1;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('start [agent]')
        .description('Start a governed AI coding session for Claude, Codex, Cursor, VS Code, or generic MCP')
        .requiredOption('--goal <goal>', 'Task goal for the governed AI session')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--plan <text>', 'Optional initial source-free plan')
        .option('--plan-file <path>', 'Read initial source-free plan from a file')
        .option('--no-activate', 'Do not install/refresh Claude Code hooks when launching Claude')
        .option('--force-profile', 'Force refresh the repo governance profile before launch')
        .option('--json', 'Output machine-readable JSON')
        .action(async (agent, options) => {
        try {
            const result = await (0, agent_session_launcher_1.launchAgentSession)({
                agent,
                goal: options.goal || '',
                dir: options.dir,
                plan: readPlan(options),
                activate: options.activate !== false,
                forceProfile: options.forceProfile === true,
                actor: 'local_cli',
            });
            if (options.json)
                emitJson(result);
            else
                renderLaunch(result);
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('status')
        .description('Show the active governed AI coding session')
        .option('--session-id <id>', 'Local governance session ID (default: active session)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        (0, session_1.localGovernanceStatusCommand)({
            sessionId: options.sessionId,
            dir: options.dir,
            json: options.json === true,
        });
    });
    cmd
        .command('handshake')
        .description('Handshake a cooperative agent into the active governed session')
        .option('--adapter <adapter>', 'Runtime adapter, e.g. codex-mcp, cursor-mcp, generic-mcp')
        .option('--agent <agent>', 'Agent alias, e.g. codex, cursor, gemini')
        .option('--session-id <id>', 'Session ID (default: active session)')
        .option('--actor <name>', 'Optional caller identity')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const adapter = adapterFromOptions(options, 'generic-mcp');
            const result = await submitAgentEvent({
                adapter,
                eventType: 'session.handshake',
                dir: options.dir,
                payload: {
                    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
                    ...(options.actor ? { actor: options.actor } : {}),
                },
            });
            if (options.json)
                emitJson(result);
            else
                renderDecision(result);
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('plan')
        .description('Capture the agent source-free implementation plan before edits')
        .option('--plan <text>', 'Source-free implementation plan')
        .option('--plan-file <path>', 'Read source-free plan from a file')
        .option('--adapter <adapter>', 'Runtime adapter, e.g. codex-mcp, cursor-mcp, generic-mcp')
        .option('--agent <agent>', 'Agent alias, e.g. codex, cursor, gemini')
        .option('--session-id <id>', 'Session ID (default: active session)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const adapter = adapterFromOptions(options, 'generic-mcp');
            const plan = readPlan(options);
            const result = await submitAgentEvent({
                adapter,
                eventType: 'plan.capture',
                dir: options.dir,
                payload: {
                    plan,
                    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
                },
            });
            if (options.json)
                emitJson(result);
            else
                renderDecision(result);
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('amend')
        .description('Amend or re-plan the active source-free implementation plan')
        .option('--plan <text>', 'Replacement source-free implementation plan')
        .option('--plan-file <path>', 'Read replacement source-free plan from a file')
        .option('--summary <text>', 'Plan summary patch')
        .option('--scope <glob>', 'Scope glob to add to the plan; repeatable', collect, [])
        .option('--reason <text>', 'Reason for the plan change')
        .option('--adapter <adapter>', 'Runtime adapter, e.g. codex-mcp, cursor-mcp, generic-mcp')
        .option('--agent <agent>', 'Agent alias, e.g. codex, cursor, gemini')
        .option('--session-id <id>', 'Session ID (default: active session)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const adapter = adapterFromOptions(options, 'generic-mcp');
            const scope = Array.isArray(options.scope) ? options.scope : [];
            const plan = readPlan(options);
            const result = await submitAgentEvent({
                adapter,
                eventType: 'plan.amend',
                dir: options.dir,
                payload: {
                    ...(plan ? { plan } : {}),
                    ...(options.summary ? { summary: options.summary } : {}),
                    ...(scope.length > 0 ? { scope } : {}),
                    ...(options.reason ? { reason: options.reason } : {}),
                    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
                },
            });
            if (options.json)
                emitJson(result);
            else
                renderDecision(result);
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('check <filePath>')
        .description('Check a proposed agent write before it lands')
        .option('--adapter <adapter>', 'Runtime adapter, e.g. codex-mcp, cursor-mcp, generic-mcp')
        .option('--agent <agent>', 'Agent alias, e.g. codex, cursor, gemini')
        .option('--tool-name <name>', 'Agent write tool name', 'Write')
        .option('--after', 'Record as post-change observation instead of pre-write enforcement')
        .option('--session-id <id>', 'Session ID (default: active session)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action(async (filePath, options) => {
        try {
            const adapter = adapterFromOptions(options, 'generic-mcp');
            const result = await submitAgentEvent({
                adapter,
                eventType: options.after ? 'edit.after' : 'edit.before',
                dir: options.dir,
                payload: {
                    filePath,
                    toolName: options.toolName || 'Write',
                    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
                },
            });
            if (options.json)
                emitJson(result);
            else
                renderDecision(result, filePath);
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('approve <path>')
        .description('Apply an exact-path approval for the active governed session')
        .option('--reason <text>', 'Human-readable approval reason')
        .option('--adapter <adapter>', 'Runtime adapter, e.g. codex-mcp, cursor-mcp, generic-mcp')
        .option('--agent <agent>', 'Agent alias, e.g. codex, cursor, gemini')
        .option('--session-id <id>', 'Session ID (default: active session)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action(async (path, options) => {
        try {
            const adapter = adapterFromOptions(options, 'generic-mcp');
            const result = await submitAgentEvent({
                adapter,
                eventType: 'approval.apply',
                dir: options.dir,
                payload: {
                    path,
                    ...(options.reason ? { reason: options.reason } : {}),
                    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
                },
            });
            if (options.json)
                emitJson(result);
            else
                renderDecision(result, path);
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('finish')
        .description('Finish the active governed agent session')
        .option('--adapter <adapter>', 'Runtime adapter, e.g. codex-mcp, cursor-mcp, generic-mcp')
        .option('--agent <agent>', 'Agent alias, e.g. codex, cursor, gemini')
        .option('--session-id <id>', 'Session ID (default: active session)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const adapter = adapterFromOptions(options, 'generic-mcp');
            const result = await submitAgentEvent({
                adapter,
                eventType: 'session.finish',
                dir: options.dir,
                payload: {
                    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
                },
            });
            if (options.json)
                emitJson(result);
            else
                renderDecision(result);
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    const guard = cmd
        .command('guard')
        .description('Detect agent writes that bypassed Neurcode runtime checks');
    guard
        .command('start [agent]')
        .description('Start a governed agent session with local bypass detection')
        .requiredOption('--goal <goal>', 'Task goal for the guarded AI session')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--plan <text>', 'Optional initial source-free plan')
        .option('--plan-file <path>', 'Read initial source-free plan from a file')
        .option('--guard-path <path>', 'Guard artifact path (default: .neurcode/agent-guard/<session>.json)')
        .option('--no-activate', 'Do not install/refresh Claude Code hooks when launching Claude')
        .option('--force-profile', 'Force refresh the repo governance profile before launch')
        .option('--json', 'Output machine-readable JSON')
        .action(async (agent, options) => {
        try {
            const launch = await (0, agent_session_launcher_1.launchAgentSession)({
                agent,
                goal: options.goal || '',
                dir: options.dir,
                plan: readPlan(options),
                activate: options.activate !== false,
                forceProfile: options.forceProfile === true,
                actor: 'local_cli_agent_guard',
            });
            const artifact = (0, agent_guard_1.createAgentGuardArtifact)({
                repoRoot: launch.repoRoot,
                sessionId: launch.session.sessionId,
                agent: launch.agent.normalized,
                adapter: launch.agent.adapter,
                startedAt: launch.generatedAt,
            });
            const guardPath = (0, agent_guard_1.writeAgentGuardArtifact)(launch.repoRoot, artifact, options.guardPath);
            await publishGuardEvent({
                repoRoot: launch.repoRoot,
                sessionId: launch.session.sessionId,
                event: {
                    type: 'agent_guard_started',
                    ts: artifact.startedAt,
                    message: `Agent guard started for ${artifact.agent} (${artifact.adapter}).`,
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
            const payload = {
                ok: true,
                schemaVersion: artifact.schemaVersion,
                launch,
                guard: {
                    guardId: artifact.guardId,
                    sessionId: artifact.sessionId,
                    artifactPath: guardPath,
                    active: artifact.active,
                    baselineFileCount: artifact.baseline.fileCount,
                    baselineTreeHash: artifact.baseline.treeHash,
                    privacy: artifact.privacy,
                },
            };
            if (options.json)
                emitJson(payload);
            else
                renderGuardStart({
                    launch,
                    guardPath,
                    baselineFileCount: artifact.baseline.fileCount,
                    baselineTreeHash: artifact.baseline.treeHash,
                });
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    guard
        .command('status')
        .description('Compare current repo writes against the governed agent session')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Session ID (default: active session or active guard pointer)')
        .option('--guard-path <path>', 'Guard artifact path')
        .option('--fail-on-unverified', 'Exit non-zero when writes lack allowed pre-write evidence')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        try {
            const repoRoot = repoRootFrom({ dir: options.dir });
            const guardRead = (0, agent_guard_1.readAgentGuardArtifact)({
                repoRoot,
                sessionId: options.sessionId,
                artifactPath: options.guardPath,
            });
            if (!guardRead.artifact) {
                const message = guardRead.error || `Agent guard not found (${guardRead.path}).`;
                if (options.json)
                    emitJson({ ok: false, path: guardRead.path, error: message });
                else
                    console.error(chalk.red(`Neurcode agent guard failed: ${message}`));
                process.exitCode = 1;
                return;
            }
            const session = loadGuardSession(repoRoot, options.sessionId || guardRead.artifact.sessionId);
            if (!session) {
                const message = `Local governance session ${options.sessionId || guardRead.artifact.sessionId} was not found.`;
                if (options.json)
                    emitJson({ ok: false, path: guardRead.path, error: message });
                else
                    console.error(chalk.red(`Neurcode agent guard failed: ${message}`));
                process.exitCode = 1;
                return;
            }
            const evaluation = (0, agent_guard_1.evaluateAgentGuard)(repoRoot, guardRead.artifact, session);
            if (options.json)
                emitJson({ ...evaluation, artifactPath: guardRead.path });
            else
                renderGuardEvaluation(evaluation, guardRead.path);
            if (options.failOnUnverified && !evaluation.pass)
                process.exitCode = 2;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    guard
        .command('finish')
        .description('Finish the agent guard and optionally close the governed session')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Session ID (default: active session or active guard pointer)')
        .option('--guard-path <path>', 'Guard artifact path')
        .option('--no-finish-session', 'Archive the guard without closing the governed session')
        .option('--fail-on-unverified', 'Exit non-zero when writes lack allowed pre-write evidence')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const repoRoot = repoRootFrom({ dir: options.dir });
            const guardRead = (0, agent_guard_1.readAgentGuardArtifact)({
                repoRoot,
                sessionId: options.sessionId,
                artifactPath: options.guardPath,
            });
            if (!guardRead.artifact) {
                const message = guardRead.error || `Agent guard not found (${guardRead.path}).`;
                if (options.json)
                    emitJson({ ok: false, path: guardRead.path, error: message });
                else
                    console.error(chalk.red(`Neurcode agent guard failed: ${message}`));
                process.exitCode = 1;
                return;
            }
            const session = loadGuardSession(repoRoot, options.sessionId || guardRead.artifact.sessionId);
            if (!session) {
                const message = `Local governance session ${options.sessionId || guardRead.artifact.sessionId} was not found.`;
                if (options.json)
                    emitJson({ ok: false, path: guardRead.path, error: message });
                else
                    console.error(chalk.red(`Neurcode agent guard failed: ${message}`));
                process.exitCode = 1;
                return;
            }
            const evaluation = (0, agent_guard_1.evaluateAgentGuard)(repoRoot, guardRead.artifact, session);
            const finishedArtifact = (0, agent_guard_1.markAgentGuardFinished)(guardRead.artifact, evaluation.generatedAt);
            const artifactPath = (0, agent_guard_1.writeAgentGuardArtifact)(repoRoot, finishedArtifact, guardRead.path);
            await publishGuardEvent({
                repoRoot,
                sessionId: session.sessionId,
                event: {
                    type: 'agent_guard_finished',
                    ts: evaluation.generatedAt,
                    message: evaluation.pass
                        ? 'Agent guard finished: all changed files had allowed pre-write evidence.'
                        : 'Agent guard finished: attention required for unverified or denied writes.',
                    detail: {
                        schemaVersion: finishedArtifact.schemaVersion,
                        guardId: finishedArtifact.guardId,
                        artifactPath: repoRelativeArtifactPath(repoRoot, artifactPath),
                        pass: evaluation.pass,
                        status: evaluation.status,
                        summary: evaluation.summary,
                        changedFiles: evaluation.changedFiles.map((file) => ({
                            path: file.path,
                            changeType: file.changeType,
                            classification: file.classification,
                            evidence: file.evidence,
                        })),
                        privacy: finishedArtifact.privacy,
                    },
                },
            });
            const closedSession = options.finishSession === false
                ? null
                : (0, governance_runtime_1.finishSession)(repoRoot, session.sessionId);
            if (closedSession) {
                await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, closedSession);
            }
            if (options.json) {
                emitJson({
                    ...evaluation,
                    artifactPath,
                    guardActive: finishedArtifact.active,
                    sessionFinished: Boolean(closedSession),
                });
            }
            else {
                renderGuardEvaluation(evaluation, artifactPath);
                console.log(chalk.dim(closedSession
                    ? `Session finished with replayHash ${closedSession.replayHash}.`
                    : 'Guard archived; governed session left active.'));
                console.log('');
            }
            if (options.failOnUnverified && !evaluation.pass)
                process.exitCode = 2;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
}
//# sourceMappingURL=agent.js.map