"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_GUARD_POSTURE_SCHEMA_VERSION = void 0;
exports.buildAgentGuardPostureSummary = buildAgentGuardPostureSummary;
exports.AGENT_GUARD_POSTURE_SCHEMA_VERSION = 'neurcode.agent-guard-posture.v1';
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function stringValue(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function count(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}
function latestOf(events, types) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        if (types.has(events[index].type))
            return events[index];
    }
    return undefined;
}
function cleanChangedFiles(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map((item) => {
        const record = item;
        const evidence = asRecord(record.evidence) ?? {};
        return {
            path: stringValue(record.path) ?? '',
            changeType: stringValue(record.changeType) ?? 'modified',
            classification: stringValue(record.classification) ?? 'unverified_write',
            evidence: {
                preWriteCallCount: count(evidence.preWriteCallCount),
                allowedPreWriteCheckCount: count(evidence.allowedPreWriteCheckCount),
                deniedPreWriteCheckCount: count(evidence.deniedPreWriteCheckCount),
                postWriteObservationCount: count(evidence.postWriteObservationCount),
                latestEventAt: stringValue(evidence.latestEventAt),
            },
        };
    })
        .filter((item) => item.path)
        .slice(0, 40);
}
function emptyCounts() {
    return {
        changedFiles: 0,
        verifiedPrewrite: 0,
        unverifiedWrites: 0,
        deniedButChanged: 0,
        observedAfterOnly: 0,
        prewriteCallsWithoutVerdict: 0,
    };
}
function cleanCounts(value) {
    const summary = asRecord(value);
    if (!summary)
        return emptyCounts();
    return {
        changedFiles: count(summary.changedFiles),
        verifiedPrewrite: count(summary.verifiedPrewrite),
        unverifiedWrites: count(summary.unverifiedWrites),
        deniedButChanged: count(summary.deniedButChanged),
        observedAfterOnly: count(summary.observedAfterOnly),
        prewriteCallsWithoutVerdict: count(summary.prewriteCallsWithoutVerdict),
    };
}
function buildAgentGuardPostureSummary(session) {
    const events = Array.isArray(session.events) ? session.events : [];
    const started = latestOf(events, new Set(['agent_guard_started']));
    const report = latestOf(events, new Set(['agent_guard_status', 'agent_guard_finished']));
    const startDetail = asRecord(started?.detail);
    const reportDetail = asRecord(report?.detail);
    const summary = cleanCounts(reportDetail?.summary);
    const changedFiles = cleanChangedFiles(reportDetail?.changedFiles);
    const finished = report?.type === 'agent_guard_finished';
    const reportStatus = stringValue(reportDetail?.status);
    const pass = reportDetail?.pass === true || reportStatus === 'following_contract';
    let status;
    if (!started)
        status = 'not_started';
    else if (!report)
        status = 'awaiting_evaluation';
    else if (finished)
        status = pass ? 'finished_clean' : 'finished_attention';
    else
        status = pass ? 'following_contract' : 'attention_required';
    const nextAction = status === 'not_started'
        ? 'Start a guarded agent session to detect writes that bypass runtime checks.'
        : status === 'awaiting_evaluation'
            ? 'Run neurcode agent guard status to compare repo writes with runtime evidence.'
            : status === 'following_contract'
                ? 'Continue; changed files have matching allowed pre-write evidence.'
                : status === 'finished_clean'
                    ? 'Review the finished source-free guard evidence.'
                    : 'Review unverified or denied-but-changed paths before continuing.';
    return {
        schemaVersion: exports.AGENT_GUARD_POSTURE_SCHEMA_VERSION,
        status,
        sourceFree: true,
        guardId: stringValue(reportDetail?.guardId) ?? stringValue(startDetail?.guardId),
        active: Boolean(started) && !finished,
        startedAt: stringValue(started?.ts),
        evaluatedAt: stringValue(report?.ts),
        finishedAt: finished ? stringValue(report?.ts) : null,
        baselineFileCount: count(startDetail?.baselineFileCount),
        reportFingerprint: stringValue(reportDetail?.reportFingerprint),
        summary,
        changedFiles,
        nextAction,
    };
}
//# sourceMappingURL=agent-guard-posture.js.map