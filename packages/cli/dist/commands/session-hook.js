"use strict";
/**
 * neurcode session-hook  (internal — called by Claude Code hooks, not by users)
 *
 * Sub-commands:
 *   start   — UserPromptSubmit: create a session from the user's prompt
 *   check   — PreToolUse: check a pending Edit/Write before it lands
 *   finish  — Stop: finalize the session and write the replay record
 *
 * Claude Code hook protocol (stdin → JSON, stdout → JSON):
 *   PreToolUse exit 0 + { permissionDecision: "deny" } → block the edit
 *   PreToolUse exit 0 (no deny)                        → allow
 *   UserPromptSubmit / Stop → side-effect only; always exit 0
 *
 * Fail-open policy:
 *   Governance errors must not break the agent.  We fail open (allow) and
 *   emit a stderr diagnostic so the developer can diagnose the issue.
 *   The exceptions: when a session IS active and the boundary or configured
 *   plan-coherence policy returns 'block', we deny — intentional enforcement.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionHookCommand = sessionHookCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_connection_1 = require("../utils/runtime-connection");
const admission_artifact_1 = require("../utils/admission-artifact");
const runtime_live_1 = require("../utils/runtime-live");
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
// ── Helpers ───────────────────────────────────────────────────────────────────
/** Read the full hook JSON from stdin, or return {} on any error. */
function readHookInput() {
    try {
        const raw = (0, fs_1.readFileSync)('/dev/stdin', 'utf8');
        if (raw.trim())
            return JSON.parse(raw);
    }
    catch { /* stdin closed or not JSON */ }
    return {};
}
/**
 * Extract the working directory from the hook input.
 *
 * Claude Code injects a `cwd` field into every hook payload containing the
 * directory in which the agent is running.  We use it to resolve the repo root
 * when the hook is invoked from a location other than the repo root.
 */
function cwdFromHookInput(hookInput, fallback) {
    const raw = hookInput['cwd'];
    if (typeof raw === 'string' && raw.trim() && (0, path_1.isAbsolute)(raw.trim())) {
        return raw.trim();
    }
    return fallback;
}
function sessionIdFromHookInput(hookInput) {
    const raw = hookInput['session_id'] ||
        hookInput['sessionId'];
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return trimmed || undefined;
}
/** Emit a diagnostic to stderr without breaking the hook exit code. */
function diagnostic(msg) {
    process.stderr.write(`[neurcode] ${msg}\n`);
}
function denyPreToolUse(reason, extra) {
    process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
            ...(extra || {}),
        },
    }) + '\n');
    process.exit(0);
}
function parseDurationMs(value) {
    if (!value)
        return undefined;
    const trimmed = value.trim().toLowerCase();
    const match = trimmed.match(/^(\d+)(ms|s|m|h|d)?$/);
    if (!match)
        throw new Error('expires-in must be a duration like 15m, 2h, or 1d');
    const amount = Number.parseInt(match[1], 10);
    const unit = match[2] || 'm';
    const multipliers = {
        ms: 1,
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };
    return amount * multipliers[unit];
}
/**
 * Deterministically capture an agent plan from a hook payload and attach it to
 * the session when present and changed. Source-free and fail-open: any failure
 * returns null and the hook proceeds unaffected.
 */
