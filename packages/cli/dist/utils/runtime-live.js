"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishRuntimeLiveStatus = publishRuntimeLiveStatus;
exports.flushRuntimeLiveOutbox = flushRuntimeLiveOutbox;
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
        session: sanitizeForRuntimeLive(session),
    };
    try {
        (0, runtime_outbox_1.enqueueRuntimeSessionSnapshot)(repoRoot, session.sessionId, body);
        const flushed = await flushRuntimeLiveOutbox(repoRoot, {
            maxEvents: 2,
            timeoutMs: 500,
        });
        return {
            ok: flushed.failed === 0 && !flushed.skipped,
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
            else {
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
            if (!response)
                throw new Error('runtime transport unavailable');
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            (0, runtime_outbox_1.markRuntimeOutboxDelivered)(repoRoot, event.eventId);
            delivered += 1;
        }
        catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            (0, runtime_outbox_1.markRuntimeOutboxFailed)(repoRoot, event.eventId, lastError);
            failed += 1;
        }
    }
    const status = (0, runtime_outbox_1.inspectRuntimeOutbox)(repoRoot);
    return {
        attempted: events.length,
        delivered,
        failed,
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
function queueApprovalAcknowledgement(repoRoot, sessionId, approval, body) {
    if (!approval.id)
        return;
    (0, runtime_outbox_1.enqueueRuntimeApprovalAck)(repoRoot, sessionId, {
        approvalId: approval.id,
        body,
    });
}
async function applyPendingRuntimeLiveApprovals(repoRoot, sessionId) {
    await flushRuntimeLiveOutbox(repoRoot, { maxEvents: 20, timeoutMs: 750 });
    const approvals = await fetchPendingApprovals(repoRoot, sessionId);
    let applied = 0;
    let failed = 0;
    for (const approval of approvals) {
        if (approval.status !== 'pending' || !approval.path)
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
    await flushRuntimeLiveOutbox(repoRoot, { maxEvents: 20, timeoutMs: 750 });
    return { applied, failed };
}
//# sourceMappingURL=runtime-live.js.map