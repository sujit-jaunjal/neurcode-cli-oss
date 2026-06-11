"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishRuntimeLiveStatus = publishRuntimeLiveStatus;
exports.flushRuntimeLiveOutbox = flushRuntimeLiveOutbox;
exports.applyPendingRuntimeLiveActions = applyPendingRuntimeLiveActions;
exports.applyPendingRuntimeLiveApprovals = applyPendingRuntimeLiveApprovals;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const config_1 = require("../config");
const runtime_connection_1 = require("./runtime-connection");
const runtime_outbox_1 = require("./runtime-outbox");
const SOURCE_LIKE_KEYS = new Set([
    'content',
    'fileContent',
    'file_content',
    'sourceText',
    'source_text',
    'diff',
    'diffText',
    'diff_text',
    'patch',
    'before',
    'after',
]);
const LIVE_SESSION_SCHEMA_VERSION = 'neurcode.runtime-live-session.v2';
const MAX_LIVE_TEXT = 800;
const MAX_LIVE_ARRAY_ITEMS = 80;
const MAX_LIVE_EVENTS = 80;
const MAX_LIVE_OBJECT_KEYS = 100;
const LIVE_OMITTED_KEYS = new Set([
    'architectureGraph',
    'dependencyGraph',
    'ownershipGraph',
    'profile',
    'profileGraph',
    'facts',
    'fileFacts',
    'repoFacts',
]);
function sanitizeForRuntimeLive(value) {
    if (Array.isArray(value))
        return value.map((item) => sanitizeForRuntimeLive(item));
    if (!value || typeof value !== 'object')
        return value;
    const out = {};
    for (const [key, child] of Object.entries(value)) {
        if (SOURCE_LIKE_KEYS.has(key))
            continue;
        out[key] = sanitizeForRuntimeLive(child);
    }
    return out;
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function compactText(value) {
    if (value.length <= MAX_LIVE_TEXT)
        return value;
    return `${value.slice(0, MAX_LIVE_TEXT)}... [truncated ${value.length - MAX_LIVE_TEXT} chars]`;
}
function compactRuntimeLiveValue(value, depth = 0) {
    if (typeof value === 'string')
        return compactText(value);
    if (Array.isArray(value)) {
        return value
            .slice(0, MAX_LIVE_ARRAY_ITEMS)
            .map((item) => compactRuntimeLiveValue(item, depth + 1));
    }
    if (!isRecord(value))
        return value;
    const out = {};
    let keys = 0;
    for (const [key, child] of Object.entries(value)) {
        if (SOURCE_LIKE_KEYS.has(key) || LIVE_OMITTED_KEYS.has(key))
            continue;
        if (keys >= MAX_LIVE_OBJECT_KEYS) {
            out.__truncatedKeys = true;
            break;
        }
        keys += 1;
        out[key] = depth > 8 ? '[max-depth]' : compactRuntimeLiveValue(child, depth + 1);
    }
    return out;
}
function compactRuntimeLiveEvent(event) {
    if (!isRecord(event))
        return compactRuntimeLiveValue(event);
    const out = {};
    for (const key of [
        'type',
        'ts',
        'filePath',
        'verdict',
        'decision',
        'message',
        'reason',
        'source',
    ]) {
        if (key in event)
            out[key] = compactRuntimeLiveValue(event[key]);
    }
    if (isRecord(event.detail)) {
        out.detail = compactRuntimeLiveValue(event.detail);
    }
    return out;
}
function compactRuntimeLiveSession(session) {
    const sanitized = sanitizeForRuntimeLive(session);
    const input = isRecord(sanitized) ? sanitized : {};
    const contract = isRecord(input.contract) ? input.contract : {};
    const events = Array.isArray(input.events) ? input.events : [];
    const compactEvents = events.slice(-MAX_LIVE_EVENTS).map(compactRuntimeLiveEvent);
    return {
        schemaVersion: input.schemaVersion,
        runtimeLiveSchemaVersion: LIVE_SESSION_SCHEMA_VERSION,
        sessionId: input.sessionId,
        repoName: input.repoName,
        profileHash: input.profileHash,
        status: input.status,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        replayHash: input.replayHash,
        contract: compactRuntimeLiveValue(contract),
        events: compactEvents,
        livePayload: {
            schemaVersion: LIVE_SESSION_SCHEMA_VERSION,
            compacted: true,
            originalEventCount: events.length,
            includedEventCount: compactEvents.length,
            maxTextChars: MAX_LIVE_TEXT,
            maxArrayItems: MAX_LIVE_ARRAY_ITEMS,
            omittedKeys: Array.from(LIVE_OMITTED_KEYS).sort(),
        },
    };
}
function runtimeAuth(repoRoot) {
    const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
    if (!connection)
        return null;
    const apiKey = (0, config_1.getApiKey)(connection.organizationId);
    if (!apiKey)
        return null;
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    return {
        apiUrl: connection.apiUrl.replace(/\/$/, ''),
        repoKey: connection.repo.repoKey,
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
            'x-org-id': connection.organizationId,
        },
    };
}
async function runtimeFetch(repoRoot, path, init, timeoutMs = 1500) {
    const auth = runtimeAuth(repoRoot);
    if (!auth)
        return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(`${auth.apiUrl}${path}`, {
            ...init,
            headers: {
                ...auth.headers,
                ...init.headers,
            },
            signal: controller.signal,
        });
    }
    finally {
        clearTimeout(timeout);
    }
}
async function publishRuntimeLiveStatus(repoRoot, session, options = {}) {
    const repo = (0, runtime_connection_1.collectRuntimeRepoMetadata)(repoRoot, options.profileFreshness);
    const body = {
        repo,
        generatedAt: new Date().toISOString(),
        session: compactRuntimeLiveSession(session),
    };
    try {
        (0, runtime_outbox_1.enqueueRuntimeSessionSnapshot)(repoRoot, session.sessionId, body);
        const flushed = await flushRuntimeLiveOutbox(repoRoot, {
            maxEvents: 2,
            timeoutMs: 500,
        });
        return {
            ok: flushed.failed === 0 && !flushed.skipped && flushed.status.health !== 'degraded',
            queued: flushed.pending > 0,
            pending: flushed.pending,
            ...(flushed.skipped ? { skipped: flushed.skipped } : {}),
            ...(flushed.lastError ? { error: flushed.lastError } : {}),
        };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
async function flushRuntimeLiveOutbox(repoRoot, options = {}) {
    if (!runtimeAuth(repoRoot)) {
        const status = (0, runtime_outbox_1.inspectRuntimeOutbox)(repoRoot);
        return {
            attempted: 0,
            delivered: 0,
            failed: 0,
            deadLettered: 0,
            pending: status.pendingEvents,
            skipped: 'not connected',
            status,
        };
    }
    const events = (0, runtime_outbox_1.pendingRuntimeOutboxEvents)(repoRoot, {
        limit: options.maxEvents ?? 10,
        force: options.force,
    });
    let delivered = 0;
    let failed = 0;
    let deadLettered = 0;
    let lastError;
    for (const event of events) {
        try {
            const envelope = (0, runtime_outbox_1.runtimeDeliveryEnvelope)(event);
            let response;
            if (event.eventType === 'session_snapshot') {
                response = await runtimeFetch(repoRoot, '/api/v1/runtime/live-sessions/status', {
                    method: 'POST',
                    body: JSON.stringify({
                        ...event.payload,
                        delivery: envelope,
                    }),
                }, options.timeoutMs ?? 1_500);
            }
            else if (event.eventType === 'approval_ack') {
                const approvalId = typeof event.payload.approvalId === 'string' ? event.payload.approvalId : '';
                response = approvalId
                    ? await runtimeFetch(repoRoot, `/api/v1/runtime/live-sessions/${encodeURIComponent(event.sessionId)}/approvals/${encodeURIComponent(approvalId)}/applied`, {
                        method: 'POST',
                        body: JSON.stringify({
                            ...event.payload.body,
                            delivery: envelope,
                        }),
                    }, options.timeoutMs ?? 1_500)
                    : null;
            }
            else {
                const amendmentId = typeof event.payload.amendmentId === 'string' ? event.payload.amendmentId : '';
                response = amendmentId
                    ? await runtimeFetch(repoRoot, `/api/v1/runtime/live-sessions/${encodeURIComponent(event.sessionId)}/scope-amendments/${encodeURIComponent(amendmentId)}/applied`, {
                        method: 'POST',
                        body: JSON.stringify({
                            ...event.payload.body,
                            delivery: envelope,
                        }),
                    }, options.timeoutMs ?? 1_500)
                    : null;
            }
            if (!response)
                throw new Error('runtime transport unavailable');
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            (0, runtime_outbox_1.markRuntimeOutboxDelivered)(repoRoot, event.eventId);
            delivered += 1;
        }
        catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            const failure = (0, runtime_outbox_1.markRuntimeOutboxFailed)(repoRoot, event.eventId, lastError);
            if (failure.deadLettered)
                deadLettered += 1;
            failed += 1;
        }
    }
    const status = (0, runtime_outbox_1.inspectRuntimeOutbox)(repoRoot);
    return {
        attempted: events.length,
        delivered,
        failed,
        deadLettered,
        pending: status.pendingEvents,
        ...(lastError ? { lastError } : {}),
        status,
    };
}
async function fetchPendingApprovals(repoRoot, sessionId) {
    const auth = runtimeAuth(repoRoot);
    if (!auth)
        return [];
    try {
        const response = await runtimeFetch(repoRoot, `/api/v1/runtime/live-sessions/${encodeURIComponent(sessionId)}/approvals?repoKey=${encodeURIComponent(auth.repoKey)}`, { method: 'GET' }, 1500);
        if (!response || !response.ok)
            return [];
        const body = await response.json();
        return Array.isArray(body.approvals) ? body.approvals : [];
    }
    catch {
        return [];
    }
}
async function fetchPendingScopeAmendments(repoRoot, sessionId) {
    const auth = runtimeAuth(repoRoot);
    if (!auth)
        return [];
    try {
        const response = await runtimeFetch(repoRoot, `/api/v1/runtime/live-sessions/${encodeURIComponent(sessionId)}/scope-amendments?repoKey=${encodeURIComponent(auth.repoKey)}`, { method: 'GET' }, 1500);
        if (!response || !response.ok)
            return [];
        const body = await response.json();
        return Array.isArray(body.scopeAmendments) ? body.scopeAmendments : [];
    }
    catch {
        return [];
    }
}
function queueApprovalAcknowledgement(repoRoot, sessionId, approval, body) {
    if (!approval.id)
        return;
    (0, runtime_outbox_1.enqueueRuntimeApprovalAck)(repoRoot, sessionId, {
        approvalId: approval.id,
        body,
    });
}
function queueScopeAmendmentAcknowledgement(repoRoot, sessionId, amendment, body) {
    if (!amendment.id)
        return;
    (0, runtime_outbox_1.enqueueRuntimeScopeAmendmentAck)(repoRoot, sessionId, {
        amendmentId: amendment.id,
        body,
    });
}
async function applyPendingRuntimeLiveActions(repoRoot, sessionId) {
    await flushRuntimeLiveOutbox(repoRoot, { maxEvents: 20, timeoutMs: 750 });
    const [approvals, scopeAmendments] = await Promise.all([
        fetchPendingApprovals(repoRoot, sessionId),
        fetchPendingScopeAmendments(repoRoot, sessionId),
    ]);
    let applied = 0;
    let revoked = 0;
    let scopeAmended = 0;
    let scopeDenied = 0;
    let failed = 0;
    for (const approval of approvals) {
        if (!approval.path)
            continue;
        if (approval.status === 'revoked') {
            try {
                (0, governance_runtime_1.revokeSessionApproval)(repoRoot, approval.path, {
                    sessionId,
                    requestId: approval.id,
                    source: 'dashboard',
                    revokedBy: approval.revokedBy || null,
                    reason: approval.revocationReason || 'dashboard live approval revoked',
                });
                revoked += 1;
                queueApprovalAcknowledgement(repoRoot, sessionId, approval, {
                    status: 'revoked',
                    appliedPath: approval.path,
                });
            }
            catch (error) {
                failed += 1;
                queueApprovalAcknowledgement(repoRoot, sessionId, approval, {
                    status: 'failed',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            continue;
        }
        if (approval.status !== 'pending')
            continue;
        try {
            const session = (0, governance_runtime_1.loadSession)(repoRoot, sessionId);
            const existingGrant = session?.contract.approvalGrants?.find((grant) => Boolean(approval.id) && grant.requestId === approval.id);
            const result = existingGrant
                ? {
                    approvedPath: existingGrant.path,
                    expiresAt: existingGrant.expiresAt,
                }
                : (0, governance_runtime_1.approveSession)(repoRoot, approval.path, {
                    reason: approval.reason || 'dashboard live approval',
                    sessionId,
                    expiresAt: approval.expiresAt || undefined,
                    source: 'dashboard',
                    approvedBy: approval.requestedBy || null,
                    requestId: approval.id || null,
                });
            applied += 1;
            queueApprovalAcknowledgement(repoRoot, sessionId, approval, {
                status: 'applied',
                appliedPath: result.approvedPath,
                expiresAt: result.expiresAt,
            });
        }
        catch (error) {
            failed += 1;
            queueApprovalAcknowledgement(repoRoot, sessionId, approval, {
                status: 'failed',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    for (const amendment of scopeAmendments) {
        if (amendment.status === 'denied') {
            scopeDenied += 1;
            queueScopeAmendmentAcknowledgement(repoRoot, sessionId, amendment, {
                status: 'denied',
            });
            continue;
        }
        if (amendment.status !== 'pending')
            continue;
        const scopeFiles = Array.isArray(amendment.scopeFiles) ? amendment.scopeFiles.filter(Boolean) : [];
        const scopeGlobs = Array.isArray(amendment.scopeGlobs) ? amendment.scopeGlobs.filter(Boolean) : [];
        try {
            const result = (0, governance_runtime_1.amendAgentPlan)(repoRoot, {
                sessionId,
                summary: `Dashboard-approved scope amendment for ${amendment.blockedPath || scopeFiles[0] || scopeGlobs[0] || 'runtime session'}`,
                addExpectedFiles: scopeFiles,
                addExpectedGlobs: scopeGlobs,
                addSteps: [
                    `Include ${amendment.blockedPath || scopeFiles[0] || scopeGlobs[0] || 'the approved task expansion'} in the governed task scope`,
                ],
                reason: amendment.reason || 'dashboard scope amendment',
                source: 'manual',
                proposedBy: 'human',
                decidedBy: amendment.requestedBy || 'dashboard-operator',
            });
            scopeAmended += 1;
            queueScopeAmendmentAcknowledgement(repoRoot, sessionId, amendment, {
                status: 'applied',
                appliedRevision: result.revision,
            });
        }
        catch (error) {
            failed += 1;
            queueScopeAmendmentAcknowledgement(repoRoot, sessionId, amendment, {
                status: 'failed',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    await flushRuntimeLiveOutbox(repoRoot, { maxEvents: 20, timeoutMs: 750 });
    return { applied, revoked, scopeAmended, scopeDenied, failed };
}
async function applyPendingRuntimeLiveApprovals(repoRoot, sessionId) {
    return applyPendingRuntimeLiveActions(repoRoot, sessionId);
}
//# sourceMappingURL=runtime-live.js.map