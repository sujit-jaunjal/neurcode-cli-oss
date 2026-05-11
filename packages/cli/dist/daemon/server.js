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
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const patch_engine_1 = require("../patch-engine");
const diff_1 = require("../patch-engine/diff");
const execution_bus_1 = require("../utils/execution-bus");
const runtime_events_1 = require("../utils/runtime-events");
const control_plane_1 = require("../utils/control-plane");
const workspace_runtime_1 = require("../utils/workspace-runtime");
const workspace_1 = require("../workspace");
const semantic_1 = require("../semantic");
const intent_engine_1 = require("../intent-engine");
const replay_runtime_1 = require("../utils/replay-runtime");
const contracts_1 = require("@neurcode-ai/contracts");
const telemetry_1 = require("@neurcode-ai/telemetry");
const governance_provenance_1 = require("../utils/governance-provenance");
const pilot_metrics_1 = require("../utils/pilot-metrics");
// ── Configuration ──────────────────────────────────────────────────────────────
exports.DAEMON_PORT = Number.parseInt(process.env.NEURCODE_DAEMON_PORT || '4321', 10) || 4321;
exports.DAEMON_HOST = process.env.NEURCODE_DAEMON_HOST || '127.0.0.1';
const SSE_RETRY_MS = 3000;
const REQUEST_ID_HEADER = 'x-neurcode-request-id';
const ALLOW_NON_LOOPBACK = ['1', 'true', 'yes', 'on'].includes(String(process.env.NEURCODE_DAEMON_ALLOW_REMOTE || '').trim().toLowerCase());
const runtimeEventClients = new Map();
let runtimeEventClientSeq = 0;
let runtimeEventUnsubscribe = null;
let runtimeEventTailTimer = null;
let runtimeEventTailCursor = null;
const DAEMON_MAX_ERROR_HISTORY = 40;
const DAEMON_MAX_ROUTE_SAMPLE = 1000;
const daemonOpsMetrics = {
    startedAt: new Date().toISOString(),
    requestsTotal: 0,
    requestsByMethod: {},
    requestsByRoute: {},
    failuresTotal: 0,
    retriableFailuresTotal: 0,
    stalePreviewRejections: 0,
    rollbackStaleRejections: 0,
    patchApplied: 0,
    patchPartial: 0,
    patchRejected: 0,
    rollbackApplied: 0,
    rollbackRejected: 0,
    recentErrors: [],
};
function normalizeRoutePath(url) {
    const pathOnly = url.split('?')[0]?.trim() || '/';
    return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}
function incrementMetricCounter(record, key) {
    record[key] = (record[key] || 0) + 1;
}
function recordDaemonRequest(url, method) {
    daemonOpsMetrics.requestsTotal += 1;
    incrementMetricCounter(daemonOpsMetrics.requestsByMethod, method.toUpperCase());
    const route = normalizeRoutePath(url);
    incrementMetricCounter(daemonOpsMetrics.requestsByRoute, route);
    // Keep route cardinality bounded for long-lived daemon sessions.
    const routeKeys = Object.keys(daemonOpsMetrics.requestsByRoute);
    if (routeKeys.length > DAEMON_MAX_ROUTE_SAMPLE) {
        const overflow = routeKeys
            .sort((left, right) => (daemonOpsMetrics.requestsByRoute[left] || 0) - (daemonOpsMetrics.requestsByRoute[right] || 0))
            .slice(0, routeKeys.length - DAEMON_MAX_ROUTE_SAMPLE);
        for (const key of overflow) {
            delete daemonOpsMetrics.requestsByRoute[key];
        }
    }
}
function recordDaemonFailure(sample) {
    daemonOpsMetrics.failuresTotal += 1;
    if (sample.retriable) {
        daemonOpsMetrics.retriableFailuresTotal += 1;
    }
    daemonOpsMetrics.recentErrors.unshift({
        at: new Date().toISOString(),
        ...sample,
    });
    if (daemonOpsMetrics.recentErrors.length > DAEMON_MAX_ERROR_HISTORY) {
        daemonOpsMetrics.recentErrors.length = DAEMON_MAX_ERROR_HISTORY;
    }
}
function recordPatchOutcome(status) {
    if (status === 'applied') {
        daemonOpsMetrics.patchApplied += 1;
        return;
    }
    if (status === 'partial') {
        daemonOpsMetrics.patchPartial += 1;
        return;
    }
    if (status === 'stale_preview') {
        daemonOpsMetrics.patchRejected += 1;
        daemonOpsMetrics.stalePreviewRejections += 1;
        return;
    }
    if (status === 'rollback_applied') {
        daemonOpsMetrics.rollbackApplied += 1;
        return;
    }
    if (status === 'rollback_stale') {
        daemonOpsMetrics.rollbackRejected += 1;
        daemonOpsMetrics.rollbackStaleRejections += 1;
        return;
    }
    if (status === 'rollback_rejected') {
        daemonOpsMetrics.rollbackRejected += 1;
        return;
    }
    daemonOpsMetrics.patchRejected += 1;
}
function buildDaemonOperationalSummary(cwd) {
    const uptimeSeconds = Math.max(0, Math.floor((Date.now() - new Date(daemonOpsMetrics.startedAt).getTime()) / 1000));
    const lockPath = path.resolve(cwd, '.neurcode', 'executions', '.lock');
    let lockPresent = false;
    let lockAgeMs = null;
    try {
        const stat = fs.statSync(lockPath);
        lockPresent = stat.isFile();
        lockAgeMs = Date.now() - stat.mtimeMs;
    }
    catch {
        lockPresent = false;
        lockAgeMs = null;
    }
    const executionQuery = (0, execution_bus_1.queryExecutions)(cwd, {
        limit: 200,
        status: 'all',
    });
    const items = executionQuery.items || [];
    const activeExecutions = items.filter((item) => item.status !== 'completed' && item.status !== 'failed').length;
    const recentFailures = items
        .filter((item) => item.status === 'failed')
        .slice(0, 10)
        .map((item) => ({
        id: item.id,
        type: item.type,
        source: item.source,
        actor: item.actor,
        completedAt: item.completedAt,
        message: item.result?.message || null,
    }));
    const patchAttempts = daemonOpsMetrics.patchApplied + daemonOpsMetrics.patchPartial + daemonOpsMetrics.patchRejected;
    const rollbackAttempts = daemonOpsMetrics.rollbackApplied + daemonOpsMetrics.rollbackRejected;
    return {
        uptimeSeconds,
        activeExecutions,
        sseClients: runtimeEventClients.size,
        requestTotals: {
            total: daemonOpsMetrics.requestsTotal,
            failures: daemonOpsMetrics.failuresTotal,
            retriableFailures: daemonOpsMetrics.retriableFailuresTotal,
            byMethod: daemonOpsMetrics.requestsByMethod,
            topRoutes: Object.entries(daemonOpsMetrics.requestsByRoute)
                .sort((left, right) => right[1] - left[1])
                .slice(0, 12)
                .map(([route, count]) => ({ route, count })),
        },
        patchStats: {
            attempts: patchAttempts,
            applied: daemonOpsMetrics.patchApplied,
            partial: daemonOpsMetrics.patchPartial,
            rejected: daemonOpsMetrics.patchRejected,
            stalePreviewRejections: daemonOpsMetrics.stalePreviewRejections,
            successRate: patchAttempts > 0 ? Number((daemonOpsMetrics.patchApplied / patchAttempts).toFixed(4)) : null,
        },
        rollbackStats: {
            attempts: rollbackAttempts,
            applied: daemonOpsMetrics.rollbackApplied,
            rejected: daemonOpsMetrics.rollbackRejected,
            staleRejections: daemonOpsMetrics.rollbackStaleRejections,
            successRate: rollbackAttempts > 0 ? Number((daemonOpsMetrics.rollbackApplied / rollbackAttempts).toFixed(4)) : null,
        },
        executionLock: {
            path: lockPath,
            present: lockPresent,
            ageMs: lockAgeMs,
        },
        recentFailures,
        recentErrors: daemonOpsMetrics.recentErrors,
    };
}
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
    const requestIdRaw = res.getHeader(REQUEST_ID_HEADER);
    const requestId = typeof requestIdRaw === 'string' && requestIdRaw.trim().length > 0
        ? requestIdRaw.trim()
        : null;
    const payloadBody = (requestId
        && body
        && typeof body === 'object'
        && !Array.isArray(body)
        && !Object.prototype.hasOwnProperty.call(body, 'requestId'))
        ? { ...body, requestId }
        : body;
    const payload = JSON.stringify(payloadBody);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}
