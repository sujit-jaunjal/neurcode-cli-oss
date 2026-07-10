"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ONBOARDING_HINTS = exports.DAEMON_ERROR_CODES = exports.CONFIDENCE_LABELS = exports.VERIFICATION_SUMMARY_LABELS = exports.SEVERITY_LABELS = exports.STATUS_TERMS = exports.STATUS_VOCABULARY_VERSION = void 0;
exports.statusTerm = statusTerm;
exports.severityLabel = severityLabel;
exports.toPatchStateLabel = toPatchStateLabel;
exports.toRetrySafeMessage = toRetrySafeMessage;
exports.toManualReviewMessage = toManualReviewMessage;
exports.toVerificationCompleteTitle = toVerificationCompleteTitle;
exports.toVerificationSummaryLabel = toVerificationSummaryLabel;
exports.STATUS_VOCABULARY_VERSION = 'neurcode.status.v1';
exports.STATUS_TERMS = {
    verificationComplete: 'Verification Complete',
    safePatchApplied: 'Safe Patch Applied',
    patchRejected: 'Patch Rejected',
    rollbackAvailable: 'Rollback Available',
    rollbackApplied: 'Rollback Applied',
    replayAvailable: 'Replay Available',
    evidenceGenerated: 'Evidence Generated',
    manualReviewRecommended: 'Manual Review Recommended',
    filesystemChangedSincePreview: 'Filesystem Changed Since Preview',
    transactionVerified: 'Transaction Verified',
    retrySafe: 'Retry Safe',
};
exports.SEVERITY_LABELS = {
    critical: 'Critical',
    blocking: 'Blocking',
    high: 'High',
    advisory: 'Advisory',
    medium: 'Medium',
    warning: 'Warning',
    low: 'Low',
    info: 'Info',
};
exports.VERIFICATION_SUMMARY_LABELS = {
    clean: exports.STATUS_TERMS.verificationComplete,
    issues: 'Verification Findings Detected',
    partial: 'Verification Partially Complete',
    failed: 'Verification Failed',
};
exports.CONFIDENCE_LABELS = {
    HIGH: 'HIGH confidence',
    MEDIUM: 'MEDIUM confidence',
    LOW: 'LOW confidence',
};
function statusTerm(key) {
    return exports.STATUS_TERMS[key];
}
function severityLabel(severity) {
    return exports.SEVERITY_LABELS[severity];
}
function toPatchStateLabel(state) {
    if (state === 'applied')
        return exports.STATUS_TERMS.safePatchApplied;
    if (state === 'partial')
        return `${exports.STATUS_TERMS.safePatchApplied} · ${exports.STATUS_TERMS.manualReviewRecommended}`;
    if (state === 'stale_preview' || state === 'filesystem_changed_since_preview') {
        return exports.STATUS_TERMS.filesystemChangedSincePreview;
    }
    if (state === 'rollback_applied')
        return exports.STATUS_TERMS.rollbackApplied;
    if (state === 'rollback_stale')
        return `${exports.STATUS_TERMS.patchRejected} · ${exports.STATUS_TERMS.filesystemChangedSincePreview}`;
    if (state === 'rollback_rejected')
        return exports.STATUS_TERMS.patchRejected;
    return exports.STATUS_TERMS.patchRejected;
}
function toRetrySafeMessage(context) {
    return `${context}. ${exports.STATUS_TERMS.retrySafe}.`;
}
function toManualReviewMessage(context) {
    return `${exports.STATUS_TERMS.manualReviewRecommended}: ${context}`;
}
function toVerificationCompleteTitle(confidenceSuffix = '') {
    return `${exports.STATUS_TERMS.verificationComplete}${confidenceSuffix}`;
}
function toVerificationSummaryLabel(state) {
    return exports.VERIFICATION_SUMMARY_LABELS[state];
}
exports.DAEMON_ERROR_CODES = {
    badRequest: 'daemon.bad_request',
    unauthorized: 'daemon.unauthorized',
    forbidden: 'daemon.forbidden',
    notFound: 'daemon.not_found',
    routeNotFound: 'daemon.route_not_found',
    timeout: 'daemon.timeout',
    conflict: 'daemon.conflict',
    validationFailed: 'daemon.validation_failed',
    rateLimited: 'daemon.rate_limited',
    internalError: 'daemon.internal_error',
    unknown: 'daemon.error',
};
exports.ONBOARDING_HINTS = [
    'Run your first verification',
    'Review findings',
    'Preview deterministic patch',
    'Apply safe patch',
    'View evidence',
    'Replay execution history',
];
//# sourceMappingURL=status-vocabulary.js.map