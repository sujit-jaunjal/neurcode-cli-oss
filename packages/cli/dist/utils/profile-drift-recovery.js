"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROFILE_DRIFT_RECOVERY_COMMAND = exports.PROFILE_DRIFT_RECOVERY_REASON = void 0;
exports.pendingProfileDriftDecisions = pendingProfileDriftDecisions;
exports.recoverProfileDriftForSessionStart = recoverProfileDriftForSessionStart;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
exports.PROFILE_DRIFT_RECOVERY_REASON = 'active_session_profile_changed';
exports.PROFILE_DRIFT_RECOVERY_COMMAND = 'neurcode session reset-stale --force';
const LIFECYCLE_LOCK_TIMEOUT_MS = 2_000;
const LIFECYCLE_LOCK_STALE_MS = 30_000;
const LIFECYCLE_LOCK_WAIT_MS = 10;
const LIFECYCLE_LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));
function withLifecycleLock(repoRoot, operation) {
    const lockPath = (0, node_path_1.join)(repoRoot, '.neurcode', 'session-lifecycle.lock');
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(repoRoot, '.neurcode'), { recursive: true });
    const deadline = Date.now() + LIFECYCLE_LOCK_TIMEOUT_MS;
    while (true) {
        try {
            (0, node_fs_1.mkdirSync)(lockPath);
            break;
        }
        catch (error) {
            const code = error && typeof error === 'object' && 'code' in error
                ? String(error.code)
                : '';
            if (code !== 'EEXIST')
                throw error;
            try {
                if (Date.now() - (0, node_fs_1.statSync)(lockPath).mtimeMs > LIFECYCLE_LOCK_STALE_MS) {
                    (0, node_fs_1.rmSync)(lockPath, { recursive: true, force: true });
                    continue;
                }
            }
            catch {
                continue;
            }
            if (Date.now() >= deadline) {
                throw new Error('Timed out waiting to recover the active Neurcode session lifecycle.');
            }
            Atomics.wait(LIFECYCLE_LOCK_SLEEP, 0, 0, LIFECYCLE_LOCK_WAIT_MS);
        }
    }
    try {
        return operation();
    }
    finally {
        (0, node_fs_1.rmSync)(lockPath, { recursive: true, force: true });
    }
}
function blockTypeFromEvent(session, eventIndex) {
    const event = session.events[eventIndex];
    const raw = event?.detail?.['blockContext'];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const value = raw['blockType'];
        if (typeof value === 'string')
            return value;
    }
    if (event?.detail?.['approvalContext'])
        return 'approval_required_boundary';
    return null;
}
function approvalPathFromEvent(session, eventIndex) {
    const event = session.events[eventIndex];
    if (!event || event.type !== 'check_block')
        return null;
    const raw = event.detail?.['approvalContext'];
    const context = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw
        : null;
    const filePath = event.filePath ||
        (typeof context?.['blockedPath'] === 'string' ? context['blockedPath'] : '') ||
        (typeof context?.['suggestedApprovalPath'] === 'string' ? context['suggestedApprovalPath'] : '');
    if (!filePath)
        return null;
    const suggestedApprovalPath = typeof context?.['suggestedApprovalPath'] === 'string'
        ? context['suggestedApprovalPath']
        : filePath;
    return { filePath, suggestedApprovalPath };
}
function pendingProfileDriftDecisions(session) {
    const decisions = [];
    const seenApprovalPaths = new Set();
    for (let index = session.events.length - 1; index >= 0; index -= 1) {
        if (blockTypeFromEvent(session, index) !== 'approval_required_boundary')
            continue;
        const target = approvalPathFromEvent(session, index);
        if (!target || seenApprovalPaths.has(target.suggestedApprovalPath))
            continue;
        seenApprovalPaths.add(target.suggestedApprovalPath);
        const verdict = (0, governance_runtime_1.checkFileBoundary)({
            filePath: target.filePath,
            allowedGlobs: session.contract.allowedGlobs,
            ownershipRules: session.contract.ownershipRules,
            sensitiveGlobs: session.contract.sensitiveGlobs,
            approvalRequiredGlobs: session.contract.approvalRequiredGlobs,
            approvedPaths: session.contract.approvedPaths,
            approvalGrants: session.contract.approvalGrants,
            scopeMode: session.contract.scopeMode,
            localMode: session.contract.runtimeMode,
        });
        if (verdict.verdict === 'block' && verdict.isApprovalRequired) {
            decisions.push({
                kind: 'exact_approval',
                filePath: target.filePath,
                suggestedApprovalPath: verdict.approvalContext?.suggestedApprovalPath || target.suggestedApprovalPath,
                blockType: 'approval_required_boundary',
            });
        }
    }
    for (const proposal of session.contract.planAmendmentProposals ?? []) {
        if (proposal.status !== 'pending')
            continue;
        decisions.push({
            kind: 'plan_amendment',
            proposalId: proposal.proposalId,
            blockType: 'scope_violation_or_task_expansion',
        });
    }
    const latestResolutionIndex = session.events.reduce((latest, event, index) => {
        return event.type === 'plan_amended' ||
            event.type === 'plan_amendment_decision' ||
            event.type === 'obligation_waiver_decision'
            ? index
            : latest;
    }, -1);
    for (let index = session.events.length - 1; index > latestResolutionIndex; index -= 1) {
        const event = session.events[index];
        if (event.type !== 'check_block')
            continue;
        const blockType = blockTypeFromEvent(session, index);
        if (blockType !== 'scope_violation_or_task_expansion')
            continue;
        const proposalId = typeof event.detail?.['blockContext'] === 'object'
            ? String((event.detail?.['blockContext'])['proposalId'] || '')
            : '';
        if (proposalId && decisions.some((decision) => decision.proposalId === proposalId))
            continue;
        decisions.push({
            kind: 'operator_decision',
            filePath: event.filePath,
            proposalId: proposalId || undefined,
            blockType,
        });
        break;
    }
    return decisions;
}
function recoveryEventAlreadyRecorded(session, decision, currentProfileHash) {
    return session.events.some((event) => event.type === 'user_decision' &&
        event.decision === decision &&
        event.detail?.['currentProfileHash'] === currentProfileHash);
}
function recoverProfileDriftForSessionStart(input) {
    return withLifecycleLock(input.repoRoot, () => {
        const active = (0, governance_runtime_1.loadActiveSession)(input.repoRoot);
        if (!active || active.status !== 'active')
            return { status: 'no_active_session' };
        if (active.profileHash === input.currentProfile.profileHash) {
            return { status: 'compatible', session: active };
        }
        const pendingDecisions = pendingProfileDriftDecisions(active);
        if (pendingDecisions.length > 0) {
            if (!recoveryEventAlreadyRecorded(active, 'profile_drift_recovery_blocked', input.currentProfile.profileHash)) {
                (0, governance_runtime_1.appendEvent)(input.repoRoot, active.sessionId, {
                    type: 'user_decision',
                    ts: new Date().toISOString(),
                    decision: 'profile_drift_recovery_blocked',
                    message: 'Profile drift recovery requires an explicit operator decision.',
                    detail: {
                        reason: exports.PROFILE_DRIFT_RECOVERY_REASON,
                        sessionProfileHash: active.profileHash,
                        currentProfileHash: input.currentProfile.profileHash,
                        pendingDecisions,
                        recoveryCommand: exports.PROFILE_DRIFT_RECOVERY_COMMAND,
                        forceConsequence: 'abandons unresolved operator state',
                    },
                });
            }
            return {
                status: 'blocked',
                reason: exports.PROFILE_DRIFT_RECOVERY_REASON,
                session: (0, governance_runtime_1.loadSession)(input.repoRoot, active.sessionId) || active,
                sessionProfileHash: active.profileHash,
                currentProfileHash: input.currentProfile.profileHash,
                pendingDecisions,
                recoveryCommand: exports.PROFILE_DRIFT_RECOVERY_COMMAND,
            };
        }
        (0, governance_runtime_1.appendEvent)(input.repoRoot, active.sessionId, {
            type: 'user_decision',
            ts: new Date().toISOString(),
            decision: 'profile_drift_auto_recovery',
            message: 'Stale-profile session recovered before intent continuity.',
            detail: {
                reason: exports.PROFILE_DRIFT_RECOVERY_REASON,
                sessionProfileHash: active.profileHash,
                currentProfileHash: input.currentProfile.profileHash,
                unresolvedHumanDecisions: false,
                exactApprovalsCarriedForward: false,
            },
        });
        const finished = (0, governance_runtime_1.finishSession)(input.repoRoot, active.sessionId, {
            reason: exports.PROFILE_DRIFT_RECOVERY_REASON,
        });
        if (!finished)
            throw new Error(`Could not finish stale-profile session ${active.sessionId}.`);
        const replacement = (0, governance_runtime_1.createSession)(input.repoRoot, input.currentProfile, input.goal);
        (0, governance_runtime_1.appendEvent)(input.repoRoot, replacement.sessionId, {
            type: 'user_decision',
            ts: new Date().toISOString(),
            decision: 'profile_drift_replacement_started',
            message: 'New governed session started from the current repository profile.',
            detail: {
                reason: exports.PROFILE_DRIFT_RECOVERY_REASON,
                previousSessionId: finished.sessionId,
                previousProfileHash: finished.profileHash,
                currentProfileHash: replacement.profileHash,
                exactApprovalsCarriedForward: false,
            },
        });
        const replacementSession = (0, governance_runtime_1.loadSession)(input.repoRoot, replacement.sessionId) || replacement;
        return {
            status: 'recovered',
            reason: exports.PROFILE_DRIFT_RECOVERY_REASON,
            previousSession: finished,
            replacementSession,
            sessionProfileHash: finished.profileHash,
            currentProfileHash: replacementSession.profileHash,
            replayVerified: (0, governance_runtime_1.replaySession)(finished).matchesOriginal,
        };
    });
}
//# sourceMappingURL=profile-drift-recovery.js.map