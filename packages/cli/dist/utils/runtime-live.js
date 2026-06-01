"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishRuntimeLiveStatus = publishRuntimeLiveStatus;
exports.applyPendingRuntimeLiveApprovals = applyPendingRuntimeLiveApprovals;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const config_1 = require("../config");
const runtime_connection_1 = require("./runtime-connection");
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
        const response = await runtimeFetch(repoRoot, '/api/v1/runtime/live-sessions/status', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        if (!response)
            return { ok: false, skipped: 'not connected' };
        if (!response.ok)
            return { ok: false, error: `HTTP ${response.status}` };
        return { ok: true };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
async function fetchPendingApprovals(repoRoot, sessionId) {
    const auth = runtimeAuth(repoRoot);
    if (!auth)
        return [];
    const response = await runtimeFetch(repoRoot, `/api/v1/runtime/live-sessions/${encodeURIComponent(sessionId)}/approvals?repoKey=${encodeURIComponent(auth.repoKey)}`, { method: 'GET' }, 1500);
    if (!response || !response.ok)
        return [];
    const body = await response.json();
    return Array.isArray(body.approvals) ? body.approvals : [];
}
async function acknowledgeApproval(repoRoot, sessionId, approval, body) {
    if (!approval.id)
        return;
    await runtimeFetch(repoRoot, `/api/v1/runtime/live-sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(approval.id)}/applied`, {
        method: 'POST',
        body: JSON.stringify(body),
    }, 1500);
}
async function applyPendingRuntimeLiveApprovals(repoRoot, sessionId) {
    const approvals = await fetchPendingApprovals(repoRoot, sessionId);
    let applied = 0;
    let failed = 0;
    for (const approval of approvals) {
        if (approval.status !== 'pending' || !approval.path)
            continue;
        try {
            const result = (0, governance_runtime_1.approveSession)(repoRoot, approval.path, {
                reason: approval.reason || 'dashboard live approval',
                sessionId,
                expiresAt: approval.expiresAt || undefined,
                source: 'dashboard',
                approvedBy: approval.requestedBy || null,
                requestId: approval.id || null,
            });
            applied += 1;
            await acknowledgeApproval(repoRoot, sessionId, approval, {
                status: 'applied',
                appliedPath: result.approvedPath,
                expiresAt: result.expiresAt,
            });
        }
        catch (error) {
            failed += 1;
            await acknowledgeApproval(repoRoot, sessionId, approval, {
                status: 'failed',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return { applied, failed };
}
//# sourceMappingURL=runtime-live.js.map