function maybeCaptureAgentPlan(repoRoot, session, hookInput) {
    try {
        const plan = (0, governance_runtime_1.extractAgentPlan)(hookInput);
        if (!plan)
            return null;
        const result = (0, governance_runtime_1.captureAgentPlan)(repoRoot, session.sessionId, plan);
        if (result && result.status !== 'unchanged') {
            diagnostic(result.status === 'pending'
                ? `agent plan amendment pending human decision (${result.proposal?.proposalId || 'unknown proposal'}, ${result.proposal?.risk.level || 'high'} risk)`
                : `agent plan ${result.status} (${plan.source}, ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}, confidence ${plan.confidence})`);
        }
        return result?.status === 'unchanged' ? null : result?.session ?? null;
    }
    catch {
        // Plan capture must never fail the hook.
        return null;
    }
}
async function maybeReuseLaunchedClaudeSession(repoRoot, goal, hookInput, profileFreshness) {
    const activeSession = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    if (!activeSession || activeSession.status !== 'active')
        return null;
    const launcher = (0, agent_session_launcher_1.latestAgentLauncherState)(activeSession);
    if (!launcher || launcher.agent.adapter !== 'claude-code-hooks')
        return null;
    const promptReferencesSession = goal.includes(activeSession.sessionId);
    const awaitingPrompt = launcher.handshakeStatus === 'awaiting_agent_prompt';
    if (!promptReferencesSession && !awaitingPrompt)
        return null;
    let session = (0, agent_session_launcher_1.recordLauncherHandshake)(repoRoot, activeSession, {
        handshakeStatus: 'prompt_seen',
        promptMatched: promptReferencesSession ? 'session_id' : 'active_launcher',
        source: 'claude-code-hooks',
        message: 'Claude Code prompt handshook into launcher-created session.',
    });
    const plannedAtStart = maybeCaptureAgentPlan(repoRoot, session, hookInput);
    if (plannedAtStart) {
        session = (0, agent_session_launcher_1.recordLauncherHandshake)(repoRoot, plannedAtStart, {
            handshakeStatus: 'plan_captured',
            promptMatched: promptReferencesSession ? 'session_id' : 'active_launcher',
            source: 'claude-code-hooks',
            message: 'Claude Code prompt captured an initial plan for the launcher-created session.',
        });
    }
    await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session, { profileFreshness });
    return session;
}
// ── Hook handlers ─────────────────────────────────────────────────────────────
/** UserPromptSubmit — create a new governance session from the prompt. */
async function handleStart(cmdCwd) {
    const hookInput = readHookInput();
    const effectiveCwd = cwdFromHookInput(hookInput, cmdCwd);
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(effectiveCwd);
    const goal = hookInput['prompt'] ||
        hookInput['user_prompt'] ||
        '';
    if (!goal.trim()) {
        // No text in the prompt — skip session creation (tool-use-only turn)
        return;
    }
    try {
        const profileResult = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot);
        const profileFreshness = (0, v0_governance_1.buildProfileFreshnessSignal)(profileResult, profileResult.refreshed ? 'auto_refreshed' : 'none');
        if (profileResult.refreshed && profileResult.status !== 'missing') {
            diagnostic(`profile refreshed before session start (${profileResult.reasons.join('; ')})`);
        }
        const reused = await maybeReuseLaunchedClaudeSession(repoRoot, goal.trim(), hookInput, profileFreshness);
        if (reused) {
            process.stdout.write(JSON.stringify({
                message: `🤝 Neurcode session ${reused.sessionId} · launcher handshake complete`,
            }) + '\n');
            return;
        }
        const profile = profileResult.profile;
        let session = (0, governance_runtime_1.createSession)(repoRoot, profile, goal.trim());
        const plannedAtStart = maybeCaptureAgentPlan(repoRoot, session, hookInput);
        if (plannedAtStart)
            session = plannedAtStart;
        const scopeNote = session.contract.scopeMode === 'ambiguous'
            ? '(scope ambiguous — approval-required boundaries will block)'
            : session.contract.allowedGlobs.slice(0, 2).join(', ') +
                (session.contract.allowedGlobs.length > 2
                    ? ` +${session.contract.allowedGlobs.length - 2} more`
                    : '');
        const banner = `🔒 Neurcode session ${session.sessionId} · ${scopeNote} · ` +
            `${session.contract.approvalRequiredGlobs.length} approval-required boundaries`;
        process.stdout.write(JSON.stringify({ message: banner }) + '\n');
        await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session, { profileFreshness });
    }
    catch (err) {
        diagnostic(`start failed: ${err instanceof Error ? err.message : String(err)}`);
        // Fail open — don't break the agent turn
    }
}
/** PreToolUse — check a pending Edit/Write/MultiEdit before it lands. */
async function handleCheck(cmdCwd) {
    const hookInput = readHookInput();
    const effectiveCwd = cwdFromHookInput(hookInput, cmdCwd);
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(effectiveCwd);
    const requestedSessionId = sessionIdFromHookInput(hookInput);
    const activeSession = requestedSessionId
        ? (0, governance_runtime_1.loadSession)(repoRoot, requestedSessionId)
        : (0, governance_runtime_1.loadActiveSession)(repoRoot);
    if (!activeSession || activeSession.status !== 'active') {
        // No active session — not governed, pass through
        diagnostic(requestedSessionId
            ? `no active session ${requestedSessionId} at ${repoRoot} — edit allowed (ungoverned)`
            : `no active session at ${repoRoot} — edit allowed (ungoverned)`);
        process.exit(0);
        return;
    }
    let session = activeSession;
    try {
        const hasPriorBlock = session.events.some((event) => event.type === 'check_block');
        if (hasPriorBlock) {
            const pending = await (0, runtime_live_1.applyPendingRuntimeLiveApprovals)(repoRoot, session.sessionId);
            if (pending.applied > 0 || pending.revoked > 0) {
                const refreshed = (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId);
                if (refreshed)
                    session = refreshed;
            }
            if (pending.applied > 0) {
                diagnostic(`applied ${pending.applied} dashboard approval${pending.applied === 1 ? '' : 's'}`);
            }
            if (pending.revoked > 0) {
                diagnostic(`revoked ${pending.revoked} dashboard approval${pending.revoked === 1 ? '' : 's'}`);
            }
        }
    }
    catch {
        // Live approval polling is best-effort; local deterministic enforcement still runs.
    }
    try {
        const expired = (0, governance_runtime_1.expireSessionApprovals)(repoRoot, session.sessionId);
        if (expired)
            session = expired;
    }
    catch {
        // Expiry cleanup is best-effort; checkFileBoundary still ignores expired grants.
    }
    try {
        const expired = (0, governance_runtime_1.expireArchitectureObligationWaivers)(repoRoot, session.sessionId);
        if (expired)
            session = expired;
    }
    catch {
        // Waiver expiry cleanup is best-effort; obligation evaluation uses timestamps.
    }
    // ── Agent plan capture ───────────────────────────────────────────────────
    // ExitPlanMode / TodoWrite PreToolUse payloads carry the agent's own plan but
    // no file path — capture it before the no-path early return below.
    try {
        const planned = maybeCaptureAgentPlan(repoRoot, session, hookInput);
        if (planned) {
            session = planned;
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        }
    }
    catch {
        // Plan capture is best-effort and must never fail the hook.
    }
    // ── Extract the target file path ─────────────────────────────────────────
    // Claude Code PreToolUse payload shape:
    //   { tool_name, tool_input: { path, ... }, cwd, ... }
    const toolInput = hookInput['tool_input'] ?? {};
    const rawPath = toolInput['path'] ||
        toolInput['file_path'] ||
        hookInput['path'] ||
        '';
    if (!rawPath) {
        diagnostic('PreToolUse: no file path in hook input — edit allowed (cannot check)');
        process.exit(0);
        return;
    }
    // Normalise to a path relative to the repo root
    let filePath = rawPath;
    if ((0, path_1.isAbsolute)(filePath)) {
        filePath = filePath.startsWith(repoRoot + '/')
            ? filePath.slice(repoRoot.length + 1)
            : filePath.replace(/^\//, '');
    }
    // ── Profile freshness guard ─────────────────────────────────────────────
    // Safe refreshes are automatic. If repo metadata changed enough that the
    // active session was derived from a different profile, the current edit is
    // denied until a new session contract is created from the fresh profile.
    let profileFreshness;
    try {
        const staleness = (0, v0_governance_1.getProfileStaleness)(repoRoot);
        const action = (0, v0_governance_1.profileFreshnessActionForSession)(staleness, session.profileHash);
        if (action === 'session_restart_required') {
            let signal = (0, v0_governance_1.buildProfileFreshnessSignal)(staleness, action);
            try {
                const refreshedProfile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot);
                signal = (0, v0_governance_1.buildProfileFreshnessSignal)(refreshedProfile, action);
            }
            catch (refreshError) {
                signal = {
                    ...signal,
                    action: 'manual_refresh_required',
                    reasons: [
                        ...signal.reasons,
                        `profile refresh failed: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
                    ],
                };
            }
            profileFreshness = signal;
            const message = `⏸ Neurcode: repository governance profile changed during this active session. ` +
                `This edit to ${filePath} was not checked against the updated repo topology. ` +
                `Start a new governed session, or run \`neurcode profile\` / \`neurcode activate claude\` and retry.`;
            try {
                (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, {
                    type: 'check_block',
                    ts: new Date().toISOString(),
                    filePath,
                    verdict: 'block',
                    message,
                    detail: { profileFreshness },
                });
                const refreshedSession = (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId);
                if (refreshedSession) {
                    await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, refreshedSession, { profileFreshness });
                }
            }
            catch {
                // Recording failure must not weaken the deny.
            }
            denyPreToolUse(message, { profileFreshness });
        }
        if (staleness.status !== 'fresh') {
            const refreshedProfile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot);
            profileFreshness = (0, v0_governance_1.buildProfileFreshnessSignal)(refreshedProfile, refreshedProfile.refreshed ? 'auto_refreshed' : 'none');
            if (refreshedProfile.refreshed) {
                diagnostic(`profile refreshed before edit check (${refreshedProfile.reasons.join('; ') || refreshedProfile.status})`);
            }
        }
        else {
            profileFreshness = (0, v0_governance_1.buildProfileFreshnessSignal)(staleness, 'none');
        }
    }
    catch (err) {
        const message = `⏸ Neurcode: could not verify the repository governance profile before checking ${filePath}. ` +
            `Run \`neurcode profile\` or \`neurcode activate claude\`, then retry. ` +
            `Cause: ${err instanceof Error ? err.message : String(err)}`;
        try {
            (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, {
                type: 'check_block',
                ts: new Date().toISOString(),
                filePath,
                verdict: 'block',
                message,
                detail: {
                    profileFreshness: {
                        status: 'unreadable',
                        refreshed: false,
                        action: 'manual_refresh_required',
                        checkedAt: new Date().toISOString(),
                        profilePath: '.neurcode/profile.json',
                        reasons: [err instanceof Error ? err.message : String(err)],
                        currentProfileHash: session.profileHash,
                        currentTopologyHash: session.profileHash,
                        trackedFileCount: 0,
                    },
                },
            });
            const refreshedSession = (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId);
            if (refreshedSession)
                await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, refreshedSession);
        }
        catch {
            // Recording failure must not weaken the deny.
        }
        denyPreToolUse(message);
    }
    // ── Run the boundary + intent-coherence checks ───────────────────────────
    let result;
    try {
        result = (0, governance_runtime_1.checkFileBoundary)({
            filePath,
            allowedGlobs: session.contract.allowedGlobs,
            ownershipRules: session.contract.ownershipRules,
            sensitiveGlobs: session.contract.sensitiveGlobs,
            approvalRequiredGlobs: session.contract.approvalRequiredGlobs,
            approvedPaths: session.contract.approvedPaths,
            approvalGrants: session.contract.approvalGrants,
            scopeMode: session.contract.scopeMode,
        });
    }
    catch (err) {
        diagnostic(`check failed: ${err instanceof Error ? err.message : String(err)} — edit allowed`);
        process.exit(0);
    }
    const boundaryVerdict = result.verdict;
    const intentCoherence = (0, governance_runtime_1.evaluateIntentCoherence)(session.contract, filePath);
    const planCoherence = (0, governance_runtime_1.evaluateSessionPlanCoherence)(session.contract, filePath);
    const planCoherencePolicy = (0, governance_runtime_1.evaluatePlanCoherencePolicy)(session.contract.planCoherenceMode, planCoherence);
    const architectureObligationFeedback = (0, governance_runtime_1.evaluateArchitectureObligationFeedback)(session.contract.architectureObligations ?? [], filePath);
    // V2: structured architecture-aware verdict (pass / warn / block /
    // obligation_pending / obligation_waived) evaluated against the dependency
    // graph + live obligation ledger. Advisory metadata for evidence + dashboard;
    // the deny/allow decision below is unchanged.
    const architectureEdit = (0, governance_runtime_1.evaluateArchitectureEdit)({
        filePath,
        boundaryVerdict,
        graph: session.contract.architectureGraph,
        obligations: session.contract.architectureObligations ?? [],
    });
    if (result.verdict === 'ok' && planCoherencePolicy.action === 'block') {
        result = {
            ...result,
            verdict: 'block',
            message: `⏸ Neurcode: ${filePath} is not justified by the agent's stated plan. ` +
                `${planCoherencePolicy.reason} Re-plan or update the plan before editing this path. ` +
                `Use neurcode_session_replan or \`neurcode session replan --add-file ${filePath}\`.`,
        };
    }
    else if (result.verdict === 'ok' && architectureObligationFeedback.action === 'block') {
        result = {
            ...result,
            verdict: 'block',
            message: `⏸ Neurcode: ${filePath} is blocked by ${architectureObligationFeedback.blocking.length} ` +
                `architecture obligation${architectureObligationFeedback.blocking.length === 1 ? '' : 's'}. ` +
                `${architectureObligationFeedback.reasons[0]} Satisfy the obligation, re-plan, or ask the human to waive it with ` +
                `neurcode_session_waive_obligation.`,
        };
    }
    else if (result.verdict === 'ok' && intentCoherence.verdict === 'drift') {
        result = {
            ...result,
            verdict: 'warn',
            message: `⚠️ Neurcode: ${filePath} is allowed by boundary rules but weakly linked to the task intent. ` +
                `${intentCoherence.reasons[0]} Proceeding — recorded in session.`,
        };
    }
    else if (result.verdict === 'ok' && architectureObligationFeedback.action === 'warn') {
        result = {
            ...result,
            verdict: 'warn',
            message: `⚠️ Neurcode: ${filePath} is allowed, but ${architectureObligationFeedback.pending.length} ` +
                `architecture obligation${architectureObligationFeedback.pending.length === 1 ? '' : 's'} remain open. ` +
                `${architectureObligationFeedback.reasons[0]} Proceeding — recorded in session.`,
        };
    }
    else if (result.verdict === 'ok' && planCoherencePolicy.action === 'warn') {
        result = {
            ...result,
            verdict: 'warn',
            message: `⚠️ Neurcode: ${filePath} is not justified by the agent's stated plan. ` +
                `${planCoherencePolicy.reason} Proceeding — recorded in session.`,
        };
    }
    // ── Record the event ─────────────────────────────────────────────────────
    // Tag every check with the agent-plan revision that was active when it ran,
    // so the evidence record can answer "which plan version governed this edit?".
    const activePlanRevision = (0, governance_runtime_1.activeAgentPlanRevision)(session.contract);
    try {
        const event = {
            type: result.verdict === 'ok'
                ? 'check_ok'
                : result.verdict === 'warn'
                    ? 'check_warn'
                    : 'check_block',
            ts: new Date().toISOString(),
            filePath,
            verdict: result.verdict,
            message: result.message,
            detail: {
                ...(result.approvalContext ? { approvalContext: result.approvalContext } : {}),
                intentCoherence,
                planCoherence,
                planCoherencePolicy,
                architectureObligationFeedback,
                architectureEdit: {
                    status: architectureEdit.status,
                    module: architectureEdit.module,
                    surfaces: architectureEdit.surfaces,
                    dependents: architectureEdit.dependents,
                    message: architectureEdit.message,
                },
                boundaryVerdict,
                activePlanRevision,
                planPresent: Boolean(session.contract.agentPlan),
            },
        };
        (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, event);
        const refreshed = (0, governance_runtime_1.refreshArchitectureObligations)(repoRoot, session.sessionId)
            || (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId);
        if (refreshed)
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, refreshed, { profileFreshness });
    }
    catch {
        // Recording failure must not affect the verdict
    }
    // ── Emit hook response ────────────────────────────────────────────────────
    if (result.verdict === 'block') {
        // Include machine-readable approvalContext when the block is approval-required,
        // so the agent can surface a structured approval request to the human.
        denyPreToolUse(result.message, result.approvalContext ? { approvalContext: result.approvalContext } : undefined);
    }
    if (result.verdict === 'warn') {
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
                reason: result.message,
            },
        }) + '\n');
    }
    // ok or warn-allowed → exit 0
    process.exit(0);
}
/** Stop — finalize the active session and emit the replay record. */
async function handleFinish(cmdCwd) {
    const hookInput = readHookInput();
    const effectiveCwd = cwdFromHookInput(hookInput, cmdCwd);
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(effectiveCwd);
    const requestedSessionId = sessionIdFromHookInput(hookInput);
    const session = requestedSessionId
        ? (0, governance_runtime_1.loadSession)(repoRoot, requestedSessionId)
        : (0, governance_runtime_1.loadActiveSession)(repoRoot);
    if (!session || session.status !== 'active')
        return;
    try {
        const finished = (0, governance_runtime_1.finishSession)(repoRoot, session.sessionId);
        if (!finished)
            return;
        const blockCount = finished.events.filter((e) => e.type === 'check_block').length;
        const warnCount = finished.events.filter((e) => e.type === 'check_warn').length;
        const summary = [
            `✅ Neurcode session ${finished.sessionId} complete`,
            `   Scope mode: ${finished.contract.scopeMode}`,
            `   Boundaries: ${blockCount} block${blockCount !== 1 ? 's' : ''}, ${warnCount} warning${warnCount !== 1 ? 's' : ''}`,
            `   Record: .neurcode/sessions/${finished.sessionId}.json`,
            `   replayHash: ${finished.replayHash}`,
        ].join('\n');
        process.stdout.write(JSON.stringify({ message: summary }) + '\n');
        // Phase A: emit the self-attested, source-free admission artifact. Never
        // allowed to break session finish, so failures are diagnostic-only.
        const admission = (0, admission_artifact_1.tryEmitSelfAttestedAdmissionRecord)({ repoRoot, session: finished });
        if (admission.ok) {
            diagnostic(`self-attested admission artifact written: ${admission.result.path}`);
        }
        else {
            diagnostic(`admission artifact skipped: ${admission.error}`);
        }
        await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, finished);
        try {
            const sync = (0, runtime_connection_1.triggerRuntimeAutoSync)(repoRoot);
            if (sync.started) {
                diagnostic('runtime evidence auto-sync queued');
            }
        }
        catch (syncError) {
            diagnostic(`auto-sync queue failed: ${syncError instanceof Error ? syncError.message : String(syncError)}`);
        }
    }
    catch (err) {
        diagnostic(`finish failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}
// ── Command registration ──────────────────────────────────────────────────────
function sessionHookCommand(program) {
    const cmd = program
        .command('session-hook')
        .description('Internal: called by Claude Code hooks (start / check / finish)')
        .option('--dir <path>', 'Repository root override (default: resolved from git)');
    cmd
        .command('start')
        .description('Create a governance session (UserPromptSubmit hook)')
        .action(async () => {
        const opts = cmd.opts();
        await handleStart(opts.dir || process.cwd());
    });
    cmd
        .command('check')
        .description('Check a pending edit against the active session (PreToolUse hook)')
        .action(async () => {
        const opts = cmd.opts();
        await handleCheck(opts.dir || process.cwd());
    });
    cmd
        .command('finish')
        .description('Finalize the active session and emit the replay record (Stop hook)')
        .action(async () => {
        const opts = cmd.opts();
        await handleFinish(opts.dir || process.cwd());
    });
    cmd
        .command('approve')
        .description('Approve a path/glob for the active session (unblocks approval-required boundaries)')
        .requiredOption('--path <path>', 'File path or glob to approve (e.g. src/billing/charge.py)')
        .option('--reason <text>', 'Human-readable reason for the approval')
        .option('--expires-in <duration>', 'Approval lifetime (default: 60m; examples: 15m, 2h, 1d)')
        .option('--expires-at <iso>', 'Absolute ISO timestamp when the approval expires')
        .option('--no-expiry', 'Create a session-scoped approval without a time expiry')
        .option('--session-id <id>', 'Session ID to approve against (default: active session)')
        .option('--json', 'Output machine-readable JSON')
        .action(async (subOpts) => {
        const opts = cmd.opts();
        const cwd = opts.dir || process.cwd();
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(cwd);
        try {
            const result = (0, governance_runtime_1.approveSession)(repoRoot, subOpts.path, {
                reason: subOpts.reason,
                sessionId: subOpts.sessionId,
                expiresAt: subOpts.expiry === false ? null : subOpts.expiresAt,
                ttlMs: subOpts.expiry === false || subOpts.expiresAt ? undefined : parseDurationMs(subOpts.expiresIn),
                source: 'local_cli',
            });
            if (subOpts.json) {
                process.stdout.write(JSON.stringify({ ok: true, ...result }, null, 2) + '\n');
            }
            else {
                process.stdout.write([
                    `✅ Approved: ${result.approvedPath}`,
                    `   Session:  ${result.sessionId}`,
                    `   Expires:  ${result.expiresAt || 'session end'}`,
                    `   All approved paths: ${result.approvedPaths.join(', ')}`,
                ].join('\n') + '\n');
            }
            const session = (0, governance_runtime_1.loadSession)(repoRoot, result.sessionId);
            if (session)
                await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (subOpts.json) {
                process.stdout.write(JSON.stringify({ ok: false, error: msg }, null, 2) + '\n');
            }
            else {
                process.stderr.write(`[neurcode] approval failed: ${msg}\n`);
            }
            process.exitCode = 1;
        }
    });
}
//# sourceMappingURL=session-hook.js.map