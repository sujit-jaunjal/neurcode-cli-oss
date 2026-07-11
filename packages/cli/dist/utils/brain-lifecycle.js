"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRAIN_LIFECYCLE_SCHEMA_VERSION = void 0;
exports.brainLifecyclePath = brainLifecyclePath;
exports.readBrainLifecycle = readBrainLifecycle;
exports.writeBrainLifecycle = writeBrainLifecycle;
exports.inspectBrainLifecycle = inspectBrainLifecycle;
exports.beginBrainIndex = beginBrainIndex;
exports.recordBrainProgress = recordBrainProgress;
exports.markBrainIndexResult = markBrainIndexResult;
exports.markBrainFailed = markBrainFailed;
exports.scheduleBrainIndex = scheduleBrainIndex;
exports.cancelBrainIndex = cancelBrainIndex;
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const brain_1 = require("@neurcode-ai/brain");
const cli_entry_1 = require("./cli-entry");
const brain_2 = require("@neurcode-ai/brain");
exports.BRAIN_LIFECYCLE_SCHEMA_VERSION = 'neurcode.brain-lifecycle.v2';
function brainLifecyclePath(repoRoot) {
    return (0, node_path_1.join)(repoRoot, '.neurcode', 'brain', 'lifecycle.json');
}
function recoveryCommands() {
    return {
        retry: 'neurcode brain retry',
        cancel: 'neurcode brain cancel',
        selectiveRebuild: 'neurcode brain repo-refresh --changed <paths>',
        recover: 'neurcode brain repo-recover',
    };
}
function defaultStatus(state = 'missing') {
    return {
        schemaVersion: exports.BRAIN_LIFECYCLE_SCHEMA_VERSION,
        state,
        jobId: null,
        source: null,
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        pid: null,
        processStartFingerprint: null,
        processGroupId: null,
        detachedProcessGroup: false,
        elapsedMs: null,
        peakRssMb: null,
        peakRssMeasurement: 'unavailable',
        requestedLimits: null,
        progress: {
            phase: null,
            filesScanned: 0,
            filesIndexed: 0,
            totalFiles: null,
            bytesScanned: 0,
            nodes: 0,
            edges: 0,
            percent: null,
        },
        freshness: null,
        graphId: null,
        generation: null,
        reasonCodes: state === 'missing' ? ['graph_missing'] : [],
        unsupportedFacts: [],
        recoveryCommands: recoveryCommands(),
    };
}
function normalizeStatus(value) {
    const fallback = defaultStatus(value.state ?? 'missing');
    const progress = value.progress ?? {};
    return {
        ...fallback,
        ...value,
        schemaVersion: exports.BRAIN_LIFECYCLE_SCHEMA_VERSION,
        jobId: typeof value.jobId === 'string' ? value.jobId : null,
        source: value.source === 'manual' || value.source === 'auto' ? value.source : null,
        processStartFingerprint: typeof value.processStartFingerprint === 'string' ? value.processStartFingerprint : null,
        processGroupId: Number.isSafeInteger(value.processGroupId) ? Number(value.processGroupId) : null,
        detachedProcessGroup: value.detachedProcessGroup === true,
        elapsedMs: Number.isFinite(value.elapsedMs) ? Number(value.elapsedMs) : null,
        peakRssMb: Number.isFinite(value.peakRssMb) ? Number(value.peakRssMb) : null,
        peakRssMeasurement: value.peakRssMeasurement === 'sampled_process_rss'
            ? 'sampled_process_rss'
            : 'unavailable',
        requestedLimits: value.requestedLimits && typeof value.requestedLimits === 'object'
            ? value.requestedLimits
            : null,
        progress: {
            ...fallback.progress,
            ...progress,
            phase: typeof progress.phase === 'string'
                ? progress.phase
                : null,
            filesScanned: Number(progress.filesScanned ?? 0),
            filesIndexed: Number(progress.filesIndexed ?? 0),
            totalFiles: Number.isFinite(progress.totalFiles) ? Number(progress.totalFiles) : null,
            bytesScanned: Number(progress.bytesScanned ?? 0),
            nodes: Number(progress.nodes ?? 0),
            edges: Number(progress.edges ?? 0),
            percent: Number.isFinite(progress.percent) ? Number(progress.percent) : null,
        },
        reasonCodes: Array.isArray(value.reasonCodes) ? value.reasonCodes.filter((item) => typeof item === 'string') : [],
        unsupportedFacts: Array.isArray(value.unsupportedFacts)
            ? value.unsupportedFacts.filter((item) => typeof item === 'string')
            : [],
        recoveryCommands: recoveryCommands(),
    };
}
function readBrainLifecycle(repoRoot) {
    const path = brainLifecyclePath(repoRoot);
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        return normalizeStatus(JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8')));
    }
    catch {
        return null;
    }
}
function writeBrainLifecycle(repoRoot, status) {
    const path = brainLifecyclePath(repoRoot);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    const temporary = `${path}.tmp.${process.pid}.${(0, node_crypto_1.randomUUID)()}`;
    let descriptor = null;
    try {
        descriptor = (0, node_fs_1.openSync)(temporary, 'w', 0o600);
        (0, node_fs_1.writeFileSync)(descriptor, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
        (0, node_fs_1.fsyncSync)(descriptor);
        (0, node_fs_1.closeSync)(descriptor);
        descriptor = null;
        (0, node_fs_1.renameSync)(temporary, path);
        try {
            const directory = (0, node_fs_1.openSync)((0, node_path_1.dirname)(path), 'r');
            try {
                (0, node_fs_1.fsyncSync)(directory);
            }
            finally {
                (0, node_fs_1.closeSync)(directory);
            }
        }
        catch {
            // Directory fsync is not supported everywhere.
        }
        return status;
    }
    catch (error) {
        if (descriptor !== null) {
            try {
                (0, node_fs_1.closeSync)(descriptor);
            }
            catch { /* best effort */ }
        }
        try {
            (0, node_fs_1.rmSync)(temporary, { force: true });
        }
        catch { /* best effort */ }
        throw error;
    }
}
function lifecycleState(freshness) {
    if (freshness.state === 'fresh')
        return 'fresh';
    if (freshness.state === 'partial')
        return 'partial';
    if (freshness.state === 'stale')
        return 'stale';
    if (freshness.state === 'missing')
        return 'missing';
    if (freshness.state === 'locked')
        return 'building';
    return 'failed';
}
function runningIdentity(status) {
    return (0, brain_1.inspectOwnedProcess)(status.pid, status.processStartFingerprint);
}
async function inspectBrainLifecycle(repoRoot) {
    const persisted = readBrainLifecycle(repoRoot);
    const freshness = await (0, brain_1.repositoryGraphStatus)(repoRoot);
    const metadata = (0, brain_1.readRepositoryGraphMetadata)(repoRoot);
    const indexedState = metadata?.coverage.filesIndexed === 0 && metadata.coverage.filesUnsupported > 0
        ? 'unsupported'
        : lifecycleState(freshness);
    const persistedRunning = persisted?.state === 'scheduled' || persisted?.state === 'building';
    const identity = persistedRunning && persisted ? runningIdentity(persisted) : 'unknown';
    const state = persistedRunning && identity === 'alive_same'
        ? persisted.state
        : persistedRunning && (identity === 'dead' || identity === 'reused')
            ? 'failed'
            : indexedState;
    const now = Date.now();
    const started = Date.parse(persisted?.startedAt ?? '');
    const elapsedMs = Number.isFinite(started)
        ? Math.max(0, (state === 'scheduled' || state === 'building' ? now : Date.parse(persisted?.completedAt ?? '') || now) - started)
        : persisted?.elapsedMs ?? null;
    const result = {
        ...(persisted ?? defaultStatus(state)),
        state,
        updatedAt: new Date().toISOString(),
        completedAt: state === 'failed' && persistedRunning ? new Date().toISOString() : persisted?.completedAt ?? null,
        pid: state === 'scheduled' || state === 'building' ? persisted?.pid ?? null : null,
        processStartFingerprint: state === 'scheduled' || state === 'building' ? persisted?.processStartFingerprint ?? null : null,
        processGroupId: state === 'scheduled' || state === 'building' ? persisted?.processGroupId ?? null : null,
        elapsedMs,
        freshness,
        graphId: metadata?.graphId ?? null,
        generation: metadata?.generation ?? null,
        progress: {
            phase: state === 'scheduled' || state === 'building' ? persisted?.progress.phase ?? null : 'completed',
            filesScanned: metadata?.coverage.filesSeen ?? persisted?.progress.filesScanned ?? 0,
            filesIndexed: metadata?.coverage.filesIndexed ?? persisted?.progress.filesIndexed ?? 0,
            totalFiles: metadata?.coverage.filesSeen ?? persisted?.progress.totalFiles ?? null,
            bytesScanned: persisted?.progress.bytesScanned ?? 0,
            nodes: metadata?.nodeCount ?? persisted?.progress.nodes ?? 0,
            edges: metadata?.edgeCount ?? persisted?.progress.edges ?? 0,
            percent: metadata?.coverage.filesSeen
                ? Math.round((metadata.coverage.filesIndexed / metadata.coverage.filesSeen) * 100)
                : persisted?.progress.percent ?? null,
        },
        reasonCodes: state === 'failed' && persistedRunning
            ? [identity === 'reused' ? 'worker_pid_reused' : 'worker_exited_without_completion']
            : freshness.reasonCodes,
        unsupportedFacts: [
            ...(freshness.unsupportedFileCount > 0 ? ['unsupported_languages'] : []),
            ...(metadata?.coverage.filesFailed ? ['failed_file_analysis'] : []),
            ...(metadata?.coverage.filesSkipped ? ['skipped_file_analysis'] : []),
        ],
        recoveryCommands: recoveryCommands(),
    };
    if (state === 'failed' && persistedRunning)
        writeBrainLifecycle(repoRoot, result);
    return result;
}
function activeJobMatches(repoRoot, jobId) {
    const current = readBrainLifecycle(repoRoot);
    if (!current)
        return null;
    if (jobId && current.jobId !== jobId)
        return null;
    return current;
}
async function terminateIndexWorker(status) {
    if (!status.pid)
        return 'not_running';
    const identity = runningIdentity(status);
    if (identity === 'dead')
        return 'not_running';
    if (identity === 'reused' || identity === 'unknown')
        return 'identity_mismatch';
    const target = status.pid;
    const canSignalGroup = status.detachedProcessGroup
        && status.processGroupId === target
        && (0, brain_1.processGroupId)(target) === target;
    const signal = (signalName) => {
        try {
            process.kill(canSignalGroup ? -target : target, signalName);
        }
        catch {
            // The worker may have exited between identity validation and signal delivery.
        }
    };
    signal('SIGTERM');
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline && (0, brain_1.inspectOwnedProcess)(target, status.processStartFingerprint) === 'alive_same') {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if ((0, brain_1.inspectOwnedProcess)(target, status.processStartFingerprint) === 'alive_same')
        signal('SIGKILL');
    return 'terminated';
}
function releaseAbandonedGraphLocks(repoRoot) {
    (0, brain_1.reclaimAbandonedOwnedFile)((0, brain_1.repositoryGraphLockPath)(repoRoot));
    (0, brain_1.reclaimAbandonedOwnedFile)(`${(0, brain_1.legacyRepositoryGraphPath)(repoRoot)}.lock`);
}
async function beginBrainIndex(repoRoot, input) {
    const current = readBrainLifecycle(repoRoot);
    if (current && (current.state === 'scheduled' || current.state === 'building')) {
        const identity = runningIdentity(current);
        const sameScheduledJob = input.source === 'auto'
            && Boolean(input.jobId)
            && current.jobId === input.jobId
            && current.pid === process.pid;
        if (!sameScheduledJob && identity === 'alive_same') {
            if (input.source === 'manual' && current.source === 'auto') {
                await terminateIndexWorker(current);
                releaseAbandonedGraphLocks(repoRoot);
            }
            else {
                throw new Error('brain_index_already_running');
            }
        }
    }
    const jobId = input.jobId || process.env.NEURCODE_BRAIN_JOB_ID || (0, node_crypto_1.randomUUID)();
    const identity = (0, brain_1.createOwnedProcessIdentity)({ jobId });
    const now = new Date().toISOString();
    const scheduled = current?.jobId === jobId ? current : null;
    return writeBrainLifecycle(repoRoot, {
        ...defaultStatus('building'),
        state: 'building',
        jobId,
        source: input.source,
        updatedAt: now,
        startedAt: scheduled?.startedAt ?? now,
        pid: process.pid,
        processStartFingerprint: identity.processStartFingerprint,
        processGroupId: identity.processGroupId,
        detachedProcessGroup: process.env.NEURCODE_BRAIN_DETACHED_GROUP === '1',
        elapsedMs: 0,
        peakRssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2)),
        peakRssMeasurement: 'sampled_process_rss',
        requestedLimits: input.requestedLimits,
        progress: {
            ...defaultStatus().progress,
            phase: 'locked',
        },
        reasonCodes: ['index_in_progress'],
    });
}
function recordBrainProgress(repoRoot, jobId, progress) {
    const current = activeJobMatches(repoRoot, jobId);
    if (!current || (current.state !== 'scheduled' && current.state !== 'building'))
        return current;
    const percent = progress.totalFiles && progress.totalFiles > 0
        ? Math.min(100, Math.round((progress.filesIndexed / progress.totalFiles) * 100))
        : null;
    return writeBrainLifecycle(repoRoot, {
        ...current,
        state: 'building',
        updatedAt: new Date().toISOString(),
        elapsedMs: progress.elapsedMs,
        peakRssMb: Math.max(current.peakRssMb ?? 0, progress.peakMemoryMb),
        peakRssMeasurement: 'sampled_process_rss',
        progress: {
            phase: progress.phase,
            filesScanned: progress.filesScanned,
            filesIndexed: progress.filesIndexed,
            totalFiles: progress.totalFiles,
            bytesScanned: progress.bytesScanned,
            nodes: progress.nodes,
            edges: progress.edges,
            percent,
        },
    });
}
function markBrainIndexResult(repoRoot, result, jobId) {
    const previous = activeJobMatches(repoRoot, jobId) ?? readBrainLifecycle(repoRoot) ?? defaultStatus();
    const state = result.graph.coverage.filesIndexed === 0
        && result.graph.coverage.filesUnsupported > 0
        ? 'unsupported'
        : result.graph.freshness.state === 'partial' ? 'partial' : 'fresh';
    const completedAt = new Date().toISOString();
    return writeBrainLifecycle(repoRoot, {
        ...previous,
        state,
        updatedAt: completedAt,
        completedAt,
        pid: null,
        processStartFingerprint: null,
        processGroupId: null,
        detachedProcessGroup: false,
        elapsedMs: result.stats.durationMs,
        peakRssMb: result.stats.peakMemoryMb,
        peakRssMeasurement: 'sampled_process_rss',
        progress: {
            phase: 'completed',
            filesScanned: result.stats.filesScanned,
            filesIndexed: result.graph.coverage.filesIndexed,
            totalFiles: result.graph.coverage.filesSeen,
            bytesScanned: previous.progress.bytesScanned,
            nodes: result.stats.nodeCount ?? result.graph.nodes?.length ?? 0,
            edges: result.stats.edgeCount ?? result.graph.edges?.length ?? 0,
            percent: result.graph.coverage.filesSeen
                ? Math.round((result.graph.coverage.filesIndexed / result.graph.coverage.filesSeen) * 100)
                : 100,
        },
        freshness: result.graph.freshness,
        graphId: result.graph.graphId,
        generation: result.graph.generation,
        reasonCodes: result.graph.freshness.reasonCodes,
        unsupportedFacts: [
            ...(result.graph.coverage.filesUnsupported > 0 ? ['unsupported_languages'] : []),
            ...(result.graph.coverage.filesFailed ? ['failed_file_analysis'] : []),
            ...(result.graph.coverage.filesSkipped ? ['skipped_file_analysis'] : []),
        ],
        recoveryCommands: recoveryCommands(),
    });
}
function markBrainFailed(repoRoot, reasonCode, jobId) {
    const current = activeJobMatches(repoRoot, jobId);
    if (jobId && !current)
        return readBrainLifecycle(repoRoot) ?? defaultStatus('failed');
    const previous = current ?? readBrainLifecycle(repoRoot) ?? defaultStatus('failed');
    const completedAt = new Date().toISOString();
    const started = Date.parse(previous.startedAt ?? '');
    return writeBrainLifecycle(repoRoot, {
        ...previous,
        state: 'failed',
        updatedAt: completedAt,
        completedAt,
        pid: null,
        processStartFingerprint: null,
        processGroupId: null,
        detachedProcessGroup: false,
        elapsedMs: Number.isFinite(started) ? Math.max(0, Date.now() - started) : previous.elapsedMs,
        reasonCodes: [reasonCode],
        recoveryCommands: recoveryCommands(),
    });
}
async function scheduleBrainIndex(repoRoot, options = {}) {
    const current = await inspectBrainLifecycle(repoRoot);
    if (!options.force && (current.state === 'fresh' || current.state === 'partial'))
        return current;
    if (!options.force && (current.state === 'scheduled' || current.state === 'building') && runningIdentity(current) === 'alive_same') {
        return current;
    }
    const trackedFileCount = (() => {
        try {
            const output = (0, node_child_process_1.execFileSync)('git', ['-C', repoRoot, 'ls-files'], { encoding: 'utf8' });
            return output.split('\n').filter((line) => line.trim().length > 0).length;
        }
        catch {
            return 0;
        }
    })();
    const planned = (0, brain_2.planRepositoryGraphLimits)({ trackedFileCount });
    const requestedLimits = {
        maxFiles: options.maxFiles ?? planned.maxFiles,
        maxTotalBytes: options.maxTotalBytes ?? planned.maxTotalBytes,
        maxBytesPerFile: options.maxBytesPerFile ?? planned.maxBytesPerFile,
    };
    const jobId = (0, node_crypto_1.randomUUID)();
    const cliEntry = (0, cli_entry_1.getActiveCliEntry)();
    const args = [
        cliEntry,
        'brain',
        'repo-index',
        '--max-files',
        String(requestedLimits.maxFiles),
        '--max-total-bytes',
        String(requestedLimits.maxTotalBytes),
        '--max-bytes-per-file',
        String(requestedLimits.maxBytesPerFile),
        '--json',
    ];
    const child = (0, node_child_process_1.spawn)(process.execPath, args, {
        cwd: repoRoot,
        detached: true,
        stdio: 'ignore',
        env: {
            ...process.env,
            NEURCODE_BRAIN_LIFECYCLE_CHILD: '1',
            NEURCODE_BRAIN_JOB_ID: jobId,
            NEURCODE_BRAIN_INDEX_SOURCE: 'auto',
            NEURCODE_BRAIN_DETACHED_GROUP: '1',
            NEURCODE_CLI_SPAWN_ENTRY: cliEntry,
        },
    });
    child.once('error', () => {
        markBrainFailed(repoRoot, 'index_spawn_failed', jobId);
    });
    child.unref();
    const identity = child.pid
        ? (0, brain_1.createOwnedProcessIdentity)({ jobId, pid: child.pid, processGroupId: child.pid })
        : null;
    const now = new Date().toISOString();
    return writeBrainLifecycle(repoRoot, {
        ...defaultStatus('scheduled'),
        state: 'scheduled',
        jobId,
        source: 'auto',
        startedAt: now,
        updatedAt: now,
        pid: child.pid ?? null,
        processStartFingerprint: identity?.processStartFingerprint ?? null,
        processGroupId: child.pid ?? null,
        detachedProcessGroup: true,
        requestedLimits,
        reasonCodes: ['activation_scheduled_index'],
    });
}
async function cancelBrainIndex(repoRoot) {
    const current = readBrainLifecycle(repoRoot) ?? defaultStatus('missing');
    if (current.reasonCodes.includes('cancelled_by_operator') && current.state === 'failed') {
        releaseAbandonedGraphLocks(repoRoot);
        return current;
    }
    const outcome = await terminateIndexWorker(current);
    releaseAbandonedGraphLocks(repoRoot);
    if (outcome === 'identity_mismatch') {
        return markBrainFailed(repoRoot, 'cancel_identity_mismatch', current.jobId ?? undefined);
    }
    return markBrainFailed(repoRoot, 'cancelled_by_operator', current.jobId ?? undefined);
}
//# sourceMappingURL=brain-lifecycle.js.map