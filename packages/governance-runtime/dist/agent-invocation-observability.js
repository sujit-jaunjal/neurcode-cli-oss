"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_INVOCATION_OBSERVABILITY_SCHEMA_VERSION = void 0;
exports.buildAgentInvocationSummary = buildAgentInvocationSummary;
exports.AGENT_INVOCATION_OBSERVABILITY_SCHEMA_VERSION = 'neurcode.agent-invocation-observability.v1';
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function eventTs(event) {
    return typeof event?.ts === 'string' ? event.ts : null;
}
function numericTs(event) {
    const ts = eventTs(event);
    if (!ts)
        return null;
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : null;
}
function latestOf(events, predicate) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        if (predicate(events[index]))
            return events[index];
    }
    return undefined;
}
function callEventType(event) {
    const detail = asRecord(event.detail);
    const runtimeEventType = detail?.runtimeEventType;
    return typeof runtimeEventType === 'string' ? runtimeEventType : null;
}
function launchAgent(event) {
    const detail = asRecord(event?.detail);
    const agent = asRecord(detail?.agent);
    return {
        adapter: typeof agent?.adapter === 'string' ? agent.adapter : null,
        enforcementLevel: typeof agent?.enforcementLevel === 'string' ? agent.enforcementLevel : null,
        automatic: typeof agent?.automatic === 'boolean' ? agent.automatic : false,
    };
}
function check(id, label, status, message, ts) {
    return { id, label, status, message, ...(ts ? { ts } : {}) };
}
function scoreChecks(checks) {
    const scored = checks.filter((item) => item.status !== 'skip');
    if (scored.length === 0)
        return 0;
    const points = scored.reduce((sum, item) => {
        if (item.status === 'pass')
            return sum + 1;
        if (item.status === 'warn')
            return sum + 0.5;
        return sum;
    }, 0);
    return Math.round((points / scored.length) * 100);
}
function latestProtocolEvent(events) {
    const latest = latestOf(events, (event) => {
        return event.type === 'agent_session_launched'
            || event.type === 'agent_handshake'
            || event.type === 'agent_runtime_call'
            || event.type === 'plan_captured'
            || event.type === 'plan_amended'
            || event.type === 'check_ok'
            || event.type === 'check_warn'
            || event.type === 'check_block'
            || event.type === 'approval_decision'
            || event.type === 'session_finish';
    });
    if (!latest)
        return null;
    return {
        type: latest.type,
        ts: eventTs(latest),
        filePath: latest.filePath ?? null,
        decision: latest.decision ?? latest.verdict ?? null,
    };
}
function buildAgentInvocationSummary(session) {
    const events = Array.isArray(session.events) ? session.events : [];
    const launch = latestOf(events, (event) => event.type === 'agent_session_launched');
    const agent = launchAgent(launch);
    const handshake = latestOf(events, (event) => event.type === 'agent_handshake');
    const runtimeCalls = events.filter((event) => event.type === 'agent_runtime_call');
    const editBeforeCalls = runtimeCalls.filter((event) => callEventType(event) === 'edit.before');
    const planEvents = events.filter((event) => event.type === 'plan_captured' || event.type === 'plan_amended');
    const checkEvents = events.filter((event) => event.type === 'check_ok' || event.type === 'check_warn' || event.type === 'check_block');
    const blockEvents = events.filter((event) => event.type === 'check_block');
    const warnEvents = events.filter((event) => event.type === 'check_warn');
    const okEvents = events.filter((event) => event.type === 'check_ok');
    const approvalEvents = events.filter((event) => event.type === 'approval_decision' && event.decision === 'approved');
    const planAmendments = events.filter((event) => event.type === 'plan_amended');
    const finish = latestOf(events, (event) => event.type === 'session_finish') || (session.status === 'finished' ? events[events.length - 1] : undefined);
    const planCaptured = Boolean(session.contract.agentPlan) || planEvents.length > 0;
    const firstPlanTs = numericTs(planEvents[0]);
    const firstCheckTs = numericTs(checkEvents[0]);
    const planBeforeFirstEdit = firstCheckTs === null
        ? null
        : firstPlanTs !== null && firstPlanTs <= firstCheckTs;
    const pendingPlanAmendments = (session.contract.planAmendmentProposals ?? [])
        .filter((proposal) => proposal.status === 'pending')
        .length;
    const isObserveOnly = agent.enforcementLevel === 'observe_only';
    const isHardDeny = agent.enforcementLevel === 'hard_deny';
    const isCooperative = agent.enforcementLevel === 'cooperative';
    const checks = [
        check('session_launch', 'Session launched', launch ? 'pass' : 'warn', launch
            ? `Runtime session launched for ${agent.adapter ?? 'unknown adapter'}.`
            : 'No agent launch marker was found in this session.', eventTs(launch)),
        check('handshake', 'Agent handshake', isObserveOnly
            ? 'skip'
            : handshake || isHardDeny
                ? 'pass'
                : launch
                    ? 'warn'
                    : 'skip', handshake
            ? 'Agent handshook into the governed session.'
            : isHardDeny
                ? 'Hard-deny hooks act as the handshake layer for Claude Code.'
                : launch
                    ? 'Waiting for the cooperative agent to handshake before editing.'
                    : 'No launched cooperative agent to handshake.', eventTs(handshake)),
        check('plan_capture', 'Plan captured', planCaptured
            ? planBeforeFirstEdit === false
                ? 'warn'
                : 'pass'
            : launch
                ? 'warn'
                : 'skip', planCaptured
            ? planBeforeFirstEdit === false
                ? 'Source-free agent plan was captured after the first checked edit.'
                : `Source-free agent plan is present${session.contract.agentPlanRevision ? ` at revision ${session.contract.agentPlanRevision}` : ''}.`
            : 'No source-free agent plan has been captured yet.', eventTs(planEvents[planEvents.length - 1])),
        check('prewrite_checks', 'Pre-write checks', checkEvents.length > 0
            ? isCooperative && editBeforeCalls.length === 0
                ? 'warn'
                : 'pass'
            : launch
                ? 'warn'
                : 'skip', checkEvents.length > 0
            ? isCooperative && editBeforeCalls.length === 0
                ? `${checkEvents.length} check event(s) recorded, but no explicit cooperative edit.before call marker is present.`
                : `${checkEvents.length} write check event(s) recorded before or around agent edits.`
            : 'No guarded edit check has been recorded yet.', eventTs(checkEvents[checkEvents.length - 1])),
        check('deny_boundary', 'Boundary denial', blockEvents.length > 0 ? 'pass' : checkEvents.length > 0 ? 'skip' : 'skip', blockEvents.length > 0
            ? `${blockEvents.length} boundary denial(s) recorded.`
            : 'No boundary denial has occurred in this session.', eventTs(blockEvents[blockEvents.length - 1])),
        check('exact_approval', 'Exact approval', approvalEvents.length > 0 ? 'pass' : blockEvents.length > 0 ? 'warn' : 'skip', approvalEvents.length > 0
            ? `${approvalEvents.length} exact-path approval(s) applied.`
            : blockEvents.length > 0
                ? 'A boundary was blocked and no exact-path approval has been applied yet.'
                : 'No approval was required.', eventTs(approvalEvents[approvalEvents.length - 1])),
        check('replan', 'Re-plan handling', pendingPlanAmendments > 0 ? 'warn' : planAmendments.length > 0 ? 'pass' : 'skip', pendingPlanAmendments > 0
            ? `${pendingPlanAmendments} plan amendment(s) await human decision.`
            : planAmendments.length > 0
                ? `${planAmendments.length} accepted plan amendment(s) recorded.`
                : 'No mid-session re-plan was needed.', eventTs(planAmendments[planAmendments.length - 1])),
        check('finish', 'Finish recorded', finish ? 'pass' : session.status === 'active' ? 'skip' : 'warn', finish
            ? 'Session finish and replay evidence were recorded.'
            : session.status === 'active'
                ? 'Session is still active.'
                : 'Session is no longer active, but no finish event was found.', eventTs(finish)),
    ];
    const gaps = checks
        .filter((item) => item.status === 'warn' || item.status === 'fail')
        .map((item) => item.message);
    let status;
    if (!launch)
        status = 'not_launched';
    else if (isObserveOnly)
        status = 'observe_only';
    else if (!handshake && !isHardDeny)
        status = 'awaiting_handshake';
    else if (!planCaptured)
        status = 'awaiting_plan';
    else if (checkEvents.length === 0)
        status = 'awaiting_prewrite_check';
    else if (session.status === 'finished')
        status = 'finished';
    else if (gaps.length > 0 && (pendingPlanAmendments > 0 || (!planBeforeFirstEdit && firstCheckTs !== null)))
        status = 'attention_needed';
    else
        status = 'following_contract';
    const nextAction = status === 'not_launched'
        ? 'Start a governed agent session.'
        : status === 'awaiting_handshake'
            ? 'Have the agent call neurcode_agent_session_handshake.'
            : status === 'awaiting_plan'
                ? 'Have the agent capture a source-free plan before editing.'
                : status === 'awaiting_prewrite_check'
                    ? 'Have the agent call neurcode_agent_edit_before before its first write.'
                    : pendingPlanAmendments > 0
                        ? 'Review and accept or reject the pending re-plan proposal.'
                        : blockEvents.length > approvalEvents.length
                            ? 'Approve or deny the blocked exact path.'
                            : status === 'finished'
                                ? 'Review the replayable source-free evidence.'
                                : 'Continue enforcing pre-write checks for every edit.';
    return {
        schemaVersion: exports.AGENT_INVOCATION_OBSERVABILITY_SCHEMA_VERSION,
        status,
        score: scoreChecks(checks),
        adapter: agent.adapter,
        enforcementLevel: agent.enforcementLevel,
        automatic: agent.automatic,
        sourceFree: true,
        launched: Boolean(launch),
        handshakeSeen: Boolean(handshake) || isHardDeny,
        planCaptured,
        planBeforeFirstEdit,
        explicitRuntimeCallCount: runtimeCalls.length,
        editBeforeCallCount: editBeforeCalls.length,
        preWriteCheckCount: checkEvents.length,
        allowedCheckCount: okEvents.length,
        warningCheckCount: warnEvents.length,
        deniedPreWriteCount: blockEvents.length,
        approvalsApplied: approvalEvents.length,
        planAmendments: planAmendments.length,
        pendingPlanAmendments,
        finishSeen: Boolean(finish),
        eventCount: events.length,
        latestProtocolEvent: latestProtocolEvent(events),
        gaps,
        nextAction,
        checks,
    };
}
//# sourceMappingURL=agent-invocation-observability.js.map