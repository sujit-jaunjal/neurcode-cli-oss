"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGovernanceEnvelope = buildGovernanceEnvelope;
exports.buildExecutionResponseMeta = buildExecutionResponseMeta;
exports.normalizeVerifyPayloadForLegacyClients = normalizeVerifyPayloadForLegacyClients;
exports.normalizeFixPayloadForLegacyClients = normalizeFixPayloadForLegacyClients;
const node_crypto_1 = require("node:crypto");
const execution_actions_1 = require("../utils/execution-actions");
function firstString(...values) {
    for (const value of values) {
        if (typeof value !== 'string')
            continue;
        const trimmed = value.trim();
        if (trimmed.length > 0)
            return trimmed;
    }
    return null;
}
function collectReceiptIds(payload) {
    const receipts = [];
    const patch = asObjectRecord(payload?.patch);
    const directReceipt = asObjectRecord(payload?.receipt) || asObjectRecord(patch?.receipt);
    const directId = firstString(payload?.receiptId, patch?.receiptId, directReceipt?.id, directReceipt?.receiptId, directReceipt?.transactionId);
    if (directId)
        receipts.push(directId);
    return [...new Set(receipts)].sort();
}
function buildGovernanceEnvelope(run, options = {}) {
    const semantics = (0, execution_actions_1.getExecutionActionSemantics)(run.execution.type);
    const primaryPayload = run.primaryPayload;
    const verificationPayload = run.verificationPayload;
    const primaryGovernance = asObjectRecord(primaryPayload?.governanceVerification);
    const verificationGovernance = asObjectRecord(verificationPayload?.governanceVerification);
    const primaryReplayIntegrity = asObjectRecord(primaryPayload?.replayIntegrity)
        || asObjectRecord(primaryGovernance?.replayIntegrity);
    const verificationReplayIntegrity = asObjectRecord(verificationPayload?.replayIntegrity)
        || asObjectRecord(verificationGovernance?.replayIntegrity);
    const compatibilityBoundary = options.compatibilityBoundary || (semantics.class === 'compatibility-mutation'
        ? {
            routeScope: 'compatibility-mutation',
            actionClass: semantics.class,
            compatibilityAction: true,
            compatibilityQuarantined: true,
            canonicalRuntime: false,
        }
        : null);
    const executionBoundary = options.executionBoundary || compatibilityBoundary || {
        routeScope: semantics.class === 'canonical-governance' ? 'canonical-governance' : 'runtime-operation',
        actionClass: semantics.class,
        compatibilityAction: false,
        canonicalRuntime: semantics.class === 'canonical-governance',
    };
    return {
        schemaVersion: 'neurcode.governance-envelope.v1',
        identity: {
            executionId: run.execution.id,
            executionType: run.execution.type,
            fingerprint: run.execution.fingerprint,
            source: run.execution.source,
            actor: run.execution.actor,
            target: run.execution.target,
            createdAt: run.execution.createdAt,
            completedAt: run.execution.completedAt,
        },
        boundary: {
            actionClass: semantics.class,
            runtimeBoundary: semantics.class === 'compatibility-mutation'
                ? 'compatibility-mutation'
                : semantics.class,
            mutatesCode: semantics.mutatesCode,
            compatibilityAction: (0, execution_actions_1.isCompatibilityExecutionActionType)(run.execution.type),
            executionBoundary,
            compatibilityBoundary,
        },
        custody: {
            evidence: {
                generated: run.execution.evidence.generated,
                references: run.execution.evidence.references,
                retentionLimit: run.execution.evidence.retentionLimit,
            },
            replay: {
                checksum: firstString(primaryPayload?.replayChecksum, verificationPayload?.replayChecksum, primaryGovernance?.replayChecksum, verificationGovernance?.replayChecksum),
                mode: firstString(primaryPayload?.replayMode, verificationPayload?.replayMode, primaryGovernance?.replayMode, verificationGovernance?.replayMode),
                integrity: verificationReplayIntegrity || primaryReplayIntegrity || null,
            },
            provenance: {
                runId: firstString(primaryPayload?.provenanceRunId, verificationPayload?.provenanceRunId, primaryGovernance?.provenanceRunId, verificationGovernance?.provenanceRunId),
                generatedAt: firstString(primaryPayload?.provenanceRunAt, verificationPayload?.provenanceRunAt, primaryGovernance?.provenanceRunAt, verificationGovernance?.provenanceRunAt),
            },
            policy: {
                policyLockFingerprint: firstString(primaryPayload?.policyLockFingerprint, verificationPayload?.policyLockFingerprint, primaryGovernance?.policyLockFingerprint, verificationGovernance?.policyLockFingerprint),
                compiledPolicyFingerprint: firstString(primaryPayload?.compiledPolicyFingerprint, verificationPayload?.compiledPolicyFingerprint, primaryGovernance?.compiledPolicyFingerprint, verificationGovernance?.compiledPolicyFingerprint),
            },
            receipts: {
                ids: collectReceiptIds(primaryPayload),
            },
        },
        lineage: {
            verificationTrend: run.execution.verification.diff.trend,
            beforeCounts: run.execution.verification.diff.before,
            afterCounts: run.execution.verification.diff.after,
            blockingDelta: run.execution.verification.diff.blockingDelta,
            advisoryDelta: run.execution.verification.diff.advisoryDelta,
            stageCount: run.execution.events.length,
        },
    };
}
function buildExecutionResponseMeta(run, options = {}) {
    const semantics = (0, execution_actions_1.getExecutionActionSemantics)(run.execution.type);
    const governanceEnvelope = buildGovernanceEnvelope(run, options);
    return {
        id: run.execution.id,
        type: run.execution.type,
        actionClass: semantics.class,
        compatibilityAction: (0, execution_actions_1.isCompatibilityExecutionActionType)(run.execution.type),
        mutatesCode: semantics.mutatesCode,
        defaultReverify: semantics.defaultReverify,
        runtimeBoundary: semantics.class === 'compatibility-mutation'
            ? 'compatibility-mutation'
            : semantics.class,
        source: run.execution.source,
        actor: run.execution.actor,
        status: run.execution.status,
        trend: run.execution.verification.diff.trend,
        evidence: run.execution.evidence.references,
        durationMs: run.execution.durationMs,
        governanceEnvelope,
    };
}
function asObjectRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    return value;
}
function asObjectArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => asObjectRecord(entry))
        .filter((entry) => entry !== null);
}
function toLegacyViolation(entry, fallbackSeverity) {
    const file = typeof entry.file === 'string' && entry.file.trim().length > 0
        ? entry.file.trim()
        : '';
    const message = typeof entry.message === 'string' && entry.message.trim().length > 0
        ? entry.message.trim()
        : '';
    if (!file || !message)
        return null;
    const severity = typeof entry.severity === 'string' && entry.severity.trim().length > 0
        ? entry.severity.trim()
        : fallbackSeverity;
    const rule = typeof entry.rule === 'string' && entry.rule.trim().length > 0
        ? entry.rule.trim()
        : typeof entry.policy === 'string' && entry.policy.trim().length > 0
            ? entry.policy.trim()
            : '';
    return { file, message, severity, rule };
}
function normalizeVerifyPayloadForLegacyClients(payload) {
    if (!payload)
        return null;
    const existingViolations = asObjectArray(payload.violations)
        .map((entry) => toLegacyViolation(entry, 'warn'))
        .filter((entry) => entry !== null);
    const blockingItems = asObjectArray(payload.blockingItems)
        .map((entry) => toLegacyViolation(entry, 'block'))
        .filter((entry) => entry !== null);
    const advisoryItems = asObjectArray(payload.advisoryItems)
        .map((entry) => toLegacyViolation(entry, 'warn'))
        .filter((entry) => entry !== null);
    const warnings = asObjectArray(payload.warnings)
        .map((entry) => toLegacyViolation(entry, 'warn'))
        .filter((entry) => entry !== null);
    const merged = [...existingViolations];
    const canonicalSeverity = (value) => {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'block' || normalized === 'critical' || normalized === 'high')
            return 'block';
        if (normalized === 'warn' || normalized === 'warning' || normalized === 'advisory' || normalized === 'medium' || normalized === 'low')
            return 'warn';
        return normalized;
    };
    const canonicalKey = (entry) => `${entry.file}::${entry.rule}::${entry.message}::${canonicalSeverity(entry.severity)}`;
    const seen = new Set(merged.map((entry) => canonicalKey(entry)));
    for (const item of [...blockingItems, ...advisoryItems, ...warnings]) {
        const key = canonicalKey(item);
        if (seen.has(key))
            continue;
        seen.add(key);
        merged.push(item);
    }
    if (merged.length === 0)
        return payload;
    return {
        ...payload,
        violations: merged,
    };
}
function normalizeFixPayloadForLegacyClients(payload) {
    if (!payload)
        return null;
    const suggestions = asObjectArray(payload.suggestions);
    if (suggestions.length === 0)
        return payload;
    const deduped = [];
    const seen = new Set();
    for (const suggestion of suggestions) {
        const file = typeof suggestion.file === 'string' ? suggestion.file.trim() : '';
        const line = typeof suggestion.line === 'number' && Number.isFinite(suggestion.line)
            ? String(Math.floor(suggestion.line))
            : '';
        const message = typeof suggestion.message === 'string' ? suggestion.message.trim() : '';
        const rule = typeof suggestion.rule === 'string'
            ? suggestion.rule.trim()
            : typeof suggestion.policy === 'string'
                ? suggestion.policy.trim()
                : '';
        const confidence = typeof suggestion.confidence === 'string' ? suggestion.confidence.trim().toLowerCase() : '';
        const patch = asObjectRecord(suggestion.patch);
        const patchDiff = patch && typeof patch.diff === 'string' ? patch.diff : '';
        const key = `${file}::${line}::${rule}::${message}::${confidence}::${(0, node_crypto_1.createHash)('sha1').update(patchDiff).digest('hex')}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        deduped.push(suggestion);
    }
    if (deduped.length === suggestions.length)
        return payload;
    return {
        ...payload,
        suggestions: deduped,
        _normalization: {
            ...(asObjectRecord(payload._normalization) || {}),
            suggestionsDeduped: suggestions.length - deduped.length,
        },
    };
}
//# sourceMappingURL=shaping.js.map