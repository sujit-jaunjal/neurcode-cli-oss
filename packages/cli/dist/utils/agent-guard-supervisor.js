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
exports.DEFAULT_AGENT_GUARD_SUPERVISOR_HEARTBEAT_MS = exports.DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS = exports.AGENT_GUARD_SUPERVISOR_SCHEMA_VERSION = void 0;
exports.inspectAgentGuardSupervisor = inspectAgentGuardSupervisor;
exports.startAgentGuardSupervisorDetached = startAgentGuardSupervisorDetached;
exports.stopAgentGuardSupervisor = stopAgentGuardSupervisor;
exports.runAgentGuardSupervisor = runAgentGuardSupervisor;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const chokidar = __importStar(require("chokidar"));
exports.AGENT_GUARD_SUPERVISOR_SCHEMA_VERSION = 'neurcode.agent-guard-supervisor.v1';
exports.DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS = 500;
exports.DEFAULT_AGENT_GUARD_SUPERVISOR_HEARTBEAT_MS = 5_000;
const IGNORED_PATTERNS = [
    '**/.git/**',
    '**/.neurcode/**',
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/.DS_Store',
    '**/Thumbs.db',
];
function normalizedMs(value, fallback, minimum = 50) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(minimum, Math.floor(value))
        : fallback;
}
function now() {
    return new Date().toISOString();
}
function statePath(repoRoot, sessionId) {
    return (0, node_path_1.resolve)(repoRoot, '.neurcode', 'agent-guard-supervisor', `${sessionId}.json`);
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
function writeState(repoRoot, state) {
    const path = statePath(repoRoot, state.sessionId);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    (0, node_fs_1.writeFileSync)(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8');
    (0, node_fs_1.renameSync)(temporary, path);
    return path;
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
        debounceMs: normalizedMs(input.debounceMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS),
        heartbeatMs: normalizedMs(input.heartbeatMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_HEARTBEAT_MS, 250),
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
function inspectAgentGuardSupervisor(repoRoot, sessionId) {
    const path = statePath(repoRoot, sessionId);
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
function startAgentGuardSupervisorDetached(input) {
    const existing = inspectAgentGuardSupervisor(input.repoRoot, input.sessionId);
    if (existing.state && existing.alive && (existing.effectiveStatus === 'running' || existing.effectiveStatus === 'starting')) {
        return {
            started: false,
            alreadyRunning: true,
            pid: existing.state.pid,
            statePath: existing.statePath,
            state: existing.state,
        };
    }
    const debounceMs = normalizedMs(input.debounceMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS);
    const startingState = newState({
        repoRoot: input.repoRoot,
        sessionId: input.sessionId,
        guardPath: input.guardPath,
        pid: null,
        status: 'starting',
        debounceMs,
    });
    const path = writeState(input.repoRoot, startingState);
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
        },
    });
    child.unref();
    const latest = inspectAgentGuardSupervisor(input.repoRoot, input.sessionId);
    const state = latest.state?.status === 'running'
        ? latest.state
        : {
            ...startingState,
            pid: child.pid ?? null,
            updatedAt: now(),
        };
    if (state.status !== 'running')
        writeState(input.repoRoot, state);
    return { started: true, alreadyRunning: false, pid: state.pid, statePath: path, state };
}
function stopAgentGuardSupervisor(repoRoot, sessionId) {
    const inspection = inspectAgentGuardSupervisor(repoRoot, sessionId);
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
    writeState(repoRoot, state);
    if (canSignal && inspection.state.pid) {
        try {
            process.kill(inspection.state.pid, 'SIGTERM');
            return { signaled: true, statePath: inspection.statePath, state, effectiveStatus: 'stopping' };
        }
        catch {
            const stopped = { ...state, status: 'stale', updatedAt: now(), stoppedAt: now() };
            writeState(repoRoot, stopped);
            return { signaled: false, statePath: inspection.statePath, state: stopped, effectiveStatus: 'stale' };
        }
    }
    return { signaled: false, statePath: inspection.statePath, state, effectiveStatus: 'stopped' };
}
async function runAgentGuardSupervisor(options) {
    const existing = inspectAgentGuardSupervisor(options.repoRoot, options.sessionId);
    if (existing.state && existing.alive && existing.state.pid !== process.pid) {
        throw new Error(`Agent guard supervisor is already running for session ${options.sessionId} (pid ${existing.state.pid}).`);
    }
    const debounceMs = normalizedMs(options.debounceMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS);
    const heartbeatMs = normalizedMs(options.heartbeatMs, exports.DEFAULT_AGENT_GUARD_SUPERVISOR_HEARTBEAT_MS, 250);
    let state = newState({
        repoRoot: options.repoRoot,
        sessionId: options.sessionId,
        guardPath: options.guardPath,
        pid: process.pid,
        status: 'running',
        debounceMs,
        heartbeatMs,
    });
    let watcher = null;
    let debounceHandle = null;
    let heartbeatHandle = null;
    let exitHandle = null;
    let evaluationRunning = false;
    let evaluationQueued = false;
    let stopped = false;
    const persist = (patch = {}) => {
        state = {
            ...state,
            ...patch,
            updatedAt: now(),
        };
        writeState(options.repoRoot, state);
        options.onState?.(state);
    };
    const evaluate = async () => {
        if (stopped)
            return;
        if (evaluationRunning) {
            evaluationQueued = true;
            return;
        }
        evaluationRunning = true;
        try {
            const result = await options.onEvaluate();
            persist({
                heartbeatAt: now(),
                evaluationCount: state.evaluationCount + 1,
                lastEvaluatedAt: result.evaluatedAt || now(),
                lastPass: result.pass,
                lastChangedFiles: result.changedFiles,
                lastError: null,
            });
        }
        catch (error) {
            persist({
                heartbeatAt: now(),
                lastError: error instanceof Error ? error.message : String(error),
            });
        }
        finally {
            evaluationRunning = false;
            if (evaluationQueued && !stopped) {
                evaluationQueued = false;
                await evaluate();
            }
        }
    };
    const scheduleEvaluation = () => {
        if (debounceHandle)
            clearTimeout(debounceHandle);
        debounceHandle = setTimeout(() => {
            debounceHandle = null;
            void evaluate();
        }, debounceMs);
    };
    return await new Promise((resolvePromise, rejectPromise) => {
        const shutdown = async (status = 'stopped') => {
            if (stopped)
                return;
            stopped = true;
            if (debounceHandle)
                clearTimeout(debounceHandle);
            if (heartbeatHandle)
                clearInterval(heartbeatHandle);
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
        const fail = async (error) => {
            persist({ status: 'failed', lastError: error instanceof Error ? error.message : String(error) });
            await shutdown('failed');
        };
        try {
            writeState(options.repoRoot, state);
            options.onState?.(state);
            watcher = chokidar.watch(options.repoRoot, {
                ignored: IGNORED_PATTERNS,
                persistent: true,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 200,
                    pollInterval: 100,
                },
            });
            watcher.on('add', scheduleEvaluation);
            watcher.on('change', scheduleEvaluation);
            watcher.on('unlink', scheduleEvaluation);
            watcher.on('error', (error) => void fail(error));
            heartbeatHandle = setInterval(() => {
                persist({ heartbeatAt: now() });
            }, heartbeatMs);
            if (options.exitAfterMs && options.exitAfterMs > 0) {
                exitHandle = setTimeout(() => void shutdown('stopped'), options.exitAfterMs);
            }
            process.once('SIGINT', () => void shutdown('stopped'));
            process.once('SIGTERM', () => void shutdown('stopped'));
            if (options.evaluateImmediately !== false)
                void evaluate();
        }
        catch (error) {
            rejectPromise(error);
        }
    });
}
//# sourceMappingURL=agent-guard-supervisor.js.map