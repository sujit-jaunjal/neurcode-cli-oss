"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_SESSION_HANDSHAKE_SCHEMA_VERSION = exports.AGENT_SESSION_LAUNCH_SCHEMA_VERSION = void 0;
exports.adapterForLauncherAgent = adapterForLauncherAgent;
exports.latestAgentLauncherState = latestAgentLauncherState;
exports.launchAgentSession = launchAgentSession;
exports.recordLauncherHandshake = recordLauncherHandshake;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const v0_governance_1 = require("./v0-governance");
const runtime_live_1 = require("./runtime-live");
exports.AGENT_SESSION_LAUNCH_SCHEMA_VERSION = 'neurcode.agent-session-launch.v1';
exports.AGENT_SESSION_HANDSHAKE_SCHEMA_VERSION = 'neurcode.agent-session-handshake.v1';
function normalizeAgent(input) {
    const raw = (input || 'claude').trim().toLowerCase();
    if (['claude', 'claude-code', 'claude_code', 'claude-code-hooks'].includes(raw))
        return 'claude';
    if (['codex', 'codex-mcp'].includes(raw))
        return 'codex';
    if (['cursor', 'cursor-mcp'].includes(raw))
        return 'cursor';
    if (['gemini', 'gemini-cli', 'generic', 'generic-mcp', 'mcp'].includes(raw))
        return raw === 'gemini' || raw === 'gemini-cli' ? 'gemini' : 'generic-mcp';
    if (['vscode', 'vs-code', 'vscode-extension'].includes(raw))
        return 'vscode';
    throw new Error(`Unsupported agent "${input}". Supported agents: claude, codex, cursor, gemini, generic-mcp, vscode.`);
}
function adapterForLauncherAgent(agent) {
    if (agent === 'claude')
        return 'claude-code-hooks';
    if (agent === 'codex')
        return 'codex-mcp';
    if (agent === 'cursor')
        return 'cursor-mcp';
    if (agent === 'vscode')
        return 'vscode-extension';
    return 'generic-mcp';
}
function handshakeStatusFor(adapter) {
    if (adapter === 'claude-code-hooks')
        return 'awaiting_agent_prompt';
    if (adapter === 'vscode-extension')
        return 'observe_only';
    return 'awaiting_plan_capture';
}
function eventId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function shellSingleQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function starterPrompt(input) {
    const base = [
        `Neurcode session: ${input.sessionId}`,
        `Goal: ${input.goal}`,
        '',
        'Before editing, state a short implementation plan with expected files.',
        'Stay inside the active Neurcode session and use exact approval paths for approval-required boundaries.',
    ];
    if (input.adapter === 'claude-code-hooks') {
        base.push('Claude Code hooks are installed; Neurcode will check Edit/Write/MultiEdit before the write lands.');
    }
    else if (input.adapter === 'vscode-extension') {
        base.push('VS Code is observe-only; use the CLI/MCP runtime adapter before edits when the agent host supports it.');
    }
    else {
        base.push('Use Neurcode MCP tools before proposed edits: neurcode_agent_session_handshake, neurcode_agent_plan_capture, then neurcode_agent_edit_before for each write.');
    }
    return base.join('\n');
}
function instructionsFor(input) {
    if (input.adapter === 'claude-code-hooks') {
        return [
            'Open Claude Code in this repository.',
            'Paste the starter prompt shown by this command.',
            'Claude Code UserPromptSubmit will handshake into the existing session instead of creating a duplicate.',
            'PreToolUse hooks will hard-deny approval-required writes before they land.',
        ];
    }
    if (input.adapter === 'vscode-extension') {
        return [
            'Open the Neurcode Runtime Companion sidebar in VS Code.',
            'Use Refresh Live Runtime to inspect this active session.',
            'Use MCP/CLI runtime adapter calls for actual agent edit checks; VS Code itself is observe-only.',
        ];
    }
    return [
        'Give the agent the starter prompt shown by this command.',
        'The agent should call neurcode_agent_session_handshake, then neurcode_agent_plan_capture with its implementation plan.',
        'Before every proposed write, the agent should call neurcode_agent_edit_before with the repo-relative file path.',
        'Cooperative governance is only as strong as the agent host calling the runtime before edits.',
    ];
}
function commandForPlanCapture(adapter, goal) {
    const event = {
        schemaVersion: 'neurcode.agent-runtime-event.v1',
        adapter,
        eventType: 'plan.capture',
        payload: {
            plan: {
                summary: `Plan for: ${goal}`,
                steps: ['Replace this with the agent plan before editing.'],
            },
        },
    };
    return `neurcode runtime-adapter event --event-json ${shellSingleQuote(JSON.stringify(event))} --json`;
}
function appendLaunchEvent(repoRoot, session, result, launchEventId) {
    const event = {
        type: 'agent_session_launched',
        ts: result.generatedAt,
        message: `Agent session launched for ${result.agent.normalized} (${result.agent.enforcementLevel}).`,
        detail: {
            schemaVersion: exports.AGENT_SESSION_LAUNCH_SCHEMA_VERSION,
            eventId: launchEventId,
            agent: result.agent,
            handshakeStatus: result.handshake.status,
            requiredNextEvent: result.handshake.nextEvent,
            activation: result.activation,
            privacy: result.privacy,
        },
    };
    const updated = (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, event);
    return updated ?? session;
}
function maybeCaptureInitialPlan(repoRoot, session, planText) {
    if (!planText?.trim())
        return session;
    const plan = (0, governance_runtime_1.extractAgentPlan)({
        plan: planText,
        prompt: session.contract.goal,
    });
    if (!plan)
        return session;
    const result = (0, governance_runtime_1.captureAgentPlan)(repoRoot, session.sessionId, plan);
    return result?.session ?? (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId) ?? session;
}
function latestAgentLauncherState(session) {
    const launch = [...session.events].reverse().find((event) => event.type === 'agent_session_launched');
    if (!launch?.detail || typeof launch.detail !== 'object')
        return null;
    const detail = launch.detail;
    const agent = detail.agent && typeof detail.agent === 'object'
        ? detail.agent
        : null;
    if (!agent?.adapter)
        return null;
    const latestHandshake = [...session.events].reverse().find((event) => event.type === 'agent_handshake');
    const handshakeDetail = latestHandshake?.detail && typeof latestHandshake.detail === 'object'
        ? latestHandshake.detail
        : null;
    return {
        agent,
        handshakeStatus: (typeof handshakeDetail?.handshakeStatus === 'string'
            ? handshakeDetail.handshakeStatus
            : detail.handshakeStatus),
        launchedAt: launch.ts,
        promptSeenAt: latestHandshake?.ts,
        launchEventId: typeof detail.eventId === 'string' ? detail.eventId : undefined,
    };
}
async function launchAgentSession(options) {
    const goal = options.goal.trim();
    if (!goal)
        throw new Error('--goal is required');
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const normalized = normalizeAgent(options.agent);
    const adapter = adapterForLauncherAgent(normalized);
    const capability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)(adapter);
    const generatedAt = new Date().toISOString();
    const profileResult = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot, { force: options.forceProfile === true });
    const profileFreshness = (0, v0_governance_1.buildProfileFreshnessSignal)(profileResult, profileResult.refreshed ? 'auto_refreshed' : 'none');
    let activation = {
        attempted: false,
    };
    if (normalized === 'claude' && options.activate !== false) {
        (0, v0_governance_1.installClaudeGovernanceHooks)(repoRoot, { force: options.forceProfile === true });
        (0, v0_governance_1.installClaudeMcpConfig)({ force: options.forceProfile === true });
        activation = {
            attempted: true,
            hooksInstalled: true,
            mcpConfigured: true,
        };
    }
    let session = (0, governance_runtime_1.createSession)(repoRoot, profileResult.profile, goal);
    session = maybeCaptureInitialPlan(repoRoot, session, options.plan);
    const status = handshakeStatusFor(adapter);
    const sessionId = session.sessionId;
    const launchEventId = eventId('launch');
    const agent = {
        requested: options.agent || 'claude',
        normalized,
        adapter,
        enforcementLevel: capability.enforcementLevel,
        automatic: capability.automatic,
        hardDeny: capability.enforcementLevel === 'hard_deny',
        description: capability.description,
    };
    const handoffPrompt = starterPrompt({ sessionId, goal, adapter });
    const resultWithoutSession = {
        schemaVersion: exports.AGENT_SESSION_LAUNCH_SCHEMA_VERSION,
        ok: true,
        generatedAt,
        repoRoot,
        privacy: {
            metadataOnly: true,
            sourceUploaded: false,
            sourceIncluded: false,
        },
        profile: {
            status: profileResult.status,
            refreshed: profileResult.refreshed,
            profileHash: profileResult.profile.profileHash,
            topologyHash: profileResult.profile.topology.hash,
            trackedFileCount: profileResult.profile.topology.trackedFileCount,
            reasons: [...profileResult.reasons],
        },
        agent,
        activation,
        handshake: {
            status,
            required: status !== 'observe_only',
            nextEvent: status === 'awaiting_agent_prompt'
                ? 'Claude Code UserPromptSubmit'
                : status === 'awaiting_plan_capture'
                    ? 'plan.capture'
                    : null,
            starterPrompt: handoffPrompt,
            instructions: instructionsFor({ agent: normalized, adapter, sessionId, goal }),
        },
        commands: {
            status: `neurcode session status --local --session-id ${sessionId}`,
            approve: `neurcode session approve --session-id ${sessionId} --path <exact-path> --reason "<reason>"`,
            finish: `neurcode session end --session-id ${sessionId}`,
            capturePlan: commandForPlanCapture(adapter, goal),
        },
    };
    session = appendLaunchEvent(repoRoot, session, resultWithoutSession, launchEventId);
    await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session, { profileFreshness });
    return {
        ...resultWithoutSession,
        session: {
            sessionId,
            goal,
            scopeMode: session.contract.scopeMode,
            allowedGlobs: [...session.contract.allowedGlobs],
            approvalRequiredGlobs: [...session.contract.approvalRequiredGlobs],
            planRevision: typeof session.contract.agentPlanRevision === 'number'
                ? session.contract.agentPlanRevision
                : session.contract.agentPlan
                    ? 1
                    : null,
        },
    };
}
function recordLauncherHandshake(repoRoot, session, input) {
    const state = latestAgentLauncherState(session);
    const now = new Date().toISOString();
    const updated = (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, {
        type: 'agent_handshake',
        ts: now,
        message: input.message || `Agent handshake recorded (${input.handshakeStatus}).`,
        detail: {
            schemaVersion: exports.AGENT_SESSION_HANDSHAKE_SCHEMA_VERSION,
            eventId: eventId('handshake'),
            agent: state?.agent ?? null,
            launchEventId: state?.launchEventId ?? null,
            handshakeStatus: input.handshakeStatus,
            promptMatched: input.promptMatched || 'manual',
            source: input.source || 'local_cli',
            privacy: {
                metadataOnly: true,
                sourceUploaded: false,
                sourceIncluded: false,
            },
        },
    });
    return updated ?? session;
}
//# sourceMappingURL=agent-session-launcher.js.map