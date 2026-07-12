"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOVERNANCE_CALIBRATION_V14_SCHEMA_VERSION = void 0;
exports.governanceCalibrationSessionCountsAsReal = governanceCalibrationSessionCountsAsReal;
exports.summarizeGovernanceCalibrationV14 = summarizeGovernanceCalibrationV14;
exports.GOVERNANCE_CALIBRATION_V14_SCHEMA_VERSION = 'neurcode.governance-calibration.v1.4';
const rate = (n, d) => d > 0 ? n / d : null;
function percentile(values, fraction) {
    if (values.length === 0)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}
function governanceCalibrationSessionCountsAsReal(session) {
    return session.hostStatus === 'real' && session.includeInRealHostMetrics === true && session.hostPlanCaptured === true;
}
function summarizeGovernanceCalibrationV14(sessions) {
    const included = sessions.filter(governanceCalibrationSessionCountsAsReal);
    const correct = included.filter((s) => s.predictedDecision === s.expectedDecision).length;
    const positives = new Set(['block', 'advisory']);
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    for (const s of included) {
        const ep = positives.has(s.expectedDecision);
        const pp = s.predictedDecision !== null && positives.has(s.predictedDecision);
        if (ep && pp)
            tp += 1;
        else if (!ep && pp)
            fp += 1;
        else if (ep && !pp)
            fn += 1;
        else
            tn += 1;
    }
    const byHost = Object.fromEntries(['codex', 'cursor', 'claude_code'].map((host) => {
        const attempted = sessions.filter((s) => s.host === host);
        const counted = attempted.filter(governanceCalibrationSessionCountsAsReal);
        const hostCorrect = counted.filter((s) => s.predictedDecision === s.expectedDecision).length;
        return [host, { status: attempted[0]?.hostStatus ?? 'not_attempted', attempted: attempted.length, included: counted.length, correct: hostCorrect, accuracy: rate(hostCorrect, counted.length), automaticInterceptionProven: counted.filter((s) => s.automaticHostInterceptionProven).length }];
    }));
    return {
        schemaVersion: exports.GOVERNANCE_CALIBRATION_V14_SCHEMA_VERSION,
        labelledSessions: sessions.filter((s) => s.labelledBeforeRun).length, attemptedSessions: sessions.length,
        realHostSessions: included.length, excludedSessions: sessions.length - included.length, correct, accuracy: rate(correct, included.length),
        precision: rate(tp, tp + fp), recall: rate(tp, tp + fn), falsePositiveRate: rate(fp, fp + tn), falseNegativeRate: rate(fn, fn + tp),
        abstentionRate: rate(included.filter((s) => s.predictedDecision === 'unknown').length, included.length),
        deterministicAuthorityViolations: included.filter((s) => s.deterministicAuthorityClaimed && !s.deterministicAuthorityExpected).length,
        exactPathContainmentFailures: included.filter((s) => s.exactPathContainmentPassed === false).length,
        reconstructionMismatches: included.filter((s) => !s.evidenceReconstructed).length,
        automaticInterceptionProven: included.filter((s) => s.automaticHostInterceptionProven).length,
        harnessDrivenRuntimeSessions: included.filter((s) => s.runtimeDriver === 'calibration_harness').length,
        latencyP50Ms: percentile(included.map((s) => s.latencyMs), .5), latencyP95Ms: percentile(included.map((s) => s.latencyMs), .95),
        approvalFrictionP95Ms: percentile(included.flatMap((s) => s.approvalFrictionMs === null ? [] : [s.approvalFrictionMs]), .95), byHost,
    };
}
//# sourceMappingURL=typescript-governance-quality-v14.js.map