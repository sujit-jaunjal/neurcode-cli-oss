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
exports.AGENT_GUARD_SUPERVISOR_IGNORED_PATTERNS = exports.DEFAULT_AGENT_GUARD_SUPERVISOR_MIN_EVAL_INTERVAL_MS = exports.DEFAULT_AGENT_GUARD_SUPERVISOR_IDLE_TIMEOUT_MS = exports.DEFAULT_AGENT_GUARD_SUPERVISOR_HEARTBEAT_MS = exports.DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS = exports.AGENT_GUARD_SUPERVISOR_ACTIVE_STATE_FILE = exports.AGENT_GUARD_SUPERVISOR_SCHEMA_VERSION = void 0;
exports.cleanupStaleSupervisorsForRepo = cleanupStaleSupervisorsForRepo;
exports.inspectAgentGuardSupervisor = inspectAgentGuardSupervisor;
exports.startAgentGuardSupervisorDetached = startAgentGuardSupervisorDetached;
exports.stopAgentGuardSupervisorForRepo = stopAgentGuardSupervisorForRepo;
exports.stopAgentGuardSupervisor = stopAgentGuardSupervisor;
exports.stopSupervisorOnSessionCompletion = stopSupervisorOnSessionCompletion;
exports.runAgentGuardSupervisor = runAgentGuardSupervisor;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const chokidar = __importStar(require("chokidar"));
const agent_guard_1 = require("./agent-guard");
exports.AGENT_GUARD_SUPERVISOR_SCHEMA_VERSION = 'neurcode.agent-guard-supervisor.v1';
exports.AGENT_GUARD_SUPERVISOR_ACTIVE_STATE_FILE = 'active.json';
exports.DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS = 500;
exports.DEFAULT_AGENT_GUARD_SUPERVISOR_HEARTBEAT_MS = 5_000;
exports.DEFAULT_AGENT_GUARD_SUPERVISOR_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
exports.DEFAULT_AGENT_GUARD_SUPERVISOR_MIN_EVAL_INTERVAL_MS = 2_000;
exports.AGENT_GUARD_SUPERVISOR_IGNORED_PATTERNS = [
    '**/.git/**',
    '**/.neurcode/**',
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/logs/**',
    '**/.cache/**',
    '**/__pycache__/**',
    '**/.venv/**',
    '**/venv/**',
    '**/target/**',
    '**/.pytest_cache/**',
    '**/.mypy_cache/**',
    '**/.DS_Store',
    '**/Thumbs.db',
    '**/*.pyc',
    '**/*.pyo',
    '**/*.class',
    '**/*.o',
    '**/*.so',
    '**/*.dylib',
    '**/*.dll',
    '**/*.wasm',
    '**/*.min.js',
    '**/*.min.css',
    '**/*.map',
    '**/*.lock',
    '**/package-lock.json',
    '**/pnpm-lock.yaml',
    '**/yarn.lock',
    '**/Cargo.lock',
    '**/go.sum',
];
function normalizedMs(value, fallback, minimum = 50) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(minimum, Math.floor(value))
        : fallback;
}
function now() {
    return new Date().toISOString();
}
function supervisorStateDirectory(repoRoot) {
    return (0, node_path_1.resolve)(repoRoot, '.neurcode', 'agent-guard-supervisor');
}
function repoStatePath(repoRoot) {
    return (0, node_path_1.resolve)(supervisorStateDirectory(repoRoot), exports.AGENT_GUARD_SUPERVISOR_ACTIVE_STATE_FILE);
}
function legacyStatePath(repoRoot, sessionId) {
    return (0, node_path_1.resolve)(supervisorStateDirectory(repoRoot), `${sessionId}.json`);
}
function isInternalRepoPath(path) {
    return path === '.neurcode' || path.startsWith('.neurcode/');
}
function shouldIgnoreWatcherPath(repoRelativePath) {
    const normalized = repoRelativePath.replace(/\\/g, '/');
    const segments = normalized.split('/');
    for (const segment of segments) {
        if (segment === 'node_modules'
            || segment === '.git'
            || segment === '.neurcode'
            || segment === '.next'
            || segment === 'dist'
            || segment === 'build'
            || segment === 'coverage'
            || segment === 'tmp'
            || segment === 'logs'
            || segment === '.cache'
            || segment === '__pycache__'
            || segment === '.venv'
            || segment === 'venv'
            || segment === 'target'
            || segment === '.pytest_cache'
            || segment === '.mypy_cache') {
            return true;
        }
    }
    if (normalized.endsWith('.pyc') || normalized.endsWith('.map') || normalized.endsWith('.min.js')) {
        return true;
    }
    return false;
}
function normalizeWatcherPath(repoRoot, absoluteOrRelative) {
    const repoRelative = absoluteOrRelative.startsWith(repoRoot)
        ? (0, node_path_1.relative)(repoRoot, absoluteOrRelative)
        : absoluteOrRelative;
    const normalized = repoRelative.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized || isInternalRepoPath(normalized) || shouldIgnoreWatcherPath(normalized)) {
        return null;
    }
    return normalized;
}
function isSupervisorState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const record = value;
    return record.schemaVersion === exports.AGENT_GUARD_SUPERVISOR_SCHEMA_VERSION
        && typeof record.sessionId === 'string'
        && typeof record.guardPath === 'string'
        && typeof record.repoRoot === 'string'
        && (typeof record.pid === 'number' || record.pid === null)
        && typeof record.status === 'string'
        && typeof record.startedAt === 'string'
        && typeof record.updatedAt === 'string'
        && typeof record.debounceMs === 'number'
        && typeof record.heartbeatMs === 'number'
        && typeof record.evaluationCount === 'number';
}
function processAlive(pid) {
    if (!pid || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function tryReadSupervisorState(path) {
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        return isSupervisorState(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function writeStateAt(path, state) {
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    (0, node_fs_1.writeFileSync)(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8');
    (0, node_fs_1.renameSync)(temporary, path);
    return path;
}
function writeRepoState(repoRoot, state) {
    return writeStateAt(repoStatePath(repoRoot), state);
}
function listSupervisorStatePaths(repoRoot) {
    const directory = supervisorStateDirectory(repoRoot);
    if (!(0, node_fs_1.existsSync)(directory))
        return [];
    const paths = new Set();
    const active = repoStatePath(repoRoot);
    if ((0, node_fs_1.existsSync)(active))
        paths.add(active);
    for (const entry of (0, node_fs_1.readdirSync)(directory)) {
        if (!entry.endsWith('.json') || entry.endsWith('.tmp'))
            continue;
        paths.add((0, node_path_1.resolve)(directory, entry));
    }
    return [...paths];
}
function markSupervisorStateStopped(path, state, status = 'stopped') {
    const stoppedAt = now();
    writeStateAt(path, {
        ...state,
        status,
        pid: processAlive(state.pid) ? state.pid : null,
        updatedAt: stoppedAt,
        stoppedAt,
        heartbeatAt: stoppedAt,
    });
}
function newState(input) {
    const generatedAt = input.startedAt || now();
    return {
        schemaVersion: exports.AGENT_GUARD_SUPERVISOR_SCHEMA_VERSION,
        sessionId: input.sessionId,
        guardPath: input.guardPath,
        repoRoot: input.repoRoot,
        pid: input.pid,
        status: input.status,
        startedAt: generatedAt,
        updatedAt: generatedAt,
        heartbeatAt: null,
        stoppedAt: null,
        lastActivityAt: generatedAt,
        debounceMs: normalizedMs(input.debounceMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS),
        heartbeatMs: normalizedMs(input.heartbeatMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_HEARTBEAT_MS, 250),
        idleTimeoutMs: normalizedMs(input.idleTimeoutMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_IDLE_TIMEOUT_MS, 1_000),
        minEvalIntervalMs: normalizedMs(input.minEvalIntervalMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_MIN_EVAL_INTERVAL_MS, 250),
        evaluationCount: 0,
        lastEvaluatedAt: null,
        lastPass: null,
        lastChangedFiles: 0,
        lastError: null,
        privacy: {
            metadataOnly: true,
            sourceUploaded: false,
            sourceIncluded: false,
            watchesPathsOnly: true,
        },
    };
}
function inspectStateAt(path) {
    if (!(0, node_fs_1.existsSync)(path)) {
        return { statePath: path, exists: false, alive: false, state: null, effectiveStatus: 'missing' };
    }
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        if (!isSupervisorState(parsed)) {
            return {
                statePath: path,
                exists: true,
                alive: false,
                state: null,
                effectiveStatus: 'failed',
                error: 'Invalid agent guard supervisor state schema.',
            };
        }
        const alive = processAlive(parsed.pid);
        const heartbeatReference = Date.parse(parsed.heartbeatAt || parsed.updatedAt);
        const heartbeatFresh = Number.isFinite(heartbeatReference)
            && Date.now() - heartbeatReference <= Math.max(parsed.heartbeatMs * 3, 10_000);
        const effectiveStatus = ((parsed.status === 'running' || parsed.status === 'starting' || parsed.status === 'stopping')
            && (!alive || !heartbeatFresh))
            ? 'stale'
            : parsed.status;
        return { statePath: path, exists: true, alive, state: parsed, effectiveStatus };
    }
    catch (error) {
        return {
            statePath: path,
            exists: true,
            alive: false,
            state: null,
            effectiveStatus: 'failed',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
function resolveRepoSupervisorInspection(repoRoot, sessionId) {
    const active = inspectStateAt(repoStatePath(repoRoot));
    if (active.state) {
        if (!sessionId || active.state.sessionId === sessionId)
            return active;
        return {
            ...active,
            effectiveStatus: active.effectiveStatus,
        };
    }
    if (sessionId) {
        return inspectStateAt(legacyStatePath(repoRoot, sessionId));
    }
    return active;
}
function cleanupStaleSupervisorsForRepo(repoRoot, exceptPid) {
    let killed = 0;
    for (const path of listSupervisorStatePaths(repoRoot)) {
        const state = tryReadSupervisorState(path);
        if (!state?.pid || state.pid === exceptPid)
            continue;
        const alive = processAlive(state.pid);
        if (!alive) {
            if (state.status === 'running' || state.status === 'starting' || state.status === 'stopping') {
                markSupervisorStateStopped(path, state, 'stale');
            }
            continue;
        }
        const heartbeatReference = Date.parse(state.heartbeatAt || state.updatedAt);
        const heartbeatFresh = Number.isFinite(heartbeatReference)
            && Date.now() - heartbeatReference <= Math.max(state.heartbeatMs * 3, 10_000);
        const staleRunning = (state.status === 'running'
            || state.status === 'starting'
            || state.status === 'stopping') && !heartbeatFresh;
        if (!staleRunning)
            continue;
        try {
            process.kill(state.pid, 'SIGTERM');
            killed += 1;
            markSupervisorStateStopped(path, state, 'stopping');
        }
        catch {
            markSupervisorStateStopped(path, state, 'stale');
        }
    }
    return killed;
}
function inspectAgentGuardSupervisor(repoRoot, sessionId) {
    return resolveRepoSupervisorInspection(repoRoot, sessionId);
}
function startAgentGuardSupervisorDetached(input) {
    cleanupStaleSupervisorsForRepo(input.repoRoot);
    const existing = inspectAgentGuardSupervisor(input.repoRoot);
    if (existing.state
        && existing.alive
        && existing.state.sessionId === input.sessionId
        && (existing.state.status === 'running' || existing.state.status === 'starting')) {
        return {
            started: false,
            alreadyRunning: true,
            replacedExisting: false,
            pid: existing.state.pid,
            statePath: existing.statePath,
            state: existing.state,
        };
    }
    const replacedExisting = Boolean(existing.state
        && existing.alive
        && existing.state.sessionId !== input.sessionId
        && (existing.state.status === 'running' || existing.state.status === 'starting'));
    if (replacedExisting) {
        stopAgentGuardSupervisorForRepo(input.repoRoot);
        cleanupStaleSupervisorsForRepo(input.repoRoot);
    }
    const debounceMs = normalizedMs(input.debounceMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS);
    const startingState = newState({
        repoRoot: input.repoRoot,
        sessionId: input.sessionId,
        guardPath: input.guardPath,
        pid: null,
        status: 'starting',
        debounceMs,
        idleTimeoutMs: input.idleTimeoutMs,
        minEvalIntervalMs: input.minEvalIntervalMs,
    });
    const path = writeRepoState(input.repoRoot, startingState);
    const child = (0, node_child_process_1.spawn)(process.execPath, [
        (0, node_path_1.resolve)(input.cliEntry),
        'agent',
        'guard',
        'supervise',
        'run',
        '--dir',
        input.repoRoot,
        '--session-id',
        input.sessionId,
        '--guard-path',
        input.guardPath,
        '--debounce-ms',
        String(debounceMs),
    ], {
        cwd: input.repoRoot,
        detached: true,
        stdio: 'ignore',
        env: {
            ...process.env,
            NEURCODE_AGENT_GUARD_SUPERVISOR_CHILD: '1',
            NEURCODE_CLI_SPAWN_ENTRY: (0, node_path_1.resolve)(input.cliEntry),
        },
    });
    child.unref();
    const latest = inspectAgentGuardSupervisor(input.repoRoot);
    const state = latest.state?.status === 'running'
        ? latest.state
        : {
            ...startingState,
            pid: child.pid ?? null,
            updatedAt: now(),
        };
    if (state.status !== 'running')
        writeRepoState(input.repoRoot, state);
    return {
        started: true,
        alreadyRunning: false,
        replacedExisting,
        pid: state.pid,
        statePath: path,
        state,
    };
}
function stopAgentGuardSupervisorForRepo(repoRoot) {
    return stopAgentGuardSupervisor(repoRoot);
}
function stopAgentGuardSupervisor(repoRoot, sessionId) {
    const inspection = inspectAgentGuardSupervisor(repoRoot, sessionId);
    if (!inspection.state) {
        if (sessionId) {
            const legacy = inspectStateAt(legacyStatePath(repoRoot, sessionId));
            if (legacy.state) {
                return stopInspection(legacy);
            }
        }
        return {
            signaled: false,
            statePath: inspection.statePath,
            state: null,
            effectiveStatus: inspection.effectiveStatus,
        };
    }
    return stopInspection(inspection);
}
function stopInspection(inspection) {
    if (!inspection.state) {
        return {
            signaled: false,
            statePath: inspection.statePath,
            state: null,
            effectiveStatus: inspection.effectiveStatus,
        };
    }
    const updatedAt = now();
    const canSignal = inspection.alive && inspection.effectiveStatus !== 'stale';
    const state = {
        ...inspection.state,
        status: canSignal ? 'stopping' : 'stopped',
        updatedAt,
        stoppedAt: canSignal ? inspection.state.stoppedAt : updatedAt,
    };
    writeStateAt(inspection.statePath, state);
    if (canSignal && inspection.state.pid) {
        try {
            process.kill(inspection.state.pid, 'SIGTERM');
            return { signaled: true, statePath: inspection.statePath, state, effectiveStatus: 'stopping' };
        }
        catch {
            const stopped = { ...state, status: 'stale', updatedAt: now(), stoppedAt: now() };
            writeStateAt(inspection.statePath, stopped);
            return { signaled: false, statePath: inspection.statePath, state: stopped, effectiveStatus: 'stale' };
        }
    }
    return { signaled: false, statePath: inspection.statePath, state, effectiveStatus: 'stopped' };
}
function stopSupervisorOnSessionCompletion(repoRoot) {
    return stopAgentGuardSupervisorForRepo(repoRoot);
}
function guardArtifactIsActive(repoRoot, guardPath, sessionId) {
    const guardRead = (0, agent_guard_1.readAgentGuardArtifact)({ repoRoot, artifactPath: guardPath, sessionId });
    return Boolean(guardRead.artifact?.active && guardRead.artifact.sessionId === sessionId);
}
async function runAgentGuardSupervisor(options) {
    cleanupStaleSupervisorsForRepo(options.repoRoot, process.pid);
    const existing = inspectAgentGuardSupervisor(options.repoRoot);
    if (existing.state
        && existing.alive
        && existing.state.pid !== process.pid
        && (existing.effectiveStatus === 'running' || existing.effectiveStatus === 'starting')) {
        throw new Error(`Agent guard supervisor is already running for repo ${options.repoRoot} (pid ${existing.state.pid}).`);
    }
    const debounceMs = normalizedMs(options.debounceMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS);
    const heartbeatMs = normalizedMs(options.heartbeatMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_HEARTBEAT_MS, 250);
    const idleTimeoutMs = normalizedMs(options.idleTimeoutMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_IDLE_TIMEOUT_MS, 1_000);
    const minEvalIntervalMs = normalizedMs(options.minEvalIntervalMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_MIN_EVAL_INTERVAL_MS, 250);
    let state = newState({
        repoRoot: options.repoRoot,
        sessionId: options.sessionId,
        guardPath: options.guardPath,
        pid: process.pid,
        status: 'running',
        debounceMs,
        heartbeatMs,
        idleTimeoutMs,
        minEvalIntervalMs,
    });
    let watcher = null;
    let debounceHandle = null;
    let throttleHandle = null;
    let heartbeatHandle = null;
    let idleHandle = null;
    let exitHandle = null;
    let evaluationRunning = false;
    let evaluationQueued = false;
    let stopped = false;
    let lastEvalStartedAt = 0;
    const pendingChangedPaths = new Set();
    let requestShutdown = async () => { };
    const touchActivity = () => {
        state = { ...state, lastActivityAt: now() };
    };
    const persist = (patch = {}) => {
        state = {
            ...state,
            ...patch,
            updatedAt: now(),
        };
        writeRepoState(options.repoRoot, state);
        options.onState?.(state);
    };
    const guardStillActive = () => guardArtifactIsActive(options.repoRoot, options.guardPath, options.sessionId);
    const evaluate = async () => {
        if (stopped)
            return;
        if (!guardStillActive()) {
            persist({ lastError: 'Agent guard not found or inactive; shutting down supervisor.' });
            await requestShutdown('stopped');
            return;
        }
        if (evaluationRunning) {
            evaluationQueued = true;
            return;
        }
        evaluationRunning = true;
        const changedPaths = [...pendingChangedPaths];
        pendingChangedPaths.clear();
        try {
            const result = await options.onEvaluate({ changedPaths });
            lastEvalStartedAt = Date.now();
            touchActivity();
            persist({
                heartbeatAt: now(),
                lastActivityAt: now(),
                evaluationCount: state.evaluationCount + 1,
                lastEvaluatedAt: result.evaluatedAt || now(),
                lastPass: result.pass,
                lastChangedFiles: result.changedFiles,
                lastError: null,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            persist({
                heartbeatAt: now(),
                lastError: message,
            });
            if (/agent guard not found/i.test(message) || /inactive/i.test(message)) {
                await requestShutdown('stopped');
            }
        }
        finally {
            evaluationRunning = false;
            if (evaluationQueued && !stopped) {
                evaluationQueued = false;
                await evaluate();
            }
        }
    };
    const runThrottledEvaluation = async () => {
        if (stopped)
            return;
        const elapsed = Date.now() - lastEvalStartedAt;
        if (lastEvalStartedAt > 0 && elapsed < minEvalIntervalMs) {
            if (throttleHandle)
                clearTimeout(throttleHandle);
            throttleHandle = setTimeout(() => {
                throttleHandle = null;
                void runThrottledEvaluation();
            }, minEvalIntervalMs - elapsed);
            return;
        }
        await evaluate();
    };
    const scheduleEvaluation = () => {
        touchActivity();
        if (debounceHandle)
            clearTimeout(debounceHandle);
        debounceHandle = setTimeout(() => {
            debounceHandle = null;
            void runThrottledEvaluation();
        }, debounceMs);
    };
    const recordPathChange = (rawPath) => {
        const normalized = normalizeWatcherPath(options.repoRoot, rawPath);
        if (!normalized)
            return;
        pendingChangedPaths.add(normalized);
        touchActivity();
        scheduleEvaluation();
    };
    return await new Promise((resolvePromise, rejectPromise) => {
        const shutdown = async (status = 'stopped') => {
            if (stopped)
                return;
            stopped = true;
            if (debounceHandle)
                clearTimeout(debounceHandle);
            if (throttleHandle)
                clearTimeout(throttleHandle);
            if (heartbeatHandle)
                clearInterval(heartbeatHandle);
            if (idleHandle)
                clearInterval(idleHandle);
            if (exitHandle)
                clearTimeout(exitHandle);
            if (watcher)
                await watcher.close();
            persist({
                status,
                heartbeatAt: now(),
                stoppedAt: now(),
            });
            resolvePromise(state);
        };
        requestShutdown = shutdown;
        const fail = async (error) => {
            persist({ status: 'failed', lastError: error instanceof Error ? error.message : String(error) });
            await shutdown('failed');
        };
        try {
            writeRepoState(options.repoRoot, state);
            options.onState?.(state);
            watcher = chokidar.watch(options.repoRoot, {
                ignored: exports.AGENT_GUARD_SUPERVISOR_IGNORED_PATTERNS,
                persistent: true,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 200,
                    pollInterval: 250,
                },
            });
            watcher.on('add', recordPathChange);
            watcher.on('change', recordPathChange);
            watcher.on('unlink', recordPathChange);
            watcher.on('error', (error) => void fail(error));
            heartbeatHandle = setInterval(() => {
                persist({ heartbeatAt: now() });
            }, heartbeatMs);
            idleHandle = setInterval(() => {
                const lastActivityMs = Date.parse(state.lastActivityAt || state.updatedAt);
                if (!Number.isFinite(lastActivityMs))
                    return;
                if (Date.now() - lastActivityMs >= idleTimeoutMs) {
                    persist({ lastError: `Idle timeout reached after ${idleTimeoutMs}ms.` });
                    void shutdown('stopped');
                }
            }, Math.min(60_000, Math.max(heartbeatMs, 5_000)));
            if (options.exitAfterMs && options.exitAfterMs > 0) {
                exitHandle = setTimeout(() => void shutdown('stopped'), options.exitAfterMs);
            }
            process.once('SIGINT', () => void shutdown('stopped'));
            process.once('SIGTERM', () => void shutdown('stopped'));
            if (options.evaluateImmediately !== false)
                void runThrottledEvaluation();
        }
        catch (error) {
            rejectPromise(error);
        }
    });
}
//# sourceMappingURL=agent-guard-supervisor.js.map