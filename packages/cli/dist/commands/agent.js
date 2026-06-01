"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentCommand = agentCommand;
const node_fs_1 = require("node:fs");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
const v0_governance_1 = require("../utils/v0-governance");
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
}
//# sourceMappingURL=agent.js.map