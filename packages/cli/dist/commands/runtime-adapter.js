"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitAgentRuntimeEvent = submitAgentRuntimeEvent;
exports.runtimeAdapterCommand = runtimeAdapterCommand;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const v0_governance_1 = require("../utils/v0-governance");
const session_allowlist_rules_1 = require("../utils/session-allowlist-rules");
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
const runtime_live_1 = require("../utils/runtime-live");
function readStdin() {
    try {
        return (0, node_fs_1.readFileSync)(0, 'utf8');
    }
    catch {
        return '';
    }
}
function parseJsonOutput(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed)
        return undefined;
    try {
        const parsed = JSON.parse(trimmed);
        return typeof parsed === 'object' && parsed !== null
            ? parsed
            : undefined;
    }
    catch {
        const lines = trimmed.split('\n');
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            try {
                const parsed = JSON.parse(lines[index]);
                if (typeof parsed === 'object' && parsed !== null) {
                    return parsed;
                }
            }
            catch {
                // Keep scanning: hook output may include a human-readable prefix.
            }
        }
    }
    return undefined;
}
function runCurrentCli(args, cwd, stdinText) {
    const cliEntry = process.argv[1];
    if (!cliEntry)
        throw new Error('Unable to resolve the active Neurcode CLI entrypoint.');
    const child = (0, node_child_process_1.spawnSync)(process.execPath, [(0, node_path_1.resolve)(cliEntry), ...args], {
        cwd,
        input: stdinText,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
    });
    if (child.error)
        throw child.error;
    return {
        status: child.status ?? 1,
        stdout: child.stdout ?? '',
        stderr: child.stderr ?? '',
        json: parseJsonOutput(child.stdout ?? ''),
    };
}
function hookInput(event, extras = {}) {
    return JSON.stringify({
        cwd: event.cwd,
        ...extras,
    });
}
function hookDecision(result) {
    const hookOutput = result.json?.hookSpecificOutput;
    const hook = typeof hookOutput === 'object' && hookOutput !== null
        ? hookOutput
        : undefined;
    const permission = hook?.permissionDecision;
    const permissionReason = hook?.permissionDecisionReason;
    const reason = hook?.reason;
    if (permission === 'deny') {
        return {
            decision: 'deny',
            message: typeof permissionReason === 'string' ? permissionReason : 'Neurcode blocked this edit.',
            payload: result.json,
        };
    }
    if (typeof reason === 'string' && reason.trim()) {
        return {
            decision: 'warn',
            message: reason,
            payload: result.json,
        };
    }
    return {
        decision: 'allow',
        message: 'Neurcode allowed this edit.',
        payload: result.json,
    };
}
function decisionEnvelope(event, decision, message, payload, wouldBlock) {
    const capability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)(event.adapter);
    return {
        schemaVersion: governance_runtime_1.AGENT_RUNTIME_DECISION_SCHEMA_VERSION,
        ok: true,
        adapter: event.adapter,
        enforcementLevel: capability.enforcementLevel,
        eventType: event.eventType,
        decision,
        message,
        ...(typeof wouldBlock === 'boolean' ? { wouldBlock } : {}),
        ...(payload ? { payload } : {}),
    };
}
function childFailure(event, result) {
    const message = result.stderr.trim()
        || result.stdout.trim()
        || `Neurcode command failed with exit code ${result.status}.`;
    throw new Error(message);
}
function runHook(event, hookAction, extras = {}) {
    return runCurrentCli(['session-hook', '--dir', event.cwd, hookAction], event.cwd, hookInput(event, extras));
}
function loadTargetSession(repoRoot, sessionId) {
    return sessionId ? (0, governance_runtime_1.loadSession)(repoRoot, sessionId) : (0, governance_runtime_1.loadActiveSession)(repoRoot);
}
function ensureAgentPlanCaptured(repoRoot, sessionId, planPayload) {
    let session = (0, governance_runtime_1.loadSession)(repoRoot, sessionId);
    if (!session || session.contract.agentPlan)
        return session;
    const plan = (0, governance_runtime_1.extractAgentPlan)({ cwd: repoRoot, plan: planPayload, session_id: sessionId }, { source: 'mcp' });
    if (!plan)
        return session;
    const captured = (0, governance_runtime_1.captureAgentPlan)(repoRoot, sessionId, plan);
    session = captured?.session ?? (0, governance_runtime_1.loadSession)(repoRoot, sessionId);
    return session;
}
function launcherAdapterMatches(eventAdapter, launchedAdapter) {
    if (!launchedAdapter)
        return true;
    return eventAdapter === launchedAdapter || eventAdapter === 'generic-mcp';
}
function payloadKeys(payload) {
    return Object.keys(payload)
        .filter((key) => payload[key] !== undefined)
        .sort();
}
function recordAgentRuntimeCall(event, session, governanceDecision) {
    const capability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)(event.adapter);
    (0, governance_runtime_1.appendEvent)(event.cwd, session.sessionId, {
        type: 'agent_runtime_call',
        ts: new Date().toISOString(),
        filePath: typeof event.payload.filePath === 'string'
            ? event.payload.filePath
            : typeof event.payload.path === 'string'
                ? event.payload.path
                : undefined,
        detail: {
            schemaVersion: 'neurcode.agent-runtime-call.v1',
            adapter: event.adapter,
            runtimeEventType: event.eventType,
            eventId: event.eventId || null,
            timestamp: event.timestamp || null,
            enforcementLevel: capability.enforcementLevel,
            automatic: capability.automatic,
            toolName: typeof event.payload.toolName === 'string' ? event.payload.toolName : null,
            payloadKeys: payloadKeys(event.payload),
            ...(governanceDecision && governanceDecision !== 'recorded' && governanceDecision !== 'observe'
                ? { governanceDecision }
                : {}),
            privacy: {
                metadataOnly: true,
                sourceUploaded: false,
                sourceIncluded: false,
            },
        },
    });
}
async function submitAgentRuntimeEvent(event) {
    const capability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)(event.adapter);
    if (!capability.events.includes(event.eventType)) {
        throw new Error(`${event.adapter} does not support ${event.eventType}; supported events: ${capability.events.join(', ')}`);
    }
    const payload = event.payload;
    const targetSession = event.eventType === 'session.start'
        ? null
        : loadTargetSession(event.cwd, payload.sessionId);
    switch (event.eventType) {
        case 'session.handshake': {
            const session = targetSession;
            if (!session || session.status !== 'active') {
                throw new Error(payload.sessionId
                    ? `No active governed session found for ${payload.sessionId}.`
                    : 'No active governed session found for MCP handshake.');
            }
            const launcher = (0, agent_session_launcher_1.latestAgentLauncherState)(session);
            if (!launcherAdapterMatches(event.adapter, launcher?.agent.adapter)) {
                throw new Error(`MCP adapter mismatch: active session was launched for ${launcher?.agent.adapter}, but handshake used ${event.adapter}.`);
            }
            const updated = (0, agent_session_launcher_1.recordLauncherHandshake)(event.cwd, session, {
                handshakeStatus: 'mcp_connected',
                promptMatched: 'manual',
                source: event.adapter,
                message: `MCP agent handshook into governed session via ${event.adapter}.`,
            });
            await (0, runtime_live_1.publishRuntimeLiveStatus)(event.cwd, updated);
            return decisionEnvelope(event, 'recorded', 'MCP agent handshook into the active governed session.', {
                sessionId: updated.sessionId,
                launcher: (0, agent_session_launcher_1.latestAgentLauncherState)(updated),
                nextAction: updated.contract.agentPlan ? 'edit.before' : 'plan.capture',
            });
        }
        case 'session.start': {
            const result = runHook(event, 'start', {
                prompt: payload.goal,
                ...(payload.plan ? { plan: payload.plan } : {}),
            });
            if (result.status !== 0)
                childFailure(event, result);
            return decisionEnvelope(event, 'recorded', 'Governed agent session started.', result.json);
        }
        case 'plan.capture': {
            const session = targetSession;
            if (!session || session.status !== 'active') {
                throw new Error(payload.sessionId
                    ? `No active governed session found for ${payload.sessionId}.`
                    : 'No active governed session found for plan capture.');
            }
            const result = runHook(event, 'check', {
                plan: payload.plan,
                session_id: session.sessionId,
            });
            if (result.status !== 0)
                childFailure(event, result);
            const updated = ensureAgentPlanCaptured(event.cwd, session.sessionId, payload.plan);
            if (!updated?.contract.agentPlan) {
                throw new Error('Agent plan capture did not persist a source-free plan for the active session.');
            }
            (0, session_allowlist_rules_1.refreshSessionScopeRules)({ dir: event.cwd, sessionId: updated.sessionId });
            await (0, runtime_live_1.publishRuntimeLiveStatus)(event.cwd, updated);
            return decisionEnvelope(event, 'recorded', 'Agent plan captured for the active session.', {
                ...(result.json ?? {}),
                sessionId: updated.sessionId,
                agentPlanRevision: updated.contract.agentPlanRevision ?? null,
            });
        }
        case 'plan.amend': {
            const args = [
                'session',
                'amend-plan',
                '--proposed-by',
                'agent',
                '--json',
            ];
            if (payload.plan)
                args.push('--plan', typeof payload.plan === 'string' ? payload.plan : JSON.stringify(payload.plan));
            if (payload.summary)
                args.push('--summary', payload.summary);
            if (payload.reason)
                args.push('--reason', payload.reason);
            for (const item of payload.scope ?? [])
                args.push('--scope', item);
            if (payload.sessionId)
                args.push('--session-id', payload.sessionId);
            const result = runCurrentCli(args, event.cwd);
            if (result.status !== 0)
                childFailure(event, result);
            return decisionEnvelope(event, 'recorded', 'Plan amendment proposed for the active session.', result.json);
        }
        case 'edit.before': {
            const result = runHook(event, 'check', {
                ...(payload.sessionId ? { session_id: payload.sessionId } : {}),
                tool_name: payload.toolName ?? 'Write',
                tool_input: { file_path: payload.filePath },
            });
            if (result.status !== 0)
                childFailure(event, result);
            const checked = hookDecision(result);
            if (targetSession) {
                recordAgentRuntimeCall(event, targetSession, checked.decision);
            }
            return decisionEnvelope(event, checked.decision, checked.message, checked.payload);
        }
        case 'edit.after': {
            const result = runHook(event, 'check', {
                ...(payload.sessionId ? { session_id: payload.sessionId } : {}),
                tool_name: payload.toolName ?? 'Write',
                tool_input: { file_path: payload.filePath },
            });
            if (result.status !== 0)
                childFailure(event, result);
            const checked = hookDecision(result);
            if (targetSession) {
                recordAgentRuntimeCall(event, targetSession, checked.decision === 'deny' ? 'deny' : 'observe');
            }
            return decisionEnvelope(event, 'observe', checked.decision === 'deny'
                ? `Post-change observation: ${checked.message}`
                : 'Post-change observation recorded.', checked.payload, checked.decision === 'deny');
        }
        case 'session.finish': {
            const result = runHook(event, 'finish', payload.sessionId ? { session_id: payload.sessionId } : {});
            if (result.status !== 0)
                childFailure(event, result);
            return decisionEnvelope(event, 'recorded', 'Governed agent session finished.', result.json);
        }
        case 'approval.apply': {
            const args = [
                'session',
                'approve',
                '--path',
                payload.path,
                '--json',
            ];
            if (payload.reason)
                args.push('--reason', payload.reason);
            if (payload.sessionId)
                args.push('--session-id', payload.sessionId);
            const result = runCurrentCli(args, event.cwd);
            if (result.status !== 0)
                childFailure(event, result);
            return decisionEnvelope(event, 'recorded', 'Exact-path runtime approval applied.', result.json);
        }
        case 'obligation.waive': {
            const args = [
                'session',
                'waive-obligation',
                '--id',
                payload.obligationId,
                '--reason',
                payload.reason,
                '--source',
                'mcp',
                '--json',
            ];
            if (payload.sessionId)
                args.push('--session-id', payload.sessionId);
            if (payload.expiresAt)
                args.push('--expires-at', payload.expiresAt);
            if (payload.ttlMinutes !== undefined)
                args.push('--ttl-minutes', String(payload.ttlMinutes));
            if (payload.actor)
                args.push('--waived-by', payload.actor);
            const result = runCurrentCli(args, event.cwd);
            if (result.status !== 0)
                childFailure(event, result);
            return decisionEnvelope(event, 'recorded', 'Obligation waiver recorded.', result.json);
        }
    }
}
function emitJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
function emitError(error, json) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
        emitJson({ ok: false, error: message });
    }
    else {
        console.error(`Error: ${message}`);
    }
    process.exitCode = 1;
}
function runtimeAdapterCommand(program) {
    const runtimeAdapter = program
        .command('runtime-adapter')
        .description('Portable local ingress for governed AI coding-agent lifecycle events');
    runtimeAdapter
        .command('capabilities')
        .description('List supported runtime adapters and their enforcement guarantees')
        .option('--json', 'Emit JSON')
        .action((options) => {
        const capabilities = (0, governance_runtime_1.listAgentRuntimeAdapterCapabilities)();
        if (options.json) {
            emitJson({ capabilities });
            return;
        }
        for (const capability of capabilities) {
            console.log(`${capability.adapter}: ${capability.compatibilityMode.replace(/_/g, ' ')}`
                + ` (${capability.enforcementLevel}; ${capability.automatic ? 'automatic' : 'explicit events'})`);
            console.log(`  enforceable: ${capability.enforceable.join('; ')}`);
            console.log(`  advisory only: ${capability.advisoryOnly.join('; ')}`);
        }
    });
    runtimeAdapter
        .command('event')
        .description('Submit one normalized, source-free agent lifecycle event')
        .option('--event-json <json>', 'Normalized runtime event JSON; reads stdin when omitted')
        .option('--dir <path>', 'Repository directory fallback')
        .option('--json', 'Emit JSON')
        .action(async (options) => {
        try {
            const raw = options.eventJson ?? readStdin();
            if (!raw.trim())
                throw new Error('Provide --event-json or pipe a normalized runtime event JSON object.');
            const parsed = JSON.parse(raw);
            const normalized = (0, governance_runtime_1.normalizeAgentRuntimeEvent)({
                ...parsed,
                cwd: (0, v0_governance_1.resolveRepoRoot)(parsed.cwd ?? options.dir ?? process.cwd()),
            });
            if (!normalized.cwd)
                throw new Error('Unable to resolve the runtime adapter repository root.');
            const event = { ...normalized, cwd: normalized.cwd };
            emitJson(await submitAgentRuntimeEvent(event));
        }
        catch (error) {
            emitError(error, Boolean(options.json));
        }
    });
}
//# sourceMappingURL=runtime-adapter.js.map