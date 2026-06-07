"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cursorCommand = cursorCommand;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
const v0_governance_1 = require("../utils/v0-governance");
const agent_adapter_setup_1 = require("../utils/agent-adapter-setup");
const agent_guard_1 = require("../utils/agent-guard");
const agent_guard_supervisor_1 = require("../utils/agent-guard-supervisor");
const runtime_live_1 = require("../utils/runtime-live");
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
    const goal = options.goal || 'Make one bounded change inside the declared task scope';
    const plan = options.plan || 'Capture a source-free plan before edits; call edit.before before every write.';
    const shouldWrite = options.write !== false;
    const shouldWriteInstructions = options.writeInstructions !== false;
    const shouldStartGuard = options.guardStart !== false;
    const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot, { force: true });
    const capability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)('cursor-mcp');
    const mcpWrite = shouldWrite
        ? (0, agent_adapter_setup_1.writeAgentSetup)({ target: 'cursor', repoRoot, global: options.global === true })
        : { status: 'not_requested', configPath: null, message: 'Skipped (--no-write).' };
    const instructionsWrite = shouldWriteInstructions
        ? (0, agent_adapter_setup_1.writeAgentInstructions)({ target: 'cursor', repoRoot })
        : { status: 'not_requested', filePath: null, message: 'Skipped (--no-write-instructions).' };
    const mcpInspection = (0, agent_adapter_setup_1.inspectAgentSetup)({ target: 'cursor', repoRoot, global: options.global === true });
    const instructionInspection = (0, agent_adapter_setup_1.inspectAgentInstructions)({ target: 'cursor', repoRoot });
    const doctorChecks = [
        {
            id: 'mcp_config',
            status: mcpInspection.configured ? 'pass' : 'fail',
            message: mcpInspection.message,
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
    const payload = {
        schemaVersion: 'neurcode.cursor-onboard.v1',
        ok: doctorOk,
        generatedAt: new Date().toISOString(),
        repoRoot,
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
        next: [
            'Reload Cursor so repo-local .cursor/mcp.json and rules are picked up.',
            'In Cursor Agent, call neurcode_agent_edit_before before every proposed file write.',
            'Finish with: neurcode agent guard finish --session-id <id> --fail-on-unverified',
            'Demo: bash scripts/cursor-supervised-demo.sh',
        ],
    };
    return payload;
}
function cursorCommand(program) {
    const cmd = program
        .command('cursor')
        .description('Cursor supervised governance onboarding');
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
}
//# sourceMappingURL=cursor.js.map