"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_DELIVERY_SCHEMA_VERSION = exports.RUNTIME_OUTBOX_SCHEMA_VERSION = void 0;
exports.runtimeOutboxPath = runtimeOutboxPath;
exports.enqueueRuntimeSessionSnapshot = enqueueRuntimeSessionSnapshot;
exports.enqueueRuntimeApprovalAck = enqueueRuntimeApprovalAck;
exports.runtimeDeliveryEnvelope = runtimeDeliveryEnvelope;
exports.pendingRuntimeOutboxEvents = pendingRuntimeOutboxEvents;
exports.markRuntimeOutboxDelivered = markRuntimeOutboxDelivered;
exports.markRuntimeOutboxFailed = markRuntimeOutboxFailed;
exports.inspectRuntimeOutbox = inspectRuntimeOutbox;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const gitignore_1 = require("./gitignore");
exports.RUNTIME_OUTBOX_SCHEMA_VERSION = 'neurcode.runtime-outbox.v1';
exports.RUNTIME_DELIVERY_SCHEMA_VERSION = 'neurcode.runtime-delivery.v1';
const OUTBOX_FILE = 'runtime-outbox.json';
const OUTBOX_LOCK = 'runtime-outbox.lock';
const MAX_OUTBOX_EVENTS = 1_000;
const LOCK_STALE_MS = 10_000;
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
function emptyOutbox() {
    return {
        schemaVersion: exports.RUNTIME_OUTBOX_SCHEMA_VERSION,
        nextSequenceBySession: {},
        events: [],
        state: {
            lastEnqueuedAt: null,
            lastAttemptAt: null,
            lastDeliveredAt: null,
            lastDeliveredEventId: null,
            lastError: null,
        },
    };
}
function runtimeOutboxPath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', OUTBOX_FILE);
}
function outboxLockPath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', OUTBOX_LOCK);
}
function sleepSync(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        // Outbox mutations are tiny. A bounded synchronous wait avoids adding an
        // async lock protocol to hook call sites while still handling overlap.
    }
}
function withOutboxLock(repoRoot, action) {
    const lockPath = outboxLockPath(repoRoot);
    (0, fs_1.mkdirSync)((0, path_1.dirname)(lockPath), { recursive: true });
    let acquired = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            (0, fs_1.mkdirSync)(lockPath);
            acquired = true;
            break;
        }
        catch {
            try {
                if (Date.now() - (0, fs_1.statSync)(lockPath).mtimeMs > LOCK_STALE_MS) {
                    (0, fs_1.rmSync)(lockPath, { recursive: true, force: true });
                    continue;
                }
            }
            catch {
                // Another process may have released the lock between the failed mkdir
                // and stat. Retry normally.
            }
            sleepSync(5);
        }
    }
    if (!acquired)
        throw new Error('runtime outbox is busy; retry the operation');
    try {
        return action();
    }
    finally {
        (0, fs_1.rmSync)(lockPath, { recursive: true, force: true });
    }
}
function stablePayloadHash(payload) {
    return (0, crypto_1.createHash)('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
}
function assertSourceFree(value, path = 'payload') {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertSourceFree(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    for (const [key, child] of Object.entries(value)) {
        if (SOURCE_LIKE_KEYS.has(key)) {
            throw new Error(`runtime outbox rejected source-like key ${path}.${key}`);
        }
        assertSourceFree(child, `${path}.${key}`);
    }
}
function normalizeOutbox(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return emptyOutbox();
    const input = value;
    if (input.schemaVersion !== exports.RUNTIME_OUTBOX_SCHEMA_VERSION)
        return emptyOutbox();
    return {
        schemaVersion: exports.RUNTIME_OUTBOX_SCHEMA_VERSION,
        nextSequenceBySession: input.nextSequenceBySession && typeof input.nextSequenceBySession === 'object'
            ? { ...input.nextSequenceBySession }
            : {},
        events: Array.isArray(input.events)
            ? input.events.filter((event) => Boolean(event)
                && event.schemaVersion === exports.RUNTIME_DELIVERY_SCHEMA_VERSION
                && typeof event.eventId === 'string'
                && typeof event.sessionId === 'string'
                && Number.isFinite(event.sequence)
                && (event.eventType === 'session_snapshot' || event.eventType === 'approval_ack')
                && Boolean(event.payload)
                && typeof event.payload === 'object'
                && !Array.isArray(event.payload))
            : [],
        state: {
            lastEnqueuedAt: input.state?.lastEnqueuedAt || null,
            lastAttemptAt: input.state?.lastAttemptAt || null,
            lastDeliveredAt: input.state?.lastDeliveredAt || null,
            lastDeliveredEventId: input.state?.lastDeliveredEventId || null,
            lastError: input.state?.lastError || null,
        },
    };
}
function readOutbox(repoRoot) {
    const path = runtimeOutboxPath(repoRoot);
    try {
        if (!(0, fs_1.existsSync)(path))
            return emptyOutbox();
        return normalizeOutbox(JSON.parse((0, fs_1.readFileSync)(path, 'utf8')));
    }
    catch {
        return emptyOutbox();
    }
}
function writeOutbox(repoRoot, outbox) {
    const path = runtimeOutboxPath(repoRoot);
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
    (0, gitignore_1.ensureNeurcodeInGitignore)(repoRoot);
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    (0, fs_1.writeFileSync)(tmp, JSON.stringify(outbox, null, 2) + '\n', 'utf8');
    (0, fs_1.renameSync)(tmp, path);
}
function nextSequence(outbox, sessionId) {
    const sequence = Math.max(0, Number(outbox.nextSequenceBySession[sessionId] || 0)) + 1;
    outbox.nextSequenceBySession[sessionId] = sequence;
    return sequence;
}
function trimOutbox(events) {
    if (events.length <= MAX_OUTBOX_EVENTS)
        return events;
    const approvalAcks = events.filter((event) => event.eventType === 'approval_ack');
    const snapshots = events.filter((event) => event.eventType === 'session_snapshot');
    const snapshotBudget = Math.max(0, MAX_OUTBOX_EVENTS - approvalAcks.length);
    const retainedSnapshots = snapshotBudget > 0 ? snapshots.slice(-snapshotBudget) : [];
    return [...approvalAcks, ...retainedSnapshots]
        .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
}
function enqueue(repoRoot, sessionId, eventType, payload) {
    assertSourceFree(payload);
    return withOutboxLock(repoRoot, () => {
        const outbox = readOutbox(repoRoot);
        const approvalId = eventType === 'approval_ack' && typeof payload.approvalId === 'string'
            ? payload.approvalId
            : null;
        const approvalStatus = eventType === 'approval_ack'
            && typeof payload.body === 'object'
            && payload.body !== null
            && typeof payload.body.status === 'string'
            ? payload.body.status
            : null;
        if (approvalId) {
            const existing = outbox.events.find((event) => event.eventType === 'approval_ack'
                && event.sessionId === sessionId
                && event.payload.approvalId === approvalId
                && (approvalStatus === null
                    || (typeof event.payload.body === 'object'
                        && event.payload.body !== null
                        && event.payload.body.status === approvalStatus)));
            if (existing)
                return existing;
        }
        const generatedAt = new Date().toISOString();
        const event = {
            schemaVersion: exports.RUNTIME_DELIVERY_SCHEMA_VERSION,
            eventId: `rt_${(0, crypto_1.randomUUID)()}`,
            sessionId,
            sequence: nextSequence(outbox, sessionId),
            eventType,
            generatedAt,
            payloadHash: stablePayloadHash(payload),
            payload,
            attemptCount: 0,
            nextAttemptAt: null,
            lastAttemptAt: null,
            lastError: null,
        };
        const retained = eventType === 'session_snapshot'
            ? outbox.events.filter((candidate) => candidate.eventType !== 'session_snapshot' || candidate.sessionId !== sessionId)
            : outbox.events;
        outbox.events = trimOutbox([...retained, event]);
        outbox.state.lastEnqueuedAt = generatedAt;
        writeOutbox(repoRoot, outbox);
        return event;
    });
}
function enqueueRuntimeSessionSnapshot(repoRoot, sessionId, payload) {
    return enqueue(repoRoot, sessionId, 'session_snapshot', payload);
}
function enqueueRuntimeApprovalAck(repoRoot, sessionId, payload) {
    return enqueue(repoRoot, sessionId, 'approval_ack', payload);
}
function runtimeDeliveryEnvelope(event) {
    return {
        schemaVersion: exports.RUNTIME_DELIVERY_SCHEMA_VERSION,
        eventId: event.eventId,
        sessionId: event.sessionId,
        sequence: event.sequence,
        eventType: event.eventType,
        generatedAt: event.generatedAt,
        payloadHash: event.payloadHash,
    };
}
function pendingRuntimeOutboxEvents(repoRoot, options = {}) {
    const nowMs = options.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(options.limit ?? 10, 100));
    return readOutbox(repoRoot).events
        .filter((event) => options.force === true
        || !event.nextAttemptAt
        || Date.parse(event.nextAttemptAt) <= nowMs)
        .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt))
        .slice(0, limit);
}
function markRuntimeOutboxDelivered(repoRoot, eventId) {
    withOutboxLock(repoRoot, () => {
        const outbox = readOutbox(repoRoot);
        const deliveredAt = new Date().toISOString();
        outbox.events = outbox.events.filter((event) => event.eventId !== eventId);
        outbox.state.lastAttemptAt = deliveredAt;
        outbox.state.lastDeliveredAt = deliveredAt;
        outbox.state.lastDeliveredEventId = eventId;
        outbox.state.lastError = null;
        writeOutbox(repoRoot, outbox);
    });
}
function markRuntimeOutboxFailed(repoRoot, eventId, error) {
    withOutboxLock(repoRoot, () => {
        const outbox = readOutbox(repoRoot);
        if (!outbox.events.some((event) => event.eventId === eventId))
            return;
        const attemptedAt = new Date().toISOString();
        outbox.events = outbox.events.map((event) => {
            if (event.eventId !== eventId)
                return event;
            const attemptCount = event.attemptCount + 1;
            const retryDelayMs = Math.min(60_000, 1_000 * 2 ** Math.min(attemptCount - 1, 6));
            return {
                ...event,
                attemptCount,
                lastAttemptAt: attemptedAt,
                nextAttemptAt: new Date(Date.now() + retryDelayMs).toISOString(),
                lastError: error,
            };
        });
        outbox.state.lastAttemptAt = attemptedAt;
        outbox.state.lastError = error;
        writeOutbox(repoRoot, outbox);
    });
}
function inspectRuntimeOutbox(repoRoot) {
    const outbox = readOutbox(repoRoot);
    const sorted = [...outbox.events].sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
    const retries = sorted
        .map((event) => event.nextAttemptAt)
        .filter((value) => Boolean(value))
        .sort();
    return {
        schemaVersion: exports.RUNTIME_OUTBOX_SCHEMA_VERSION,
        pendingEvents: sorted.length,
        pendingSessionSnapshots: sorted.filter((event) => event.eventType === 'session_snapshot').length,
        pendingApprovalAcks: sorted.filter((event) => event.eventType === 'approval_ack').length,
        oldestPendingAt: sorted[0]?.generatedAt || null,
        nextRetryAt: retries[0] || null,
        lastEnqueuedAt: outbox.state.lastEnqueuedAt,
        lastAttemptAt: outbox.state.lastAttemptAt,
        lastDeliveredAt: outbox.state.lastDeliveredAt,
        lastDeliveredEventId: outbox.state.lastDeliveredEventId,
        lastError: outbox.state.lastError,
    };
}
//# sourceMappingURL=runtime-outbox.js.map