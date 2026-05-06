"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitRuntimeEvent = emitRuntimeEvent;
exports.queryRuntimeEvents = queryRuntimeEvents;
exports.getLatestRuntimeEventCursor = getLatestRuntimeEventCursor;
exports.onRuntimeEvent = onRuntimeEvent;
exports.getRuntimeEventsFilePath = getRuntimeEventsFilePath;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const RUNTIME_EVENT_SCHEMA = 'neurcode.runtime-event.v1';
const DEFAULT_EVENT_RETENTION = 5000;
const MAX_QUERY_LIMIT = 500;
const DEFAULT_QUERY_LIMIT = 100;
const listeners = new Set();
function nowIso() {
    return new Date().toISOString();
}
function normalizeLimit(limit) {
    if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 1) {
        return Math.min(MAX_QUERY_LIMIT, Math.floor(limit));
    }
    return DEFAULT_QUERY_LIMIT;
}
function parseRetention(cwd) {
    const env = process.env.NEURCODE_RUNTIME_EVENT_RETENTION;
    if (!env) {
        try {
            const controlPlanePath = (0, path_1.resolve)(cwd, '.neurcode/control-plane/event-runtime.json');
            if ((0, fs_1.existsSync)(controlPlanePath)) {
                const parsed = JSON.parse((0, fs_1.readFileSync)(controlPlanePath, 'utf8'));
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const retention = parsed.retention;
                    if (retention && typeof retention === 'object' && !Array.isArray(retention)) {
                        const maxEvents = retention.maxEvents;
                        if (typeof maxEvents === 'number' && Number.isFinite(maxEvents) && maxEvents >= 100) {
                            return Math.floor(maxEvents);
                        }
                    }
                }
            }
        }
        catch {
            // fall through to defaults
        }
        return DEFAULT_EVENT_RETENTION;
    }
    const parsed = Number.parseInt(env, 10);
    if (!Number.isFinite(parsed) || parsed < 100)
        return DEFAULT_EVENT_RETENTION;
    return Math.floor(parsed);
}
function toRuntimeEventPaths(cwd) {
    const rootDir = (0, path_1.resolve)(cwd, '.neurcode/runtime-events');
    const eventsFile = (0, path_1.join)(rootDir, 'events.jsonl');
    (0, fs_1.mkdirSync)(rootDir, { recursive: true });
    return { rootDir, eventsFile };
}
function toEventId(input) {
    const digest = (0, crypto_1.createHash)('sha256')
        .update(JSON.stringify(input))
        .digest('hex')
        .slice(0, 16);
    return `evt-${digest}`;
}
function toCursor(timestamp, id) {
    const parsed = Date.parse(timestamp);
    const ms = Number.isFinite(parsed) ? parsed : Date.now();
    return `${String(ms).padStart(13, '0')}:${id}`;
}
function compareCursor(left, right) {
    if (left === right)
        return 0;
    return left < right ? -1 : 1;
}
function readRawLines(eventsFile) {
    if (!(0, fs_1.existsSync)(eventsFile))
        return [];
    try {
        const raw = (0, fs_1.readFileSync)(eventsFile, 'utf8');
        if (!raw.trim())
            return [];
        return raw.split('\n').filter((line) => line.trim().length > 0);
    }
    catch {
        return [];
    }
}
function parseEvent(line) {
    try {
        const parsed = JSON.parse(line);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return null;
        const record = parsed;
        if (record.schemaVersion !== RUNTIME_EVENT_SCHEMA)
            return null;
        if (!record.id || !record.cursor || !record.type || !record.timestamp || !record.executionId)
            return null;
        if (!record.source || !record.actor || !record.severity || !record.payload)
            return null;
        return record;
    }
    catch {
        return null;
    }
}
function appendEventLine(eventsFile, event) {
    const line = `${JSON.stringify(event)}\n`;
    (0, fs_1.writeFileSync)(eventsFile, line, { encoding: 'utf8', flag: 'a' });
}
function pruneRuntimeEvents(eventsFile, keepLatest) {
    const lines = readRawLines(eventsFile);
    if (lines.length <= keepLatest)
        return;
    const kept = lines.slice(lines.length - keepLatest).join('\n');
    (0, fs_1.writeFileSync)(eventsFile, `${kept}\n`, { encoding: 'utf8' });
}
function matchesQuery(event, query) {
    if (query.executionId && event.executionId !== query.executionId)
        return false;
    if (query.type && event.type !== query.type)
        return false;
    if (query.source && event.source !== query.source)
        return false;
    if (query.severity && event.severity !== query.severity)
        return false;
    if (query.cursor && compareCursor(event.cursor, query.cursor) <= 0)
        return false;
    return true;
}
function emitRuntimeEvent(cwd = process.cwd(), input) {
    const resolvedCwd = (0, path_1.resolve)(cwd);
    const paths = toRuntimeEventPaths(resolvedCwd);
    const timestamp = input.timestamp ?? nowIso();
    const payload = input.payload ?? {};
    const id = toEventId({
        timestamp,
        type: input.type,
        executionId: input.executionId,
        source: input.source,
        actor: input.actor,
        payload,
    });
    const cursor = toCursor(timestamp, id);
    const event = {
        schemaVersion: RUNTIME_EVENT_SCHEMA,
        id,
        cursor,
        type: input.type,
        timestamp,
        executionId: input.executionId,
        source: input.source,
        actor: input.actor,
        severity: input.severity,
        payload,
    };
    appendEventLine(paths.eventsFile, event);
    pruneRuntimeEvents(paths.eventsFile, parseRetention(resolvedCwd));
    for (const listener of listeners) {
        try {
            listener(event);
        }
        catch {
            // Listener failures must not break deterministic execution pipeline.
        }
    }
    return event;
}
function queryRuntimeEvents(cwd = process.cwd(), query = {}) {
    const paths = toRuntimeEventPaths((0, path_1.resolve)(cwd));
    const limit = normalizeLimit(query.limit);
    const lines = readRawLines(paths.eventsFile);
    const items = [];
    let scanned = 0;
    let hasMore = false;
    for (const line of lines) {
        const parsed = parseEvent(line);
        if (!parsed)
            continue;
        scanned += 1;
        if (!matchesQuery(parsed, query))
            continue;
        if (items.length >= limit) {
            hasMore = true;
            break;
        }
        items.push(parsed);
    }
    const nextCursor = items.length > 0 ? items[items.length - 1].cursor : query.cursor ?? null;
    return {
        items,
        hasMore,
        nextCursor,
        scanned,
    };
}
function getLatestRuntimeEventCursor(cwd = process.cwd()) {
    const result = queryRuntimeEvents(cwd, { limit: 1_000_000 });
    if (result.items.length === 0)
        return null;
    return result.items[result.items.length - 1].cursor;
}
function onRuntimeEvent(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
function getRuntimeEventsFilePath(cwd = process.cwd()) {
    const paths = toRuntimeEventPaths((0, path_1.resolve)(cwd));
    return paths.eventsFile;
}
//# sourceMappingURL=runtime-events.js.map