function success(res, data) {
    send(res, 200, { success: true, data });
}
function defaultFailureCode(status, error) {
    if (status === 400)
        return contracts_1.DAEMON_ERROR_CODES.badRequest;
    if (status === 401)
        return contracts_1.DAEMON_ERROR_CODES.unauthorized;
    if (status === 403)
        return contracts_1.DAEMON_ERROR_CODES.forbidden;
    if (status === 404) {
        if (/no route for/i.test(error))
            return contracts_1.DAEMON_ERROR_CODES.routeNotFound;
        return contracts_1.DAEMON_ERROR_CODES.notFound;
    }
    if (status === 408)
        return contracts_1.DAEMON_ERROR_CODES.timeout;
    if (status === 409)
        return contracts_1.DAEMON_ERROR_CODES.conflict;
    if (status === 422)
        return contracts_1.DAEMON_ERROR_CODES.validationFailed;
    if (status === 429)
        return contracts_1.DAEMON_ERROR_CODES.rateLimited;
    if (status >= 500)
        return contracts_1.DAEMON_ERROR_CODES.internalError;
    return contracts_1.DAEMON_ERROR_CODES.unknown;
}
function failure(res, error, status = 500, options = {}) {
    const code = options.code ?? defaultFailureCode(status, error);
    const retriable = options.retriable ?? status >= 500;
    const requestIdRaw = res.getHeader(REQUEST_ID_HEADER);
    const requestId = typeof requestIdRaw === 'string' && requestIdRaw.trim().length > 0
        ? requestIdRaw.trim()
        : null;
    const route = res.__neurcodeRoutePath || '/unknown';
    recordDaemonFailure({
        route,
        requestId,
        code,
        message: error,
        retriable,
    });
    send(res, status, {
        success: false,
        error,
        code,
        retriable,
        details: options.details ?? null,
    });
}
function addCorsHeaders(res, req) {
    // Wildcard is safe: daemon binds to 127.0.0.1 only and isLoopback() rejects
    // any non-local TCP connection. CORS * just lets browsers read the response
    // regardless of what origin the dashboard is served from (local dev, prod domain, etc).
    const requestedHeadersRaw = req.headers['access-control-request-headers'];
    const requestedHeaders = Array.isArray(requestedHeadersRaw)
        ? requestedHeadersRaw.join(',')
        : (requestedHeadersRaw || '');
    const allowedHeaders = new Set(['content-type', 'x-neurcode-source', 'x-neurcode-actor', REQUEST_ID_HEADER]
        .concat(requestedHeaders.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', [...allowedHeaders].join(', '));
    res.setHeader('Access-Control-Max-Age', '86400');
}
function resolveGitRoot(cwd) {
    const result = (0, node_child_process_1.spawnSync)('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status !== 0)
        return null;
    const value = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    return value.length > 0 ? value : null;
}
function captureGitDirtyPaths(cwd) {
    const gitRoot = resolveGitRoot(cwd);
    if (!gitRoot)
        return null;
    const statusResult = (0, node_child_process_1.spawnSync)('git', ['-C', cwd, 'status', '--porcelain=1', '-z', '--untracked-files=all'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (statusResult.status !== 0 || typeof statusResult.stdout !== 'string')
        return null;
    const tokens = statusResult.stdout.split('\0').filter((entry) => entry.length > 0);
    const dirty = new Set();
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.length < 4)
            continue;
        const status = token.slice(0, 2);
        const filePath = token.slice(3).trim();
        if (filePath.length > 0) {
            dirty.add(path.resolve(gitRoot, filePath));
        }
        const renamedOrCopied = status.includes('R') || status.includes('C');
        if (renamedOrCopied && index + 1 < tokens.length) {
            index += 1;
        }
    }
    return dirty;
}
function hashFileForDiff(absPath) {
    try {
        const stat = fs.statSync(absPath);
        if (!stat.isFile())
            return '<non-file>';
        const content = fs.readFileSync(absPath);
        return (0, node_crypto_1.createHash)('sha256').update(content).digest('hex');
    }
    catch {
        return '<missing>';
    }
}
function captureDirtyFileFingerprints(cwd) {
    const dirtyPaths = captureGitDirtyPaths(cwd);
    if (!dirtyPaths)
        return null;
    const map = new Map();
    for (const dirtyPath of dirtyPaths) {
        map.set(dirtyPath, hashFileForDiff(dirtyPath));
    }
    return map;
}
function isAllowedPatchSideEffect(absPath, targetAbsPath, cwd) {
    if (absPath === targetAbsPath)
        return true;
    const rel = path.relative(cwd, absPath);
    if (!rel || rel.startsWith('..'))
        return false;
    if (rel === 'neurcode.policy.compiled.json')
        return true;
    return rel === '.neurcode' || rel.startsWith(`.neurcode${path.sep}`);
}
function collectUnexpectedPatchSideEffects(before, after, targetAbsPath, cwd) {
    if (!before || !after)
        return [];
    const added = [...after].filter((entry) => !before.has(entry));
    const unexpected = added
        .filter((entry) => !isAllowedPatchSideEffect(entry, targetAbsPath, cwd))
        .map((entry) => path.relative(cwd, entry).replace(/\\/g, '/'))
        .filter((entry) => entry.length > 0)
        .sort();
    return unexpected;
}
function collectUnexpectedPatchMutations(before, after, targetAbsPath, cwd) {
    if (!before || !after)
        return [];
    const keys = new Set([...before.keys(), ...after.keys()]);
    const unexpected = [];
    for (const key of keys) {
        const beforeHash = before.get(key) ?? '<missing>';
        const afterHash = after.get(key) ?? '<missing>';
        if (beforeHash === afterHash)
            continue;
        if (isAllowedPatchSideEffect(key, targetAbsPath, cwd))
            continue;
        const rel = path.relative(cwd, key).replace(/\\/g, '/');
        if (rel.length > 0 && !rel.startsWith('..')) {
            unexpected.push(rel);
        }
    }
    return unexpected.sort();
}
function patternDescriptor(kind, confidence, manualReviewRequired) {
    const labelByKind = {
        missing_validation: 'API input validation guard',
        missing_timeout_handling: 'Outbound request timeout guard',
        unsafe_fetch_without_retries: 'Outbound request retry guard',
        missing_idempotency_keys: 'Mutation idempotency-key guard',
        unsafe_file_uploads: 'Upload MIME/size validation guard',
        missing_auth_middleware: 'Route authentication middleware',
        missing_rate_limiting: 'Route rate limiting middleware',
        missing_token_expiry: 'JWT expiry enforcement',
        unsafe_inner_html_usage: 'Unsafe DOM sink replacement',
        unsafe_sensitive_logging: 'Sensitive log redaction',
        db_in_ui: 'Service-layer boundary placeholder',
        todo_fixme: 'TODO/FIXME debt marker removal',
    };
    const confidenceModel = confidence === 'high'
        ? 'high'
        : confidence === 'medium'
            ? 'medium'
            : 'low';
    return {
        kind,
        label: labelByKind[kind] || kind,
        deterministic: true,
        confidenceModel,
        advisoryOnly: confidenceModel === 'low',
        manualReviewRequired,
    };
}
function summarizeDiff(diff) {
    let addedLines = 0;
    let removedLines = 0;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@'))
            continue;
        if (line.startsWith('+'))
            addedLines += 1;
        if (line.startsWith('-'))
            removedLines += 1;
    }
    const changedLines = addedLines + removedLines;
    return {
        addedLines,
        removedLines,
        changedLines,
        summary: `${changedLines} changed line(s): +${addedLines} / -${removedLines}`,
    };
}
function extractRequestInputUsage(content) {
    const accessMatch = content.match(/\b(req|request)\.(body|params|query)\b/);
    if (!accessMatch)
        return null;
    const receiver = accessMatch[1];
    const field = accessMatch[2];
    const fieldRegex = new RegExp(`\\b${receiver}\\.${field}\\.([A-Za-z_$][\\w$]*)\\b`, 'g');
    const fields = [];
    const seen = new Set();
    let match = fieldRegex.exec(content);
    while (match) {
        const fieldName = match[1];
        if (!seen.has(fieldName)) {
            seen.add(fieldName);
            fields.push(fieldName);
        }
        match = fieldRegex.exec(content);
    }
    return { receiver, field, fields };
}
function buildPatchPreviewReasoning(patternKind, targetPath, beforeContent) {
    if (!patternKind)
        return null;
    if (patternKind === 'missing_validation') {
        const usage = extractRequestInputUsage(beforeContent);
        if (!usage) {
            return {
                summary: 'Adds deterministic API input validation guard.',
                why: `This file accesses request input without a validation boundary check.`,
                risk: 'Malformed input can cause runtime errors or unsafe processing paths.',
                expectedOutcome: 'Invalid requests fail fast and valid requests continue unchanged.',
            };
        }
        const noun = usage.field === 'body' ? 'request body' : usage.field === 'params' ? 'route params' : 'query params';
        const fieldSummary = usage.fields.length > 0 ? usage.fields.join(', ') : 'no explicit property access detected';
        return {
            summary: `Adds deterministic validation before reading ${usage.receiver}.${usage.field}.`,
            why: `${targetPath} reads ${noun} fields (${fieldSummary}) before validation.`,
            risk: `Without boundary validation, malformed ${noun} may propagate into handler logic.`,
            expectedOutcome: `Invalid ${noun} returns HTTP 400 early; valid requests keep existing behavior.`,
            fields: usage.fields,
        };
    }
    if (patternKind === 'db_in_ui') {
        return {
            summary: 'Suggests moving direct DB access behind a service boundary.',
            why: `${targetPath} appears to perform direct data access in a non-service layer.`,
            risk: 'Layering violations increase coupling and make behavior harder to govern.',
            expectedOutcome: 'Patch inserts a deterministic placeholder to redirect to service-layer logic.',
        };
    }
    if (patternKind === 'missing_auth_middleware') {
        return {
            summary: 'Adds deterministic authentication middleware to the route definition.',
            why: `${targetPath} appears to expose a request handler without an auth middleware guard.`,
            risk: 'Unauthenticated routes can expose sensitive behavior to unauthorized clients.',
            expectedOutcome: 'Route execution is gated by requireAuth before handler logic runs.',
        };
    }
    if (patternKind === 'missing_rate_limiting') {
        return {
            summary: 'Adds deterministic rate-limit middleware to the route definition.',
            why: `${targetPath} appears to expose a request handler without rate limiting controls.`,
            risk: 'Unbounded request rates can increase abuse, cost, and availability risks.',
            expectedOutcome: 'Route applies rateLimitGuard before handler execution.',
        };
    }
    if (patternKind === 'missing_timeout_handling') {
        return {
            summary: 'Adds deterministic timeout guard to outbound fetch call.',
            why: `${targetPath} issues a fetch request without timeout protection.`,
            risk: 'Unbounded network calls can hang request execution and degrade reliability under upstream latency.',
            expectedOutcome: 'Fetch call aborts after timeout and fails fast instead of hanging.',
        };
    }
    if (patternKind === 'unsafe_fetch_without_retries') {
        return {
            summary: 'Wraps outbound fetch call in deterministic retry guard.',
            why: `${targetPath} makes outbound network calls without transient failure retry handling.`,
            risk: 'Single transient failures can become user-facing errors and increase instability.',
            expectedOutcome: 'Transient upstream failures retry deterministically before failing.',
        };
    }
    if (patternKind === 'missing_idempotency_keys') {
        return {
            summary: 'Adds deterministic idempotency-key guard for side-effecting requests.',
            why: `${targetPath} appears to process payment/order-like mutations without idempotency key enforcement.`,
            risk: 'Duplicate requests can cause repeated side effects (double charges/orders).',
            expectedOutcome: 'Requests missing idempotency key fail early with explicit error.',
        };
    }
    if (patternKind === 'unsafe_file_uploads') {
        return {
            summary: 'Adds deterministic MIME and size guards for uploaded files.',
            why: `${targetPath} appears to process uploaded files without boundary checks.`,
            risk: 'Unbounded or unsafe uploads increase security and stability risk.',
            expectedOutcome: 'Invalid upload payloads are rejected before processing.',
        };
    }
    if (patternKind === 'missing_token_expiry') {
        return {
            summary: 'Adds deterministic token expiry to JWT signing call.',
            why: `${targetPath} signs JWT tokens without an expiresIn option.`,
            risk: 'Long-lived tokens increase replay and account-compromise blast radius.',
            expectedOutcome: 'Tokens gain explicit expiry to enforce credential rotation windows.',
        };
    }
    if (patternKind === 'unsafe_inner_html_usage') {
        return {
            summary: 'Replaces unsafe innerHTML assignment with textContent.',
            why: `${targetPath} writes HTML content directly into the DOM using innerHTML.`,
            risk: 'innerHTML assignments can expose XSS vectors when input is not trusted.',
            expectedOutcome: 'DOM assignment becomes text-only rendering with reduced injection risk.',
        };
    }
    if (patternKind === 'unsafe_sensitive_logging') {
        return {
            summary: 'Removes deterministic sensitive logging line.',
            why: `${targetPath} appears to log secret-bearing fields (token/authorization/password).`,
            risk: 'Sensitive log content can leak credentials to observability or audit sinks.',
            expectedOutcome: 'Sensitive logging path is replaced with a neutral warning placeholder.',
        };
    }
    if (patternKind === 'todo_fixme') {
        return {
            summary: 'Removes TODO/FIXME marker matched by policy.',
            why: `${targetPath} includes TODO/FIXME comments tracked as governance debt.`,
            risk: 'Unresolved TODO markers can hide missing implementation or review debt.',
            expectedOutcome: 'Patch removes the marker; implementation must still be verified separately.',
        };
    }
    return null;
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
function isLoopback(req) {
    if (ALLOW_NON_LOOPBACK)
        return true;
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
    const normalizedPayload = normalizeVerifyPayloadForLegacyClients(run.primaryPayload ?? null) ?? run.primaryPayload;
    success(res, {
        ...normalizedPayload,
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
    const normalizedFixPayload = normalizeFixPayloadForLegacyClients(run.primaryPayload) ?? run.primaryPayload;
    const normalizedVerifyAfter = normalizeVerifyPayloadForLegacyClients(run.verificationPayload);
    success(res, {
        ...normalizedFixPayload,
        verifyAfter: normalizedVerifyAfter ?? null,
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
    const normalizedFixPayload = normalizeFixPayloadForLegacyClients(run.primaryPayload) ?? run.primaryPayload;
    const normalizedVerifyAfter = normalizeVerifyPayloadForLegacyClients(run.verificationPayload);
    success(res, {
        ...normalizedFixPayload,
        verifyAfter: normalizedVerifyAfter ?? null,
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
    const previewToken = typeof body.previewToken === 'string' && body.previewToken.trim().length > 0
        ? body.previewToken.trim()
        : undefined;
    const cwd = process.cwd();
    const targetPath = file.trim();
    const absPath = path.resolve(cwd, targetPath);
    const beforeDirtyPaths = captureGitDirtyPaths(cwd);
    const beforeDirtyFingerprints = captureDirtyFileFingerprints(cwd);
    // Capture file content before patch to detect real change
    let contentBefore = null;
    try {
        contentBefore = fs.readFileSync(absPath, 'utf-8');
    }
    catch { /* file may not exist */ }
    const primaryArgs = ['patch', '--file', targetPath];
    if (previewToken) {
        primaryArgs.push('--preview-token', previewToken);
    }
    const run = await (0, execution_bus_1.runExecution)({
        type: 'patch',
        source: toSource(req),
        actor: toActor(req),
        target: targetPath,
        cwd,
        reverify: true,
        primaryArgs,
    });
    const patchData = run.primaryPayload ?? {
        success: false,
        file: targetPath,
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
    const afterDirtyPaths = captureGitDirtyPaths(cwd);
    const afterDirtyFingerprints = captureDirtyFileFingerprints(cwd);
    const sideEffects = collectUnexpectedPatchSideEffects(beforeDirtyPaths, afterDirtyPaths, absPath, cwd);
    const mutatedSideEffects = collectUnexpectedPatchMutations(beforeDirtyFingerprints, afterDirtyFingerprints, absPath, cwd);
    const combinedSideEffects = [...new Set([...sideEffects, ...mutatedSideEffects])].sort();
    const payloadFile = typeof patchData.file === 'string' ? patchData.file : '';
    const payloadTargetMatch = payloadFile.length > 0
        ? path.resolve(cwd, payloadFile) === absPath
        : true;
    const patchSucceeded = patchData.success === true;
    const rawPatchStatus = typeof patchData.status === 'string' ? patchData.status : '';
    const patchStatus = rawPatchStatus === 'filesystem_changed_since_preview'
        ? 'stale_preview'
        : !patchSucceeded
            ? 'rejected'
            : changed && payloadTargetMatch && combinedSideEffects.length === 0
                ? 'applied'
                : changed
                    ? 'partial'
                    : 'rejected';
    const patchMessage = (() => {
        if (patchStatus === 'applied') {
            return (typeof patchData.message === 'string' && patchData.message.trim().length > 0)
                ? patchData.message
                : `${contracts_1.STATUS_TERMS.safePatchApplied}`;
        }
        if (patchStatus === 'partial') {
            if (!payloadTargetMatch) {
                return `${contracts_1.STATUS_TERMS.patchRejected}: patch target mismatch detected between requested file and daemon payload file.`;
            }
            if (combinedSideEffects.length > 0) {
                return `${contracts_1.STATUS_TERMS.patchRejected}: patch introduced side effects in ${combinedSideEffects.length} additional file(s).`;
            }
            return `${contracts_1.STATUS_TERMS.safePatchApplied}. ${contracts_1.STATUS_TERMS.manualReviewRecommended}.`;
        }
        if (patchStatus === 'stale_preview') {
            return `${contracts_1.STATUS_TERMS.filesystemChangedSincePreview}. Regenerate patch preview and retry. ${contracts_1.STATUS_TERMS.retrySafe}.`;
        }
        return (typeof patchData.message === 'string' && patchData.message.trim().length > 0)
            ? patchData.message
            : `${contracts_1.STATUS_TERMS.patchRejected}; no deterministic file-scoped change applied`;
    })();
    const reverifyRequired = patchStatus === 'applied' || patchStatus === 'partial';
    const stateLabel = patchStatus === 'stale_preview'
        ? contracts_1.STATUS_TERMS.filesystemChangedSincePreview.toLowerCase()
        : (0, contracts_1.toPatchStateLabel)(patchStatus).toLowerCase();
    recordPatchOutcome(patchStatus);
    const normalizedVerifyPayload = normalizeVerifyPayloadForLegacyClients(run.verificationPayload);
    success(res, {
        patch: {
            ...patchData,
            file: payloadFile || targetPath,
            success: patchStatus === 'applied',
            rawSuccess: patchData.success === true,
            changed,
            status: patchStatus,
            targetMatch: payloadTargetMatch,
            sideEffects: combinedSideEffects,
            message: patchMessage,
            reverifyRequired,
            stateLabel,
            previewTokenUsed: previewToken ? true : false,
        },
        verify: normalizedVerifyPayload ?? null,
        execution: run.execution,
    });
}
async function handlePatchRollback(req, res) {
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400);
        return;
    }
    const file = body.file;
    const receiptId = typeof body.receiptId === 'string' ? body.receiptId.trim() : '';
    if (!file || typeof file !== 'string' || file.includes('..')) {
        failure(res, 'Missing or unsafe "file" field', 400);
        return;
    }
    if (!receiptId) {
        failure(res, 'Missing "receiptId" field', 400);
        return;
    }
    const cwd = process.cwd();
    const targetPath = file.trim();
    const absPath = path.resolve(cwd, targetPath);
    const beforeDirtyPaths = captureGitDirtyPaths(cwd);
    const beforeDirtyFingerprints = captureDirtyFileFingerprints(cwd);
    let contentBefore = null;
    try {
        contentBefore = fs.readFileSync(absPath, 'utf-8');
    }
    catch { /* file may not exist */ }
    const run = await (0, execution_bus_1.runExecution)({
        type: 'patch',
        source: toSource(req),
        actor: toActor(req),
        target: targetPath,
        cwd,
        reverify: true,
        primaryArgs: ['patch', '--file', targetPath, '--rollback-receipt', receiptId, '--json'],
    });
    const patchData = run.primaryPayload ?? {
        success: false,
        file: targetPath,
        message: run.execution.result?.message || 'No rollback receipt could be applied',
    };
    let changed = false;
    if (patchData.success && contentBefore !== null) {
        try {
            const contentAfter = fs.readFileSync(absPath, 'utf-8');
            changed = contentAfter !== contentBefore;
        }
        catch {
            // ignore read error
        }
    }
    const afterDirtyPaths = captureGitDirtyPaths(cwd);
    const afterDirtyFingerprints = captureDirtyFileFingerprints(cwd);
    const sideEffects = collectUnexpectedPatchSideEffects(beforeDirtyPaths, afterDirtyPaths, absPath, cwd);
    const mutatedSideEffects = collectUnexpectedPatchMutations(beforeDirtyFingerprints, afterDirtyFingerprints, absPath, cwd);
    const combinedSideEffects = [...new Set([...sideEffects, ...mutatedSideEffects])].sort();
    const payloadFile = typeof patchData.file === 'string' ? patchData.file : '';
    const payloadTargetMatch = payloadFile.length > 0
        ? path.resolve(cwd, payloadFile) === absPath
        : true;
    const rawStatus = typeof patchData.status === 'string' ? patchData.status : '';
    const rollbackStatus = rawStatus === 'rollback_applied'
        ? 'rollback_applied'
        : rawStatus === 'rollback_stale' || rawStatus === 'filesystem_changed_since_patch'
            ? 'rollback_stale'
            : 'rollback_rejected';
    const rollbackSucceeded = patchData.success === true && rollbackStatus === 'rollback_applied' && payloadTargetMatch && combinedSideEffects.length === 0;
    const rollbackMessage = (() => {
        if (rollbackSucceeded) {
            return (typeof patchData.message === 'string' && patchData.message.trim().length > 0)
                ? patchData.message
                : contracts_1.STATUS_TERMS.rollbackApplied;
        }
        if (!payloadTargetMatch) {
            return `${contracts_1.STATUS_TERMS.patchRejected}: rollback receipt target mismatch detected.`;
        }
        if (combinedSideEffects.length > 0) {
            return `${contracts_1.STATUS_TERMS.patchRejected}: rollback side effects detected in ${combinedSideEffects.length} additional file(s).`;
        }
        return (typeof patchData.message === 'string' && patchData.message.trim().length > 0)
            ? patchData.message
            : contracts_1.STATUS_TERMS.patchRejected;
    })();
    recordPatchOutcome(rollbackStatus);
    success(res, {
        patch: {
            ...patchData,
            file: payloadFile || targetPath,
            success: rollbackSucceeded,
            rawSuccess: patchData.success === true,
            changed,
            status: rollbackStatus,
            targetMatch: payloadTargetMatch,
            sideEffects: combinedSideEffects,
            message: rollbackMessage,
            reverifyRequired: rollbackSucceeded,
            stateLabel: rollbackSucceeded
                ? contracts_1.STATUS_TERMS.rollbackApplied.toLowerCase()
                : rollbackStatus === 'rollback_stale'
                    ? contracts_1.STATUS_TERMS.filesystemChangedSincePreview.toLowerCase()
                    : contracts_1.STATUS_TERMS.patchRejected.toLowerCase(),
            previewTokenUsed: false,
        },
        verify: normalizeVerifyPayloadForLegacyClients(run.verificationPayload) ?? null,
        execution: run.execution,
    });
}
async function handlePatchPreview(req, res) {
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
    const cwd = process.cwd();
    const targetPath = file.trim();
    const absPath = path.resolve(cwd, targetPath);
    let contentBefore = '';
    try {
        contentBefore = fs.readFileSync(absPath, 'utf-8');
    }
    catch {
        failure(res, `File not found: ${targetPath}`, 404);
        return;
    }
    const preview = (0, patch_engine_1.applyFirstMatchingPatch)(targetPath, contentBefore);
    if (!preview) {
        success(res, {
            success: false,
            file: targetPath,
            status: 'rejected',
            message: `No deterministic patch preview available for ${targetPath}`,
            beforeContent: contentBefore,
            afterContent: null,
            diff: null,
            changed: false,
            patternKind: null,
            patchConfidence: null,
            patchHash: null,
            previewToken: null,
            validation: null,
            recipe: null,
            pattern: null,
            whatChanges: null,
            rollbackPreviewDiff: null,
            whySafe: null,
            manualReviewRequired: true,
            supportedDeterministicPattern: false,
            reasoning: null,
        });
        return;
    }
    const reasoning = buildPatchPreviewReasoning(preview.patternKind, targetPath, contentBefore);
    const rollbackPreviewDiff = (0, diff_1.generateUnifiedDiff)(targetPath, preview.updatedContent, contentBefore);
    const changeSummary = summarizeDiff(preview.diff);
    const manualReviewRequired = preview.patchConfidence === 'low'
        || preview.validation.safe !== true
        || preview.recipe.requiresManualReview === true;
    const pattern = patternDescriptor(preview.patternKind, preview.patchConfidence, manualReviewRequired);
    const whySafe = {
        deterministic: true,
        validationPassed: preview.validation.safe === true,
        confidence: preview.patchConfidence,
        checks: preview.validation.checks,
        reasonCodes: preview.validation.reasonCodes,
    };
    if (!preview.validation.safe) {
        success(res, {
            success: false,
            file: targetPath,
            status: 'rejected',
            message: `Patch preview rejected by deterministic safety validation (${preview.validation.reasonCodes.join(', ') || 'unknown'}).`,
            beforeContent: contentBefore,
            afterContent: null,
            diff: preview.diff,
            changed: false,
            patternKind: preview.patternKind,
            patchConfidence: preview.patchConfidence,
            patchHash: preview.patchHash,
            previewToken: preview.previewToken,
            validation: preview.validation,
            recipe: preview.recipe,
            pattern,
            whatChanges: changeSummary,
            rollbackPreviewDiff,
            whySafe,
            manualReviewRequired,
            supportedDeterministicPattern: true,
            reasoning,
        });
        return;
    }
    success(res, {
        success: true,
        file: targetPath,
        status: 'preview',
        message: 'Patch preview generated',
        beforeContent: contentBefore,
        afterContent: preview.updatedContent,
        diff: preview.diff,
        changed: contentBefore !== preview.updatedContent,
        patternKind: preview.patternKind,
        patchConfidence: preview.patchConfidence,
        patchHash: preview.patchHash,
        previewToken: preview.previewToken,
        validation: preview.validation,
        recipe: preview.recipe,
        pattern,
        whatChanges: changeSummary,
        rollbackPreviewDiff,
        whySafe,
        manualReviewRequired,
        supportedDeterministicPattern: true,
        reasoning,
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
// ── Semantic Search Handlers ──────────────────────────────────────────────────
/**
 * POST /workspaces/:id/semantic-search
 *
 * Body: { query: string, limit?: number, minScore?: number }
 * Returns: { results: SemanticSearchResult[], totalIndexed: number }
 *
 * Performs TF-IDF vector similarity search over the brain context index.
 * Fully deterministic — zero LLM calls, zero external dependencies.
 */
async function handleSemanticSearch(req, res, workspaceId) {
    const workspace = (0, workspace_runtime_1.getWorkspaceById)(workspaceId, process.cwd());
    if (!workspace) {
        failure(res, `Workspace not found: ${workspaceId}`, 404, { code: 'workspace.not_found' });
        return;
    }
    let body;
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400, { code: 'bad_request' });
        return;
    }
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) {
        failure(res, 'Missing required field: query', 400, { code: 'bad_request' });
        return;
    }
    const limit = typeof body.limit === 'number' ? Math.min(50, Math.max(1, body.limit)) : 10;
    const minScore = typeof body.minScore === 'number' ? Math.max(0, body.minScore) : 0.01;
    // Use the first enabled repo root, or fall back to process.cwd()
    const rootPath = workspace.repositories.find((r) => r.enabled)?.rootPath ?? process.cwd();
    const scope = { orgId: null, projectId: null };
    const stats = (0, semantic_1.getSemanticIndexStats)(rootPath, scope);
    // Auto-build index if it doesn't exist yet
    if (!stats.exists || stats.documentCount === 0) {
        (0, semantic_1.buildSemanticIndex)(rootPath, scope);
    }
    const results = (0, semantic_1.semanticSearch)(rootPath, scope, query, { limit, minScore });
    const updatedStats = (0, semantic_1.getSemanticIndexStats)(rootPath, scope);
    success(res, {
        schemaVersion: 'neurcode.semantic-search.v1',
        workspaceId,
        workspaceName: workspace.name,
        query,
        results,
        totalIndexed: updatedStats.documentCount,
        indexBuiltAt: updatedStats.builtAt,
    });
}
/**
 * POST /workspaces/:id/semantic-index/build
 *
 * Forces a full semantic index rebuild from the current brain context.
 * Returns: { documentsIndexed: number, builtAt: string }
 */
async function handleBuildSemanticIndex(_req, res, workspaceId) {
    const workspace = (0, workspace_runtime_1.getWorkspaceById)(workspaceId, process.cwd());
    if (!workspace) {
        failure(res, `Workspace not found: ${workspaceId}`, 404, { code: 'workspace.not_found' });
        return;
    }
    const rootPath = workspace.repositories.find((r) => r.enabled)?.rootPath ?? process.cwd();
    const scope = { orgId: null, projectId: null };
    const count = (0, semantic_1.buildSemanticIndex)(rootPath, scope);
    const stats = (0, semantic_1.getSemanticIndexStats)(rootPath, scope);
    success(res, {
        schemaVersion: 'neurcode.semantic-index.v1',
        workspaceId,
        workspaceName: workspace.name,
        documentsIndexed: count,
        builtAt: stats.builtAt,
        sizeBytes: stats.sizeBytes,
    });
}
/**
 * POST /workspaces/:id/intent-expand
 *
 * Body: { intent: string, forceRefresh?: boolean }
 *
 * Returns a rich semantic governance artifact for the given intent.
 * The artifact is HMAC-signed and cached — subsequent calls return
 * the stored artifact without calling the LLM again.
 *
 * expansionMethod='llm'              → LLM was called (first time only)
 * expansionMethod='keyword-fallback' → no LLM key configured
 * signature present                  → tamper-evident, auditable
 */
async function handleIntentExpand(req, res, workspaceId) {
    const workspace = (0, workspace_runtime_1.getWorkspaceById)(workspaceId, process.cwd());
    if (!workspace) {
        failure(res, `Workspace not found: ${workspaceId}`, 404, { code: 'workspace.not_found' });
        return;
    }
    let body;
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400, { code: 'bad_request' });
        return;
    }
    const intent = typeof body.intent === 'string' ? body.intent.trim() : '';
    if (!intent) {
        failure(res, 'Missing required field: intent', 400, { code: 'bad_request' });
        return;
    }
    const forceRefresh = body.forceRefresh === true;
    const rootPath = workspace.repositories.find((r) => r.enabled)?.rootPath ?? process.cwd();
    // Check cache first (synchronous — no LLM call)
    if (!forceRefresh) {
        const cached = (0, intent_engine_1.loadCachedExpansion)(rootPath, intent);
        if (cached) {
            success(res, {
                schemaVersion: 'neurcode.intent-expansion.v1',
                workspaceId,
                workspaceName: workspace.name,
                cacheHit: true,
                expansion: cached,
                summary: (0, intent_engine_1.formatExpansionSummary)(cached),
            });
            return;
        }
    }
    // Expand (may call LLM or use fallback)
    try {
        const expansion = await (0, intent_engine_1.expandIntent)(intent, { cwd: rootPath, forceRefresh });
        success(res, {
            schemaVersion: 'neurcode.intent-expansion.v1',
            workspaceId,
            workspaceName: workspace.name,
            cacheHit: false,
            expansion,
            summary: (0, intent_engine_1.formatExpansionSummary)(expansion),
        });
    }
    catch (err) {
        failure(res, `Intent expansion failed: ${err instanceof Error ? err.message : String(err)}`, 500, { code: 'intent_expansion.failed' });
    }
}
// ── Cross-Repo Context Handlers ──────────────────────────────────────────────
/**
 * GET /workspaces/:id/cross-repo-graph
 *
 * Returns the detected cross-repo dependency graph for all repos in a workspace.
 * Used by Fix Center to show which services are coupled to the file being patched.
 *
 * Query params:
 *   ?format=summary   — human-readable summary (default: full JSON)
 */
async function handleGetCrossRepoGraph(req, res, workspaceId) {
    const workspace = (0, workspace_runtime_1.getWorkspaceById)(workspaceId, process.cwd());
    if (!workspace) {
        failure(res, `Workspace not found: ${workspaceId}`, 404, { code: 'workspace.not_found' });
        return;
    }
    const repos = workspace.repositories.filter((r) => r.enabled);
    if (repos.length === 0) {
        success(res, {
            schemaVersion: 'neurcode.cross-repo-graph.v1',
            workspaceId,
            workspaceName: workspace.name,
            graph: { generatedAt: new Date().toISOString(), repos: [], edges: [], stats: { filesScanned: 0, edgesDetected: 0, byVia: {}, byConfidence: {} } },
            edgeCount: 0,
        });
        return;
    }
    const graph = (0, workspace_1.buildCrossRepoGraph)({ repos });
    success(res, {
        schemaVersion: 'neurcode.cross-repo-graph.v1',
        workspaceId,
        workspaceName: workspace.name,
        graph,
        edgeCount: graph.edges.length,
    });
}
/**
 * POST /workspaces/:id/federated-context
 *
 * Builds the full federated context for a set of changed files in the primary repo.
 * This is the multi-repo blast radius analysis endpoint.
 *
 * Body: { primaryRepo: string; changedFiles: string[] }
 *
 * Returns:
 *   - affectedDownstreamRepos: services that call the changed code
 *   - relevantUpstreamRepos: services the changed code calls
 *   - federatedBlindSpots: structural coupling invisible to code scanning
 *   - summary.requiresCoordinatedDeploy: true if any high-confidence edge exists
 */
async function handleGetFederatedContext(req, res, workspaceId) {
    const workspace = (0, workspace_runtime_1.getWorkspaceById)(workspaceId, process.cwd());
    if (!workspace) {
        failure(res, `Workspace not found: ${workspaceId}`, 404, { code: 'workspace.not_found' });
        return;
    }
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400, { code: 'invalid_body' });
        return;
    }
    const primaryRepo = asNonEmptyString(body.primaryRepo);
    if (!primaryRepo) {
        failure(res, 'Missing required field: primaryRepo', 400, { code: 'missing_field' });
        return;
    }
    const changedFiles = Array.isArray(body.changedFiles)
        ? body.changedFiles.filter((f) => typeof f === 'string')
        : [];
    if (changedFiles.length === 0) {
        failure(res, 'changedFiles must be a non-empty array of strings', 400, { code: 'missing_field' });
        return;
    }
    const repoExists = workspace.repositories.some((r) => r.name === primaryRepo);
    if (!repoExists) {
        failure(res, `Repo "${primaryRepo}" not found in workspace "${workspaceId}"`, 404, { code: 'repo.not_found' });
        return;
    }
    const pkg = (0, workspace_1.buildFederatedContext)({
        workspaceName: workspace.name,
        repos: workspace.repositories,
        primaryRepoName: primaryRepo,
        changedFiles,
    });
    const { workspaceName: _wn, ...pkgRest } = pkg;
    success(res, {
        schemaVersion: 'neurcode.federated-context.v1',
        workspaceId,
        workspaceName: workspace.name,
        ...pkgRest,
        humanSummary: (0, workspace_1.formatFederatedContextSummary)(pkg),
    });
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
// ── Governance findings handler ───────────────────────────────────────────────
// ── Enterprise docs handlers ────────────────────────────────────────────────
/** Returns a manifest of all enterprise docs with titles and slugs. */
async function handleDocsManifest(res) {
    // Resolve docs directory relative to repo root (two levels up from packages/cli/dist or src)
    const possibleRoots = [
        path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'enterprise'),
        path.resolve(process.cwd(), 'docs', 'enterprise'),
    ];
    let docsDir = '';
    for (const candidate of possibleRoots) {
        if (fs.existsSync(candidate)) {
            docsDir = candidate;
            break;
        }
    }
    if (!docsDir) {
        success(res, { docs: [], docsDir: null, error: 'docs/enterprise/ directory not found' });
        return;
    }
    try {
        const files = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md')).sort();
        const docs = files.map((filename) => {
            const slug = filename.replace(/\.md$/, '');
            let title = slug;
            try {
                const firstLine = fs.readFileSync(path.join(docsDir, filename), 'utf8').split('\n')[0] || '';
                const match = firstLine.match(/^#+ (.+)/);
                if (match)
                    title = match[1].trim();
            }
            catch { /* use slug as title */ }
            return { slug, filename, title };
        });
        success(res, { docs, docsDir });
    }
    catch (err) {
        failure(res, err instanceof Error ? err.message : String(err), 500);
    }
}
/** Returns the raw markdown content of a single enterprise doc file. */
async function handleDocsContent(res, slug) {
    // Sanitize: only allow alphanumeric, dash, underscore — no path traversal
    if (!/^[\w-]+$/.test(slug)) {
        failure(res, 'Invalid doc slug', 400);
        return;
    }
    const possibleRoots = [
        path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'enterprise'),
        path.resolve(process.cwd(), 'docs', 'enterprise'),
    ];
    let docFile = '';
    for (const rootDir of possibleRoots) {
        const candidate = path.join(rootDir, `${slug}.md`);
        if (fs.existsSync(candidate)) {
            docFile = candidate;
            break;
        }
    }
    if (!docFile) {
        failure(res, `Doc not found: ${slug}`, 404);
        return;
    }
    try {
        const content = fs.readFileSync(docFile, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(content);
    }
    catch (err) {
        failure(res, err instanceof Error ? err.message : String(err), 500);
    }
}
// ── End enterprise docs handlers ────────────────────────────────────────────
async function handleGovernanceFindings(req, res) {
    const cwd = process.cwd();
    const requestUrl = new URL(req.url || '/governance/findings', 'http://localhost');
    const limitRaw = parseInt(requestUrl.searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    const filterSeverity = requestUrl.searchParams.get('severity') || undefined;
    const filterRule = requestUrl.searchParams.get('rule') || undefined;
    const filterFile = requestUrl.searchParams.get('file') || undefined;
    const filterDeterminism = requestUrl.searchParams.get('determinism') || undefined;
    const candidatePaths = [
        path.resolve(cwd, '.neurcode', 'last-verify-output.json'),
        path.resolve(cwd, '.neurcode', 'verify-output.json'),
    ];
    let rawFindings = [];
    let sourceFile = '';
    let envelope = {};
    for (const candidate of candidatePaths) {
        try {
            if (fs.existsSync(candidate)) {
                const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
                if (parsed && typeof parsed === 'object') {
                    envelope = parsed;
                    const findings = parsed.findings;
                    if (Array.isArray(findings)) {
                        rawFindings = findings;
                    }
                    else {
                        const violations = parsed.violations;
                        if (Array.isArray(violations)) {
                            rawFindings = violations.map((v) => ({
                                findingId: v.ruleId || 'unknown',
                                ruleId: v.ruleId || 'unknown',
                                ruleName: v.message || 'Unknown finding',
                                severity: v.severity || 'advisory',
                                category: 'structural',
                                determinism: 'deterministic-structural',
                                file: v.file,
                                line: v.line,
                                message: v.message,
                                explanation: v.explanation,
                                source: 'structural-rule-engine',
                                confidence: v.confidence || 1.0,
                                remediable: true,
                                remediationStatus: 'pending',
                            }));
                        }
                    }
                    sourceFile = candidate;
                }
                break;
            }
        }
        catch {
            // continue to next candidate
        }
    }
    // Filter
    let filtered = rawFindings;
    if (filterSeverity) {
        filtered = filtered.filter((f) => (f.severity || '') === filterSeverity);
    }
    if (filterRule) {
        filtered = filtered.filter((f) => {
            const ruleId = f.ruleId || '';
            const ruleName = f.ruleName || '';
            return ruleId.includes(filterRule) || ruleName.toLowerCase().includes(filterRule.toLowerCase());
        });
    }
    if (filterFile) {
        filtered = filtered.filter((f) => {
            const filePath = f.file || '';
            return filePath.includes(filterFile);
        });
    }
    if (filterDeterminism) {
        filtered = filtered.filter((f) => (f.determinism || '') === filterDeterminism);
    }
    const paginated = filtered.slice(0, limit);
    const blockingCount = rawFindings.filter((f) => {
        const sev = (f.severity || '').toLowerCase();
        return sev === 'critical' || sev === 'high' || sev === 'blocking' || sev === 'block';
    }).length;
    const advisoryCount = rawFindings.length - blockingCount;
    const meta = {
        verdict: envelope.verdict || (rawFindings.length === 0 ? 'PASS' : blockingCount > 0 ? 'FAIL' : 'WARN'),
        verifiedAt: envelope.verifiedAt || envelope.timestamp || null,
        projectRoot: envelope.projectRoot || cwd,
        planId: envelope.planId || null,
        schemaVersion: envelope.schemaVersion || null,
        fingerprint: envelope.fingerprint || null,
        totalFindings: rawFindings.length,
        blockingCount,
        advisoryCount,
        structuralCount: rawFindings.filter((f) => f.category === 'structural').length,
        semanticCount: rawFindings.filter((f) => f.category === 'semantic').length,
        sourceFile: sourceFile || null,
        filtered: filtered.length,
        returned: paginated.length,
    };
    success(res, { meta, findings: paginated });
}
// ── Governance overview handler ───────────────────────────────────────────────
async function handleGovernanceOverview(_req, res) {
    const cwd = process.cwd();
    // Read last verify output
    let lastVerifyMeta = {};
    let lastVerifyFindings = [];
    const verifyPath = path.resolve(cwd, '.neurcode', 'last-verify-output.json');
    try {
        if (fs.existsSync(verifyPath)) {
            const parsed = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
            if (parsed && typeof parsed === 'object') {
                lastVerifyMeta = parsed;
                const findings = parsed.findings;
                const violations = parsed.violations;
                if (Array.isArray(findings))
                    lastVerifyFindings = findings;
                else if (Array.isArray(violations))
                    lastVerifyFindings = violations;
            }
        }
    }
    catch { /* ignore */ }
    // Read provenance file for recent runs
    const provenancePaths = [
        path.resolve(cwd, '.neurcode', 'provenance.json'),
        path.resolve(cwd, '.neurcode', 'provenance-chain.json'),
    ];
    let recentRuns = [];
    for (const pp of provenancePaths) {
        try {
            if (fs.existsSync(pp)) {
                const parsed = JSON.parse(fs.readFileSync(pp, 'utf8'));
                if (Array.isArray(parsed)) {
                    recentRuns = parsed.slice(-20).reverse();
                }
                else if (parsed && typeof parsed === 'object') {
                    const records = parsed.records;
                    if (Array.isArray(records))
                        recentRuns = records.slice(-20).reverse();
                }
                break;
            }
        }
        catch { /* ignore */ }
    }
    // Compute top triggered rules
    const ruleFreq = {};
    for (const f of lastVerifyFindings) {
        const ruleId = f.ruleId || 'unknown';
        ruleFreq[ruleId] = (ruleFreq[ruleId] || 0) + 1;
    }
    const topRules = Object.entries(ruleFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([ruleId, count]) => ({ ruleId, count }));
    // Read remediation artifacts
    const remediationDir = path.resolve(cwd, '.neurcode', 'remediation');
    let remediationCount = 0;
    let remediationPending = 0;
    let remediationValidated = 0;
    try {
        if (fs.existsSync(remediationDir)) {
            const entries = fs.readdirSync(remediationDir);
            for (const entry of entries) {
                if (entry.endsWith('-request.json'))
                    remediationCount++;
                if (entry.endsWith('-receipt.json'))
                    remediationValidated++;
            }
            remediationPending = remediationCount - remediationValidated;
        }
    }
    catch { /* ignore */ }
    const blockingCount = lastVerifyFindings.filter((f) => {
        const sev = (f.severity || '').toLowerCase();
        return sev === 'critical' || sev === 'high' || sev === 'blocking' || sev === 'block';
    }).length;
    success(res, {
        lastVerify: {
            verdict: lastVerifyMeta.verdict || (lastVerifyFindings.length === 0 ? 'PASS' : blockingCount > 0 ? 'FAIL' : 'WARN'),
            verifiedAt: lastVerifyMeta.verifiedAt || lastVerifyMeta.timestamp || null,
            planId: lastVerifyMeta.planId || null,
            totalFindings: lastVerifyFindings.length,
            blockingCount,
            advisoryCount: lastVerifyFindings.length - blockingCount,
            topRules,
        },
        recentRuns: recentRuns.slice(0, 10),
        remediation: {
            total: remediationCount,
            pending: remediationPending,
            validated: remediationValidated,
        },
        projectRoot: cwd,
    });
}
// ── Brain cache status handler ────────────────────────────────────────────────
async function handleBrainCacheStatus(_req, res) {
    const cwd = process.cwd();
    const brainDir = path.resolve(cwd, '.neurcode', 'brain-cache');
    const manifestPath = path.resolve(brainDir, 'manifest.json');
    let manifest = null;
    let cacheSize = 0;
    let fileCount = 0;
    let staleCount = 0;
    let cacheExists = false;
    try {
        cacheExists = fs.existsSync(brainDir);
        if (cacheExists) {
            const entries = fs.readdirSync(brainDir);
            fileCount = entries.length;
            for (const entry of entries) {
                try {
                    const stat = fs.statSync(path.resolve(brainDir, entry));
                    cacheSize += stat.size;
                }
                catch { /* ignore */ }
            }
            if (fs.existsSync(manifestPath)) {
                manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                const files = manifest.files;
                if (Array.isArray(files)) {
                    const now = Date.now();
                    for (const f of files) {
                        const cachedAt = f.cachedAt;
                        if (typeof cachedAt === 'string') {
                            const age = now - new Date(cachedAt).getTime();
                            if (age > 24 * 60 * 60 * 1000)
                                staleCount++;
                        }
                    }
                }
            }
        }
    }
    catch { /* ignore */ }
    // Check semantic index
    const semanticIndexPath = path.resolve(brainDir, 'semantic-index.json');
    const hasSemanticIndex = fs.existsSync(semanticIndexPath);
    let semanticIndexSize = 0;
    let semanticIndexAt = null;
    try {
        if (hasSemanticIndex) {
            const stat = fs.statSync(semanticIndexPath);
            semanticIndexSize = stat.size;
            const idx = JSON.parse(fs.readFileSync(semanticIndexPath, 'utf8'));
            semanticIndexAt = idx.indexedAt || null;
        }
    }
    catch { /* ignore */ }
    success(res, {
        cacheExists,
        brainDir,
        manifest: manifest
            ? {
                schemaVersion: manifest.schemaVersion,
                createdAt: manifest.createdAt,
                updatedAt: manifest.updatedAt,
                projectId: manifest.projectId,
                fileCount: Array.isArray(manifest.files) ? manifest.files.length : fileCount,
                staleCount,
                stalePercent: fileCount > 0 ? Math.round((staleCount / fileCount) * 100) : 0,
            }
            : null,
        semanticIndex: {
            exists: hasSemanticIndex,
            sizeBytes: semanticIndexSize,
            indexedAt: semanticIndexAt,
        },
        cacheDirSizeBytes: cacheSize,
        cwd,
    });
}
// ── Remediation status handler ────────────────────────────────────────────────
async function handleRemediationStatus(_req, res) {
    const cwd = process.cwd();
    const remediationDir = path.resolve(cwd, '.neurcode', 'remediation');
    const artifacts = [];
    try {
        if (fs.existsSync(remediationDir)) {
            const entries = fs.readdirSync(remediationDir).sort().reverse();
            for (const entry of entries.slice(0, 50)) {
                if (!entry.endsWith('.json'))
                    continue;
                try {
                    const fullPath = path.resolve(remediationDir, entry);
                    const stat = fs.statSync(fullPath);
                    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                    const isReceipt = entry.endsWith('-receipt.json');
                    const isRequest = entry.endsWith('-request.json');
                    artifacts.push({
                        filename: entry,
                        type: isReceipt ? 'receipt' : isRequest ? 'request' : 'unknown',
                        sizeBytes: stat.size,
                        createdAt: stat.birthtime.toISOString(),
                        modifiedAt: stat.mtime.toISOString(),
                        findingId: raw.findingId || raw.requestId || null,
                        ruleId: raw.ruleId || null,
                        status: isReceipt
                            ? (raw.overallStatus || 'validated')
                            : 'pending',
                        passed: isReceipt ? raw.passed || false : null,
                    });
                }
                catch { /* ignore */ }
            }
        }
    }
    catch { /* ignore */ }
    const requests = artifacts.filter((a) => a.type === 'request');
    const receipts = artifacts.filter((a) => a.type === 'receipt');
    const passedReceipts = receipts.filter((a) => a.passed === true);
    success(res, {
        remediationDir,
        exists: fs.existsSync(remediationDir),
        summary: {
            total: requests.length,
            pending: requests.length - receipts.length,
            validated: receipts.length,
            passed: passedReceipts.length,
            failed: receipts.length - passedReceipts.length,
        },
        artifacts,
        cwd,
    });
}
// ── Pilot report handler ──────────────────────────────────────────────────────
// Aggregates existing local artifacts only: governance JSONL telemetry, provenance
// index/legacy chain, pilot-metrics.json, last-verify-output — same sources as
// `neurcode pilot-report` (no new telemetry systems).
function pilotReportWindowDays() {
    return 7;
}
function pilotReportCutoffIso(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}
function filterTelemetryByWindow(events, fromDate, toDate) {
    return events.filter((ev) => {
        const day = ev.emittedAt.slice(0, 10);
        return day >= fromDate && day <= toDate;
    });
}
function aggregateDeterministicFromTelemetry(events) {
    let sumDeterministic = 0;
    let sumFindings = 0;
    for (const ev of events) {
        if (ev.eventType !== 'governance.verify.completed')
            continue;
        const p = ev.payload;
        const hist = p.determinismHistogram;
        const count = p.governanceFindingCount;
        if (!hist || typeof count !== 'number')
            continue;
        sumFindings += count;
        sumDeterministic += hist['deterministic-structural'] ?? 0;
    }
    const deterministicPct = sumFindings > 0 ? sumDeterministic / sumFindings : 0;
    return { deterministicPct, sumDeterministic, sumFindings };
}
function governanceTrustFromPct(deterministicPct) {
    if (deterministicPct >= 0.7)
        return 'HIGH';
    if (deterministicPct >= 0.4)
        return 'MEDIUM';
    return 'LOW';
}
function advisoryCaughtInPilotWindow(cwd, from, to) {
    try {
        const p = path.join(cwd, '.neurcode', 'pilot-metrics.json');
        if (!fs.existsSync(p))
            return 0;
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (!Array.isArray(raw))
            return 0;
        return raw
            .filter((e) => e.date >= from && e.date <= to)
            .reduce((s, e) => s + (e.advisoryCaught ?? 0), 0);
    }
    catch {
        return 0;
    }
}
function summarizeTelemetryLine(ev) {
    if (ev.eventType === 'governance.verify.completed') {
        const p = ev.payload;
        const verdict = String(p.verdict ?? '');
        const n = Number(p.governanceFindingCount ?? 0);
        const ri = p.replayIntegrityStatus;
        return {
            emittedAt: ev.emittedAt,
            eventType: ev.eventType,
            summary: `Verify ${verdict} · ${n} findings`,
            verdict,
            replayIntegrityStatus: ri ?? null,
        };
    }
    if (ev.eventType === 'rule.trigger') {
        const p = ev.payload;
        return {
            emittedAt: ev.emittedAt,
            eventType: ev.eventType,
            summary: `Rule ${p.ruleId ?? '?'} · ${p.count ?? 0}×`,
        };
    }
    return {
        emittedAt: ev.emittedAt,
        eventType: ev.eventType,
        summary: ev.eventType.replace(/\./g, ' '),
    };
}
async function handlePilotReport(_req, res) {
    const cwd = process.cwd();
    const days = pilotReportWindowDays();
    const periodTo = new Date().toISOString().slice(0, 10);
    const periodFrom = pilotReportCutoffIso(days);
    // Canonical governance telemetry (JSONL) — same reader as CLI pilot-report
    const telemetryEnvelopes = (0, telemetry_1.readGovernanceTelemetryEvents)(cwd);
    const telemetryWindow = filterTelemetryByWindow(telemetryEnvelopes, periodFrom, periodTo);
    const verifyCompletedInWindow = telemetryWindow.filter((e) => e.eventType === 'governance.verify.completed');
    // Legacy JSON telemetry (optional fallback counts for older repos)
    const telemetryPaths = [
        path.resolve(cwd, '.neurcode', 'telemetry.json'),
        path.resolve(cwd, '.neurcode', 'telemetry-events.json'),
    ];
    let legacyEvents = [];
    for (const tp of telemetryPaths) {
        try {
            if (fs.existsSync(tp)) {
                const raw = JSON.parse(fs.readFileSync(tp, 'utf8'));
                if (Array.isArray(raw))
                    legacyEvents = raw;
                else if (raw && typeof raw === 'object') {
                    const evts = raw.events;
                    if (Array.isArray(evts))
                        legacyEvents = evts;
                }
                break;
            }
        }
        catch { /* ignore */ }
    }
    const legacyVerifyEvents = legacyEvents.filter((e) => e.type === 'verify' || e.eventType === 'verify');
    // Provenance index (preferred) + legacy flat chain files
    const provIndex = (0, governance_provenance_1.loadProvenanceIndex)(cwd);
    const provenancePaths = [
        path.resolve(cwd, '.neurcode', 'provenance.json'),
        path.resolve(cwd, '.neurcode', 'provenance-chain.json'),
    ];
    let legacyRuns = [];
    for (const pp of provenancePaths) {
        try {
            if (fs.existsSync(pp)) {
                const raw = JSON.parse(fs.readFileSync(pp, 'utf8'));
                if (Array.isArray(raw))
                    legacyRuns = raw;
                else if (raw && typeof raw === 'object') {
                    const records = raw.records;
                    if (Array.isArray(records))
                        legacyRuns = records;
                }
                break;
            }
        }
        catch { /* ignore */ }
    }
    const indexRecords = [...provIndex.records].sort((a, b) => (a.runAt < b.runAt ? -1 : a.runAt > b.runAt ? 1 : 0));
    const runsForRates = indexRecords.length > 0
        ? indexRecords.map((r) => ({ verdict: r.verdict, verifiedAt: r.runAt, blockingCount: 0, fingerprint: r.fingerprint }))
        : legacyRuns.map((r) => ({
            verdict: r.verdict,
            verifiedAt: r.verifiedAt || r.timestamp,
            blockingCount: r.blockingCount || 0,
            fingerprint: r.fingerprint,
        }));
    const passRuns = runsForRates.filter((r) => String(r.verdict).toUpperCase() === 'PASS');
    const failRuns = runsForRates.filter((r) => {
        const v = String(r.verdict).toUpperCase();
        return v === 'FAIL' || v === 'BLOCK';
    });
    const warnRuns = runsForRates.filter((r) => String(r.verdict).toUpperCase() === 'WARN');
    const total = runsForRates.length;
    const passRate = total > 0 ? Math.round((passRuns.length / total) * 100) : 0;
    const failRate = total > 0 ? Math.round((failRuns.length / total) * 100) : 0;
    const warnRate = total > 0 ? Math.round((warnRuns.length / total) * 100) : 0;
    // Top rules: legacy deep records + telemetry rollup (merged)
    const globalRuleFreq = {};
    for (const run of legacyRuns) {
        const violations = run.violations;
        const findings = run.findings;
        const items = Array.isArray(violations) ? violations : Array.isArray(findings) ? findings : [];
        for (const item of items) {
            const ruleId = item.ruleId || 'unknown';
            globalRuleFreq[ruleId] = (globalRuleFreq[ruleId] || 0) + 1;
        }
    }
    const rollup = (0, telemetry_1.rollupRulePrecisionFromEvents)(telemetryWindow);
    const telemetryTop = [...(0, telemetry_1.highTrustRuleLeaderboard)(rollup, 10)];
    for (const r of telemetryTop) {
        globalRuleFreq[r.ruleId] = (globalRuleFreq[r.ruleId] || 0) + r.triggerCount;
    }
    const topRules = Object.entries(globalRuleFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ruleId, count]) => ({ ruleId, count }));
    const topRulesTelemetry = telemetryTop.map((r) => ({ ruleId: r.ruleId, triggerCount: r.triggerCount }));
    // Last verify output for current state
    let currentVerdict = 'UNKNOWN';
    let lastVerifiedAt = null;
    let deterministicFindingCount = 0;
    const verifyPath = path.resolve(cwd, '.neurcode', 'last-verify-output.json');
    try {
        if (fs.existsSync(verifyPath)) {
            const vf = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
            currentVerdict = vf.verdict || 'UNKNOWN';
            lastVerifiedAt = vf.verifiedAt || vf.timestamp || null;
            const fArr = Array.isArray(vf.findings) ? vf.findings : [];
            deterministicFindingCount = fArr.filter((f) => {
                const det = f.determinism || '';
                return det.startsWith('deterministic');
            }).length;
        }
    }
    catch { /* ignore */ }
    // Trend: last 7 runs chronological (oldest → newest for charts)
    const trendSource = indexRecords.length > 0 ? indexRecords : legacyRuns;
    const recentSlice = trendSource.slice(-7);
    const recentTrend = recentSlice.map((r) => {
        if ('runAt' in r && typeof r.runAt === 'string') {
            const row = r;
            return {
                verifiedAt: row.runAt,
                verdict: row.verdict,
                blockingCount: 0,
                fingerprint: row.fingerprint,
            };
        }
        const row = r;
        return {
            verifiedAt: row.verifiedAt || row.timestamp,
            verdict: row.verdict,
            blockingCount: row.blockingCount || 0,
            fingerprint: row.fingerprint,
        };
    });
    const { deterministicPct, sumDeterministic, sumFindings } = aggregateDeterministicFromTelemetry(telemetryWindow);
    const deterministicRatioPct = Math.round(deterministicPct * 100);
    const governanceTrust = governanceTrustFromPct(deterministicPct);
    // Replay integrity distribution from verify.completed telemetry payloads
    let replayExact = 0;
    let replayBounded = 0;
    let replayUnknown = 0;
    let lastReplayIntegrityStatus = null;
    for (const ev of verifyCompletedInWindow) {
        const p = ev.payload;
        const ri = p.replayIntegrityStatus;
        if (ri === 'exact')
            replayExact += 1;
        else if (ri === 'bounded-degradation')
            replayBounded += 1;
        else
            replayUnknown += 1;
        if (!lastReplayIntegrityStatus && ri)
            lastReplayIntegrityStatus = ri;
    }
    for (let i = verifyCompletedInWindow.length - 1; i >= 0; i--) {
        const p = verifyCompletedInWindow[i].payload;
        const ri = p.replayIntegrityStatus;
        if (ri) {
            lastReplayIntegrityStatus = ri;
            break;
        }
    }
    // Provenance fingerprint integrity sample (last N index entries)
    const SAMPLE = 12;
    let sampleOk = 0;
    let sampleFail = 0;
    let sampleTried = 0;
    for (const entry of provIndex.records.slice(0, SAMPLE)) {
        const rec = (0, governance_provenance_1.loadProvenanceRecord)(cwd, entry.runId);
        if (!rec)
            continue;
        sampleTried += 1;
        if ((0, governance_provenance_1.verifyProvenanceIntegrity)(rec))
            sampleOk += 1;
        else
            sampleFail += 1;
    }
    const pilotSummary = (0, pilot_metrics_1.generatePilotSummary)(cwd, days);
    const fingerprintedInWindow = provIndex.records.filter((r) => {
        const d = r.runAt.slice(0, 10);
        return d >= periodFrom && d <= periodTo;
    }).length;
    const recentGovernanceEvents = telemetryEnvelopes
        .slice(-20)
        .reverse()
        .map(summarizeTelemetryLine);
    const operationalRisks = [];
    if (failRate >= 40) {
        operationalRisks.push({ level: 'high', label: 'Elevated failure rate', detail: `${failRate}% of recorded governance runs failed or blocked in the provenance window.` });
    }
    else if (failRate >= 15) {
        operationalRisks.push({ level: 'medium', label: 'Moderate failure rate', detail: `${failRate}% of runs failed or blocked — review top rules and intent scope.` });
    }
    if (pilotSummary.suppressionRate >= 0.25) {
        operationalRisks.push({
            level: 'medium',
            label: 'Suppression activity',
            detail: `Suppression rate ~${Math.round(pilotSummary.suppressionRate * 100)}% in pilot-metrics window — triage false positives vs policy.`,
        });
    }
    if (deterministicRatioPct < 40 && sumFindings > 0) {
        operationalRisks.push({
            level: 'medium',
            label: 'Deterministic signal mix',
            detail: `${deterministicRatioPct}% of findings in telemetry window are deterministic-structural — semantic/advisory dominates.`,
        });
    }
    if (replayBounded > replayExact && verifyCompletedInWindow.length >= 3) {
        operationalRisks.push({
            level: 'low',
            label: 'Replay bounded degradation',
            detail: 'Some verify completions reported bounded-degradation replay integrity — expected under truncation or large-repo limits.',
        });
    }
    if (operationalRisks.length === 0) {
        operationalRisks.push({
            level: 'low',
            label: 'No acute risk flags',
            detail: 'Within normal bands for this snapshot — keep running verify and monitoring pilot-metrics.',
        });
    }
    const verifyEventCount = verifyCompletedInWindow.length + legacyVerifyEvents.length;
    const telemetryEventCount = telemetryEnvelopes.length;
    success(res, {
        period: { days, from: periodFrom, to: periodTo },
        summary: {
            currentVerdict,
            lastVerifiedAt,
            totalRuns: total,
            passRate,
            failRate,
            warnRate,
            deterministicFindingCount,
            verifyEventCount,
        },
        deterministic: {
            ratioPct: deterministicRatioPct,
            sumDeterministic,
            sumFindings,
            windowDays: days,
        },
        governanceTrust,
        pilotSummary: {
            totalVerifyRuns: pilotSummary.totalVerifyRuns,
            averagePassRate: pilotSummary.averagePassRate,
            suppressionRate: pilotSummary.suppressionRate,
            totalBlockingCaught: pilotSummary.totalBlockingCaught,
            totalStructuralCaught: pilotSummary.totalStructuralCaught,
            advisoryCaught: advisoryCaughtInPilotWindow(cwd, periodFrom, periodTo),
            aiDebtTrend: pilotSummary.aiDebtTrend,
            topViolatedRules: pilotSummary.topViolatedRules,
        },
        provenanceCoverage: {
            indexedRuns: provIndex.records.length,
            fingerprintedInWindow,
            integritySampleVerified: sampleOk,
            integritySampleFailed: sampleFail,
            integritySampleTried: sampleTried,
        },
        replayIntegrity: {
            exact: replayExact,
            boundedDegradation: replayBounded,
            unknown: replayUnknown,
            lastStatus: lastReplayIntegrityStatus,
        },
        topRules,
        topRulesTelemetry,
        recentTrend,
        recentGovernanceEvents,
        operationalRisks,
        governance: {
            provenanceRecords: provIndex.records.length > 0 ? provIndex.records.length : legacyRuns.length,
            telemetryEvents: telemetryEventCount,
            legacyTelemetryEventCount: legacyEvents.length,
            cwd,
        },
    });
}
// ── Server factory ─────────────────────────────────────────────────────────────
function createDaemonServer() {
    const server = http.createServer(async (req, res) => {
        const incomingRequestIdRaw = req.headers[REQUEST_ID_HEADER];
        const incomingRequestId = Array.isArray(incomingRequestIdRaw)
            ? incomingRequestIdRaw[0]
            : incomingRequestIdRaw;
        const requestId = (typeof incomingRequestId === 'string'
            && incomingRequestId.trim().length > 0)
            ? incomingRequestId.trim().slice(0, 128)
            : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        res.setHeader(REQUEST_ID_HEADER, requestId);
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
        const normalizedRoutePath = normalizeRoutePath(url);
        recordDaemonRequest(normalizedRoutePath, method);
        res.__neurcodeRoutePath = normalizedRoutePath;
        try {
            if (method === 'GET' && url === '/health') {
                let version = '0.0.0';
                try {
                    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
                    version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? version;
                }
                catch { /* ignore */ }
                const operational = buildDaemonOperationalSummary(process.cwd());
                send(res, 200, {
                    ok: true,
                    version,
                    cwd: process.cwd(),
                    operational,
                    executionBus: {
                        schemaVersion: 'neurcode.execution.v1',
                        supportedActions: ['verify', 'fix', 'patch', 'apply-safe', 'reverify', 'policy-sync', 'intent-update'],
                    },
                    runtimeEvents: {
                        schemaVersion: 'neurcode.runtime-event.v1',
                        streamPath: '/events/stream',
                    },
                    compatibility: {
                        runtimeContractVersion: contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_VERSION,
                        cliJsonContractVersion: contracts_1.CLI_JSON_CONTRACT_VERSION,
                        statusVocabularyVersion: contracts_1.STATUS_VOCABULARY_VERSION,
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
            if (method === 'GET' && (url === '/ops/summary' || url.startsWith('/ops/summary?'))) {
                success(res, {
                    schemaVersion: 'neurcode.daemon.ops.v1',
                    generatedAt: new Date().toISOString(),
                    operational: buildDaemonOperationalSummary(process.cwd()),
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
            if (method === 'POST' && (url === '/control-plane/preview' || url.startsWith('/control-plane/preview?'))) {
                await handlePreviewControlPlaneUpdate(req, res);
                return;
            }
            if (method === 'PUT' && (url === '/control-plane' || url.startsWith('/control-plane?'))) {
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
                // Cross-repo graph: GET /workspaces/:id/cross-repo-graph
                const crossRepoGraphMatch = url.match(/^\/workspaces\/([^/]+)\/cross-repo-graph(?:\?.*)?$/);
                if (crossRepoGraphMatch) {
                    await handleGetCrossRepoGraph(req, res, decodeURIComponent(crossRepoGraphMatch[1]));
                    return;
                }
                const detailMatch = url.match(/^\/workspaces\/([^/?]+)(?:\?.*)?$/);
                if (detailMatch) {
                    await handleGetWorkspace(req, res, decodeURIComponent(detailMatch[1]));
                    return;
                }
            }
            if (method === 'POST' && (url === '/workspaces' || url.startsWith('/workspaces?'))) {
                await handleCreateWorkspace(req, res);
                return;
            }
            const activateMatch = url.match(/^\/workspaces\/([^/]+)\/activate(?:\?.*)?$/);
            if (method === 'POST' && activateMatch) {
                await handleActivateWorkspace(req, res, decodeURIComponent(activateMatch[1]));
                return;
            }
            const addRepoMatch = url.match(/^\/workspaces\/([^/]+)\/repositories(?:\?.*)?$/);
            if (method === 'POST' && addRepoMatch) {
                await handleAddWorkspaceRepository(req, res, decodeURIComponent(addRepoMatch[1]));
                return;
            }
            // Federated context: POST /workspaces/:id/federated-context
            const federatedContextMatch = url.match(/^\/workspaces\/([^/]+)\/federated-context(?:\?.*)?$/);
            if (method === 'POST' && federatedContextMatch) {
                await handleGetFederatedContext(req, res, decodeURIComponent(federatedContextMatch[1]));
                return;
            }
            // Semantic search: POST /workspaces/:id/semantic-search
            const semanticSearchMatch = url.match(/^\/workspaces\/([^/]+)\/semantic-search(?:\?.*)?$/);
            if (method === 'POST' && semanticSearchMatch) {
                await handleSemanticSearch(req, res, decodeURIComponent(semanticSearchMatch[1]));
                return;
            }
            // Semantic index build: POST /workspaces/:id/semantic-index/build
            const semanticIndexBuildMatch = url.match(/^\/workspaces\/([^/]+)\/semantic-index\/build(?:\?.*)?$/);
            if (method === 'POST' && semanticIndexBuildMatch) {
                await handleBuildSemanticIndex(req, res, decodeURIComponent(semanticIndexBuildMatch[1]));
                return;
            }
            // Intent expansion: POST /workspaces/:id/intent-expand
            const intentExpandMatch = url.match(/^\/workspaces\/([^/]+)\/intent-expand(?:\?.*)?$/);
            if (method === 'POST' && intentExpandMatch) {
                await handleIntentExpand(req, res, decodeURIComponent(intentExpandMatch[1]));
                return;
            }
            const updateWorkspaceMatch = url.match(/^\/workspaces\/([^/?]+)(?:\?.*)?$/);
            if (method === 'PUT' && updateWorkspaceMatch) {
                await handleUpdateWorkspace(req, res, decodeURIComponent(updateWorkspaceMatch[1]));
                return;
            }
            if (method === 'POST' && (url === '/workspaces/execute' || url.startsWith('/workspaces/execute?'))) {
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
            // ── Governance findings & overview (new surfaces) ───────────────────────
            if (method === 'GET' && (url === '/governance/findings' || url.startsWith('/governance/findings?'))) {
                await handleGovernanceFindings(req, res);
                return;
            }
            if (method === 'GET' && (url === '/governance/overview' || url.startsWith('/governance/overview?'))) {
                await handleGovernanceOverview(req, res);
                return;
            }
            if (method === 'GET' && (url === '/brain/cache-status' || url.startsWith('/brain/cache-status?'))) {
                await handleBrainCacheStatus(req, res);
                return;
            }
            if (method === 'GET' && (url === '/remediation/status' || url.startsWith('/remediation/status?'))) {
                await handleRemediationStatus(req, res);
                return;
            }
            if (method === 'GET' && (url === '/pilot-report' || url.startsWith('/pilot-report?'))) {
                await handlePilotReport(req, res);
                return;
            }
            // ── Enterprise docs serving (renders from docs/enterprise/ on filesystem) ─
            if (method === 'GET' && url === '/docs/enterprise') {
                await handleDocsManifest(res);
                return;
            }
            const docsContentMatch = url.match(/^\/docs\/enterprise\/([^/?]+)(?:\?.*)?$/);
            if (method === 'GET' && docsContentMatch) {
                await handleDocsContent(res, decodeURIComponent(docsContentMatch[1]));
                return;
            }
            if (method === 'POST' && (url === '/execute' || url.startsWith('/execute?'))) {
                await handleExecute(req, res);
                return;
            }
            if (method === 'POST' && (url === '/verify' || url.startsWith('/verify?'))) {
                await handleVerify(req, res);
                return;
            }
            if (method === 'POST' && (url === '/fix' || url.startsWith('/fix?'))) {
                await handleFix(req, res);
                return;
            }
            if (method === 'POST' && (url === '/fix/apply-safe' || url.startsWith('/fix/apply-safe?'))) {
                await handleFixApplySafe(req, res);
                return;
            }
            if (method === 'POST' && (url === '/patch/preview' || url.startsWith('/patch/preview?'))) {
                await handlePatchPreview(req, res);
                return;
            }
            if (method === 'POST' && (url === '/patch/rollback' || url.startsWith('/patch/rollback?'))) {
                await handlePatchRollback(req, res);
                return;
            }
            if (method === 'POST' && (url === '/patch' || url.startsWith('/patch?'))) {
                await handlePatch(req, res);
                return;
            }
            failure(res, `No route for ${method} ${url}`, 404);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (/execution lock busy|EEXIST: file already exists, open '.*\/\.lock'/.test(message)) {
                failure(res, 'Execution lock busy. Another daemon action is running; retry this request.', 409, {
                    code: 'daemon.execution_lock_busy',
                    retriable: true,
                    details: { cause: message },
                });
                return;
            }
            failure(res, message, 500);
        }
    });
    return server;
}
// ── Start function ─────────────────────────────────────────────────────────────
function validateDaemonStartup(cwd) {
    const errors = [];
    const warnings = [];
    const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
    if (!Number.isFinite(nodeMajor) || nodeMajor < 18) {
        errors.push(`Node.js >= 18 is required (detected ${process.versions.node}).`);
    }
    try {
        const stat = fs.statSync(cwd);
        if (!stat.isDirectory()) {
            errors.push(`Current working directory is not a directory: ${cwd}`);
        }
    }
    catch (error) {
        errors.push(`Cannot access working directory ${cwd}: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        const runtimeDir = path.resolve(cwd, '.neurcode');
        fs.mkdirSync(runtimeDir, { recursive: true });
        fs.accessSync(runtimeDir, fs.constants.R_OK | fs.constants.W_OK);
    }
    catch (error) {
        errors.push(`Runtime state directory .neurcode is not writable in ${cwd}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const apiUrl = process.env.NEURCODE_API_URL || process.env.VITE_API_URL;
    if (!apiUrl) {
        warnings.push('NEURCODE_API_URL is not set; cloud compatibility probes may rely on default localhost API settings.');
    }
    if (ALLOW_NON_LOOPBACK) {
        warnings.push('Remote daemon access is enabled via NEURCODE_DAEMON_ALLOW_REMOTE. Ensure network access is restricted and trusted.');
    }
    return { errors, warnings };
}
function startDaemon() {
    const cwd = process.cwd();
    const startupValidation = validateDaemonStartup(cwd);
    for (const warning of startupValidation.warnings) {
        console.warn(`⚠️  Daemon startup warning: ${warning}`);
    }
    if (startupValidation.errors.length > 0) {
        for (const error of startupValidation.errors) {
            console.error(`❌ Daemon startup validation error: ${error}`);
        }
        process.exit(1);
    }
    const server = createDaemonServer();
    startRuntimeEventTailer(cwd);
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
        console.log(`  POST /patch/preview  → deterministic patch preview (before/after diff)`);
        console.log(`  POST /patch/rollback → deterministic rollback apply by receipt`);
        console.log(`  POST /patch          → execution bus: patch + reverify`);
        console.log(`  POST /execute        → unified execution endpoint`);
        console.log(`  GET  /executions     → execution history`);
        console.log(`  GET  /executions/:id → execution detail`);
        console.log(`  GET  /executions/:id/timeline → phase timeline + durations`);
        console.log(`  GET  /executions/:id/diff     → verification + patch inspection`);
        console.log(`  GET  /events         → runtime event history`);
        console.log(`  GET  /events/stream  → SSE deterministic governance runtime`);
        console.log(`  GET  /ops/summary    → daemon operational health + reliability metrics`);
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
        console.log(`  GET  /workspaces/:id/cross-repo-graph → detected cross-repo dependency edges`);
        console.log(`  POST /workspaces/:id/federated-context → multi-repo blast radius analysis`);
        console.log(`  POST /workspaces/:id/semantic-search → TF-IDF vector similarity file search`);
        console.log(`  POST /workspaces/:id/semantic-index/build → rebuild semantic index from brain context`);
        console.log(`  POST /workspaces/:id/intent-expand → signed semantic intent governance artifact`);
        console.log(`  GET  /replay/state → deterministic governance state replay`);
        console.log(`  GET  /replay/execution/:id → deterministic execution replay`);
        console.log(`  GET  /replay/workspace/:id → deterministic workspace replay`);
        console.log(`  GET  /replay/timeline → deterministic governance timeline replay`);
        console.log(`  GET  /governance/findings → canonical governance findings (last verify output)`);
        console.log(`  GET  /governance/overview → governance posture summary`);
        console.log(`  GET  /brain/cache-status → brain cache manifest and freshness`);
        console.log(`  GET  /remediation/status → remediation artifacts and receipts`);
        console.log(`  GET  /pilot-report       → governance health metrics and trend`);
        console.log(`\n  CWD: ${cwd}`);
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