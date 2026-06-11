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
exports.resolveSessionForHook = resolveSessionForHook;
exports.normalizeHookFilePathForRepo = normalizeHookFilePathForRepo;
exports.hookFilePathCandidates = hookFilePathCandidates;
exports.evaluateNoActiveSessionWrite = evaluateNoActiveSessionWrite;
exports.shouldKeepSessionActiveForPendingApproval = shouldKeepSessionActiveForPendingApproval;
exports.sessionHookCommand = sessionHookCommand;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const v0_governance_1 = require("../utils/v0-governance");
const runtime_connection_1 = require("../utils/runtime-connection");
const admission_artifact_1 = require("../utils/admission-artifact");
const hook_heartbeat_1 = require("../utils/hook-heartbeat");
const runtime_live_1 = require("../utils/runtime-live");
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
const governed_intent_1 = require("../utils/governed-intent");
const intent_continuity_1 = require("../utils/intent-continuity");
const bash_command_analysis_1 = require("../utils/bash-command-analysis");
const diff_parser_1 = require("@neurcode-ai/diff-parser");
const structural_understanding_1 = require("../utils/structural-understanding");
const consequence_nudges_1 = require("../utils/consequence-nudges");
const agent_guard_supervisor_1 = require("../utils/agent-guard-supervisor");
// ── Helpers ───────────────────────────────────────────────────────────────────
/** Read the full hook JSON from stdin, or return {} on any error. */
function readHookInput() {
    try {
        // Read fd 0 directly — /dev/stdin can be empty on Linux CI when stdin is a pipe.
        const raw = (0, fs_1.readFileSync)(0, 'utf8');
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
function resolveSessionForHook(repoRoot, requestedSessionId) {
    if (requestedSessionId) {
        const requested = (0, governance_runtime_1.loadSession)(repoRoot, requestedSessionId);
        if (requested && requested.status === 'active') {
            return { session: requested, requestedSessionId, usedActiveFallback: false };
        }
        const active = (0, governance_runtime_1.loadActiveSession)(repoRoot);
        if (active && active.status === 'active') {
            return { session: active, requestedSessionId, usedActiveFallback: true };
        }
        return { session: null, requestedSessionId, usedActiveFallback: false };
    }
    const active = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    return { session: active && active.status === 'active' ? active : null, usedActiveFallback: false };
}
function safeRealpath(path) {
    try {
        return (0, fs_1.realpathSync)(path);
    }
    catch {
        return null;
    }
}
function absolutizeMissingPath(path) {
    const parent = safeRealpath((0, path_1.dirname)(path));
    return parent ? (0, path_1.join)(parent, (0, path_1.basename)(path)) : null;
}
function normalizeHookFilePathForRepo(rawPath, repoRoot) {
    let filePath = rawPath.replace(/\\/g, '/');
    if (!(0, path_1.isAbsolute)(filePath))
        return filePath.replace(/^\.\//, '');
    const repoReal = safeRealpath(repoRoot) || repoRoot;
    const directCandidates = [
        filePath,
        safeRealpath(filePath),
        absolutizeMissingPath(filePath),
    ].filter((value) => Boolean(value));
    for (const candidate of directCandidates) {
        if (candidate === repoRoot)
            return '';
        if (candidate.startsWith(repoRoot + path_1.sep) || candidate.startsWith(repoRoot + '/')) {
            return (0, path_1.relative)(repoRoot, candidate).replace(/\\/g, '/');
        }
        if (candidate === repoReal)
            return '';
        if (candidate.startsWith(repoReal + path_1.sep) || candidate.startsWith(repoReal + '/')) {
            return (0, path_1.relative)(repoReal, candidate).replace(/\\/g, '/');
        }
    }
    return filePath.replace(/^\//, '');
}
function isPlanDeclaredTarget(session, filePath) {
    const normalized = filePath.replace(/^\.\//, '').replace(/^\//, '');
    return (session.contract.agentPlan?.expectedFiles ?? []).some((candidate) => candidate.replace(/^\.\//, '').replace(/^\//, '') === normalized);
}
/** Emit a diagnostic to stderr without breaking the hook exit code. */
function diagnostic(msg) {
    process.stderr.write(`[neurcode] ${msg}\n`);
}
function hookAnalysisLimit(envName, fallback) {
    const raw = process.env[envName];
    if (!raw)
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function sessionAlreadyEmittedNudge(session, nudgeKey) {
    return session.events.some((event) => event.type === 'consequence_nudge' &&
        event.detail &&
        typeof event.detail === 'object' &&
        event.detail['nudgeKey'] === nudgeKey);
}
function readWorkingDiff(repoRoot) {
    return (0, child_process_1.execFileSync)('git', ['-C', repoRoot, 'diff', '--no-ext-diff', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 48 * 1024 * 1024,
    });
}
async function maybeRecordConsequenceNudge(repoRoot, session) {
    if (!(0, consequence_nudges_1.consequenceNudgesEnabled)())
        return null;
    try {
        const diffText = readWorkingDiff(repoRoot);
        if (!diffText.trim())
            return null;
        const diffFiles = (0, diff_parser_1.parseDiff)(diffText);
        const artifact = (0, structural_understanding_1.buildStructuralUnderstanding)(repoRoot, diffFiles, {
            session,
            maxProgramFiles: hookAnalysisLimit('NEURCODE_CONSEQUENCE_NUDGE_MAX_PROGRAM_FILES', 2500),
            timeBudgetMs: hookAnalysisLimit('NEURCODE_CONSEQUENCE_NUDGE_TIME_BUDGET_MS', 3500),
        });
        const nudges = (0, consequence_nudges_1.selectInFlowConsequenceNudges)(artifact, { max: 3 });
        const [nudge] = nudges;
        if (!nudge)
            return null;
        const latest = (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId) || session;
        if (sessionAlreadyEmittedNudge(latest, nudge.nudgeKey))
            return null;
        const artifactPath = (0, structural_understanding_1.writeStructuralUnderstanding)(repoRoot, session.sessionId, artifact);
        (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, {
            type: 'structural_understanding',
            ts: artifact.generatedAt,
            message: artifact.analysis.analyzed
                ? `Structural understanding: ${artifact.analysis.changedSymbolCount} changed symbols, ${artifact.analysis.referenceCount} references, ${artifact.analysis.testReferenceCount} test references.`
                : `Structural understanding not analyzed: ${artifact.analysis.reason ?? 'unknown reason'}.`,
            detail: {
                schemaVersion: artifact.schemaVersion,
                artifactHash: artifact.artifactHash,
                artifactPath: artifactPath.replace(`${repoRoot}/`, ''),
                analysis: artifact.analysis,
                changedFiles: artifact.changedFiles,
                changedSymbols: artifact.changedSymbols,
                digest: artifact.digest,
                boundaryImpact: artifact.boundaryImpact,
                suppressedArtifacts: artifact.suppressedArtifacts,
                consequenceUnderstanding: {
                    schemaVersion: artifact.consequenceUnderstanding.schemaVersion,
                    analyzed: artifact.consequenceUnderstanding.analyzed,
                    reason: artifact.consequenceUnderstanding.reason,
                    summary: artifact.consequenceUnderstanding.summary,
                    topImpacts: artifact.consequenceUnderstanding.topImpacts.slice(0, 8),
                    topFindings: artifact.consequenceUnderstanding.topFindings.slice(0, 8),
                    artifactHash: artifact.consequenceUnderstanding.artifactHash,
                },
                privacy: artifact.privacy,
            },
        });
        (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, {
            type: 'consequence_nudge',
            ts: new Date().toISOString(),
            message: nudge.headline,
            detail: {
                nudgeVersion: nudge.nudgeVersion,
                nudgeKey: nudge.nudgeKey,
                severity: nudge.severity,
                consequenceClass: nudge.consequenceClass,
                operatorAction: nudge.operatorAction,
                reviewFocus: nudge.reviewFocus,
                artifactHash: nudge.artifactHash,
                impact: nudge.impact ? {
                    rank: nudge.impact.rank,
                    score: nudge.impact.score,
                    file: nudge.impact.file,
                    symbol: nudge.impact.symbol,
                    summary: nudge.impact.summary,
                    findingTypes: nudge.impact.findingTypes,
                    findingRanks: nudge.impact.findingRanks,
                    findingCount: nudge.impact.findingCount,
                    productionConsumerCount: nudge.impact.productionConsumerCount,
                    testConsumerCount: nudge.impact.testConsumerCount,
                    reachableProductionConsumerCount: nudge.impact.reachableProductionConsumerCount,
                    externalProductionConsumerCount: nudge.impact.externalProductionConsumerCount,
                    changedProductionConsumerCount: nudge.impact.changedProductionConsumerCount,
                    sensitiveConsumerCount: nudge.impact.sensitiveConsumerCount,
                    approvalRequiredConsumerCount: nudge.impact.approvalRequiredConsumerCount,
                    runtimeGovernanceConsumerCount: nudge.impact.runtimeGovernanceConsumerCount,
                    productionFiles: nudge.impact.productionFiles,
                    changedProductionFiles: nudge.impact.changedProductionFiles,
                    testFiles: nudge.impact.testFiles,
                    sensitiveFiles: nudge.impact.sensitiveFiles,
                    approvalRequiredFiles: nudge.impact.approvalRequiredFiles,
                    runtimeGovernanceFiles: nudge.impact.runtimeGovernanceFiles,
                    highFanout: nudge.impact.highFanout,
                    architectureRelevant: nudge.impact.architectureRelevant,
                    reasonCodes: nudge.impact.reasonCodes,
                    provenance: nudge.impact.provenance,
                } : null,
                finding: {
                    rank: nudge.finding.rank,
                    score: nudge.finding.score,
                    findingType: nudge.finding.findingType,
                    file: nudge.finding.file,
                    symbol: nudge.finding.symbol,
                    summary: nudge.finding.summary,
                    consumerCount: nudge.finding.consumerCount,
                    nonTestConsumerCount: nudge.finding.nonTestConsumerCount,
                    testConsumerCount: nudge.finding.testConsumerCount,
                    externalConsumerCount: nudge.finding.externalConsumerCount,
                    externalConsumerFiles: nudge.finding.externalConsumerFiles,
                    consumerSummary: nudge.finding.consumerSummary,
                    reasonCodes: nudge.finding.reasonCodes,
                },
                topImpacts: nudges
                    .map((item) => item.impact)
                    .filter((impact) => Boolean(impact))
                    .map((impact) => ({
                    rank: impact.rank,
                    score: impact.score,
                    file: impact.file,
                    symbol: impact.symbol,
                    summary: impact.summary,
                    findingTypes: impact.findingTypes,
                    findingCount: impact.findingCount,
                    reachableProductionConsumerCount: impact.reachableProductionConsumerCount,
                    externalProductionConsumerCount: impact.externalProductionConsumerCount,
                    changedProductionConsumerCount: impact.changedProductionConsumerCount,
                    productionFiles: impact.productionFiles,
                    changedProductionFiles: impact.changedProductionFiles,
                    sensitiveConsumerCount: impact.sensitiveConsumerCount,
                    approvalRequiredConsumerCount: impact.approvalRequiredConsumerCount,
                    runtimeGovernanceConsumerCount: impact.runtimeGovernanceConsumerCount,
                    highFanout: impact.highFanout,
                    architectureRelevant: impact.architectureRelevant,
                    reasonCodes: impact.reasonCodes,
                })),
                topFindings: nudges.map((item) => ({
                    nudgeKey: item.nudgeKey,
                    severity: item.severity,
                    consequenceClass: item.consequenceClass,
                    operatorAction: item.operatorAction,
                    reviewFocus: item.reviewFocus,
                    findingType: item.finding.findingType,
                    file: item.finding.file,
                    symbol: item.finding.symbol,
                    externalConsumerCount: item.finding.externalConsumerCount,
                    externalConsumerFiles: item.finding.externalConsumerFiles,
                    consumerSummary: item.finding.consumerSummary,
                    reasonCodes: item.finding.reasonCodes,
                })),
                provenance: nudge.provenance,
                killSwitch: 'NEURCODE_DISABLE_CONSEQUENCE_NUDGES=1',
            },
        });
        const refreshed = (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId);
        if (refreshed)
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, refreshed);
        return nudge;
    }
    catch (error) {
        diagnostic(`consequence nudge skipped: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
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
function stringFromUnknownPath(value) {
    if (typeof value === 'string' && value.trim())
        return value.trim();
    if (!value || typeof value !== 'object')
        return null;
    const record = value;
    for (const key of ['path', 'file_path', 'filePath', 'uri', 'fileUri', 'fsPath']) {
        const candidate = record[key];
        if (typeof candidate === 'string' && candidate.trim())
            return candidate.trim();
    }
    return null;
}
function hookFilePathCandidates(hookInput) {
    const toolInput = hookInput['tool_input'] ??
        hookInput['toolInput'] ??
        {};
    const candidates = [];
    for (const key of ['path', 'file_path', 'filePath', 'uri', 'fileUri', 'fsPath', 'targetFile', 'target_file']) {
        const direct = stringFromUnknownPath(toolInput[key]) || stringFromUnknownPath(hookInput[key]);
        if (direct)
            candidates.push(direct);
    }
    const files = toolInput['files'] ?? hookInput['files'];
    if (Array.isArray(files)) {
        for (const file of files) {
            const candidate = stringFromUnknownPath(file);
            if (candidate)
                candidates.push(candidate);
        }
    }
    return Array.from(new Set(candidates));
}
function runtimeMode(session) {
    return session.contract.runtimeMode === 'strict' ||
        session.contract.runtimeMode === 'paused' ||
        session.contract.runtimeMode === 'advisory'
        ? session.contract.runtimeMode
        : 'strict';
}
function blockContext(input) {
    const isApproval = input.blockType === 'approval_required_boundary';
    const isScope = input.blockType === 'scope_violation_or_task_expansion';
    return {
        schemaVersion: 'neurcode.runtime-block.v1',
        blockType: input.blockType,
        filePath: input.filePath || null,
        message: input.message || null,
        runtimeMode: input.runtimeMode || null,
        operatorActionKind: isApproval
            ? 'exact_path_approval'
            : isScope
                ? 'scope_amendment'
                : input.blockType === 'profile_or_runtime_health_block'
                    ? 'runtime_health_recovery'
                    : 'split_tool_call',
        operatorActionLabel: isApproval
            ? 'Approve exact path / Deny'
            : isScope
                ? 'Approve task expansion / Amend scope / Deny'
                : input.blockType === 'profile_or_runtime_health_block'
                    ? 'Refresh or restart runtime'
                    : 'Split into one file per tool call',
        suggestedApprovalPath: isApproval ? input.suggestedApprovalPath || input.filePath || null : null,
        owners: input.owners || [],
        proposalId: input.proposalId || null,
        nextAction: input.nextAction || (isApproval
            ? 'Approve only the exact path for this session, or deny the write.'
            : isScope
                ? 'Accept the pending scope amendment or re-plan locally, then retry the write.'
                : input.blockType === 'profile_or_runtime_health_block'
                    ? 'Refresh the governance profile or restart the active governed session.'
                    : 'Retry as separate single-file edits so each path can be governed.'),
    };
}
const NO_ACTIVE_SESSION_SCOPE_SENTINEL = '__neurcode_no_active_session_scope__';
function evaluateNoActiveSessionWrite(repoRoot, filePath) {
    const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot).profile;
    const result = (0, governance_runtime_1.checkFileBoundary)({
        filePath,
        allowedGlobs: [NO_ACTIVE_SESSION_SCOPE_SENTINEL],
        ownershipRules: profile.ownershipBoundaries,
        sensitiveGlobs: profile.sensitiveBoundaries.map((boundary) => boundary.glob),
        approvalRequiredGlobs: profile.approvalRequiredPaths,
        approvedPaths: [],
        approvalGrants: [],
        scopeMode: 'explicit',
        localMode: 'strict',
    });
    const protectedPath = result.isApprovalRequired || result.isSensitive || result.owners.length > 0;
    const ownerNote = result.owners.length ? ` Owners: ${result.owners.join(', ')}.` : '';
    const message = protectedPath
        ? `⏸ Neurcode: no active governed session is running, so protected path ${filePath} cannot be checked or approved safely.${ownerNote} Start a governed session with \`neurcode session-hook start\`/agent activation, or run \`neurcode doctor --runtime\` for recovery before retrying.`
        : `No active governed session at ${repoRoot}; ${filePath} is not a detected protected path and is allowed advisory-only.`;
    return {
        block: protectedPath,
        filePath,
        result,
        message,
    };
}
function blockTypeFromEvent(event) {
    const detail = event.detail || {};
    const context = detail.blockContext;
    if (context && typeof context === 'object') {
        const value = context.blockType;
        if (value === 'approval_required_boundary' ||
            value === 'scope_violation_or_task_expansion' ||
            value === 'profile_or_runtime_health_block' ||
            value === 'multi_file_or_tool_shape_block') {
            return value;
        }
    }
    if (detail.approvalContext)
        return 'approval_required_boundary';
    if (detail.profileFreshness)
        return 'profile_or_runtime_health_block';
    if (detail.reason === 'multi_file_tool_call_requires_split')
        return 'multi_file_or_tool_shape_block';
    return 'scope_violation_or_task_expansion';
}
function latestUnresolvedActionableBlock(session) {
    for (let i = session.events.length - 1; i >= 0; i -= 1) {
        const event = session.events[i];
        if (event.type === 'check_ok' || event.type === 'check_warn' || event.type === 'plan_amended') {
            return null;
        }
        if (event.type !== 'check_block')
            continue;
        const detail = event.detail;
        const context = detail?.approvalContext;
        const blockedPath = event.filePath || context?.blockedPath || context?.suggestedApprovalPath;
        if (!blockedPath)
            continue;
        const blockType = blockTypeFromEvent(event);
        if (blockType !== 'approval_required_boundary') {
            return {
                filePath: blockedPath,
                blockType,
                suggestedApprovalPath: detail?.blockContext?.suggestedApprovalPath || null,
                proposalId: detail?.blockContext?.proposalId || null,
                message: event.message || null,
            };
        }
        const verdict = (0, governance_runtime_1.checkFileBoundary)({
            filePath: blockedPath,
            allowedGlobs: session.contract.allowedGlobs,
            ownershipRules: session.contract.ownershipRules,
            sensitiveGlobs: session.contract.sensitiveGlobs,
            approvalRequiredGlobs: session.contract.approvalRequiredGlobs,
            approvedPaths: session.contract.approvedPaths,
            approvalGrants: session.contract.approvalGrants,
            scopeMode: session.contract.scopeMode,
            localMode: runtimeMode(session),
        });
        if (verdict.verdict === 'block' && verdict.approvalContext) {
            return {
                filePath: blockedPath,
                blockType: 'approval_required_boundary',
                suggestedApprovalPath: verdict.approvalContext.suggestedApprovalPath || context?.suggestedApprovalPath || blockedPath,
                message: event.message || null,
            };
        }
        return null;
    }
    return null;
}
function shouldKeepSessionActiveForPendingApproval(session, pendingApproval) {
    if (!pendingApproval)
        return false;
    if (pendingApproval.blockType && pendingApproval.blockType !== 'approval_required_boundary') {
        return true;
    }
    const hasRecordedApproval = session.contract.approvedPaths.length > 0 ||
        (session.contract.approvalGrants ?? []).some((grant) => !grant.revokedAt) ||
        session.events.some((event) => event.type === 'approval_decision' && event.decision === 'approved');
    return !hasRecordedApproval;
}
async function recordBashCheck(repoRoot, session, args) {
    (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, {
        type: args.verdict === 'ok' ? 'check_ok' : args.verdict === 'warn' ? 'check_warn' : 'check_block',
        ts: new Date().toISOString(),
        filePath: args.filePath,
        verdict: args.verdict,
        message: args.message,
        detail: {
            ...(args.approvalContext ? { approvalContext: args.approvalContext } : {}),
            ...(args.blockContext ? { blockContext: args.blockContext } : {}),
            toolName: 'Bash',
            bash: {
                operation: args.operation,
                targetPaths: args.targetPaths,
                commandFingerprint: args.commandFingerprint,
            },
            ...(args.boundaryVerdict ? { boundaryVerdict: args.boundaryVerdict } : {}),
        },
    });
    const refreshed = (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId);
    if (refreshed)
        await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, refreshed);
}
async function handleBashCheck(repoRoot, session, command) {
    const analysis = (0, bash_command_analysis_1.analyzeBashCommand)(command);
    if (analysis.operatorDiagnostic) {
        diagnostic(`Bash ${analysis.operation} classified as operator diagnostic; not recorded as governed edit evidence`);
        process.exit(0);
        return;
    }
    if (!analysis.mutates) {
        process.exit(0);
        return;
    }
    if (analysis.targetPaths.length === 0) {
        diagnostic(`Bash ${analysis.operation} target extraction was inconclusive; not recorded as governed edit evidence`);
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
                reason: `⚠️ Neurcode: Bash ${analysis.operation} target extraction was inconclusive; allowed without governed edit evidence.`,
            },
        }) + '\n');
        process.exit(0);
        return;
    }
    const targetPaths = analysis.targetPaths.map((path) => normalizeHookFilePathForRepo(path, repoRoot));
    const results = targetPaths.map((filePath) => ({
        filePath,
        result: (0, governance_runtime_1.checkFileBoundary)({
            filePath,
            allowedGlobs: session.contract.allowedGlobs,
            ownershipRules: session.contract.ownershipRules,
            sensitiveGlobs: session.contract.sensitiveGlobs,
            approvalRequiredGlobs: session.contract.approvalRequiredGlobs,
            approvedPaths: session.contract.approvedPaths,
            approvalGrants: session.contract.approvalGrants,
            scopeMode: session.contract.scopeMode,
            localMode: runtimeMode(session),
        }),
    }));
    for (const { filePath, result } of results) {
        await recordBashCheck(repoRoot, session, {
            filePath,
            verdict: result.verdict,
            message: result.message,
            operation: analysis.operation,
            targetPaths,
            commandFingerprint: analysis.commandFingerprint,
            boundaryVerdict: result.verdict,
            approvalContext: result.approvalContext,
            blockContext: result.blockType
                ? blockContext({
                    blockType: result.blockType,
                    filePath,
                    message: result.message,
                    suggestedApprovalPath: result.approvalContext?.suggestedApprovalPath,
                    owners: result.owners,
                    runtimeMode: runtimeMode(session),
                })
                : undefined,
        });
    }
    const blocking = results.find(({ result }) => result.verdict === 'block');
    if (blocking) {
        const message = `⏸ Neurcode: Bash ${analysis.operation} targets ${blocking.filePath}. ` +
            blocking.result.message.replace(/^⏸ Neurcode:\s*/, '');
        denyPreToolUse(message, {
            ...(blocking.result.approvalContext ? { approvalContext: blocking.result.approvalContext } : {}),
            ...(blocking.result.blockType
                ? {
                    blockContext: blockContext({
                        blockType: blocking.result.blockType,
                        filePath: blocking.filePath,
                        message,
                        suggestedApprovalPath: blocking.result.approvalContext?.suggestedApprovalPath,
                        owners: blocking.result.owners,
                        runtimeMode: runtimeMode(session),
                    }),
                }
                : {}),
        });
    }
    const warning = results.find(({ result }) => result.verdict === 'warn');
    if (warning) {
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
                reason: `⚠️ Neurcode: Bash ${analysis.operation} is allowed with warning for ${warning.filePath}.`,
            },
        }) + '\n');
    }
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
async function maybeContinueActiveClaudeSession(repoRoot, rawPrompt, intentSelection, profileFreshness) {
    const activeSession = (0, governance_runtime_1.loadActiveSession)(repoRoot);
    if (!activeSession || activeSession.status !== 'active')
        return null;
    const decision = (0, intent_continuity_1.classifyIntentContinuity)(rawPrompt, intentSelection, activeSession);
    if (decision.action === 'start_new_session')
        return null;
    if (decision.action === 'record_operator_note') {
        (0, governance_runtime_1.appendEvent)(repoRoot, activeSession.sessionId, {
            type: 'user_decision',
            ts: new Date().toISOString(),
            decision: 'operator_prompt_recorded',
            message: 'Human follow-up prompt recorded without changing the active governed plan.',
            detail: {
                intentContinuity: decision.detail,
                reason: decision.reason,
                confidence: decision.confidence,
            },
        });
        const refreshed = (0, governance_runtime_1.loadSession)(repoRoot, activeSession.sessionId) || activeSession;
        await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, refreshed, { profileFreshness });
        return refreshed;
    }
    if (!decision.amendment)
        return activeSession;
    const amended = (0, governance_runtime_1.amendAgentPlan)(repoRoot, {
        ...decision.amendment,
        amendedAt: new Date().toISOString(),
    });
    let session = (0, governance_runtime_1.loadSession)(repoRoot, amended.sessionId) || activeSession;
    (0, governance_runtime_1.appendEvent)(repoRoot, amended.sessionId, {
        type: 'user_decision',
        ts: new Date().toISOString(),
        decision: 'intent_continuity_amended',
        message: amended.status === 'pending'
            ? 'Human follow-up prompt proposed a plan amendment that is pending decision.'
            : `Human follow-up prompt updated active plan revision ${amended.previousRevision} -> ${amended.revision}.`,
        detail: {
            intentContinuity: decision.detail,
            reason: decision.reason,
            confidence: decision.confidence,
            planAmendment: {
                status: amended.status,
                previousRevision: amended.previousRevision,
                revision: amended.revision,
                action: amended.action,
                risk: amended.risk,
                proposalId: amended.proposal?.proposalId,
            },
        },
    });
    session = (0, governance_runtime_1.loadSession)(repoRoot, amended.sessionId) || session;
    await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session, { profileFreshness });
    diagnostic(amended.status === 'pending'
        ? `intent continuity proposed plan amendment ${amended.proposal?.proposalId || amended.eventId}`
        : `intent continuity updated active plan revision ${amended.previousRevision} -> ${amended.revision}`);
    return session;
}
// ── Hook handlers ─────────────────────────────────────────────────────────────
/** UserPromptSubmit — create a new governance session from the prompt. */
async function handleStart(cmdCwd) {
    const hookInput = readHookInput();
    const effectiveCwd = cwdFromHookInput(hookInput, cmdCwd);
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(effectiveCwd);
    (0, hook_heartbeat_1.recordHookHeartbeat)({ repoRoot, eventType: 'start' });
    const rawGoal = hookInput['prompt'] ||
        hookInput['user_prompt'] ||
        '';
    const intentSelection = (0, governed_intent_1.selectGovernedIntent)(rawGoal);
    const goal = intentSelection.goal;
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
        for (const warning of intentSelection.warnings) {
            diagnostic(warning);
        }
        const reused = await maybeReuseLaunchedClaudeSession(repoRoot, rawGoal.trim(), hookInput, profileFreshness);
        if (reused) {
            process.stdout.write(JSON.stringify({
                message: `🤝 Neurcode session ${reused.sessionId} · launcher handshake complete`,
            }) + '\n');
            return;
        }
        const continued = await maybeContinueActiveClaudeSession(repoRoot, rawGoal.trim(), intentSelection, profileFreshness);
        if (continued) {
            process.stdout.write(JSON.stringify({
                message: `🔁 Neurcode session ${continued.sessionId} · continuing active governed intent · ` +
                    `plan revision ${(0, governance_runtime_1.activeAgentPlanRevision)(continued.contract)}`,
            }) + '\n');
            return;
        }
        if (!(0, governed_intent_1.shouldStartGovernedSession)(intentSelection)) {
            process.stdout.write(JSON.stringify({
                message: 'Neurcode did not start a governed session for this operator/status prompt. ' +
                    'Use `Demo goal:` or `Governed goal:` when you want a new governed implementation session.',
            }) + '\n');
            return;
        }
        const profile = profileResult.profile;
        let session = (0, governance_runtime_1.createSession)(repoRoot, profile, goal.trim());
        const plannedAtStart = maybeCaptureAgentPlan(repoRoot, session, hookInput);
        if (plannedAtStart)
            session = plannedAtStart;
        if (intentSelection.source === 'labeled_goal' || intentSelection.operatorPrompt) {
            (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, {
                type: 'user_decision',
                ts: new Date().toISOString(),
                decision: 'governed_intent_selected',
                message: intentSelection.source === 'labeled_goal'
                    ? 'Governed intent selected from labeled prompt section.'
                    : 'Operator-style prompt used directly as governed intent.',
                detail: {
                    source: intentSelection.source,
                    operatorPrompt: intentSelection.operatorPrompt,
                    warnings: intentSelection.warnings,
                },
            });
            const refreshed = (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId);
            if (refreshed)
                session = refreshed;
        }
        // Goal-quality warning (lightweight; does not redesign the parser): a very long or
        // path-heavy goal tends to produce broad/noisy scope where everything is
        // approval-required. Counts only — no goal/prompt text is echoed (source-free).
        const trimmedGoal = goal.trim();
        const goalLength = trimmedGoal.length;
        const goalLines = trimmedGoal.split('\n').length;
        const broadApprovalScope = session.contract.approvalRequiredGlobs.includes('**');
        if (broadApprovalScope || goalLength > 600 || goalLines > 6) {
            diagnostic(`⚠ goal is verbose (${goalLength} chars, ${goalLines} lines)` +
                (broadApprovalScope ? ' and produced broad scope (approvalRequiredGlobs includes "**" — every file needs approval)' : '') +
                '. For cleaner governance and demos, start the session with a short, crisp goal.');
        }
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
    (0, hook_heartbeat_1.recordHookHeartbeat)({ repoRoot, eventType: 'check' });
    const requestedSessionId = sessionIdFromHookInput(hookInput);
    const toolName = hookInput['tool_name'] ||
        hookInput['toolName'] ||
        '';
    const toolInput = hookInput['tool_input'] ??
        hookInput['toolInput'] ??
        {};
    const resolution = resolveSessionForHook(repoRoot, requestedSessionId);
    const activeSession = resolution.session;
    if (!activeSession) {
        const rawPaths = hookFilePathCandidates(hookInput);
        const bashLike = /^(bash|shell|runCommand|run_command|runInTerminal|run_in_terminal|terminal)$/i.test(toolName);
        const bashAnalysis = bashLike
            ? (0, bash_command_analysis_1.analyzeBashCommand)(toolInput['command'] ||
                toolInput['cmd'] ||
                hookInput['command'] ||
                '')
            : null;
        const candidatePaths = bashAnalysis?.mutates
            ? bashAnalysis.targetPaths
            : rawPaths;
        const normalizedPaths = Array.from(new Set(candidatePaths.map((path) => normalizeHookFilePathForRepo(path, repoRoot))));
        for (const filePath of normalizedPaths) {
            try {
                const decision = evaluateNoActiveSessionWrite(repoRoot, filePath);
                if (decision.block) {
                    denyPreToolUse(decision.message, {
                        ...(decision.result.approvalContext ? { approvalContext: decision.result.approvalContext } : {}),
                        blockContext: blockContext({
                            blockType: 'profile_or_runtime_health_block',
                            filePath,
                            message: decision.message,
                            suggestedApprovalPath: decision.result.approvalContext?.suggestedApprovalPath,
                            owners: decision.result.owners,
                            runtimeMode: 'strict',
                            nextAction: 'Start or resume a governed Neurcode session, then retry this protected path.',
                        }),
                    });
                }
            }
            catch (error) {
                diagnostic(`no-active-session protected-path check skipped: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const targetNote = normalizedPaths.length > 0 ? ` for ${normalizedPaths.join(', ')}` : '';
        diagnostic(requestedSessionId
            ? `no active session ${requestedSessionId} at ${repoRoot} — edit allowed advisory-only${targetNote}`
            : `no active session at ${repoRoot} — edit allowed advisory-only${targetNote}`);
        process.exit(0);
        return;
    }
    if (resolution.usedActiveFallback && requestedSessionId) {
        diagnostic(`Claude session_id ${requestedSessionId} did not match a Neurcode session; using active session ${activeSession.sessionId}`);
    }
    let session = activeSession;
    try {
        const hasPriorBlock = session.events.some((event) => event.type === 'check_block');
        if (hasPriorBlock) {
            const pending = await (0, runtime_live_1.applyPendingRuntimeLiveApprovals)(repoRoot, session.sessionId);
            if (pending.applied > 0 || pending.revoked > 0 || pending.scopeAmended > 0 || pending.scopeDenied > 0) {
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
            if (pending.scopeAmended > 0) {
                diagnostic(`applied ${pending.scopeAmended} dashboard scope amendment${pending.scopeAmended === 1 ? '' : 's'}`);
            }
            if (pending.scopeDenied > 0) {
                diagnostic(`recorded ${pending.scopeDenied} denied dashboard scope amendment${pending.scopeDenied === 1 ? '' : 's'}`);
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
    if (/^(bash|shell|runCommand|run_command|runInTerminal|run_in_terminal|terminal)$/i.test(toolName)) {
        const command = toolInput['command'] ||
            toolInput['cmd'] ||
            hookInput['command'] ||
            '';
        await handleBashCheck(repoRoot, session, command);
        return;
    }
    const rawPaths = hookFilePathCandidates(hookInput);
    if (rawPaths.length > 1) {
        const message = `⏸ Neurcode: this ${toolName || 'tool'} call attempts to edit multiple files at once ` +
            `(${rawPaths.length} paths). Split the edit into one file per tool call so each path can be governed before write.`;
        try {
            (0, governance_runtime_1.appendEvent)(repoRoot, session.sessionId, {
                type: 'check_block',
                ts: new Date().toISOString(),
                filePath: rawPaths.map((path) => normalizeHookFilePathForRepo(path, repoRoot)).join(','),
                verdict: 'block',
                message,
                detail: {
                    blockContext: blockContext({
                        blockType: 'multi_file_or_tool_shape_block',
                        filePath: rawPaths.map((path) => normalizeHookFilePathForRepo(path, repoRoot)).join(','),
                        message,
                        runtimeMode: runtimeMode(session),
                    }),
                    reason: 'multi_file_tool_call_requires_split',
                    paths: rawPaths.map((path) => normalizeHookFilePathForRepo(path, repoRoot)),
                    toolName,
                },
            });
            const refreshed = (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId);
            if (refreshed)
                await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, refreshed);
        }
        catch {
            // Recording failure must not weaken the deny.
        }
        denyPreToolUse(message, {
            blockContext: blockContext({
                blockType: 'multi_file_or_tool_shape_block',
                filePath: rawPaths.map((path) => normalizeHookFilePathForRepo(path, repoRoot)).join(','),
                message,
                runtimeMode: runtimeMode(session),
            }),
            reason: 'multi_file_tool_call_requires_split',
            paths: rawPaths.map((path) => normalizeHookFilePathForRepo(path, repoRoot)),
        });
    }
    const rawPath = rawPaths[0] || '';
    if (!rawPath) {
        diagnostic('PreToolUse: no file path in hook input — edit allowed (cannot check)');
        process.exit(0);
        return;
    }
    // Normalise to a path relative to the repo root. Use realpath-aware
    // comparison so macOS /tmp -> /private/tmp and other repo symlinks do not
    // turn an in-repo edit into a bogus "tmp/repo/..." path.
    const filePath = normalizeHookFilePathForRepo(rawPath, repoRoot);
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
                    detail: {
                        profileFreshness,
                        blockContext: blockContext({
                            blockType: 'profile_or_runtime_health_block',
                            filePath,
                            message,
                            runtimeMode: runtimeMode(session),
                        }),
                    },
                });
                const refreshedSession = (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId);
                if (refreshedSession) {
                    await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, refreshedSession, { profileFreshness });
                }
            }
            catch {
                // Recording failure must not weaken the deny.
            }
            denyPreToolUse(message, {
                profileFreshness,
                blockContext: blockContext({
                    blockType: 'profile_or_runtime_health_block',
                    filePath,
                    message,
                    runtimeMode: runtimeMode(session),
                }),
            });
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
                    blockContext: blockContext({
                        blockType: 'profile_or_runtime_health_block',
                        filePath,
                        message,
                        runtimeMode: runtimeMode(session),
                    }),
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
        denyPreToolUse(message, {
            blockContext: blockContext({
                blockType: 'profile_or_runtime_health_block',
                filePath,
                message,
                runtimeMode: runtimeMode(session),
            }),
        });
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
            localMode: runtimeMode(session),
        });
    }
    catch (err) {
        diagnostic(`check failed: ${err instanceof Error ? err.message : String(err)} — edit allowed`);
        process.exit(0);
    }
    if (result.verdict === 'block' && result.isApprovalRequired && isPlanDeclaredTarget(session, filePath)) {
        const ownerNote = result.owners.length ? ` (owned by ${result.owners.join(', ')})` : '';
        result = {
            ...result,
            message: `⏸ Neurcode: ${filePath} is declared in your active plan but requires CODEOWNERS approval${ownerNote}. ` +
                'Approve the exact path before editing: neurcode_session_approve. ' +
                'See neurcode_session_obligations or .cursor/rules/neurcode-session-scope.mdc for the full list.',
        };
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
    let pendingScopeAmendmentProposalId = null;
    if (result.verdict === 'ok' && planCoherencePolicy.action === 'block' && runtimeMode(session) !== 'strict') {
        result = {
            ...result,
            verdict: 'warn',
            blockType: 'scope_violation_or_task_expansion',
            message: `⚠️ Neurcode: ${filePath} is not justified by the agent's stated plan. ` +
                `${planCoherencePolicy.reason} Proceeding in ${runtimeMode(session)} mode — recorded as task expansion evidence. ` +
                `Re-plan with neurcode_session_replan if this path should become part of the task.`,
        };
    }
    else if (result.verdict === 'ok' && planCoherencePolicy.action === 'block') {
        try {
            const amendment = (0, governance_runtime_1.amendAgentPlan)(repoRoot, {
                sessionId: session.sessionId,
                addExpectedFiles: [filePath],
                addSteps: [`Expand governed task scope to include ${filePath}`],
                reason: `scope expansion requested for ${filePath}`,
                source: 'unknown',
                proposedBy: 'agent',
                amendedAt: new Date().toISOString(),
            });
            pendingScopeAmendmentProposalId = amendment.proposal?.proposalId || amendment.eventId || null;
            const amendedSession = (0, governance_runtime_1.loadSession)(repoRoot, session.sessionId);
            if (amendedSession)
                session = amendedSession;
        }
        catch (error) {
            diagnostic(`scope amendment proposal could not be recorded: ${error instanceof Error ? error.message : String(error)}`);
        }
        result = {
            ...result,
            verdict: 'block',
            blockType: 'scope_violation_or_task_expansion',
            message: `⏸ Neurcode: ${filePath} is not justified by the agent's stated plan. ` +
                `${planCoherencePolicy.reason} Approve task expansion / amend scope, then retry this path. ` +
                `Use neurcode_session_replan_decide${pendingScopeAmendmentProposalId ? ` for ${pendingScopeAmendmentProposalId}` : ''} or \`neurcode session replan --add-file ${filePath}\`.`,
        };
    }
    else if (result.verdict === 'ok' && architectureObligationFeedback.action === 'block') {
        result = {
            ...result,
            verdict: 'block',
            blockType: 'scope_violation_or_task_expansion',
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
                ...(result.blockType
                    ? {
                        blockContext: blockContext({
                            blockType: result.blockType,
                            filePath,
                            message: result.message,
                            suggestedApprovalPath: result.approvalContext?.suggestedApprovalPath,
                            owners: result.owners,
                            proposalId: pendingScopeAmendmentProposalId,
                            runtimeMode: runtimeMode(session),
                        }),
                    }
                    : {}),
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
    const consequenceNudge = result.verdict === 'block'
        ? null
        : await maybeRecordConsequenceNudge(repoRoot, session);
    // ── Emit hook response ────────────────────────────────────────────────────
    if (result.verdict === 'block') {
        // Include machine-readable approvalContext when the block is approval-required,
        // so the agent can surface a structured approval request to the human.
        denyPreToolUse(result.message, {
            ...(result.approvalContext ? { approvalContext: result.approvalContext } : {}),
            ...(result.blockType
                ? {
                    blockContext: blockContext({
                        blockType: result.blockType,
                        filePath,
                        message: result.message,
                        suggestedApprovalPath: result.approvalContext?.suggestedApprovalPath,
                        owners: result.owners,
                        proposalId: pendingScopeAmendmentProposalId,
                        runtimeMode: runtimeMode(session),
                    }),
                }
                : {}),
        });
    }
    if (result.verdict === 'warn') {
        const reason = consequenceNudge
            ? `${result.message}\n\n${consequenceNudge.headline}`
            : result.message;
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
                reason,
            },
        }) + '\n');
        process.exit(0);
    }
    if (consequenceNudge) {
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
                reason: consequenceNudge.headline,
                consequenceNudge: {
                    nudgeVersion: consequenceNudge.nudgeVersion,
                    nudgeKey: consequenceNudge.nudgeKey,
                    severity: consequenceNudge.severity,
                    consequenceClass: consequenceNudge.consequenceClass,
                    operatorAction: consequenceNudge.operatorAction,
                    reviewFocus: consequenceNudge.reviewFocus,
                    artifactHash: consequenceNudge.artifactHash,
                    impact: consequenceNudge.impact ? {
                        rank: consequenceNudge.impact.rank,
                        score: consequenceNudge.impact.score,
                        file: consequenceNudge.impact.file,
                        symbol: consequenceNudge.impact.symbol,
                        summary: consequenceNudge.impact.summary,
                        findingTypes: consequenceNudge.impact.findingTypes,
                        findingCount: consequenceNudge.impact.findingCount,
                        reachableProductionConsumerCount: consequenceNudge.impact.reachableProductionConsumerCount,
                        externalProductionConsumerCount: consequenceNudge.impact.externalProductionConsumerCount,
                        changedProductionConsumerCount: consequenceNudge.impact.changedProductionConsumerCount,
                        productionFiles: consequenceNudge.impact.productionFiles,
                        changedProductionFiles: consequenceNudge.impact.changedProductionFiles,
                        sensitiveConsumerCount: consequenceNudge.impact.sensitiveConsumerCount,
                        approvalRequiredConsumerCount: consequenceNudge.impact.approvalRequiredConsumerCount,
                        runtimeGovernanceConsumerCount: consequenceNudge.impact.runtimeGovernanceConsumerCount,
                        highFanout: consequenceNudge.impact.highFanout,
                        architectureRelevant: consequenceNudge.impact.architectureRelevant,
                        reasonCodes: consequenceNudge.impact.reasonCodes,
                    } : null,
                    finding: {
                        findingType: consequenceNudge.finding.findingType,
                        file: consequenceNudge.finding.file,
                        symbol: consequenceNudge.finding.symbol,
                        externalConsumerCount: consequenceNudge.finding.externalConsumerCount,
                        externalConsumerFiles: consequenceNudge.finding.externalConsumerFiles,
                        consumerSummary: consequenceNudge.finding.consumerSummary,
                        reasonCodes: consequenceNudge.finding.reasonCodes,
                    },
                    surfacedFindingLimit: 3,
                    topFindings: consequenceNudge.surfacedFindings.map((finding) => ({
                        findingType: finding.findingType,
                        file: finding.file,
                        symbol: finding.symbol,
                        externalConsumerCount: finding.externalConsumerCount,
                        externalConsumerFiles: finding.externalConsumerFiles,
                        consumerSummary: finding.consumerSummary,
                        reasonCodes: finding.reasonCodes,
                    })),
                    surfacedImpactLimit: 3,
                    topImpacts: consequenceNudge.surfacedImpacts.map((impact) => ({
                        rank: impact.rank,
                        score: impact.score,
                        file: impact.file,
                        symbol: impact.symbol,
                        summary: impact.summary,
                        findingTypes: impact.findingTypes,
                        findingCount: impact.findingCount,
                        reachableProductionConsumerCount: impact.reachableProductionConsumerCount,
                        externalProductionConsumerCount: impact.externalProductionConsumerCount,
                        changedProductionConsumerCount: impact.changedProductionConsumerCount,
                        productionFiles: impact.productionFiles,
                        changedProductionFiles: impact.changedProductionFiles,
                        sensitiveConsumerCount: impact.sensitiveConsumerCount,
                        approvalRequiredConsumerCount: impact.approvalRequiredConsumerCount,
                        runtimeGovernanceConsumerCount: impact.runtimeGovernanceConsumerCount,
                        highFanout: impact.highFanout,
                        architectureRelevant: impact.architectureRelevant,
                        reasonCodes: impact.reasonCodes,
                    })),
                },
            },
        }) + '\n');
        process.exit(0);
    }
    // ok or warn-allowed → exit 0
    process.exit(0);
}
/** Stop — finalize the active session and emit the replay record. */
async function handleFinish(cmdCwd) {
    const hookInput = readHookInput();
    const effectiveCwd = cwdFromHookInput(hookInput, cmdCwd);
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(effectiveCwd);
    (0, hook_heartbeat_1.recordHookHeartbeat)({ repoRoot, eventType: 'finish' });
    const requestedSessionId = sessionIdFromHookInput(hookInput);
    const resolution = resolveSessionForHook(repoRoot, requestedSessionId);
    const session = resolution.session;
    if (!session || session.status !== 'active')
        return;
    if (resolution.usedActiveFallback && requestedSessionId) {
        diagnostic(`Claude session_id ${requestedSessionId} did not match a Neurcode session; finishing active session ${session.sessionId}`);
    }
    try {
        const pendingActionableBlock = latestUnresolvedActionableBlock(session);
        if (shouldKeepSessionActiveForPendingApproval(session, pendingActionableBlock)) {
            const actionLabel = pendingActionableBlock.blockType === 'approval_required_boundary'
                ? `exact approval of ${pendingActionableBlock.suggestedApprovalPath || pendingActionableBlock.filePath}`
                : pendingActionableBlock.blockType === 'scope_violation_or_task_expansion'
                    ? `scope amendment for ${pendingActionableBlock.filePath}`
                    : pendingActionableBlock.blockType === 'profile_or_runtime_health_block'
                        ? 'runtime/profile recovery'
                        : 'a split single-file retry';
            process.stdout.write(JSON.stringify({
                message: `⏸ Neurcode session ${session.sessionId} remains active; waiting for operator action: ${actionLabel}.`,
            }) + '\n');
            await (0, runtime_live_1.publishRuntimeLiveStatus)(repoRoot, session);
            try {
                const sync = (0, runtime_connection_1.triggerRuntimeAutoSync)(repoRoot);
                if (sync.started)
                    diagnostic('runtime evidence auto-sync queued');
            }
            catch (syncError) {
                diagnostic(`auto-sync queue failed: ${syncError instanceof Error ? syncError.message : String(syncError)}`);
            }
            return;
        }
        const finished = (0, governance_runtime_1.finishSession)(repoRoot, session.sessionId, pendingActionableBlock
            ? {
                reason: pendingActionableBlock.blockType === 'approval_required_boundary'
                    ? 'finished_with_unresolved_approval_blocks'
                    : 'finished_with_unresolved_actionable_blocks',
                unresolvedActionableBlocks: [pendingActionableBlock],
                ...(pendingActionableBlock.blockType === 'approval_required_boundary'
                    ? {
                        unresolvedApprovalBlocks: [{
                                filePath: pendingActionableBlock.filePath,
                                suggestedApprovalPath: pendingActionableBlock.suggestedApprovalPath || pendingActionableBlock.filePath,
                            }],
                    }
                    : {}),
            }
            : undefined);
        if (!finished)
            return;
        const supervisorStop = (0, agent_guard_supervisor_1.stopSupervisorOnSessionCompletion)(repoRoot);
        if (supervisorStop.signaled) {
            diagnostic(`agent guard supervisor stop requested (pid ${supervisorStop.state?.pid ?? 'unknown'})`);
        }
        const blockCount = finished.events.filter((e) => e.type === 'check_block').length;
        const warnCount = finished.events.filter((e) => e.type === 'check_warn').length;
        const unresolvedLine = pendingActionableBlock
            ? `   Unresolved: 1 ${pendingActionableBlock.blockType} left recorded (${pendingActionableBlock.suggestedApprovalPath || pendingActionableBlock.filePath})`
            : null;
        const summary = [
            pendingActionableBlock
                ? `✅ Neurcode session ${finished.sessionId} complete with unresolved block evidence`
                : `✅ Neurcode session ${finished.sessionId} complete`,
            `   Scope mode: ${finished.contract.scopeMode}`,
            `   Boundaries: ${blockCount} block${blockCount !== 1 ? 's' : ''}, ${warnCount} warning${warnCount !== 1 ? 's' : ''}`,
            ...(unresolvedLine ? [unresolvedLine] : []),
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