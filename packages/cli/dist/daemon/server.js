"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAEMON_HOST = exports.DAEMON_PORT = void 0;
exports.createDaemonServer = createDaemonServer;
exports.startDaemon = startDaemon;
const http = __importStar(require("node:http"));
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const execution_bus_1 = require("../utils/execution-bus");
const runtime_events_1 = require("../utils/runtime-events");
const control_plane_1 = require("../utils/control-plane");
const workspace_runtime_1 = require("../utils/workspace-runtime");
const replay_runtime_1 = require("../utils/replay-runtime");
// ── Configuration ──────────────────────────────────────────────────────────────
exports.DAEMON_PORT = 4321;
exports.DAEMON_HOST = '127.0.0.1';
const SSE_RETRY_MS = 3000;
const runtimeEventClients = new Map();
let runtimeEventClientSeq = 0;
let runtimeEventUnsubscribe = null;
let runtimeEventTailTimer = null;
let runtimeEventTailCursor = null;
// ── Request helpers ────────────────────────────────────────────────────────────
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}
function send(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}
function success(res, data) {
    send(res, 200, { success: true, data });
}
function failure(res, error, status = 200) {
    send(res, status, { success: false, error });
}
function addCorsHeaders(res, req) {
    // Wildcard is safe: daemon binds to 127.0.0.1 only and isLoopback() rejects
    // any non-local TCP connection. CORS * just lets browsers read the response
    // regardless of what origin the dashboard is served from (local dev, prod domain, etc).
    const requestedHeadersRaw = req.headers['access-control-request-headers'];
    const requestedHeaders = Array.isArray(requestedHeadersRaw)
        ? requestedHeadersRaw.join(',')
        : (requestedHeadersRaw || '');
    const allowedHeaders = new Set(['content-type', 'x-neurcode-source', 'x-neurcode-actor']
        .concat(requestedHeaders.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', [...allowedHeaders].join(', '));
    res.setHeader('Access-Control-Max-Age', '86400');
}
function isExecutionActionType(value) {
    if (typeof value !== 'string')
        return false;
    return (value === 'verify'
        || value === 'fix'
        || value === 'patch'
        || value === 'apply-safe'
        || value === 'reverify'
        || value === 'policy-sync'
        || value === 'intent-update');
}
function isLoopback(req) {
    const addr = req.socket.remoteAddress ?? '';
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
function toSource(req) {
    const raw = req.headers['x-neurcode-source'];
    let value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) {
        try {
            const requestUrl = new URL(req.url ?? '/', 'http://localhost');
            value = requestUrl.searchParams.get('source') ?? undefined;
        }
        catch {
            value = undefined;
        }
    }
    if (!value)
        return 'daemon';
    const normalized = value.trim().toLowerCase();
    if (normalized === 'cli'
        || normalized === 'daemon'
        || normalized === 'dashboard'
        || normalized === 'vscode'
        || normalized === 'ci'
        || normalized === 'mcp'
        || normalized === 'cursor'
        || normalized === 'api') {
        return normalized;
    }
    return 'unknown';
}
function toActor(req) {
    const raw = req.headers['x-neurcode-actor'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && value.trim().length > 0) {
        return value.trim().slice(0, 120);
    }
    const source = toSource(req);
    if (source === 'vscode')
        return 'vscode-user';
    if (source === 'dashboard')
        return 'dashboard-user';
    if (source === 'ci')
        return 'ci-runner';
    return 'daemon-user';
}
function parsePositiveInt(value, fallback) {
    if (!value)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0)
        return fallback;
    return Math.floor(parsed);
}
function toSeverityFilter(value) {
    if (!value)
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'all'
        || normalized === 'blocking'
        || normalized === 'advisory'
        || normalized === 'high'
        || normalized === 'medium'
        || normalized === 'low') {
        return normalized;
    }
    return undefined;
}
function readExecutionQueryOptions(requestUrl) {
    const limit = parsePositiveInt(requestUrl.searchParams.get('limit'), 50);
    const offset = parsePositiveInt(requestUrl.searchParams.get('offset'), 0);
    const q = requestUrl.searchParams.get('q') || undefined;
    const type = requestUrl.searchParams.get('type') || undefined;
    const source = requestUrl.searchParams.get('source') || undefined;
    const status = requestUrl.searchParams.get('status') || undefined;
    const actor = requestUrl.searchParams.get('actor') || undefined;
    const from = requestUrl.searchParams.get('from') || undefined;
    const to = requestUrl.searchParams.get('to') || undefined;
    const severity = toSeverityFilter(requestUrl.searchParams.get('severity'));
    return {
        limit,
        offset,
        q,
        type: type,
        source: source,
        status: status,
        actor,
        from,
        to,
        severity,
    };
}
function isRuntimeEventType(value) {
    if (!value)
        return false;
    const normalized = value.trim().toLowerCase();
    return (normalized === 'execution.started'
        || normalized === 'execution.progress'
        || normalized === 'execution.completed'
        || normalized === 'execution.failed'
        || normalized === 'verification.completed'
        || normalized === 'regression.detected'
        || normalized === 'patch.applied'
        || normalized === 'hotspot.updated'
        || normalized === 'narrative.updated'
        || normalized === 'evidence.generated'
        || normalized === 'governance.config.updated');
}
function isRuntimeEventSeverity(value) {
    if (!value)
        return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'low' || normalized === 'medium' || normalized === 'high';
}
function isExecutionSourceValue(value) {
    if (!value)
        return false;
    const normalized = value.trim().toLowerCase();
    return (normalized === 'cli'
        || normalized === 'daemon'
        || normalized === 'dashboard'
        || normalized === 'vscode'
        || normalized === 'ci'
        || normalized === 'mcp'
        || normalized === 'cursor'
        || normalized === 'api'
        || normalized === 'unknown');
}
function readRuntimeEventFilters(req, requestUrl) {
    const cursorQuery = requestUrl.searchParams.get('cursor') || undefined;
    const lastEventIdHeader = req.headers['last-event-id'];
    const headerCursor = Array.isArray(lastEventIdHeader) ? lastEventIdHeader[0] : lastEventIdHeader;
    const cursor = cursorQuery || headerCursor || undefined;
    const typeRaw = requestUrl.searchParams.get('type');
    const sourceRaw = requestUrl.searchParams.get('source');
    const severityRaw = requestUrl.searchParams.get('severity');
    const executionId = requestUrl.searchParams.get('executionId') || undefined;
    return {
        cursor,
        executionId,
        type: isRuntimeEventType(typeRaw) ? typeRaw : undefined,
        source: isExecutionSourceValue(sourceRaw) ? sourceRaw : undefined,
        severity: isRuntimeEventSeverity(severityRaw) ? severityRaw : undefined,
    };
}
function toRuntimeEventQuery(filters, limit) {
    return {
        limit,
        cursor: filters.cursor,
        executionId: filters.executionId,
        type: filters.type,
        source: filters.source,
        severity: filters.severity,
    };
}
function matchesRuntimeEventFilters(event, filters) {
    if (filters.executionId && event.executionId !== filters.executionId)
        return false;
    if (filters.type && event.type !== filters.type)
        return false;
    if (filters.source && event.source !== filters.source)
        return false;
    if (filters.severity && event.severity !== filters.severity)
        return false;
    return true;
}
function writeSseEvent(res, event) {
    res.write(`id: ${event.cursor}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
}
function broadcastRuntimeEvent(event) {
    if (!runtimeEventTailCursor || runtimeEventTailCursor < event.cursor) {
        runtimeEventTailCursor = event.cursor;
    }
    for (const client of runtimeEventClients.values()) {
        if (!matchesRuntimeEventFilters(event, client.filters))
            continue;
        try {
            writeSseEvent(client.res, event);
            client.filters.cursor = event.cursor;
        }
        catch {
            clearInterval(client.heartbeat);
            runtimeEventClients.delete(client.id);
        }
    }
}
function closeRuntimeEventClients() {
    for (const client of runtimeEventClients.values()) {
        clearInterval(client.heartbeat);
        try {
            client.res.end();
        }
        catch {
            // no-op
        }
    }
    runtimeEventClients.clear();
}
function startRuntimeEventTailer(cwd) {
    runtimeEventTailCursor = (0, runtime_events_1.getLatestRuntimeEventCursor)(cwd);
    if (runtimeEventTailTimer) {
        clearInterval(runtimeEventTailTimer);
        runtimeEventTailTimer = null;
    }
    runtimeEventTailTimer = setInterval(() => {
        if (runtimeEventClients.size === 0)
            return;
        let cursor = runtimeEventTailCursor;
        let loops = 0;
        while (loops < 10) {
            const replay = (0, runtime_events_1.queryRuntimeEvents)(cwd, {
                limit: 100,
                cursor: cursor || undefined,
            });
            if (replay.items.length === 0)
                break;
            for (const event of replay.items) {
                broadcastRuntimeEvent(event);
            }
            cursor = replay.nextCursor;
            runtimeEventTailCursor = cursor;
            if (!replay.hasMore)
                break;
            loops += 1;
        }
    }, 1000);
}
function stopRuntimeEventTailer() {
    if (!runtimeEventTailTimer)
        return;
    clearInterval(runtimeEventTailTimer);
    runtimeEventTailTimer = null;
}
// ── Route handlers ─────────────────────────────────────────────────────────────
async function handleVerify(req, res) {
    const run = await (0, execution_bus_1.runExecution)({
        type: 'verify',
        source: toSource(req),
        actor: toActor(req),
        cwd: process.cwd(),
        reverify: false,
    });
    if (!run.primaryPayload) {
        failure(res, run.execution.result?.message || 'verify execution produced no payload');
        return;
    }
    success(res, {
        ...run.primaryPayload,
        _execution: {
            id: run.execution.id,
            type: run.execution.type,
            source: run.execution.source,
            actor: run.execution.actor,
            status: run.execution.status,
            trend: run.execution.verification.diff.trend,
            evidence: run.execution.evidence.references,
            durationMs: run.execution.durationMs,
        },
    });
}
async function handleFix(req, res) {
    const run = await (0, execution_bus_1.runExecution)({
        type: 'fix',
        source: toSource(req),
        actor: toActor(req),
        cwd: process.cwd(),
        reverify: true,
    });
    if (!run.primaryPayload) {
        failure(res, run.execution.result?.message || 'fix execution produced no payload');
        return;
    }
    success(res, {
        ...run.primaryPayload,
        verifyAfter: run.verificationPayload ?? null,
        _execution: {
            id: run.execution.id,
            type: run.execution.type,
            source: run.execution.source,
            actor: run.execution.actor,
            status: run.execution.status,
            trend: run.execution.verification.diff.trend,
            evidence: run.execution.evidence.references,
            durationMs: run.execution.durationMs,
        },
    });
}
async function handleFixApplySafe(req, res) {
    const run = await (0, execution_bus_1.runExecution)({
        type: 'apply-safe',
        source: toSource(req),
        actor: toActor(req),
        cwd: process.cwd(),
        reverify: true,
    });
    if (!run.primaryPayload) {
        failure(res, run.execution.result?.message || 'fix --apply-safe execution produced no payload');
        return;
    }
    success(res, {
        ...run.primaryPayload,
        verifyAfter: run.verificationPayload ?? null,
        execution: run.execution,
    });
}
async function handlePatch(req, res) {
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400);
        return;
    }
    const file = body.file;
    if (!file || typeof file !== 'string' || file.includes('..')) {
        failure(res, 'Missing or unsafe "file" field', 400);
        return;
    }
    // Capture file content before patch to detect real change
    const absPath = path.resolve(process.cwd(), file);
    let contentBefore = null;
    try {
        contentBefore = fs.readFileSync(absPath, 'utf-8');
    }
    catch { /* file may not exist */ }
    const run = await (0, execution_bus_1.runExecution)({
        type: 'patch',
        source: toSource(req),
        actor: toActor(req),
        target: file,
        cwd: process.cwd(),
        reverify: true,
    });
    const patchData = run.primaryPayload ?? {
        success: false,
        file,
        message: run.execution.result?.message || 'No applicable patch found',
    };
    // Validate that the file actually changed on disk
    let changed = false;
    if (patchData.success && contentBefore !== null) {
        try {
            const contentAfter = fs.readFileSync(absPath, 'utf-8');
            changed = contentAfter !== contentBefore;
        }
        catch { /* ignore read error */ }
    }
    success(res, {
        patch: { ...patchData, changed },
        verify: run.verificationPayload ?? null,
        execution: run.execution,
    });
}
async function handleExecute(req, res) {
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400);
        return;
    }
    const type = body.type;
    if (!isExecutionActionType(type)) {
        failure(res, 'Invalid or missing "type" field', 400);
        return;
    }
    const run = await (0, execution_bus_1.runExecution)({
        type,
        source: toSource(req),
        actor: toActor(req),
        target: body.target ?? null,
        intentText: body.intentText ?? null,
        cwd: process.cwd(),
        reverify: body.reverify !== false,
        ciMode: typeof body.ciMode === 'boolean' ? body.ciMode : undefined,
        evidenceDir: typeof body.evidenceDir === 'string' ? body.evidenceDir : undefined,
        dedupeWindowMs: typeof body.dedupeWindowMs === 'number' ? body.dedupeWindowMs : undefined,
    });
    success(res, {
        execution: run.execution,
        payload: run.primaryPayload,
        verification: run.verificationPayload,
    });
}
async function handleListExecutions(req, res) {
    const requestUrl = new URL(req.url || '/executions', 'http://localhost');
    const queryOptions = readExecutionQueryOptions(requestUrl);
    const result = (0, execution_bus_1.queryExecutions)(process.cwd(), queryOptions);
    success(res, {
        count: result.items.length,
        items: result.items,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
        nextOffset: result.nextOffset,
        scanned: result.scanned,
        filters: {
            type: queryOptions.type ?? 'all',
            source: queryOptions.source ?? 'all',
            status: queryOptions.status ?? 'all',
            actor: queryOptions.actor ?? '',
            severity: queryOptions.severity ?? 'all',
            q: queryOptions.q ?? '',
            from: queryOptions.from ?? null,
            to: queryOptions.to ?? null,
        },
    });
}
async function handleGetExecution(req, res, executionId) {
    const record = (0, execution_bus_1.getExecutionById)(executionId, process.cwd());
    if (!record) {
        failure(res, `Execution not found: ${executionId}`, 404);
        return;
    }
    success(res, record);
}
async function handleGetExecutionEvents(req, res, executionId) {
    const record = (0, execution_bus_1.getExecutionById)(executionId, process.cwd());
    if (!record) {
        failure(res, `Execution not found: ${executionId}`, 404);
        return;
    }
    success(res, {
        id: record.id,
        status: record.status,
        events: record.events,
    });
}
async function handleGetExecutionTimeline(_req, res, executionId) {
    const record = (0, execution_bus_1.getExecutionById)(executionId, process.cwd());
    if (!record) {
        failure(res, `Execution not found: ${executionId}`, 404);
        return;
    }
    success(res, (0, execution_bus_1.buildExecutionTimeline)(record));
}
async function handleGetExecutionDiff(_req, res, executionId) {
    const record = (0, execution_bus_1.getExecutionById)(executionId, process.cwd());
    if (!record) {
        failure(res, `Execution not found: ${executionId}`, 404);
        return;
    }
    success(res, (0, execution_bus_1.buildExecutionDiffInspection)(record));
}
async function handleListRuntimeEvents(req, res) {
    const requestUrl = new URL(req.url || '/events', 'http://localhost');
    const filters = readRuntimeEventFilters(req, requestUrl);
    const limit = parsePositiveInt(requestUrl.searchParams.get('limit'), 100);
    const result = (0, runtime_events_1.queryRuntimeEvents)(process.cwd(), toRuntimeEventQuery(filters, limit));
    success(res, {
        count: result.items.length,
        items: result.items,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
        scanned: result.scanned,
        filters,
    });
}
function asControlPlanePatch(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    const allowedKeys = new Set([
        'runtime',
        'remediation',
        'evidence',
        'eventRuntime',
        'ciGovernance',
        'policyGovernance',
    ]);
    const patch = {};
    for (const [key, entry] of Object.entries(record)) {
        if (!allowedKeys.has(key))
            continue;
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            continue;
        patch[key] = entry;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}
async function handleGetControlPlane(_req, res) {
    const state = (0, control_plane_1.readControlPlaneState)(process.cwd());
    const snapshots = (0, control_plane_1.readControlPlaneSnapshotHistory)(process.cwd(), 30);
    success(res, {
        state,
        snapshots,
    });
}
async function handlePreviewControlPlaneUpdate(req, res) {
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400);
        return;
    }
    const patch = asControlPlanePatch(body.patch);
    if (!patch) {
        failure(res, 'Invalid or missing patch object', 400);
        return;
    }
    const preview = (0, control_plane_1.previewControlPlaneUpdate)(patch, process.cwd());
    success(res, preview);
}
async function handleApplyControlPlaneUpdate(req, res) {
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400);
        return;
    }
    const patch = asControlPlanePatch(body.patch);
    if (!patch) {
        failure(res, 'Invalid or missing patch object', 400);
        return;
    }
    const reason = typeof body.reason === 'string' && body.reason.trim().length > 0
        ? body.reason.trim()
        : undefined;
    const result = (0, control_plane_1.applyControlPlaneUpdate)(patch, {
        cwd: process.cwd(),
        actor: toActor(req),
        source: toSource(req),
        reason,
    });
    success(res, result);
}
function asNonEmptyString(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function asStringArray(value) {
    if (!Array.isArray(value))
        return undefined;
    const items = value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    return items.length > 0 ? items : [];
}
function asWorkspaceCreateInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    const name = asNonEmptyString(record.name);
    if (!name)
        return null;
    const input = {
        name,
    };
    const id = asNonEmptyString(record.id);
    if (id)
        input.id = id;
    if (record.description === null || typeof record.description === 'string') {
        input.description = record.description;
    }
    if (Array.isArray(record.repositories)) {
        input.repositories = record.repositories;
    }
    if (record.governance && typeof record.governance === 'object' && !Array.isArray(record.governance)) {
        input.governance = record.governance;
    }
    if (record.access && typeof record.access === 'object' && !Array.isArray(record.access)) {
        input.access = record.access;
    }
    return input;
}
function asWorkspacePatch(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    const patch = {};
    if (typeof record.name === 'string')
        patch.name = record.name;
    if (record.description === null || typeof record.description === 'string')
        patch.description = record.description;
    if (Array.isArray(record.repositories))
        patch.repositories = record.repositories;
    if (record.governance && typeof record.governance === 'object' && !Array.isArray(record.governance)) {
        patch.governance = record.governance;
    }
    if (record.access && typeof record.access === 'object' && !Array.isArray(record.access)) {
        patch.access = record.access;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}
function asWorkspaceRepositoryInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    const name = asNonEmptyString(record.name);
    const rootPath = asNonEmptyString(record.rootPath) || asNonEmptyString(record.path);
    if (!name || !rootPath)
        return null;
    return {
        id: asNonEmptyString(record.id),
        name,
        rootPath,
        services: asStringArray(record.services),
        policyDomain: record.policyDomain === null ? null : asNonEmptyString(record.policyDomain),
        tags: asStringArray(record.tags),
        enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
    };
}
async function handleListWorkspaces(req, res) {
    const requestUrl = new URL(req.url || '/workspaces', 'http://localhost');
    const workspaceId = asNonEmptyString(requestUrl.searchParams.get('workspaceId'));
    const actor = asNonEmptyString(requestUrl.searchParams.get('actor'));
    const list = (0, workspace_runtime_1.listWorkspaces)(process.cwd());
    const snapshot = (0, workspace_runtime_1.getWorkspaceRuntimeSnapshot)({
        cwd: process.cwd(),
        workspaceId,
        actor,
    });
    success(res, {
        schemaVersion: 'neurcode.workspace.api.list.v1',
        generatedAt: new Date().toISOString(),
        count: list.length,
        activeWorkspaceId: snapshot.activeWorkspaceId,
        items: list,
    });
}
async function handleGetWorkspace(_req, res, workspaceId) {
    const workspace = (0, workspace_runtime_1.getWorkspaceById)(workspaceId, process.cwd());
    if (!workspace) {
        failure(res, `Workspace not found: ${workspaceId}`, 404);
        return;
    }
    success(res, workspace);
}
async function handleGetWorkspaceRuntime(req, res, workspaceId) {
    const requestUrl = new URL(req.url || '/workspaces/runtime', 'http://localhost');
    const queryWorkspaceId = asNonEmptyString(requestUrl.searchParams.get('workspaceId'));
    const actor = asNonEmptyString(requestUrl.searchParams.get('actor'));
    const snapshot = (0, workspace_runtime_1.getWorkspaceRuntimeSnapshot)({
        cwd: process.cwd(),
        workspaceId: workspaceId || queryWorkspaceId,
        actor,
    });
    success(res, snapshot);
}
async function handleCreateWorkspace(req, res) {
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400);
        return;
    }
    const input = asWorkspaceCreateInput(body.workspace);
    if (!input) {
        failure(res, 'Invalid or missing workspace payload', 400);
        return;
    }
    const result = (0, workspace_runtime_1.createWorkspace)(input, {
        cwd: process.cwd(),
        source: toSource(req),
        actor: toActor(req),
        setActive: typeof body.setActive === 'boolean' ? body.setActive : true,
    });
    success(res, result);
}
async function handleActivateWorkspace(req, res, workspaceId) {
    const result = (0, workspace_runtime_1.setActiveWorkspace)(workspaceId, {
        cwd: process.cwd(),
        source: toSource(req),
        actor: toActor(req),
    });
    success(res, result);
}
async function handleAddWorkspaceRepository(req, res, workspaceId) {
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400);
        return;
    }
    const input = asWorkspaceRepositoryInput(body.repository);
    if (!input) {
        failure(res, 'Invalid or missing repository payload', 400);
        return;
    }
    const result = (0, workspace_runtime_1.addWorkspaceRepository)(workspaceId, input, {
        cwd: process.cwd(),
        source: toSource(req),
        actor: toActor(req),
    });
    success(res, result);
}
async function handleUpdateWorkspace(req, res, workspaceId) {
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400);
        return;
    }
    const patch = asWorkspacePatch(body.patch);
    if (!patch) {
        failure(res, 'Invalid or missing patch payload', 400);
        return;
    }
    const result = (0, workspace_runtime_1.updateWorkspace)(workspaceId, patch, {
        cwd: process.cwd(),
        source: toSource(req),
        actor: toActor(req),
    });
    success(res, result);
}
async function handleExecuteWorkspace(req, res) {
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400);
        return;
    }
    if (!isExecutionActionType(body.type)) {
        failure(res, 'Invalid or missing execution type', 400);
        return;
    }
    const request = {
        workspaceId: asNonEmptyString(body.workspaceId),
        repositoryIds: asStringArray(body.repositoryIds),
        type: body.type,
        source: toSource(req),
        actor: toActor(req),
        target: body.target === null ? null : asNonEmptyString(body.target) || null,
        intentText: body.intentText === null ? null : asNonEmptyString(body.intentText) || null,
        reverify: typeof body.reverify === 'boolean' ? body.reverify : true,
        ciMode: typeof body.ciMode === 'boolean' ? body.ciMode : undefined,
        evidenceDir: asNonEmptyString(body.evidenceDir),
        dedupeWindowMs: typeof body.dedupeWindowMs === 'number' ? body.dedupeWindowMs : undefined,
    };
    const result = await (0, workspace_runtime_1.executeWorkspaceAction)(request, {
        cwd: process.cwd(),
    });
    success(res, result);
}
async function handleReplayState(req, res) {
    const requestUrl = new URL(req.url || '/replay/state', 'http://localhost');
    const at = asNonEmptyString(requestUrl.searchParams.get('at')) || new Date().toISOString();
    const workspaceId = asNonEmptyString(requestUrl.searchParams.get('workspaceId'));
    const includeEvents = requestUrl.searchParams.get('events') === 'true';
    const eventLimit = parsePositiveInt(requestUrl.searchParams.get('eventLimit'), 400);
    const result = (0, replay_runtime_1.replayGovernanceState)({
        at,
        workspaceId,
        includeEvents,
        eventLimit,
    }, process.cwd());
    success(res, result);
}
async function handleReplayExecution(_req, res, executionId) {
    const result = (0, replay_runtime_1.replayExecution)({ executionId }, process.cwd());
    success(res, result);
}
async function handleReplayWorkspace(req, res, workspaceId) {
    const requestUrl = new URL(req.url || '/replay/workspace', 'http://localhost');
    const queryWorkspaceId = asNonEmptyString(requestUrl.searchParams.get('workspaceId'));
    const at = asNonEmptyString(requestUrl.searchParams.get('at')) || undefined;
    const result = (0, replay_runtime_1.replayWorkspace)({
        workspaceId: workspaceId || queryWorkspaceId || undefined,
        at,
    }, process.cwd());
    success(res, result);
}
async function handleReplayTimeline(req, res) {
    const requestUrl = new URL(req.url || '/replay/timeline', 'http://localhost');
    const request = {
        workspaceId: asNonEmptyString(requestUrl.searchParams.get('workspaceId')),
        from: asNonEmptyString(requestUrl.searchParams.get('from')) || undefined,
        to: asNonEmptyString(requestUrl.searchParams.get('to')) || undefined,
        limit: parsePositiveInt(requestUrl.searchParams.get('limit'), 200),
    };
    const result = (0, replay_runtime_1.replayTimeline)(request, process.cwd());
    success(res, result);
}
async function handleRuntimeEventStream(req, res) {
    const requestUrl = new URL(req.url || '/events/stream', 'http://localhost');
    const filters = readRuntimeEventFilters(req, requestUrl);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.write(`retry: ${SSE_RETRY_MS}\n\n`);
    let cursor = filters.cursor;
    let replayed = 0;
    // Cursor-safe incremental replay before registering live listener.
    while (true) {
        const replay = (0, runtime_events_1.queryRuntimeEvents)(process.cwd(), {
            ...toRuntimeEventQuery({ ...filters, cursor }, 200),
        });
        if (replay.items.length === 0)
            break;
        for (const event of replay.items) {
            if (!matchesRuntimeEventFilters(event, filters))
                continue;
            writeSseEvent(res, event);
            replayed += 1;
        }
        cursor = replay.nextCursor || cursor;
        if (!replay.hasMore)
            break;
    }
    const clientId = ++runtimeEventClientSeq;
    const heartbeat = setInterval(() => {
        try {
            res.write(`: keep-alive ${Date.now()}\n\n`);
        }
        catch {
            const client = runtimeEventClients.get(clientId);
            if (client) {
                clearInterval(client.heartbeat);
                runtimeEventClients.delete(clientId);
            }
        }
    }, 15_000);
    runtimeEventClients.set(clientId, {
        id: clientId,
        res,
        filters: {
            ...filters,
            cursor,
        },
        heartbeat,
    });
    const ackEvent = {
        kind: 'stream.ready',
        replayed,
        cursor: cursor || (0, runtime_events_1.getLatestRuntimeEventCursor)(process.cwd()),
    };
    res.write(`event: stream.ready\n`);
    res.write(`data: ${JSON.stringify(ackEvent)}\n\n`);
    const cleanup = () => {
        const client = runtimeEventClients.get(clientId);
        if (!client)
            return;
        clearInterval(client.heartbeat);
        runtimeEventClients.delete(clientId);
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('close', cleanup);
}
// ── Server factory ─────────────────────────────────────────────────────────────
function createDaemonServer() {
    const server = http.createServer(async (req, res) => {
        addCorsHeaders(res, req);
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        if (!isLoopback(req)) {
            failure(res, 'Only localhost connections are allowed', 403);
            return;
        }
        const url = req.url ?? '/';
        const method = req.method ?? 'GET';
        try {
            if (method === 'GET' && url === '/health') {
                let version = '0.0.0';
                try {
                    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
                    version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? version;
                }
                catch { /* ignore */ }
                send(res, 200, {
                    ok: true,
                    version,
                    cwd: process.cwd(),
                    executionBus: {
                        schemaVersion: 'neurcode.execution.v1',
                        supportedActions: ['verify', 'fix', 'patch', 'apply-safe', 'reverify', 'policy-sync', 'intent-update'],
                    },
                    runtimeEvents: {
                        schemaVersion: 'neurcode.runtime-event.v1',
                        streamPath: '/events/stream',
                    },
                    controlPlane: {
                        schemaVersion: 'neurcode.control-plane.v1',
                        path: '/control-plane',
                    },
                    workspaceRuntime: {
                        schemaVersion: 'neurcode.workspace-runtime.v1',
                        path: '/workspaces/runtime',
                    },
                    replayRuntime: {
                        schemaVersion: 'neurcode.replay.state.v1',
                        path: '/replay/state',
                    },
                });
                return;
            }
            if (method === 'GET' && url.startsWith('/executions')) {
                if (url === '/executions' || url.startsWith('/executions?')) {
                    await handleListExecutions(req, res);
                    return;
                }
                const eventsMatch = url.match(/^\/executions\/([^/]+)\/events(?:\?.*)?$/);
                if (eventsMatch) {
                    await handleGetExecutionEvents(req, res, decodeURIComponent(eventsMatch[1]));
                    return;
                }
                const timelineMatch = url.match(/^\/executions\/([^/]+)\/timeline(?:\?.*)?$/);
                if (timelineMatch) {
                    await handleGetExecutionTimeline(req, res, decodeURIComponent(timelineMatch[1]));
                    return;
                }
                const diffMatch = url.match(/^\/executions\/([^/]+)\/diff(?:\?.*)?$/);
                if (diffMatch) {
                    await handleGetExecutionDiff(req, res, decodeURIComponent(diffMatch[1]));
                    return;
                }
                const detailMatch = url.match(/^\/executions\/([^/?]+)(?:\?.*)?$/);
                if (detailMatch) {
                    await handleGetExecution(req, res, decodeURIComponent(detailMatch[1]));
                    return;
                }
            }
            if (method === 'GET' && url.startsWith('/events')) {
                if (url === '/events' || url.startsWith('/events?')) {
                    await handleListRuntimeEvents(req, res);
                    return;
                }
                if (url === '/events/stream' || url.startsWith('/events/stream?')) {
                    await handleRuntimeEventStream(req, res);
                    return;
                }
            }
            if (method === 'GET' && (url === '/control-plane' || url.startsWith('/control-plane?'))) {
                await handleGetControlPlane(req, res);
                return;
            }
            if (method === 'POST' && url === '/control-plane/preview') {
                await handlePreviewControlPlaneUpdate(req, res);
                return;
            }
            if (method === 'PUT' && url === '/control-plane') {
                await handleApplyControlPlaneUpdate(req, res);
                return;
            }
            if (method === 'GET' && url.startsWith('/workspaces')) {
                if (url === '/workspaces' || url.startsWith('/workspaces?')) {
                    await handleListWorkspaces(req, res);
                    return;
                }
                if (url === '/workspaces/runtime' || url.startsWith('/workspaces/runtime?')) {
                    await handleGetWorkspaceRuntime(req, res);
                    return;
                }
                const runtimeMatch = url.match(/^\/workspaces\/([^/]+)\/runtime(?:\?.*)?$/);
                if (runtimeMatch) {
                    await handleGetWorkspaceRuntime(req, res, decodeURIComponent(runtimeMatch[1]));
                    return;
                }
                const detailMatch = url.match(/^\/workspaces\/([^/?]+)(?:\?.*)?$/);
                if (detailMatch) {
                    await handleGetWorkspace(req, res, decodeURIComponent(detailMatch[1]));
                    return;
                }
            }
            if (method === 'POST' && url === '/workspaces') {
                await handleCreateWorkspace(req, res);
                return;
            }
            const activateMatch = url.match(/^\/workspaces\/([^/]+)\/activate$/);
            if (method === 'POST' && activateMatch) {
                await handleActivateWorkspace(req, res, decodeURIComponent(activateMatch[1]));
                return;
            }
            const addRepoMatch = url.match(/^\/workspaces\/([^/]+)\/repositories$/);
            if (method === 'POST' && addRepoMatch) {
                await handleAddWorkspaceRepository(req, res, decodeURIComponent(addRepoMatch[1]));
                return;
            }
            const updateWorkspaceMatch = url.match(/^\/workspaces\/([^/?]+)$/);
            if (method === 'PUT' && updateWorkspaceMatch) {
                await handleUpdateWorkspace(req, res, decodeURIComponent(updateWorkspaceMatch[1]));
                return;
            }
            if (method === 'POST' && url === '/workspaces/execute') {
                await handleExecuteWorkspace(req, res);
                return;
            }
            if (method === 'GET' && url.startsWith('/replay')) {
                if (url === '/replay/state' || url.startsWith('/replay/state?')) {
                    await handleReplayState(req, res);
                    return;
                }
                if (url === '/replay/timeline' || url.startsWith('/replay/timeline?')) {
                    await handleReplayTimeline(req, res);
                    return;
                }
                if (url === '/replay/workspace' || url.startsWith('/replay/workspace?')) {
                    await handleReplayWorkspace(req, res);
                    return;
                }
                const replayWorkspaceMatch = url.match(/^\/replay\/workspace\/([^/?]+)(?:\?.*)?$/);
                if (replayWorkspaceMatch) {
                    await handleReplayWorkspace(req, res, decodeURIComponent(replayWorkspaceMatch[1]));
                    return;
                }
                const replayExecutionMatch = url.match(/^\/replay\/execution\/([^/?]+)(?:\?.*)?$/);
                if (replayExecutionMatch) {
                    await handleReplayExecution(req, res, decodeURIComponent(replayExecutionMatch[1]));
                    return;
                }
            }
            if (method === 'POST' && url === '/execute') {
                await handleExecute(req, res);
                return;
            }
            if (method === 'POST' && url === '/verify') {
                await handleVerify(req, res);
                return;
            }
            if (method === 'POST' && url === '/fix') {
                await handleFix(req, res);
                return;
            }
            if (method === 'POST' && url === '/fix/apply-safe') {
                await handleFixApplySafe(req, res);
                return;
            }
            if (method === 'POST' && url === '/patch') {
                await handlePatch(req, res);
                return;
            }
            failure(res, `No route for ${method} ${url}`, 404);
        }
        catch (err) {
            failure(res, err instanceof Error ? err.message : String(err), 500);
        }
    });
    return server;
}
// ── Start function ─────────────────────────────────────────────────────────────
function startDaemon() {
    const server = createDaemonServer();
    startRuntimeEventTailer(process.cwd());
    if (!runtimeEventUnsubscribe) {
        runtimeEventUnsubscribe = (0, runtime_events_1.onRuntimeEvent)((event) => {
            broadcastRuntimeEvent(event);
        });
    }
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n❌  Port ${exports.DAEMON_PORT} is already in use.\n` +
                `    Another Neurcode daemon may already be running.\n` +
                `    Check with: lsof -i :${exports.DAEMON_PORT}\n`);
        }
        else {
            console.error(`\n❌  Daemon error: ${err.message}\n`);
        }
        process.exit(1);
    });
    server.listen(exports.DAEMON_PORT, exports.DAEMON_HOST, () => {
        console.log(`\nNeurcode daemon v2 running on http://localhost:${exports.DAEMON_PORT}`);
        console.log(`  POST /verify         → execution bus: verify`);
        console.log(`  POST /fix            → execution bus: fix + reverify`);
        console.log(`  POST /fix/apply-safe → execution bus: apply-safe + reverify`);
        console.log(`  POST /patch          → execution bus: patch + reverify`);
        console.log(`  POST /execute        → unified execution endpoint`);
        console.log(`  GET  /executions     → execution history`);
        console.log(`  GET  /executions/:id → execution detail`);
        console.log(`  GET  /executions/:id/timeline → phase timeline + durations`);
        console.log(`  GET  /executions/:id/diff     → verification + patch inspection`);
        console.log(`  GET  /events         → runtime event history`);
        console.log(`  GET  /events/stream  → SSE deterministic governance runtime`);
        console.log(`  GET  /control-plane  → governance control-plane state + snapshots`);
        console.log(`  POST /control-plane/preview → deterministic config impact preview`);
        console.log(`  PUT  /control-plane  → apply deterministic governance config update`);
        console.log(`  GET  /workspaces     → workspace catalog + active pointer`);
        console.log(`  GET  /workspaces/runtime → workspace governance runtime snapshot`);
        console.log(`  GET  /workspaces/:id/runtime → workspace-specific runtime snapshot`);
        console.log(`  GET  /workspaces/:id → workspace definition`);
        console.log(`  POST /workspaces     → create workspace`);
        console.log(`  PUT  /workspaces/:id → update workspace`);
        console.log(`  POST /workspaces/:id/activate → set active workspace`);
        console.log(`  POST /workspaces/:id/repositories → add repository to workspace`);
        console.log(`  POST /workspaces/execute → workspace-scoped deterministic execution`);
        console.log(`  GET  /replay/state → deterministic governance state replay`);
        console.log(`  GET  /replay/execution/:id → deterministic execution replay`);
        console.log(`  GET  /replay/workspace/:id → deterministic workspace replay`);
        console.log(`  GET  /replay/timeline → deterministic governance timeline replay`);
        console.log(`\n  CWD: ${process.cwd()}`);
        console.log(`  Press Ctrl+C to stop.\n`);
    });
    const stop = () => {
        stopRuntimeEventTailer();
        closeRuntimeEventClients();
        if (runtimeEventUnsubscribe) {
            runtimeEventUnsubscribe();
            runtimeEventUnsubscribe = null;
        }
        server.close(() => {
            console.log('\nNeurcode daemon stopped.');
            process.exit(0);
        });
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}
//# sourceMappingURL=server.js.map