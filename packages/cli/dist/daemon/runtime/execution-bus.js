"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExecution = runExecution;
exports.recordSyntheticExecution = recordSyntheticExecution;
exports.queryExecutions = queryExecutions;
exports.listExecutions = listExecutions;
exports.buildExecutionTimeline = buildExecutionTimeline;
exports.buildExecutionDiffInspection = buildExecutionDiffInspection;
exports.getExecutionById = getExecutionById;
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const path_1 = require("path");
const artifact_io_1 = require("../../utils/artifact-io");
const cli_json_1 = require("../../utils/cli-json");
const runtime_events_1 = require("../../utils/runtime-events");
const execution_actions_1 = require("../../utils/execution-actions");
const DEFAULT_EXECUTIONS_DIR = '.neurcode/executions';
const RECORD_SCHEMA_VERSION = 'neurcode.execution.v1';
const RECORD_PREFIX = 'execution-';
const RECORD_SUFFIX = '.json';
const DEFAULT_RETENTION = 250;
const DEFAULT_LOCK_TIMEOUT_MS = 90_000;
const LOCK_STALE_GRACE_MS = 5_000;
const DEFAULT_DEDUPE_WINDOW_MS = 0;
const MAX_DEDUPE_WINDOW_MS = 60_000;
const EXECUTION_CHILD_ENV = { NEURCODE_EXECUTION_CHILD: '1' };
function nowIso() {
    return new Date().toISOString();
}
function parseJsonRecord(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function asObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    return value;
}
function asString(value) {
    return typeof value === 'string' ? value : null;
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function readRuntimeControlPlaneDefaults(cwd) {
    const defaultValues = {
        duplicateSuppression: false,
        dedupeWindowMs: DEFAULT_DEDUPE_WINDOW_MS,
        executionRetention: DEFAULT_RETENTION,
        lockTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
    };
    const configPath = (0, path_1.resolve)(cwd, '.neurcode/control-plane/runtime.json');
    if (!(0, fs_1.existsSync)(configPath)) {
        return defaultValues;
    }
    try {
        const parsed = parseJsonRecord((0, fs_1.readFileSync)(configPath, 'utf-8'));
        if (!parsed)
            return defaultValues;
        const execution = asObject(parsed.execution);
        const retention = asObject(parsed.retention);
        const duplicateSuppression = typeof execution?.duplicateSuppression === 'boolean'
            ? execution.duplicateSuppression
            : defaultValues.duplicateSuppression;
        const dedupeWindowMs = asNumber(execution?.dedupeWindowMs);
        const executionRetention = asNumber(retention?.executionRecords);
        const lockTimeoutMs = asNumber(execution?.lockTimeoutMs);
        return {
            duplicateSuppression,
            dedupeWindowMs: dedupeWindowMs === null
                ? defaultValues.dedupeWindowMs
                : Math.min(MAX_DEDUPE_WINDOW_MS, Math.max(0, Math.floor(dedupeWindowMs))),
            executionRetention: executionRetention === null
                ? defaultValues.executionRetention
                : Math.max(1, Math.floor(executionRetention)),
            lockTimeoutMs: lockTimeoutMs === null
                ? defaultValues.lockTimeoutMs
                : Math.max(10_000, Math.min(300_000, Math.floor(lockTimeoutMs))),
        };
    }
    catch {
        return defaultValues;
    }
}
function parseRetentionLimit(input, cwd) {
    if (typeof input === 'number' && Number.isFinite(input) && input >= 1) {
        return Math.floor(input);
    }
    const runtimeDefaults = readRuntimeControlPlaneDefaults(cwd);
    if (Number.isFinite(runtimeDefaults.executionRetention) && runtimeDefaults.executionRetention >= 1) {
        return Math.floor(runtimeDefaults.executionRetention);
    }
    const env = process.env.NEURCODE_EXECUTION_RETENTION;
    if (!env)
        return DEFAULT_RETENTION;
    const parsed = Number.parseInt(env, 10);
    if (!Number.isFinite(parsed) || parsed < 1)
        return DEFAULT_RETENTION;
    return Math.floor(parsed);
}
function parseDedupeWindowMs(input, cwd) {
    if (typeof input === 'number' && Number.isFinite(input) && input >= 0) {
        return Math.min(MAX_DEDUPE_WINDOW_MS, Math.floor(input));
    }
    const runtimeDefaults = readRuntimeControlPlaneDefaults(cwd);
    if (runtimeDefaults.duplicateSuppression) {
        return Math.min(MAX_DEDUPE_WINDOW_MS, Math.max(0, Math.floor(runtimeDefaults.dedupeWindowMs)));
    }
    const env = process.env.NEURCODE_EXECUTION_DEDUPE_WINDOW_MS;
    if (!env)
        return DEFAULT_DEDUPE_WINDOW_MS;
    const parsed = Number.parseInt(env, 10);
    if (!Number.isFinite(parsed) || parsed < 0)
        return DEFAULT_DEDUPE_WINDOW_MS;
    return Math.min(MAX_DEDUPE_WINDOW_MS, Math.floor(parsed));
}
function normalizeSource(input) {
    if (!input)
        return 'unknown';
    const normalized = input.trim().toLowerCase();
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
function resolveExecutionPaths(cwd) {
    const rootDir = (0, path_1.resolve)(cwd, DEFAULT_EXECUTIONS_DIR);
    const recordsDir = (0, path_1.join)(rootDir, 'records');
    const eventsFile = (0, path_1.join)(rootDir, 'events.jsonl');
    const lockFile = (0, path_1.join)(rootDir, '.lock');
    (0, fs_1.mkdirSync)(recordsDir, { recursive: true });
    return { rootDir, recordsDir, eventsFile, lockFile };
}
function executionIdFromNow() {
    const stamp = nowIso().replace(/[:.]/g, '-');
    const random = Math.random().toString(16).slice(2, 8);
    return `exec-${stamp}-${random}`;
}
function appendEventLine(paths, event) {
    try {
        (0, artifact_io_1.appendJsonLineSync)(paths.eventsFile, event, { fsync: false });
    }
    catch {
        // Best-effort only; record file remains source of truth.
    }
}
function buildCounts(payload) {
    if (!payload) {
        return { blocking: 0, advisory: 0 };
    }
    const blockingFromField = asNumber(payload.blockingCount);
    const advisoryFromField = asNumber(payload.advisoryCount);
    if (blockingFromField !== null || advisoryFromField !== null) {
        return {
            blocking: blockingFromField ?? 0,
            advisory: advisoryFromField ?? 0,
        };
    }
    const violations = Array.isArray(payload.violations) ? payload.violations : [];
    let blocking = 0;
    for (const violation of violations) {
        const record = asObject(violation);
        const severity = (asString(record?.severity) || '').toLowerCase();
        if (severity === 'critical' || severity === 'high' || severity === 'block') {
            blocking += 1;
        }
    }
    return {
        blocking,
        advisory: Math.max(0, violations.length - blocking),
    };
}
function severityFromCounts(counts) {
    if (!counts)
        return 'medium';
    if (counts.blocking > 0)
        return 'high';
    if (counts.advisory > 0)
        return 'medium';
    return 'low';
}
function toPayloadObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    return value;
}
function toVerificationSnapshot(payload) {
    if (!payload)
        return null;
    return {
        verdict: asString(payload.verdict) || 'UNKNOWN',
        grade: asString(payload.grade) || undefined,
        score: asNumber(payload.score),
        summary: payload.summary ?? null,
        counts: buildCounts(payload),
    };
}
function toVerificationDiff(before, after) {
    const beforeCounts = before?.counts ?? null;
    const afterCounts = after?.counts ?? null;
    if (!beforeCounts && !afterCounts) {
        return {
            before: null,
            after: null,
            blockingDelta: null,
            advisoryDelta: null,
            trend: 'baseline',
        };
    }
    if (!beforeCounts) {
        return {
            before: null,
            after: afterCounts,
            blockingDelta: null,
            advisoryDelta: null,
            trend: 'baseline',
        };
    }
    if (!afterCounts) {
        return {
            before: beforeCounts,
            after: null,
            blockingDelta: null,
            advisoryDelta: null,
            trend: 'unchanged',
        };
    }
    const blockingDelta = afterCounts.blocking - beforeCounts.blocking;
    const advisoryDelta = afterCounts.advisory - beforeCounts.advisory;
    let trend = 'unchanged';
    if (blockingDelta < 0 || (blockingDelta === 0 && advisoryDelta < 0)) {
        trend = 'improved';
    }
    else if (blockingDelta > 0 || (blockingDelta === 0 && advisoryDelta > 0)) {
        trend = 'regressed';
    }
    return {
        before: beforeCounts,
        after: afterCounts,
        blockingDelta,
        advisoryDelta,
        trend,
    };
}
function buildNarrative(actionType, succeeded, verification, target) {
    if (!succeeded) {
        return {
            status: 'failure',
            summary: `${actionType} execution failed before deterministic remediation completed.`,
            why: 'The command exited non-zero or produced no valid payload for downstream verification.',
            riskLevel: 'high',
            recommendedAction: 'Review command output, resolve local errors, and re-run execution.',
            expectedImprovement: 'A successful rerun will re-enter verify/evidence/narrative stages and restore traceability.',
        };
    }
    const diff = verification.diff;
    if (diff.trend === 'improved') {
        return {
            status: 'success',
            summary: target
                ? `Execution improved governance posture for ${target}.`
                : 'Execution improved governance posture.',
            why: `Blocking delta ${diff.blockingDelta ?? 0}, advisory delta ${diff.advisoryDelta ?? 0}.`,
            riskLevel: 'low',
            recommendedAction: 'Run follow-up verify in CI to confirm stability across ephemeral runners.',
            expectedImprovement: 'Sustaining the same export → fix → re-verify pattern should reduce recurrent blocking drift.',
        };
    }
    if (diff.trend === 'regressed') {
        return {
            status: 'warning',
            summary: 'Execution completed but verification regressed.',
            why: `Blocking delta ${diff.blockingDelta ?? 0}, advisory delta ${diff.advisoryDelta ?? 0}.`,
            riskLevel: 'high',
            recommendedAction: 'Export remediation context (`neurcode remediate-export`) and re-verify after external edits before merging.',
            expectedImprovement: 'Closing blocking findings externally then re-running verify should reduce reported violations.',
        };
    }
    return {
        status: 'success',
        summary: 'Execution completed with stable verification posture.',
        why: 'No net blocking/advisory change was detected in the deterministic reverify stage.',
        riskLevel: 'medium',
        recommendedAction: 'Review advisory findings and maintain verify cadence.',
        expectedImprovement: 'Targeted follow-up remediation and re-verify can move the system from stable to improving.',
    };
}
function listEvidenceFiles(dir) {
    if (!(0, fs_1.existsSync)(dir))
        return [];
    return (0, fs_1.readdirSync)(dir)
        .filter((name) => name.startsWith('verification-') && name.endsWith('.json'))
        .sort();
}
function resolveEvidenceDirectory(cwd, configured) {
    if (configured && configured.trim().length > 0) {
        return (0, path_1.resolve)(cwd, configured.trim());
    }
    return (0, path_1.resolve)(cwd, '.neurcode/evidence');
}
function collectNewEvidenceRefs(before, afterEntries, evidenceDir) {
    const created = [];
    for (const name of afterEntries) {
        if (before.has(name))
            continue;
        created.push((0, path_1.join)(evidenceDir, name));
    }
    return created.sort();
}
function resolveCiMode(request, source) {
    if (typeof request.ciMode === 'boolean')
        return request.ciMode;
    return source === 'ci' || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}
function ensureFlag(args, flag) {
    if (args.includes(flag))
        return [...args];
    return [...args, flag];
}
function ensureCiFlag(args, ciMode) {
    return ciMode ? ensureFlag(args, '--ci') : [...args];
}
function ensureVerifyEvidence(args) {
    return args[0] === 'verify' ? ensureFlag(args, '--evidence') : [...args];
}
function buildDefaultVerifyArgs(ciMode, withEvidence) {
    let args = ['verify'];
    if (withEvidence) {
        args = ensureFlag(args, '--evidence');
    }
    return ensureCiFlag(args, ciMode);
}
function resolvePrimaryCommand(request, ciMode) {
    const semantics = (0, execution_actions_1.getExecutionActionSemantics)(request.type);
    if (Array.isArray(request.primaryArgs) && request.primaryArgs.length > 0) {
        const provided = [...request.primaryArgs];
        if (provided[0] === 'verify') {
            const verifyCommand = semantics.forceEvidenceOnPrimaryVerify
                ? ensureVerifyEvidence(provided)
                : [...provided];
            return ensureCiFlag(verifyCommand, ciMode);
        }
        if (provided[0] === 'fix') {
            return ensureCiFlag(provided, ciMode);
        }
        return [...provided];
    }
    if (request.type === 'patch') {
        return ['patch', '--file', request.target || '', '--json'];
    }
    if (request.type === 'intent-update') {
        return ['start', request.intentText || 'Update intent'];
    }
    if (semantics.primaryCommand[0] === 'verify') {
        return buildDefaultVerifyArgs(ciMode, semantics.forceEvidenceOnPrimaryVerify);
    }
    return ensureCiFlag([...semantics.primaryCommand], ciMode);
}
function resolveBaselineVerifyCommand(request, ciMode) {
    if (Array.isArray(request.baselineVerifyArgs) && request.baselineVerifyArgs.length > 0) {
        return ensureCiFlag([...request.baselineVerifyArgs], ciMode);
    }
    return buildDefaultVerifyArgs(ciMode, false);
}
function resolveReverifyCommand(request, ciMode) {
    if (Array.isArray(request.reverifyArgs) && request.reverifyArgs.length > 0) {
        return ensureCiFlag(ensureFlag([...request.reverifyArgs], '--evidence'), ciMode);
    }
    return buildDefaultVerifyArgs(ciMode, true);
}
function isPathInsideCwd(cwd, targetPath) {
    const resolvedTarget = (0, path_1.resolve)(cwd, targetPath);
    const root = cwd.endsWith(path_1.sep) ? cwd : `${cwd}${path_1.sep}`;
    return resolvedTarget === cwd || resolvedTarget.startsWith(root);
}
function validateRequest(request, cwd) {
    const semantics = (0, execution_actions_1.getExecutionActionSemantics)(request.type);
    if (semantics.mutatesCode && request.type === 'patch') {
        if (!request.target || request.target.trim().length === 0) {
            return 'patch execution requires a target file path';
        }
        if (!isPathInsideCwd(cwd, request.target)) {
            return 'patch target path is unsafe';
        }
    }
    if (request.type === 'intent-update' && (!request.intentText || request.intentText.trim().length === 0)) {
        return 'intent-update execution requires intentText';
    }
    return null;
}
function buildExecutionFingerprint(request, source, actor, cwd, ciMode) {
    const semantics = (0, execution_actions_1.getExecutionActionSemantics)(request.type);
    const fingerprintPayload = {
        type: request.type,
        executionClass: semantics.class,
        source,
        actor,
        target: request.target || null,
        intentText: request.intentText || null,
        reverify: request.reverify !== false,
        ciMode,
        cwd,
        primaryArgs: request.primaryArgs ?? null,
        baselineVerifyArgs: request.baselineVerifyArgs ?? null,
        reverifyArgs: request.reverifyArgs ?? null,
    };
    return (0, crypto_1.createHash)('sha256').update(JSON.stringify(fingerprintPayload)).digest('hex');
}
function writeRecord(paths, record) {
    const filePath = (0, path_1.join)(paths.recordsDir, `${RECORD_PREFIX}${record.id}${RECORD_SUFFIX}`);
    (0, artifact_io_1.atomicWriteJsonFileSync)(filePath, record);
    return filePath;
}
function pruneRecords(paths, keepLatest) {
    const files = (0, fs_1.readdirSync)(paths.recordsDir)
        .filter((name) => name.startsWith(RECORD_PREFIX) && name.endsWith(RECORD_SUFFIX))
        .sort();
    if (files.length <= keepLatest)
        return;
    const toDelete = files.slice(0, files.length - keepLatest);
    for (const name of toDelete) {
        (0, fs_1.rmSync)((0, path_1.join)(paths.recordsDir, name), { force: true });
    }
}
function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(1, ms));
}
function readLockAgeMs(lockFile) {
    try {
        const stamp = (0, fs_1.readFileSync)(lockFile, 'utf-8').trim();
        const parsed = Date.parse(stamp);
        return Number.isFinite(parsed) ? Date.now() - parsed : 0;
    }
    catch {
        return null;
    }
}
function acquireLock(lockFile, timeoutMs) {
    const boundedTimeout = Math.max(0, Math.floor(timeoutMs));
    const startedAt = Date.now();
    let lastMessage = 'lock exists';
    while (true) {
        if ((0, fs_1.existsSync)(lockFile)) {
            const ageMs = readLockAgeMs(lockFile) ?? 0;
            if (ageMs > boundedTimeout + LOCK_STALE_GRACE_MS) {
                try {
                    (0, fs_1.unlinkSync)(lockFile);
                }
                catch {
                    // Another contender may have released or replaced the lock.
                }
            }
        }
        try {
            return (0, fs_1.openSync)(lockFile, 'wx');
        }
        catch (error) {
            const errorCode = typeof error === 'object' && error && 'code' in error
                ? String(error.code)
                : '';
            const message = error instanceof Error ? error.message : String(error);
            if (errorCode !== 'EEXIST') {
                throw new Error(`execution lock unavailable: ${message}`);
            }
            lastMessage = message;
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed >= boundedTimeout) {
            throw new Error(`execution lock busy after ${elapsed}ms: ${lastMessage}`);
        }
        sleepSync(Math.min(50, boundedTimeout - elapsed));
    }
}
function markLockAcquired(fd) {
    try {
        (0, fs_1.writeFileSync)(fd, nowIso(), { encoding: 'utf-8' });
    }
    catch {
        // Lock timestamp is diagnostic/stale-cleanup metadata. The open fd itself
        // remains the ownership boundary for this process.
    }
}
function releaseLock(fd, lockFile) {
    try {
        (0, fs_1.unlinkSync)(lockFile);
    }
    catch {
        // ignore
    }
    try {
        (0, fs_1.closeSync)(fd);
    }
    catch {
        // ignore
    }
}
function toEvent(stage, message, details) {
    return {
        timestamp: nowIso(),
        stage,
        message,
        ...(details ? { details } : {}),
    };
}
function readExecutionRecord(filePath) {
    try {
        const parsed = parseJsonRecord((0, fs_1.readFileSync)(filePath, 'utf-8'));
        if (!parsed)
            return null;
        if (parsed.schemaVersion !== RECORD_SCHEMA_VERSION)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function toRecordPath(paths, executionId) {
    return (0, path_1.join)(paths.recordsDir, `${RECORD_PREFIX}${executionId}${RECORD_SUFFIX}`);
}
function normalizeLimit(limit) {
    if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 1) {
        return Math.floor(limit);
    }
    return 50;
}
function normalizeQueryLimit(limit) {
    const normalized = normalizeLimit(limit);
    return Math.min(200, normalized);
}
function normalizeOffset(offset) {
    if (typeof offset === 'number' && Number.isFinite(offset) && offset >= 0) {
        return Math.floor(offset);
    }
    return 0;
}
function parseQueryDate(value) {
    if (!value || value.trim().length === 0)
        return null;
    const parsed = Date.parse(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
}
function normalizeSeverityFilter(value) {
    if (!value)
        return 'all';
    const normalized = value.trim().toLowerCase();
    if (normalized === 'all'
        || normalized === 'blocking'
        || normalized === 'advisory'
        || normalized === 'high'
        || normalized === 'medium'
        || normalized === 'low') {
        return normalized;
    }
    return 'all';
}
function getVerificationCountsForFilter(record) {
    return record.verification.after?.counts ?? record.verification.before?.counts ?? null;
}
function inferRiskLevel(record) {
    const explicit = record.narrative?.riskLevel;
    if (explicit === 'low' || explicit === 'medium' || explicit === 'high') {
        return explicit;
    }
    const counts = getVerificationCountsForFilter(record);
    if (!counts)
        return 'medium';
    if (counts.blocking > 0)
        return 'high';
    if (counts.advisory > 0)
        return 'medium';
    return 'low';
}
function buildExecutionSearchText(record) {
    const chunks = [
        record.id,
        record.type,
        record.source,
        record.actor,
        record.status,
        record.target || '',
        record.result?.message || '',
        record.result?.stderr || '',
        record.result?.command.join(' ') || '',
        record.narrative?.summary || '',
        record.narrative?.why || '',
        record.narrative?.recommendedAction || '',
        record.evidence.references.join(' '),
    ];
    return chunks.join(' ').toLowerCase();
}
function extractHotspotSnapshot(payload) {
    if (!payload)
        return [];
    const buckets = new Map();
    const candidates = [
        ...(Array.isArray(payload.violations) ? payload.violations : []),
        ...(Array.isArray(payload.warnings) ? payload.warnings : []),
    ];
    for (const candidate of candidates) {
        const row = toPayloadObject(candidate);
        const file = (asString(row?.file) || '').trim();
        if (!file)
            continue;
        buckets.set(file, (buckets.get(file) || 0) + 1);
    }
    return [...buckets.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 3)
        .map(([file, count]) => ({ file, count }));
}
function matchesExecutionFilters(record, options, parsedFromMs, parsedToMs, normalizedSeverity) {
    if (options.type && options.type !== 'all' && record.type !== options.type) {
        return false;
    }
    if (options.source && options.source !== 'all' && record.source !== options.source) {
        return false;
    }
    if (options.status && options.status !== 'all' && record.status !== options.status) {
        return false;
    }
    if (options.actor && options.actor.trim().length > 0) {
        const actorNeedle = options.actor.trim().toLowerCase();
        if (!record.actor.toLowerCase().includes(actorNeedle)) {
            return false;
        }
    }
    const createdAtMs = Date.parse(record.createdAt);
    if (parsedFromMs !== null && Number.isFinite(createdAtMs) && createdAtMs < parsedFromMs) {
        return false;
    }
    if (parsedToMs !== null && Number.isFinite(createdAtMs) && createdAtMs > parsedToMs) {
        return false;
    }
    if (normalizedSeverity !== 'all') {
        const counts = getVerificationCountsForFilter(record) ?? { blocking: 0, advisory: 0 };
        const risk = inferRiskLevel(record);
        if (normalizedSeverity === 'blocking' && counts.blocking <= 0)
            return false;
        if (normalizedSeverity === 'advisory' && counts.advisory <= 0)
            return false;
        if (normalizedSeverity === 'high' && risk !== 'high')
            return false;
        if (normalizedSeverity === 'medium' && risk !== 'medium')
            return false;
        if (normalizedSeverity === 'low' && risk !== 'low')
            return false;
    }
    if (options.q && options.q.trim().length > 0) {
        const needle = options.q.trim().toLowerCase();
        const haystack = buildExecutionSearchText(record);
        if (!haystack.includes(needle)) {
            return false;
        }
    }
    return true;
}
function toCliInvocationFailure(message) {
    return {
        exitCode: 1,
        stdout: '',
        stderr: message,
        payload: null,
        command: [],
    };
}
function isInvocationSuccessful(invocation) {
    if (!invocation)
        return false;
    if (invocation.exitCode !== 0)
        return false;
    if (invocation.payload && typeof invocation.payload.success === 'boolean') {
        return invocation.payload.success;
    }
    return true;
}
function findRecentDuplicateExecution(paths, fingerprint, dedupeWindowMs) {
    if (dedupeWindowMs <= 0)
        return null;
    const files = (0, fs_1.readdirSync)(paths.recordsDir)
        .filter((name) => name.startsWith(RECORD_PREFIX) && name.endsWith(RECORD_SUFFIX))
        .sort()
        .reverse()
        .slice(0, 25);
    const nowMs = Date.now();
    for (const file of files) {
        const record = readExecutionRecord((0, path_1.join)(paths.recordsDir, file));
        if (!record)
            continue;
        if (record.fingerprint !== fingerprint)
            continue;
        const completedMs = Date.parse(record.completedAt || record.createdAt);
        if (!Number.isFinite(completedMs))
            continue;
        if (nowMs - completedMs <= dedupeWindowMs) {
            return record;
        }
    }
    return null;
}
async function runExecution(request) {
    const cwd = (0, path_1.resolve)(request.cwd || process.cwd());
    const runtimeDefaults = readRuntimeControlPlaneDefaults(cwd);
    const paths = resolveExecutionPaths(cwd);
    const lockTimeout = typeof request.maxLockMs === 'number' && request.maxLockMs > 0
        ? Math.floor(request.maxLockMs)
        : runtimeDefaults.lockTimeoutMs;
    const lockFd = acquireLock(paths.lockFile, lockTimeout);
    markLockAcquired(lockFd);
    const source = normalizeSource(request.source);
    const actor = request.actor && request.actor.trim().length > 0
        ? request.actor.trim()
        : source === 'ci'
            ? 'ci-runner'
            : source === 'vscode'
                ? 'vscode-user'
                : source === 'dashboard'
                    ? 'dashboard-user'
                    : source === 'daemon'
                        ? 'daemon-bridge'
                        : 'local-user';
    const ciMode = resolveCiMode(request, source);
    const executionSemantics = (0, execution_actions_1.getExecutionActionSemantics)(request.type);
    const executionClass = executionSemantics.class;
    const fingerprint = buildExecutionFingerprint(request, source, actor, cwd, ciMode);
    const dedupeWindowMs = parseDedupeWindowMs(request.dedupeWindowMs, cwd);
    const executionId = executionIdFromNow();
    const createdAt = nowIso();
    const events = [toEvent('queued', 'Execution requested')];
    let primaryInvocation = null;
    let verifyInvocation = null;
    let finalStatus = 'failed';
    let startedAt = null;
    let completedAt = null;
    const evidenceDir = resolveEvidenceDirectory(cwd, request.evidenceDir);
    const evidenceBefore = new Set(listEvidenceFiles(evidenceDir));
    const retentionLimit = parseRetentionLimit(request.evidenceRetentionLimit, cwd);
    let verificationBeforePayload = null;
    let verificationAfterPayload = null;
    const emitRuntime = (type, severity, payload) => {
        try {
            (0, runtime_events_1.emitRuntimeEvent)(cwd, {
                type,
                executionId,
                source,
                actor,
                severity,
                payload: payload ?? {},
            });
        }
        catch {
            // Runtime event emission is best-effort and must not alter execution determinism.
        }
    };
    try {
        const dedupeEnabled = !(0, execution_actions_1.isCanonicalExecutionActionType)(request.type);
        const duplicate = dedupeEnabled
            ? findRecentDuplicateExecution(paths, fingerprint, dedupeWindowMs)
            : null;
        if (duplicate) {
            events.push(toEvent('validating', 'Duplicate execution suppressed', {
                duplicateExecutionId: duplicate.id,
                dedupeWindowMs,
                executionClass,
            }));
            appendEventLine(paths, {
                timestamp: nowIso(),
                executionId: duplicate.id,
                status: 'deduplicated',
                source,
                actor,
                dedupeWindowMs,
                fingerprint,
            });
            return {
                execution: duplicate,
                primaryPayload: duplicate.result?.payload ?? null,
                verificationPayload: null,
            };
        }
        events.push(toEvent('validating', 'Validating execution request'));
        emitRuntime('execution.progress', 'low', {
            stage: 'validating',
            type: request.type,
            target: request.target || null,
            ciMode,
            executionClass,
        });
        const validationError = validateRequest(request, cwd);
        if (validationError) {
            primaryInvocation = toCliInvocationFailure(validationError);
            throw new Error(validationError);
        }
        if (executionSemantics.captureBaselineVerify) {
            const baselineInvocation = await (0, cli_json_1.runCliJson)(resolveBaselineVerifyCommand(request, ciMode), {
                cwd,
                env: EXECUTION_CHILD_ENV,
            });
            verificationBeforePayload = baselineInvocation.payload;
            events.push(toEvent('validating', 'Captured baseline verification snapshot', {
                exitCode: baselineInvocation.exitCode,
                verdict: asString(baselineInvocation.payload?.verdict) || 'UNKNOWN',
                executionClass,
            }));
        }
        startedAt = nowIso();
        events.push(toEvent('executing', 'Executing primary action'));
        emitRuntime('execution.started', 'low', {
            type: request.type,
            target: request.target || null,
            command: resolvePrimaryCommand(request, ciMode),
            ciMode,
            executionClass,
            createdAt,
            startedAt,
        });
        emitRuntime('execution.progress', 'low', {
            stage: 'executing',
            type: request.type,
            target: request.target || null,
            executionClass,
        });
        const primaryCommand = resolvePrimaryCommand(request, ciMode);
        primaryInvocation = await (0, cli_json_1.runCliJson)(primaryCommand, { cwd, env: EXECUTION_CHILD_ENV });
        if (!primaryInvocation.payload) {
            throw new Error(primaryInvocation.stderr.trim() || `${request.type} produced no JSON payload`);
        }
        events.push(toEvent('executing', 'Primary action completed', {
            exitCode: primaryInvocation.exitCode,
            verdict: asString(primaryInvocation.payload.verdict) || null,
        }));
        const shouldReverify = executionSemantics.defaultReverify && request.reverify !== false;
        if ((0, execution_actions_1.isCanonicalExecutionActionType)(request.type)) {
            verificationAfterPayload = primaryInvocation.payload;
        }
        else if (shouldReverify) {
            events.push(toEvent('verifying', 'Running deterministic reverify'));
            emitRuntime('execution.progress', 'low', {
                stage: 'verifying',
                type: request.type,
                executionClass,
            });
            verifyInvocation = await (0, cli_json_1.runCliJson)(resolveReverifyCommand(request, ciMode), {
                cwd,
                env: EXECUTION_CHILD_ENV,
            });
            verificationAfterPayload = verifyInvocation.payload;
            events.push(toEvent('verifying', 'Reverify completed', {
                exitCode: verifyInvocation.exitCode,
                verdict: asString(verifyInvocation.payload?.verdict) || 'UNKNOWN',
                executionClass,
            }));
        }
        events.push(toEvent('evidence', 'Collecting evidence artifact references'));
        emitRuntime('execution.progress', 'low', {
            stage: 'evidence',
            type: request.type,
            executionClass,
        });
        const evidenceAfter = listEvidenceFiles(evidenceDir);
        const evidenceRefs = collectNewEvidenceRefs(evidenceBefore, evidenceAfter, evidenceDir);
        const verification = {
            before: toVerificationSnapshot(verificationBeforePayload),
            after: toVerificationSnapshot(verificationAfterPayload),
            diff: toVerificationDiff(toVerificationSnapshot(verificationBeforePayload), toVerificationSnapshot(verificationAfterPayload)),
        };
        const executionSucceeded = verifyInvocation
            ? isInvocationSuccessful(verifyInvocation)
            : isInvocationSuccessful(primaryInvocation);
        events.push(toEvent('narrating', 'Synthesizing deterministic execution narrative'));
        emitRuntime('execution.progress', 'low', {
            stage: 'narrating',
            type: request.type,
            executionClass,
        });
        const narrative = buildNarrative(request.type, executionSucceeded, verification, request.target || null);
        completedAt = nowIso();
        finalStatus = 'completed';
        const execution = {
            schemaVersion: RECORD_SCHEMA_VERSION,
            id: executionId,
            fingerprint,
            type: request.type,
            actor,
            source,
            target: request.target || null,
            status: finalStatus,
            createdAt,
            startedAt,
            completedAt,
            durationMs: startedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) : null,
            result: {
                success: executionSucceeded,
                exitCode: verifyInvocation?.exitCode ?? primaryInvocation.exitCode,
                command: primaryInvocation.command,
                message: asString(primaryInvocation.payload.message),
                payload: primaryInvocation.payload,
                stderr: primaryInvocation.stderr.trim() || null,
            },
            verification,
            evidence: {
                references: evidenceRefs,
                generated: evidenceRefs.length > 0,
                retentionLimit,
            },
            narrative,
            runtime: {
                cwd,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                ciMode,
                executionClass,
            },
            events,
        };
        writeRecord(paths, execution);
        appendEventLine(paths, {
            timestamp: completedAt,
            executionId,
            status: finalStatus,
            type: request.type,
            executionClass,
            source,
            actor,
            trend: verification.diff.trend,
            evidenceCount: evidenceRefs.length,
        });
        pruneRecords(paths, retentionLimit);
        const verificationCounts = verification.after?.counts ?? verification.before?.counts ?? null;
        emitRuntime('verification.completed', severityFromCounts(verificationCounts), {
            verdict: verification.after?.verdict || verification.before?.verdict || 'UNKNOWN',
            counts: verificationCounts,
            trend: verification.diff.trend,
            blockingDelta: verification.diff.blockingDelta,
            advisoryDelta: verification.diff.advisoryDelta,
            ciMode,
            executionClass,
        });
        if (verification.diff.trend === 'regressed') {
            emitRuntime('regression.detected', 'high', {
                blockingDelta: verification.diff.blockingDelta,
                advisoryDelta: verification.diff.advisoryDelta,
                target: request.target || null,
                executionClass,
            });
        }
        const hotspotSnapshot = extractHotspotSnapshot(verificationAfterPayload ?? verificationBeforePayload);
        if (hotspotSnapshot.length > 0) {
            emitRuntime('hotspot.updated', verification.diff.trend === 'regressed' ? 'high' : 'medium', {
                hotspots: hotspotSnapshot,
                trend: verification.diff.trend,
                executionClass,
            });
        }
        if ((0, execution_actions_1.isCompatibilityExecutionActionType)(request.type)) {
            const patchPayload = toPayloadObject(primaryInvocation.payload);
            const patchSucceeded = patchPayload?.success === true
                || (typeof asNumber(patchPayload?.applied) === 'number' && (asNumber(patchPayload?.applied) || 0) > 0);
            if (patchSucceeded) {
                emitRuntime('patch.applied', request.type === 'patch' ? 'low' : 'medium', {
                    type: request.type,
                    target: request.target || asString(patchPayload?.file) || null,
                    changed: patchPayload?.changed === true,
                    applied: asNumber(patchPayload?.applied) ?? null,
                    skipped: asNumber(patchPayload?.skipped) ?? null,
                    executionClass,
                });
            }
        }
        if (evidenceRefs.length > 0) {
            emitRuntime('evidence.generated', 'low', {
                count: evidenceRefs.length,
                references: evidenceRefs,
                executionClass,
            });
        }
        if (narrative) {
            emitRuntime('narrative.updated', narrative.riskLevel === 'high' ? 'high' : narrative.riskLevel === 'medium' ? 'medium' : 'low', {
                summary: narrative.summary,
                why: narrative.why,
                recommendedAction: narrative.recommendedAction,
                expectedImprovement: narrative.expectedImprovement,
                executionClass,
            });
        }
        emitRuntime(executionSucceeded ? 'execution.completed' : 'execution.failed', executionSucceeded ? 'low' : 'high', {
            status: execution.status,
            type: execution.type,
            durationMs: execution.durationMs,
            trend: execution.verification.diff.trend,
            evidenceCount: execution.evidence.references.length,
            exitCode: execution.result?.exitCode ?? 1,
            executionClass,
        });
        return {
            execution,
            primaryPayload: primaryInvocation.payload,
            verificationPayload: verificationAfterPayload,
        };
    }
    catch (error) {
        completedAt = nowIso();
        const message = error instanceof Error ? error.message : String(error);
        events.push(toEvent('failed', message));
        const execution = {
            schemaVersion: RECORD_SCHEMA_VERSION,
            id: executionId,
            fingerprint,
            type: request.type,
            actor,
            source,
            target: request.target || null,
            status: 'failed',
            createdAt,
            startedAt,
            completedAt,
            durationMs: startedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) : null,
            result: {
                success: false,
                exitCode: verifyInvocation?.exitCode ?? primaryInvocation?.exitCode ?? 1,
                command: primaryInvocation?.command || [],
                message,
                payload: primaryInvocation?.payload || null,
                stderr: primaryInvocation?.stderr?.trim() || message,
            },
            verification: {
                before: toVerificationSnapshot(verificationBeforePayload),
                after: toVerificationSnapshot(verificationAfterPayload),
                diff: toVerificationDiff(toVerificationSnapshot(verificationBeforePayload), toVerificationSnapshot(verificationAfterPayload)),
            },
            evidence: {
                references: [],
                generated: false,
                retentionLimit,
            },
            narrative: buildNarrative(request.type, false, {
                before: toVerificationSnapshot(verificationBeforePayload),
                after: toVerificationSnapshot(verificationAfterPayload),
                diff: toVerificationDiff(toVerificationSnapshot(verificationBeforePayload), toVerificationSnapshot(verificationAfterPayload)),
            }, request.target || null),
            runtime: {
                cwd,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                ciMode,
                executionClass,
            },
            events,
        };
        writeRecord(paths, execution);
        appendEventLine(paths, {
            timestamp: completedAt,
            executionId,
            status: 'failed',
            type: request.type,
            executionClass,
            source,
            actor,
            message,
        });
        pruneRecords(paths, retentionLimit);
        emitRuntime('execution.failed', 'high', {
            type: request.type,
            stage: events[events.length - 1]?.stage || 'failed',
            message,
            exitCode: verifyInvocation?.exitCode ?? primaryInvocation?.exitCode ?? 1,
            executionClass,
        });
        return {
            execution,
            primaryPayload: primaryInvocation?.payload || null,
            verificationPayload: verificationAfterPayload,
        };
    }
    finally {
        releaseLock(lockFd, paths.lockFile);
    }
}
function recordSyntheticExecution(input) {
    const cwd = (0, path_1.resolve)(input.cwd || process.cwd());
    const paths = resolveExecutionPaths(cwd);
    const source = normalizeSource(input.source);
    const executionClass = (0, execution_actions_1.getExecutionActionClass)(input.type);
    const actor = input.actor && input.actor.trim().length > 0
        ? input.actor.trim()
        : source === 'ci'
            ? 'ci-runner'
            : source === 'vscode'
                ? 'vscode-user'
                : source === 'dashboard'
                    ? 'dashboard-user'
                    : source === 'daemon'
                        ? 'daemon-bridge'
                        : 'local-user';
    const executionId = executionIdFromNow();
    const createdAt = nowIso();
    const startedAt = createdAt;
    const completedAt = createdAt;
    const status = input.status === 'failed' ? 'failed' : 'completed';
    const success = input.success !== false;
    const retentionLimit = parseRetentionLimit(input.evidenceRetentionLimit, cwd);
    const command = Array.isArray(input.command) && input.command.length > 0
        ? input.command
        : ['control-plane', 'apply'];
    const message = input.message ?? null;
    const payload = input.payload ?? null;
    const verificationSnapshot = input.verification
        ? {
            verdict: input.verification.verdict || (success ? 'PASS' : 'FAIL'),
            grade: input.verification.grade,
            score: input.verification.score ?? null,
            summary: input.verification.summary,
            counts: {
                blocking: Math.max(0, Math.floor(input.verification.counts?.blocking ?? 0)),
                advisory: Math.max(0, Math.floor(input.verification.counts?.advisory ?? 0)),
            },
        }
        : null;
    const verification = {
        before: null,
        after: verificationSnapshot,
        diff: {
            before: null,
            after: verificationSnapshot?.counts ?? null,
            blockingDelta: verificationSnapshot ? verificationSnapshot.counts.blocking : null,
            advisoryDelta: verificationSnapshot ? verificationSnapshot.counts.advisory : null,
            trend: 'baseline',
        },
    };
    const evidenceRefs = Array.isArray(input.evidenceReferences)
        ? input.evidenceReferences.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
        : [];
    const narrativeDefaults = {
        status: success ? 'success' : 'failure',
        summary: success ? 'Synthetic execution recorded' : 'Synthetic execution failed',
        why: message || (success ? 'Deterministic external event persisted' : 'Synthetic execution marked failed'),
        riskLevel: success ? 'low' : 'high',
        recommendedAction: success ? 'Run verify to confirm runtime posture.' : 'Review error and retry execution.',
        expectedImprovement: 'Maintains deterministic execution and governance history.',
    };
    const narrative = input.narrative
        ? {
            ...narrativeDefaults,
            ...input.narrative,
        }
        : narrativeDefaults;
    const events = [
        toEvent('queued', 'Synthetic execution requested'),
        toEvent('executing', 'Persisting synthetic execution event'),
        toEvent(status, message || (success ? 'Synthetic execution completed' : 'Synthetic execution failed'), input.eventDetails),
    ];
    const execution = {
        schemaVersion: RECORD_SCHEMA_VERSION,
        id: executionId,
        fingerprint: (0, crypto_1.createHash)('sha256')
            .update(JSON.stringify({
            type: input.type,
            source,
            actor,
            target: input.target || null,
            createdAt,
            payload,
            success,
        }))
            .digest('hex'),
        type: input.type,
        actor,
        source,
        target: input.target || null,
        status,
        createdAt,
        startedAt,
        completedAt,
        durationMs: 0,
        result: {
            success,
            exitCode: success ? 0 : 1,
            command,
            message,
            payload,
            stderr: input.stderr ?? null,
        },
        verification,
        evidence: {
            references: evidenceRefs,
            generated: evidenceRefs.length > 0,
            retentionLimit,
        },
        narrative,
        runtime: {
            cwd,
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            ciMode: input.ciMode === true,
            executionClass,
        },
        events,
    };
    writeRecord(paths, execution);
    appendEventLine(paths, {
        timestamp: completedAt,
        executionId,
        status,
        type: input.type,
        source,
        actor,
        message: message || null,
    });
    pruneRecords(paths, retentionLimit);
    return execution;
}
function queryExecutions(cwd = process.cwd(), options = {}) {
    const paths = resolveExecutionPaths((0, path_1.resolve)(cwd));
    const limit = normalizeQueryLimit(options.limit);
    const offset = normalizeOffset(options.offset);
    const parsedFromMs = parseQueryDate(options.from);
    const parsedToMs = parseQueryDate(options.to);
    const normalizedSeverity = normalizeSeverityFilter(options.severity);
    const files = (0, fs_1.readdirSync)(paths.recordsDir)
        .filter((name) => name.startsWith(RECORD_PREFIX) && name.endsWith(RECORD_SUFFIX))
        .sort()
        .reverse();
    const items = [];
    let matched = 0;
    let scanned = 0;
    let hasMore = false;
    for (const file of files) {
        const parsed = readExecutionRecord((0, path_1.join)(paths.recordsDir, file));
        if (!parsed)
            continue;
        scanned += 1;
        if (!matchesExecutionFilters(parsed, options, parsedFromMs, parsedToMs, normalizedSeverity)) {
            continue;
        }
        if (matched < offset) {
            matched += 1;
            continue;
        }
        if (items.length >= limit) {
            hasMore = true;
            break;
        }
        items.push(parsed);
        matched += 1;
    }
    return {
        items,
        limit,
        offset,
        hasMore,
        nextOffset: offset + items.length,
        scanned,
    };
}
function listExecutions(cwd = process.cwd(), limit) {
    return queryExecutions(cwd, { limit }).items;
}
function eventTimestampMs(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function buildExecutionTimeline(record) {
    const stages = [];
    const completedMs = eventTimestampMs(record.completedAt || '');
    const sortedEvents = [...record.events].sort((left, right) => {
        const leftMs = eventTimestampMs(left.timestamp) ?? 0;
        const rightMs = eventTimestampMs(right.timestamp) ?? 0;
        return leftMs - rightMs;
    });
    for (let idx = 0; idx < sortedEvents.length; idx += 1) {
        const current = sortedEvents[idx];
        const startMs = eventTimestampMs(current.timestamp);
        if (startMs === null)
            continue;
        const next = sortedEvents[idx + 1];
        const nextMs = next ? eventTimestampMs(next.timestamp) : null;
        const endMs = nextMs ?? completedMs ?? startMs;
        const boundedEndMs = endMs >= startMs ? endMs : startMs;
        stages.push({
            stage: current.stage,
            message: current.message,
            startedAt: new Date(startMs).toISOString(),
            endedAt: new Date(boundedEndMs).toISOString(),
            durationMs: Math.max(0, boundedEndMs - startMs),
        });
    }
    return {
        id: record.id,
        status: record.status,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        totalDurationMs: record.durationMs,
        stages,
    };
}
function extractFindings(payload) {
    if (!payload)
        return [];
    const entries = Array.isArray(payload.violations)
        ? payload.violations
        : Array.isArray(payload.warnings)
            ? payload.warnings
            : [];
    const findings = [];
    for (const entry of entries.slice(0, 50)) {
        const row = asObject(entry);
        findings.push({
            file: asString(row?.file),
            message: asString(row?.message) || asString(row?.issue) || asString(row?.rule) || 'Issue',
            severity: asString(row?.severity),
            rule: asString(row?.rule) || asString(row?.policy),
        });
    }
    return findings;
}
function extractDiffPreview(payload) {
    if (!payload)
        return null;
    const directPatch = asObject(payload.patch);
    const directDiff = asString(directPatch?.diff) || asString(payload.diff);
    if (directDiff)
        return directDiff;
    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
    for (const suggestion of suggestions) {
        const suggestionRecord = asObject(suggestion);
        const patchRecord = asObject(suggestionRecord?.patch);
        const suggestionDiff = asString(patchRecord?.diff);
        if (suggestionDiff)
            return suggestionDiff;
    }
    return null;
}
function buildExecutionDiffInspection(record) {
    const payload = record.result?.payload ?? null;
    const patchPayload = asObject(payload?.patch) ?? payload;
    const receiptPayload = asObject(patchPayload?.receipt);
    const validationPayload = asObject(patchPayload?.validation);
    const patchDiff = extractDiffPreview(payload);
    const before = record.verification.diff.before ?? null;
    const after = record.verification.diff.after ?? null;
    return {
        id: record.id,
        type: record.type,
        source: record.source,
        actor: record.actor,
        target: record.target,
        command: record.result?.command ?? [],
        predictedOutcome: {
            riskLevel: record.narrative?.riskLevel ?? null,
            expectedImprovement: record.narrative?.expectedImprovement ?? null,
        },
        actualOutcome: {
            success: record.result?.success === true,
            trend: record.verification.diff.trend,
            blockingDelta: record.verification.diff.blockingDelta,
            advisoryDelta: record.verification.diff.advisoryDelta,
        },
        beforeAfter: {
            before,
            after,
        },
        findings: extractFindings(payload),
        patch: {
            available: Boolean(patchDiff)
                || record.type === 'patch'
                || (payload ? Array.isArray(payload.suggestions) : false),
            file: asString(patchPayload?.file) || record.target || null,
            changed: typeof patchPayload?.changed === 'boolean'
                ? patchPayload.changed
                : null,
            status: asString(patchPayload?.status) || null,
            confidence: asString(patchPayload?.patchConfidence) || null,
            patternKind: asString(patchPayload?.patternKind) || null,
            diffPreview: patchDiff,
            diffHash: asString(validationPayload?.diffHash)
                || asString(receiptPayload?.diffHash)
                || null,
            receipt: receiptPayload
                ? {
                    transactionId: asString(receiptPayload.transactionId),
                    transactionHash: asString(receiptPayload.transactionHash),
                    rollbackSnapshotId: asString(receiptPayload.rollbackSnapshotId),
                    rollbackAvailable: typeof receiptPayload.rollbackAvailable === 'boolean' ? receiptPayload.rollbackAvailable : null,
                    stalePreviewRejected: typeof receiptPayload.stalePreviewRejected === 'boolean' ? receiptPayload.stalePreviewRejected : null,
                    staleReason: asString(receiptPayload.staleReason),
                }
                : null,
        },
    };
}
function getExecutionById(executionId, cwd = process.cwd()) {
    const paths = resolveExecutionPaths((0, path_1.resolve)(cwd));
    if (!executionId || executionId.trim().length === 0)
        return null;
    const safeId = (0, path_1.basename)(executionId.trim());
    if (safeId !== executionId.trim())
        return null;
    const filePath = toRecordPath(paths, safeId);
    if (!(0, fs_1.existsSync)(filePath))
        return null;
    return readExecutionRecord(filePath);
}
//# sourceMappingURL=execution-bus.js.map