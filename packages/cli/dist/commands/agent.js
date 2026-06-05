"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentCommand = agentCommand;
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
const v0_governance_1 = require("../utils/v0-governance");
const agent_adapter_setup_1 = require("../utils/agent-adapter-setup");
const agent_guard_1 = require("../utils/agent-guard");
const admission_artifact_1 = require("../utils/admission-artifact");
const agent_guard_supervisor_1 = require("../utils/agent-guard-supervisor");
const runtime_live_1 = require("../utils/runtime-live");
const runtime_evidence_1 = require("../utils/runtime-evidence");
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
    copilot: 'copilot-hooks',
    'github-copilot': 'copilot-hooks',
    'copilot-hooks': 'copilot-hooks',
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
    throw new Error(`Unsupported agent/adapter. Use one of: claude, copilot, codex, cursor, generic-mcp, vscode.`);
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
function emitJsonLine(value) {
    console.log(JSON.stringify(value));
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
    console.log(`Agent:    ${result.agent.normalized} -> ${result.agent.adapter} ${chalk.dim(`(${result.agent.compatibilityMode.replace(/_/g, ' ')})`)}`);
    console.log(`Goal:     ${result.session.goal}`);
    console.log(`Scope:    ${result.session.scopeMode} · ${compact(result.session.allowedGlobs)}`);
    console.log(`Gates:    ${compact(result.session.approvalRequiredGlobs)}`);
    console.log(`Enforce:  ${compact(result.agent.enforceable, 3)}`);
    console.log(`Advisory: ${compact(result.agent.advisoryOnly, 3)}`);
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
function controlLevelLabel(level) {
    if (level === 'hard_block_capable')
        return 'hard-block capable';
    if (level === 'supervised_advisory_capable')
        return 'supervised/advisory capable';
    if (level === 'evidence_only_capable')
        return 'evidence-only capable';
    return 'unsupported/unknown';
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
    if (input.target === 'copilot') {
        return {
            activate: 'neurcode activate copilot',
            start: `neurcode agent start copilot --goal "${input.goal}"`,
            status: 'neurcode status',
            approve: 'Approve the exact suggested path in Runtime Control Plane',
            finish: 'Copilot Stop hook finishes the governed session',
        };
    }
    return {
        setup: `neurcode agent bootstrap ${input.target}`,
        start: `neurcode agent start ${input.target} --goal "${input.goal}"`,
        handshake: `neurcode agent handshake --adapter ${input.adapter} --session-id ${session}`,
        plan: `neurcode agent plan --adapter ${input.adapter} --session-id ${session} --plan "<source-free plan>"`,
        check: `neurcode agent check <repo-relative-path> --adapter ${input.adapter} --session-id ${session}`,
        approve: `neurcode agent approve <exact-path> --adapter ${input.adapter} --session-id ${session} --reason "<reason>"`,
        finish: `neurcode agent finish --adapter ${input.adapter} --session-id ${session}`,
        report: `neurcode agent report ${input.target} --session-id ${session}`,
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
            message: 'Run with --write to update the known adapter config automatically.',
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
            controlLevel: capability?.controlLevel ?? 'unsupported_unknown',
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
    console.log(`Control:  ${controlLevelLabel(payload.enforcement.controlLevel)}`);
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
            recommendation: `Run neurcode agent bootstrap ${inspection.target}, or paste the emitted snippet manually.`,
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
            recommendation: `Run neurcode agent bootstrap ${inspection.target}, or paste the emitted instruction block manually.`,
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
    const needsNpx = target === 'codex' || target === 'cursor' || target === 'generic-mcp';
    const checks = [
        {
            id: 'adapter',
            label: 'Adapter capability',
            status: 'pass',
            message: `${inspection.adapter} reports ${controlLevelLabel(capability?.controlLevel)} (${capability?.enforcementLevel ?? 'cooperative'}, ${capability?.automatic ? 'automatic' : 'explicit agent calls'}).`,
        },
        configCheck(inspection),
        instructionCheck(instructionInspection),
        ...(needsNpx ? [npxCheck()] : []),
        {
            id: 'profile',
            label: 'Governance profile',
            status: staleness.status === 'fresh' ? 'pass' : 'warn',
            message: staleness.status === 'fresh'
                ? `Fresh profile at ${staleness.profilePath} (${staleness.currentProfile.topology.trackedFileCount} tracked files).`
                : `${staleness.status}: ${staleness.reasons.join('; ') || 'profile needs refresh'}.`,
            recommendation: staleness.status === 'fresh' ? undefined : `Run neurcode agent bootstrap ${target}.`,
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
        controlLevel: capability?.controlLevel ?? 'unsupported_unknown',
        controlLabel: controlLevelLabel(capability?.controlLevel),
        checks,
        summary,
        next: summary.fail > 0
            ? 'Resolve failed checks before relying on agent MCP calls.'
            : inspection.configured === false
                ? `Run neurcode agent bootstrap ${target} or paste the MCP snippet.`
                : instructionInspection.installed === false
                    ? `Run neurcode agent bootstrap ${target} or paste the agent instruction block.`
                    : `Run neurcode agent start ${target} --goal "<task>".`,
    };
}
function renderDoctor(payload) {
    console.log('');
    console.log(chalk.bold(`Neurcode agent doctor - ${payload.target}`));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Repo:    ${chalk.white(payload.repoRoot)}`);
    console.log(`Adapter: ${payload.adapter}`);
    console.log(`Control: ${payload.controlLabel}`);
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
function readinessCheck(id, label, status, message, recommendation) {
    return { id, label, status, message, ...(recommendation ? { recommendation } : {}) };
}
function readinessMode(enforcementLevel) {
    if (enforcementLevel === 'hard_deny')
        return 'hard pre-write deny';
    if (enforcementLevel === 'cooperative')
        return 'cooperative pre-write checks + local guard supervision';
    if (enforcementLevel === 'observe_only')
        return 'observe-only companion visibility';
    if (enforcementLevel === 'post_change_backstop')
        return 'post-change backstop';
    return 'unknown runtime guarantee';
}
function buildReadinessPayload(agentArg, options) {
    const doctor = buildDoctorPayload(agentArg, options);
    const repoRoot = doctor.repoRoot;
    const target = doctor.target;
    const adapter = doctor.adapter;
    const capability = capabilityFor(adapter);
    const session = options.sessionId
        ? (0, governance_runtime_1.loadSession)(repoRoot, options.sessionId)
        : (0, governance_runtime_1.loadActiveSession)(repoRoot);
    const invocation = session ? (0, governance_runtime_1.buildAgentInvocationSummary)(session) : null;
    const guardPosture = session ? (0, governance_runtime_1.buildAgentGuardPostureSummary)(session) : null;
    const supervisor = session ? (0, agent_guard_supervisor_1.inspectAgentGuardSupervisor)(repoRoot, session.sessionId) : null;
    const isCooperative = capability?.enforcementLevel === 'cooperative';
    const isObserveOnly = capability?.enforcementLevel === 'observe_only';
    const isHardDeny = capability?.enforcementLevel === 'hard_deny';
    const checks = [
        ...doctor.checks.map((check) => ({ ...check })),
        readinessCheck('active_governed_session', 'Active governed session', session?.status === 'active' ? 'pass' : 'warn', session
            ? `Session ${session.sessionId} is ${session.status} (${session.contract.scopeMode} scope).`
            : 'No governed session is active in this repository.', `Run neurcode agent guard start ${target} --goal "<task>" for supervised agent work.`),
    ];
    if (session && invocation) {
        checks.push(readinessCheck('agent_launch_binding', 'Agent launch binding', invocation.launched && invocation.adapter === adapter
            ? 'pass'
            : invocation.launched
                ? 'warn'
                : 'warn', invocation.launched
            ? `Session is bound to ${invocation.adapter ?? 'unknown adapter'} (${invocation.enforcementLevel ?? 'unknown'}).`
            : 'Session has no agent launch marker.', invocation.launched && invocation.adapter === adapter
            ? undefined
            : `Start this workflow with neurcode agent guard start ${target} --goal "<task>".`));
        checks.push(readinessCheck('agent_protocol', 'Agent protocol', invocation.status === 'following_contract' || invocation.status === 'finished' || invocation.status === 'observe_only'
            ? 'pass'
            : invocation.status === 'attention_needed'
                ? 'fail'
                : 'warn', `${invocation.status.replace(/_/g, ' ')} · ${invocation.nextAction}`, invocation.nextAction));
    }
    else {
        checks.push(readinessCheck('agent_launch_binding', 'Agent launch binding', 'warn', 'No active session exists to prove agent launch binding.', `Run neurcode agent guard start ${target} --goal "<task>".`));
        checks.push(readinessCheck('agent_protocol', 'Agent protocol', 'skip', 'Protocol checks require an active governed session.'));
    }
    if (isCooperative) {
        const guardStatus = guardPosture?.status ?? 'not_started';
        checks.push(readinessCheck('guard_posture', 'Local guard posture', guardStatus === 'following_contract' || guardStatus === 'finished_clean'
            ? 'pass'
            : guardStatus === 'attention_required' || guardStatus === 'finished_attention'
                ? 'fail'
                : 'warn', guardPosture
            ? `${guardStatus.replace(/_/g, ' ')} · ${guardPosture.nextAction}`
            : 'No local guard posture was found.', guardStatus === 'following_contract' || guardStatus === 'finished_clean'
            ? undefined
            : `Use neurcode agent guard start ${target} --goal "<task>" and keep the supervisor running during agent work.`));
        checks.push(readinessCheck('guard_supervisor', 'Guard supervisor', supervisor?.effectiveStatus === 'running'
            ? 'pass'
            : supervisor?.effectiveStatus === 'stale' || supervisor?.effectiveStatus === 'failed'
                ? 'fail'
                : 'warn', supervisor?.state
            ? `Supervisor is ${supervisor.effectiveStatus} for session ${supervisor.state.sessionId}.`
            : 'No detached supervisor state exists for this session.', supervisor?.effectiveStatus === 'running'
            ? undefined
            : 'Start it with neurcode agent guard supervise start, or launch through neurcode agent guard start.'));
    }
    else if (isObserveOnly) {
        checks.push(readinessCheck('guard_posture', 'Local guard posture', guardPosture?.status === 'attention_required' || guardPosture?.status === 'finished_attention'
            ? 'fail'
            : 'warn', 'VS Code is observe-only; pair it with Codex/Cursor/MCP guard supervision for write accountability.', 'Use VS Code as the companion surface, then launch the real agent workflow from the Runtime Companion or CLI.'));
    }
    else if (isHardDeny) {
        checks.push(readinessCheck('guard_posture', 'Local guard posture', 'skip', 'Claude Code hooks provide the hard-deny layer; guard supervision is optional as a bypass audit.'));
    }
    checks.push(readinessCheck('source_free_contract', 'Source-free contract', 'pass', 'Readiness uses paths, config presence, runtime metadata, guard posture, and integrity hashes only.'));
    const summary = {
        pass: checks.filter((item) => item.status === 'pass').length,
        warn: checks.filter((item) => item.status === 'warn').length,
        fail: checks.filter((item) => item.status === 'fail').length,
        skip: checks.filter((item) => item.status === 'skip').length,
    };
    const nextActions = checks
        .filter((item) => item.status === 'fail' || item.status === 'warn')
        .map((item) => item.recommendation || item.message)
        .filter(Boolean)
        .slice(0, 8);
    const readiness = summary.fail > 0
        ? 'not_ready'
        : summary.warn > 0
            ? 'needs_attention'
            : 'ready';
    return {
        schemaVersion: 'neurcode.agent-readiness.v1',
        ok: summary.fail === 0 && (options.strict !== true || summary.warn === 0),
        generatedAt: new Date().toISOString(),
        repoRoot,
        target,
        adapter,
        readiness,
        guarantee: {
            enforcementLevel: capability?.enforcementLevel ?? 'unknown',
            controlLevel: capability?.controlLevel ?? 'unsupported_unknown',
            controlLabel: controlLevelLabel(capability?.controlLevel),
            automatic: capability?.automatic ?? false,
            mode: readinessMode(capability?.enforcementLevel),
            truthfulClaim: isCooperative
                ? 'Agent writes are governed when the agent calls MCP/CLI pre-write checks; guard supervision detects bypassed writes.'
                : isObserveOnly
                    ? 'VS Code provides operator visibility and approval UX, not editor-level hard deny.'
                    : isHardDeny
                        ? 'Claude Code hooks can deny supported write tools before the write lands.'
                        : capability?.description ?? 'Runtime guarantee is unknown.',
        },
        pilotReady: readiness === 'ready' || (readiness === 'needs_attention' && summary.fail === 0 && !isCooperative),
        session: session
            ? {
                sessionId: session.sessionId,
                status: session.status,
                scopeMode: session.contract.scopeMode,
                allowedGlobs: session.contract.allowedGlobs,
                approvalRequiredGlobs: session.contract.approvalRequiredGlobs,
                replayHash: session.replayHash,
            }
            : null,
        invocation,
        guardPosture,
        supervisor: supervisor
            ? {
                exists: supervisor.exists,
                alive: supervisor.alive,
                effectiveStatus: supervisor.effectiveStatus,
                statePath: supervisor.statePath,
                state: supervisor.state,
                error: supervisor.error,
            }
            : null,
        checks,
        summary,
        nextActions,
        privacy: {
            metadataOnly: true,
            sourceUploaded: false,
            sourceIncluded: false,
            localContentDigestsOnly: true,
        },
    };
}
function renderReadiness(payload) {
    console.log('');
    console.log(chalk.bold(`Neurcode agent readiness - ${payload.target}`));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Repo:      ${chalk.white(payload.repoRoot)}`);
    console.log(`Adapter:   ${payload.adapter}`);
    console.log(`Guarantee: ${payload.guarantee.controlLabel} · ${payload.guarantee.mode}`);
    console.log(`Readiness: ${payload.readiness === 'ready' ? chalk.green(payload.readiness) : payload.readiness === 'not_ready' ? chalk.red(payload.readiness) : chalk.yellow(payload.readiness)}`);
    console.log(`Pilot:     ${payload.pilotReady ? chalk.green('ready enough to test') : chalk.yellow('needs attention')}`);
    if (payload.session)
        console.log(`Session:   ${chalk.cyan(payload.session.sessionId)} (${payload.session.status})`);
    console.log('');
    for (const check of payload.checks) {
        console.log(`${statusLabel(check.status)} ${chalk.bold(check.label)}`);
        console.log(chalk.dim(`  ${check.message}`));
        if (check.recommendation)
            console.log(chalk.dim(`  Next: ${check.recommendation}`));
    }
    if (payload.nextActions.length > 0) {
        console.log('');
        console.log(chalk.bold('Next actions'));
        payload.nextActions.forEach((action, index) => console.log(chalk.dim(`  ${index + 1}. ${action}`)));
    }
    console.log('');
}
function latestLocalSession(repoRoot) {
    return (0, runtime_evidence_1.listRuntimeSessions)(repoRoot)[0]?.session ?? null;
}
function resolveReportSession(repoRoot, options) {
    if (options.sessionId)
        return (0, governance_runtime_1.loadSession)(repoRoot, options.sessionId);
    return (0, governance_runtime_1.loadActiveSession)(repoRoot) ?? latestLocalSession(repoRoot);
}
function recordAppliedApprovalPaths(record) {
    return new Set(record.approvals
        .filter((approval) => approval.status === 'active')
        .map((approval) => approval.path));
}
function containedDenialPaths(record) {
    if (record.session.status !== 'finished')
        return [];
    const approved = recordAppliedApprovalPaths(record);
    return record.trajectory
        .filter((entry) => entry.verdicts.includes('block') &&
        !entry.verdicts.some((verdict) => verdict === 'ok' || verdict === 'warn'))
        .map((entry) => entry.suggestedApprovalPath || entry.filePath)
        .filter((path, index, paths) => !approved.has(path) && paths.indexOf(path) === index);
}
function unresolvedBriefBlockCount(record) {
    const section = record.reviewBrief.sections.find((item) => item.id === 'governance_events');
    const fact = section?.facts.find((item) => item.includes('without active approval') || item.includes('without applied approval'));
    if (!fact || fact.startsWith('no '))
        return 0;
    const match = fact.match(/^(\d+)/);
    return match ? Number(match[1]) : 1;
}
function buildAgentReportPayload(agentArg, options) {
    const repoRoot = repoRootFrom({ dir: options.dir });
    const target = (0, agent_adapter_setup_1.normalizeAgentSetupTarget)(agentArg);
    const adapter = AGENT_TO_ADAPTER[target] ?? 'generic-mcp';
    const capability = capabilityFor(adapter);
    const session = resolveReportSession(repoRoot, options);
    if (!session) {
        return {
            schemaVersion: 'neurcode.agent-report.v1',
            ok: false,
            generatedAt: new Date().toISOString(),
            repoRoot,
            target,
            adapter,
            reportStatus: 'no_session',
            pilotReady: false,
            message: 'No active or completed governed session was found in this repository.',
            nextActions: [`Run neurcode agent guard start ${target} --goal "<task>".`],
            privacy: {
                metadataOnly: true,
                sourceUploaded: false,
                sourceIncluded: false,
            },
        };
    }
    const { record, path } = options.writeRecord === false
        ? { record: (0, governance_runtime_1.buildAIChangeRecord)(session), path: '<not-written>' }
        : (0, governance_runtime_1.writeAIChangeRecord)(repoRoot, session);
    const invocation = (0, governance_runtime_1.buildAgentInvocationSummary)(session);
    const guardPosture = (0, governance_runtime_1.buildAgentGuardPostureSummary)(session);
    const supervisor = (0, agent_guard_supervisor_1.inspectAgentGuardSupervisor)(repoRoot, session.sessionId);
    const contained = containedDenialPaths(record);
    const unresolvedBlockCount = unresolvedBriefBlockCount(record);
    const guardClean = guardPosture.status === 'finished_clean' || guardPosture.status === 'following_contract';
    const reportStatus = record.reviewBrief.verdict === 'blocked_unresolved' || unresolvedBlockCount > 0 || guardPosture.status === 'attention_required' || guardPosture.status === 'finished_attention'
        ? 'attention_needed'
        : !record.integrity.replayHash
            ? 'in_progress'
            : guardClean && record.session.status === 'finished'
                ? 'pilot_ready'
                : 'review_ready';
    const nextActions = reportStatus === 'pilot_ready'
        ? ['Export the AI Change Record or open Runtime Evidence for human review.']
        : reportStatus === 'attention_needed'
            ? ['Resolve open blocked paths or unverified writes before presenting this run as clean pilot evidence.']
            : record.session.status === 'active'
                ? [`Finish with neurcode agent guard finish --session-id ${session.sessionId} --fail-on-unverified.`]
                : ['Open the Runtime Evidence record and review remaining warnings.'];
    return {
        schemaVersion: 'neurcode.agent-report.v1',
        ok: reportStatus !== 'attention_needed',
        generatedAt: new Date().toISOString(),
        repoRoot,
        target,
        adapter,
        reportStatus,
        pilotReady: reportStatus === 'pilot_ready',
        guarantee: {
            enforcementLevel: capability?.enforcementLevel ?? 'unknown',
            controlLevel: capability?.controlLevel ?? 'unsupported_unknown',
            controlLabel: controlLevelLabel(capability?.controlLevel),
            mode: readinessMode(capability?.enforcementLevel),
        },
        session: {
            sessionId: session.sessionId,
            status: session.status,
            goal: session.contract.goal,
            scopeMode: session.contract.scopeMode,
            startedAt: session.events[0]?.ts ?? null,
            finishedAt: session.finishedAt ?? null,
        },
        reviewBrief: record.reviewBrief,
        counts: {
            ok: record.session.counts.ok,
            warn: record.session.counts.warn,
            block: record.session.counts.block,
            events: record.session.counts.events,
            approvals: record.approvals.length,
            activeApprovals: record.approvals.filter((approval) => approval.status === 'active').length,
            containedBoundaryDenials: contained.length,
            unresolvedBlocks: unresolvedBlockCount,
        },
        invocation,
        guardPosture,
        supervisor: {
            exists: supervisor.exists,
            alive: supervisor.alive,
            effectiveStatus: supervisor.effectiveStatus,
        },
        integrity: {
            replayHash: record.integrity.replayHash,
            recordHash: record.integrity.recordHash,
            recordPath: path === '<not-written>' ? path : path.replace(`${repoRoot}/`, ''),
        },
        containedBoundaryDenials: contained,
        nextActions,
        privacy: {
            metadataOnly: true,
            sourceUploaded: false,
            sourceIncluded: false,
            localContentDigestsOnly: true,
        },
    };
}
function renderAgentReport(payload) {
    console.log('');
    console.log(chalk.bold(`Neurcode agent report - ${payload.target}`));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Repo:   ${chalk.white(payload.repoRoot)}`);
    console.log(`Status: ${payload.reportStatus === 'pilot_ready' ? chalk.green(payload.reportStatus) : payload.reportStatus === 'attention_needed' || payload.reportStatus === 'no_session' ? chalk.red(payload.reportStatus) : chalk.yellow(payload.reportStatus)}`);
    if (payload.reportStatus === 'no_session') {
        console.log(payload.message);
    }
    else {
        const full = payload;
        console.log(`Session: ${chalk.cyan(full.session.sessionId)} (${full.session.status})`);
        console.log(`Verdict: ${full.reviewBrief.verdict}`);
        console.log(`Summary: ${full.reviewBrief.headline}`);
        console.log(`Counts:  ok ${full.counts.ok} · warn ${full.counts.warn} · block ${full.counts.block} · approvals ${full.counts.approvals}`);
        console.log(`Control: contained ${full.counts.containedBoundaryDenials} · open blocks ${full.counts.unresolvedBlocks}`);
        console.log(`Guard:   ${full.guardPosture.status.replace(/_/g, ' ')} · ${full.guardPosture.nextAction}`);
        console.log(`Record:  ${full.integrity.recordPath}`);
        if (full.integrity.replayHash)
            console.log(`Replay:  ${full.integrity.replayHash}`);
    }
    if (payload.nextActions.length > 0) {
        console.log('');
        console.log(chalk.bold('Next'));
        payload.nextActions.forEach((action, index) => console.log(chalk.dim(`  ${index + 1}. ${action}`)));
    }
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
    console.log(`Watch:    ${input.supervisor?.enabled
        ? chalk.green(input.supervisor.started ? `running (pid ${input.supervisor.pid ?? 'pending'})` : input.supervisor.alreadyRunning ? `already running (pid ${input.supervisor.pid ?? 'unknown'})` : 'enabled')
        : chalk.dim('disabled')}`);
    console.log('');
    console.log(chalk.bold('Next'));
    console.log(chalk.dim(`  neurcode agent handshake --adapter ${input.launch.agent.adapter} --session-id ${input.launch.session.sessionId}`));
    console.log(chalk.dim(`  neurcode agent plan --adapter ${input.launch.agent.adapter} --session-id ${input.launch.session.sessionId} --plan "<source-free plan>"`));
    console.log(chalk.dim(`  neurcode agent check <repo-relative-path> --adapter ${input.launch.agent.adapter} --session-id ${input.launch.session.sessionId}`));
    console.log(chalk.dim(`  neurcode agent guard supervise status --session-id ${input.launch.session.sessionId}`));
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
function guardEvaluationFingerprint(evaluation) {
    return (0, node_crypto_1.createHash)('sha256')
        .update(JSON.stringify({
        pass: evaluation.pass,
        status: evaluation.status,
        summary: evaluation.summary,
        changedFiles: evaluation.changedFiles.map((file) => ({
            path: file.path,
            changeType: file.changeType,
            classification: file.classification,
            evidence: file.evidence,
        })),
    }))
        .digest('hex')
        .slice(0, 24);
}
function guardEvaluationDetail(repoRoot, artifactPath, evaluation) {
    return {
        schemaVersion: 'neurcode.agent-guard-status.v1',
        guardId: evaluation.guardId,
        artifactPath: repoRelativeArtifactPath(repoRoot, artifactPath),
        reportFingerprint: guardEvaluationFingerprint(evaluation),
        pass: evaluation.pass,
        status: evaluation.status,
        summary: evaluation.summary,
        changedFiles: evaluation.changedFiles.slice(0, 100).map((file) => ({
            path: file.path,
            changeType: file.changeType,
            classification: file.classification,
            evidence: file.evidence,
        })),
        privacy: evaluation.privacy,
    };
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
async function publishGuardEvaluation(input) {
    const session = (0, governance_runtime_1.loadSession)(input.repoRoot, input.evaluation.sessionId);
    if (!session)
        return;
    const detail = guardEvaluationDetail(input.repoRoot, input.artifactPath, input.evaluation);
    const latestStatus = [...session.events]
        .reverse()
        .find((event) => event.type === input.eventType);
    if (latestStatus?.detail?.reportFingerprint === detail.reportFingerprint) {
        await (0, runtime_live_1.publishRuntimeLiveStatus)(input.repoRoot, session);
        return;
    }
    await publishGuardEvent({
        repoRoot: input.repoRoot,
        sessionId: input.evaluation.sessionId,
        event: {
            type: input.eventType,
            ts: input.evaluation.generatedAt,
            message: input.message,
            detail,
        },
    });
}
function requireGuardContext(input) {
    const repoRoot = repoRootFrom({ dir: input.dir });
    const guardRead = (0, agent_guard_1.readAgentGuardArtifact)({
        repoRoot,
        sessionId: input.sessionId,
        artifactPath: input.guardPath,
    });
    if (!guardRead.artifact) {
        throw new Error(guardRead.error || `Agent guard not found (${guardRead.path}).`);
    }
    const artifact = guardRead.artifact;
    const session = loadGuardSession(repoRoot, input.sessionId || artifact.sessionId);
    if (!session) {
        throw new Error(`Local governance session ${input.sessionId || artifact.sessionId} was not found.`);
    }
    return { repoRoot, guardRead, artifact, session };
}
async function evaluateAndPublishGuardStatus(input) {
    const { repoRoot, guardRead, artifact, session } = requireGuardContext(input);
    const evaluation = (0, agent_guard_1.evaluateAgentGuard)(repoRoot, artifact, session);
    await publishGuardEvaluation({
        repoRoot,
        artifactPath: guardRead.path,
        evaluation,
        eventType: 'agent_guard_status',
        message: evaluation.pass
            ? 'Agent guard status: changed files have allowed pre-write evidence.'
            : 'Agent guard status: attention required for unverified or denied writes.',
    });
    return { repoRoot, artifactPath: guardRead.path, evaluation };
}
async function recordSupervisorEvent(input) {
    await publishGuardEvent({
        repoRoot: input.repoRoot,
        sessionId: input.sessionId,
        event: {
            type: input.type,
            ts: new Date().toISOString(),
            message: input.message,
            detail: {
                schemaVersion: 'neurcode.agent-guard-supervisor.v1',
                ...input.detail,
                privacy: {
                    metadataOnly: true,
                    sourceUploaded: false,
                    sourceIncluded: false,
                    watchesPathsOnly: true,
                },
            },
        },
    });
}
function renderSupervisorInspection(inspection) {
    console.log('');
    console.log(chalk.bold('Neurcode agent guard supervisor'));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`State:   ${chalk.white(inspection.statePath)}`);
    console.log(`Status:  ${inspection.effectiveStatus}`);
    console.log(`Alive:   ${inspection.alive ? chalk.green('yes') : chalk.dim('no')}`);
    if (inspection.state) {
        console.log(`Session: ${chalk.white(inspection.state.sessionId)}`);
        console.log(`PID:     ${inspection.state.pid ?? 'none'}`);
        console.log(`Checks:  ${inspection.state.evaluationCount}`);
        console.log(`Changed: ${inspection.state.lastChangedFiles}`);
        console.log(`Last:    ${inspection.state.lastEvaluatedAt || 'not evaluated yet'}`);
        if (inspection.state.lastError)
            console.log(`Error:   ${chalk.red(inspection.state.lastError)}`);
    }
    if (inspection.error)
        console.log(`Error:   ${chalk.red(inspection.error)}`);
    console.log('');
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
            console.log(`${capability.adapter.padEnd(18)} ${controlLevelLabel(capability.controlLevel).padEnd(28)} ${capability.enforcementLevel.padEnd(20)} ` +
                `${capability.automatic ? 'automatic' : 'explicit'} · ${capability.description}`);
        }
    });
    cmd
        .command('bootstrap [agent]')
        .description('One-command self-serve setup: refresh profile, write MCP config, and install agent instructions')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--goal <goal>', 'Example first governed task for generated commands')
        .option('--global', 'For Cursor, write/check ~/.cursor/mcp.json instead of repo-local .cursor/mcp.json')
        .option('--json', 'Output machine-readable JSON')
        .action((agent, options) => {
        try {
            const payload = buildSetupPayload(agent, {
                ...options,
                write: true,
                writeInstructions: true,
                forceProfile: true,
            });
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
        .command('readiness [agent]')
        .description('Assess enterprise readiness for an agent workflow, including setup, session protocol, guard posture, and truthful enforcement level')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Local governance session ID (default: active session)')
        .option('--global', 'For Cursor, check ~/.cursor/mcp.json instead of repo-local .cursor/mcp.json')
        .option('--strict', 'Exit non-zero when any readiness warning remains')
        .option('--json', 'Output machine-readable JSON')
        .action((agent, options) => {
        try {
            const payload = buildReadinessPayload(agent, options);
            if (options.json)
                emitJson(payload);
            else
                renderReadiness(payload);
            if (!payload.ok)
                process.exitCode = payload.summary.fail > 0 ? 2 : 1;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    cmd
        .command('report [agent]')
        .description('Summarize the latest or selected governed agent run after it finishes')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Local governance session ID (default: active session, then latest local session)')
        .option('--global', 'For Cursor, check ~/.cursor/mcp.json instead of repo-local .cursor/mcp.json')
        .option('--no-write-record', 'Do not refresh the local AI Change Record sidecar')
        .option('--json', 'Output machine-readable JSON')
        .action((agent, options) => {
        try {
            const payload = buildAgentReportPayload(agent, options);
            if (options.json)
                emitJson(payload);
            else
                renderAgentReport(payload);
            if (!payload.ok)
                process.exitCode = payload.reportStatus === 'no_session' ? 1 : 2;
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
        .option('--no-supervise', 'Do not start the detached local guard supervisor')
        .option('--debounce-ms <ms>', 'Supervisor file-change debounce in milliseconds', (value) => Number.parseInt(value, 10))
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
            const cliEntry = process.argv[1];
            const supervisor = options.supervise !== false && cliEntry
                ? {
                    enabled: true,
                    ...(0, agent_guard_supervisor_1.startAgentGuardSupervisorDetached)({
                        repoRoot: launch.repoRoot,
                        sessionId: launch.session.sessionId,
                        guardPath,
                        cliEntry,
                        debounceMs: options.debounceMs,
                    }),
                }
                : { enabled: false };
            if (supervisor.enabled) {
                await recordSupervisorEvent({
                    repoRoot: launch.repoRoot,
                    sessionId: launch.session.sessionId,
                    type: 'agent_guard_supervisor_started',
                    message: supervisor.alreadyRunning
                        ? 'Agent guard supervisor already running.'
                        : 'Agent guard supervisor started.',
                    detail: {
                        guardId: artifact.guardId,
                        pid: supervisor.pid ?? null,
                        status: supervisor.state.status,
                        debounceMs: supervisor.state.debounceMs,
                        alreadyRunning: supervisor.alreadyRunning,
                    },
                });
            }
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
                supervisor,
            };
            if (options.json)
                emitJson(payload);
            else
                renderGuardStart({
                    launch,
                    guardPath,
                    baselineFileCount: artifact.baseline.fileCount,
                    baselineTreeHash: artifact.baseline.treeHash,
                    supervisor,
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
        .action(async (options) => {
        try {
            const { artifactPath, evaluation } = await evaluateAndPublishGuardStatus(options);
            if (options.json)
                emitJson({ ...evaluation, artifactPath });
            else
                renderGuardEvaluation(evaluation, artifactPath);
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
            await publishGuardEvaluation({
                repoRoot,
                artifactPath,
                evaluation,
                eventType: 'agent_guard_finished',
                message: evaluation.pass
                    ? 'Agent guard finished: all changed files had allowed pre-write evidence.'
                    : 'Agent guard finished: attention required for unverified or denied writes.',
            });
            const supervisorStop = (0, agent_guard_supervisor_1.stopAgentGuardSupervisor)(repoRoot, session.sessionId);
            if (supervisorStop.state) {
                await recordSupervisorEvent({
                    repoRoot,
                    sessionId: session.sessionId,
                    type: 'agent_guard_supervisor_stopped',
                    message: supervisorStop.signaled
                        ? 'Agent guard supervisor stop requested.'
                        : 'Agent guard supervisor stopped.',
                    detail: {
                        guardId: finishedArtifact.guardId,
                        pid: supervisorStop.state.pid,
                        status: supervisorStop.effectiveStatus,
                        signaled: supervisorStop.signaled,
                    },
                });
            }
            const closedSession = options.finishSession === false
                ? null
                : (0, governance_runtime_1.finishSession)(repoRoot, session.sessionId);
            if (closedSession) {
                // Phase A: emit the self-attested, source-free admission artifact.
                // Best-effort — never disrupts guard finish.
                (0, admission_artifact_1.tryEmitSelfAttestedAdmissionRecord)({ repoRoot, session: closedSession });
                await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, closedSession);
            }
            if (options.json) {
                emitJson({
                    ...evaluation,
                    artifactPath,
                    guardActive: finishedArtifact.active,
                    sessionFinished: Boolean(closedSession),
                    supervisor: supervisorStop,
                });
            }
            else {
                renderGuardEvaluation(evaluation, artifactPath);
                console.log(chalk.dim(closedSession
                    ? `Session finished with replayHash ${closedSession.replayHash}.`
                    : 'Guard archived; governed session left active.'));
                if (closedSession) {
                    console.log(chalk.dim(`Next: neurcode agent report --session-id ${closedSession.sessionId}`));
                }
                console.log('');
            }
            if (options.failOnUnverified && !evaluation.pass)
                process.exitCode = 2;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    const supervise = guard
        .command('supervise')
        .description('Continuously evaluate and publish guard posture while files change');
    supervise
        .command('start')
        .description('Start the detached local agent guard supervisor')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Session ID (default: active session or active guard pointer)')
        .option('--guard-path <path>', 'Guard artifact path')
        .option('--debounce-ms <ms>', 'File-change debounce in milliseconds', (value) => Number.parseInt(value, 10))
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const { repoRoot, guardRead, artifact, session } = requireGuardContext(options);
            if (!process.argv[1])
                throw new Error('Unable to resolve the active Neurcode CLI entrypoint.');
            const supervisor = (0, agent_guard_supervisor_1.startAgentGuardSupervisorDetached)({
                repoRoot,
                sessionId: session.sessionId,
                guardPath: guardRead.path,
                cliEntry: process.argv[1],
                debounceMs: options.debounceMs,
            });
            await recordSupervisorEvent({
                repoRoot,
                sessionId: session.sessionId,
                type: 'agent_guard_supervisor_started',
                message: supervisor.alreadyRunning
                    ? 'Agent guard supervisor already running.'
                    : 'Agent guard supervisor started.',
                detail: {
                    guardId: artifact.guardId,
                    pid: supervisor.pid,
                    status: supervisor.state.status,
                    debounceMs: supervisor.state.debounceMs,
                    alreadyRunning: supervisor.alreadyRunning,
                },
            });
            if (options.json)
                emitJson({ ok: true, ...supervisor });
            else
                renderSupervisorInspection((0, agent_guard_supervisor_1.inspectAgentGuardSupervisor)(repoRoot, session.sessionId));
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    supervise
        .command('status')
        .description('Show the detached supervisor process and heartbeat state')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Session ID (default: active session or active guard pointer)')
        .option('--guard-path <path>', 'Guard artifact path')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        try {
            const { repoRoot, artifact } = requireGuardContext(options);
            const inspection = (0, agent_guard_supervisor_1.inspectAgentGuardSupervisor)(repoRoot, options.sessionId || artifact.sessionId);
            if (options.json)
                emitJson({ ok: inspection.exists && inspection.state !== null, ...inspection });
            else
                renderSupervisorInspection(inspection);
            if (!inspection.exists || !inspection.state)
                process.exitCode = 1;
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    supervise
        .command('stop')
        .description('Stop the detached supervisor without finishing the governed session')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Session ID (default: active session or active guard pointer)')
        .option('--guard-path <path>', 'Guard artifact path')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const { repoRoot, artifact, session } = requireGuardContext(options);
            const stopped = (0, agent_guard_supervisor_1.stopAgentGuardSupervisor)(repoRoot, session.sessionId);
            if (stopped.state) {
                await recordSupervisorEvent({
                    repoRoot,
                    sessionId: session.sessionId,
                    type: 'agent_guard_supervisor_stopped',
                    message: stopped.signaled
                        ? 'Agent guard supervisor stop requested.'
                        : 'Agent guard supervisor stopped.',
                    detail: {
                        guardId: artifact.guardId,
                        pid: stopped.state.pid,
                        status: stopped.effectiveStatus,
                        signaled: stopped.signaled,
                    },
                });
            }
            if (options.json)
                emitJson({ ok: stopped.state !== null, ...stopped });
            else
                renderSupervisorInspection((0, agent_guard_supervisor_1.inspectAgentGuardSupervisor)(repoRoot, session.sessionId));
        }
        catch (error) {
            emitError(error, options.json);
        }
    });
    supervise
        .command('run')
        .description('Run the guard supervisor in the foreground (internal/process-manager mode)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--session-id <id>', 'Session ID (default: active session or active guard pointer)')
        .option('--guard-path <path>', 'Guard artifact path')
        .option('--debounce-ms <ms>', 'File-change debounce in milliseconds', (value) => Number.parseInt(value, 10))
        .option('--heartbeat-ms <ms>', 'Supervisor heartbeat interval in milliseconds', (value) => Number.parseInt(value, 10))
        .option('--exit-after-ms <ms>', 'Stop automatically after a duration (test/process-manager support)', (value) => Number.parseInt(value, 10))
        .option('--no-initial-evaluation', 'Wait for the first file change before evaluating')
        .option('--json-lines', 'Emit source-free JSON line updates')
        .action(async (options) => {
        try {
            const { repoRoot, guardRead, session } = requireGuardContext(options);
            const finalState = await (0, agent_guard_supervisor_1.runAgentGuardSupervisor)({
                repoRoot,
                sessionId: session.sessionId,
                guardPath: guardRead.path,
                debounceMs: options.debounceMs,
                heartbeatMs: options.heartbeatMs,
                exitAfterMs: options.exitAfterMs,
                evaluateImmediately: options.initialEvaluation !== false,
                onEvaluate: async () => {
                    const { evaluation } = await evaluateAndPublishGuardStatus({
                        dir: repoRoot,
                        sessionId: session.sessionId,
                        guardPath: guardRead.path,
                    });
                    if (options.jsonLines)
                        emitJsonLine({ type: 'evaluation', evaluation });
                    return {
                        pass: evaluation.pass,
                        changedFiles: evaluation.summary.changedFiles,
                        evaluatedAt: evaluation.generatedAt,
                    };
                },
                onState: options.jsonLines
                    ? (state) => emitJsonLine({ type: 'supervisor_state', state })
                    : undefined,
            });
            if (options.jsonLines)
                emitJsonLine({ type: 'supervisor_stopped', state: finalState });
        }
        catch (error) {
            if (options.jsonLines) {
                emitJsonLine({ ok: false, error: error instanceof Error ? error.message : String(error) });
                process.exitCode = 1;
            }
            else {
                emitError(error);
            }
        }
    });
}
//# sourceMappingURL=agent.js.map