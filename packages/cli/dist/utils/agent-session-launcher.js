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
const session_start_transaction_1 = require("./session-start-transaction");
const atomic_runtime_bootstrap_1 = require("./atomic-runtime-bootstrap");
exports.AGENT_SESSION_LAUNCH_SCHEMA_VERSION = 'neurcode.agent-session-launch.v1';
exports.AGENT_SESSION_HANDSHAKE_SCHEMA_VERSION = 'neurcode.agent-session-handshake.v1';
function normalizeAgent(input) {
    const raw = (input || 'claude').trim().toLowerCase();
    if (['claude', 'claude-code', 'claude_code', 'claude-code-hooks'].includes(raw))
        return 'claude';
    if (['copilot', 'github-copilot', 'copilot-hooks'].includes(raw))
        return 'copilot';
    if (['codex', 'codex-mcp'].includes(raw))
        return 'codex';
    if (['cursor', 'cursor-mcp'].includes(raw))
        return 'cursor';
    if (['gemini', 'gemini-cli', 'generic', 'generic-mcp', 'mcp'].includes(raw))
        return raw === 'gemini' || raw === 'gemini-cli' ? 'gemini' : 'generic-mcp';
    if (['vscode', 'vs-code', 'vscode-extension'].includes(raw))
        return 'vscode';
    throw new Error(`Unsupported agent "${input}". Supported agents: claude, copilot, codex, cursor, gemini, generic-mcp, vscode.`);
}
function adapterForLauncherAgent(agent) {
    if (agent === 'claude')
        return 'claude-code-hooks';
    if (agent === 'copilot')
        return 'copilot-hooks';
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
    if (adapter === 'copilot-hooks')
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
function throwIfTestBootstrapFail(phase) {
    const target = process.env.NEURCODE_TEST_BOOTSTRAP_FAIL?.trim();
    if (target === phase) {
        throw new Error(`neurcode_test_bootstrap_fail:${phase}`);
    }
}
function rollbackDeferredSession(repoRoot, sessionId) {
    if (!sessionId)
        return;
    try {
        (0, governance_runtime_1.removeSession)(repoRoot, sessionId);
    }
    catch { /* best effort */ }
    try {
        (0, governance_runtime_1.clearActiveSession)(repoRoot, sessionId);
    }
    catch { /* best effort */ }
}
function formatConcurrentStartError(repoRoot) {
    return new Error('Another session start is already in progress (session_start_already_running). ' +
        `Wait for it to finish or run exactly: neurcode runtime repair --dir ${shellSingleQuote(repoRoot)}`);
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
    else if (input.adapter === 'copilot-hooks') {
        base.push('GitHub Copilot hooks are installed; Neurcode will check agent tool use before writes when Copilot hook discovery is active.');
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
    if (input.adapter === 'copilot-hooks') {
        return [
            'Open VS Code in this repository and use GitHub Copilot Agent Mode.',
            'Ensure .github/hooks/neurcode.json is present from `neurcode activate copilot`.',
            'Paste the starter prompt shown by this command.',
            'Copilot hooks will run UserPromptSubmit, PreToolUse, and Stop through the local runtime where hook discovery is active.',
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
            bootstrap: result.bootstrap,
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
    let deferredSessionId = null;
    try {
        (0, session_start_transaction_1.beginSessionStartTransaction)(repoRoot, process.env.NEURCODE_BOUNDED_COMMAND_KEY || 'run_agent');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('session_start_already_running')) {
            throw formatConcurrentStartError(repoRoot);
        }
        throw error;
    }
    try {
        const normalized = normalizeAgent(options.agent);
        const adapter = adapterForLauncherAgent(normalized);
        const capability = (0, governance_runtime_1.getAgentRuntimeAdapterCapability)(adapter);
        const generatedAt = new Date().toISOString();
        const activateExternal = options.activate !== false;
        (0, session_start_transaction_1.updateSessionStartTransaction)(repoRoot, { phase: 'initializing_runtime' });
        const bootstrapResult = await (0, atomic_runtime_bootstrap_1.atomicRuntimeBootstrap)(repoRoot, {
            agent: normalized,
            activate: activateExternal,
            forceProfile: options.forceProfile === true,
        });
        if (!bootstrapResult.ok) {
            const recovery = bootstrapResult.recoveryCommand || 'neurcode runtime repair';
            throw new Error(`Runtime bootstrap failed (${bootstrapResult.manifestStatus}; state=${bootstrapResult.runtimeState}). ` +
                `Run exactly: ${recovery}`);
        }
        (0, session_start_transaction_1.updateSessionStartTransaction)(repoRoot, { phase: 'fingerprinting_profile' });
        throwIfTestBootstrapFail('profile_generation');
        const profileResult = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot, { force: options.forceProfile === true });
        const profileFreshness = (0, v0_governance_1.buildProfileFreshnessSignal)(profileResult, profileResult.refreshed ? 'auto_refreshed' : 'none');
        const activation = {
            attempted: activateExternal,
            hooksInstalled: activateExternal && (normalized === 'claude' || normalized === 'copilot'),
            mcpConfigured: activateExternal && normalized === 'claude',
        };
        const bootstrap = {
            attempted: bootstrapResult.attempted,
            repaired: bootstrapResult.repaired,
            preserved: bootstrapResult.preserved,
            runtimeState: bootstrapResult.runtimeState,
            manifestStatus: bootstrapResult.manifestStatus,
            sessionCreated: false,
            recoveryCommand: bootstrapResult.recoveryCommand,
            reasonCodes: bootstrapResult.reasonCodes,
            manifestHash: bootstrapResult.manifestHash,
        };
        // Transactional launch (P0-D): persist the session record but defer publishing the
        // active pointer until the launch is durable. If any step below throws, the session is
        // rolled back so a failed `run claude` leaves no active session and no partial record.
        (0, session_start_transaction_1.updateSessionStartTransaction)(repoRoot, { phase: 'persisting_deferred_session' });
        throwIfTestBootstrapFail('session_persist');
        let session = (0, governance_runtime_1.createSession)(repoRoot, profileResult.profile, goal, { activate: false });
        deferredSessionId = session.sessionId;
        (0, session_start_transaction_1.updateSessionStartTransaction)(repoRoot, {
            phase: 'shaping_session',
            sessionId: session.sessionId,
        });
        const testStartHangMs = process.env.NODE_ENV === 'test'
            ? Number(process.env.NEURCODE_TEST_SESSION_START_HANG_MS)
            : Number.NaN;
        if (Number.isSafeInteger(testStartHangMs) && testStartHangMs > 0) {
            await new Promise((resolveDelay) => setTimeout(resolveDelay, testStartHangMs));
        }
        try {
            session = maybeCaptureInitialPlan(repoRoot, session, options.plan);
        }
        catch (error) {
            rollbackDeferredSession(repoRoot, deferredSessionId);
            throw error;
        }
        const status = handshakeStatusFor(adapter);
        const sessionId = session.sessionId;
        const launchEventId = eventId('launch');
        const agent = {
            requested: options.agent || 'claude',
            normalized,
            adapter,
            enforcementLevel: capability.enforcementLevel,
            compatibilityMode: capability.compatibilityMode,
            automatic: capability.automatic,
            hardDeny: capability.enforcementLevel === 'hard_deny',
            enforceable: capability.enforceable,
            advisoryOnly: capability.advisoryOnly,
            supervisorSupported: capability.supervisorSupported,
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
            bootstrap,
            handshake: {
                status,
                required: status !== 'observe_only',
                nextEvent: status === 'awaiting_agent_prompt'
                    ? (adapter === 'copilot-hooks' ? 'Copilot UserPromptSubmit' : 'Claude Code UserPromptSubmit')
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
        try {
            session = appendLaunchEvent(repoRoot, session, resultWithoutSession, launchEventId);
            // Commit: the launch record is durable, so publish the active pointer now.
            (0, session_start_transaction_1.updateSessionStartTransaction)(repoRoot, {
                phase: 'activating_session',
                sessionId: session.sessionId,
            });
            (0, governance_runtime_1.activateSession)(repoRoot, session.sessionId);
            deferredSessionId = null;
            bootstrap.sessionCreated = true;
        }
        catch (error) {
            rollbackDeferredSession(repoRoot, deferredSessionId);
            throw error;
        }
        // Cloud projection is non-authoritative and must not affect the committed session.
        (0, session_start_transaction_1.updateSessionStartTransaction)(repoRoot, {
            phase: 'reconciling_cloud',
            sessionId: session.sessionId,
        });
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
    catch (error) {
        rollbackDeferredSession(repoRoot, deferredSessionId);
        throw error;
    }
    finally {
        (0, session_start_transaction_1.clearSessionStartTransaction)(repoRoot);
    }
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