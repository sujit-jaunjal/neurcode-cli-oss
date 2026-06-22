"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRAIN_LIFECYCLE_SCHEMA_VERSION = void 0;
exports.brainLifecyclePath = brainLifecyclePath;
exports.readBrainLifecycle = readBrainLifecycle;
exports.writeBrainLifecycle = writeBrainLifecycle;
exports.inspectBrainLifecycle = inspectBrainLifecycle;
exports.markBrainBuilding = markBrainBuilding;
exports.markBrainIndexResult = markBrainIndexResult;
exports.markBrainFailed = markBrainFailed;
exports.scheduleBrainIndex = scheduleBrainIndex;
exports.cancelBrainIndex = cancelBrainIndex;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const brain_1 = require("@neurcode-ai/brain");
const cli_entry_1 = require("./cli-entry");
exports.BRAIN_LIFECYCLE_SCHEMA_VERSION = 'neurcode.brain-lifecycle.v1';
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
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        pid: null,
        progress: {
            filesScanned: 0,
            filesIndexed: 0,
            totalFiles: null,
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
function readBrainLifecycle(repoRoot) {
    const path = brainLifecyclePath(repoRoot);
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        return parsed.schemaVersion === exports.BRAIN_LIFECYCLE_SCHEMA_VERSION ? parsed : null;
    }
    catch {
        return null;
    }
}
function writeBrainLifecycle(repoRoot, status) {
    const path = brainLifecyclePath(repoRoot);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    const temporary = `${path}.tmp.${process.pid}`;
    (0, node_fs_1.writeFileSync)(temporary, `${JSON.stringify(status, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    (0, node_fs_1.renameSync)(temporary, path);
    return status;
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
function pidAlive(pid) {
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
async function inspectBrainLifecycle(repoRoot) {
    const persisted = readBrainLifecycle(repoRoot);
    const freshness = await (0, brain_1.repositoryGraphStatus)(repoRoot);
    const graph = (0, brain_1.readRepositoryGraph)(repoRoot);
    const indexedState = graph?.coverage.filesIndexed === 0 && graph.coverage.filesUnsupported > 0
        ? 'unsupported'
        : lifecycleState(freshness);
    const state = persisted?.state === 'scheduled' && pidAlive(persisted.pid)
        ? 'scheduled'
        : persisted?.state === 'building' && pidAlive(persisted.pid)
            ? 'building'
            : indexedState;
    return {
        ...(persisted ?? defaultStatus(state)),
        state,
        updatedAt: new Date().toISOString(),
        pid: state === 'scheduled' || state === 'building' ? persisted?.pid ?? null : null,
        freshness,
        graphId: graph?.graphId ?? null,
        generation: graph?.generation ?? null,
        progress: {
            filesScanned: graph?.coverage.filesSeen ?? persisted?.progress.filesScanned ?? 0,
            filesIndexed: graph?.coverage.filesIndexed ?? persisted?.progress.filesIndexed ?? 0,
            totalFiles: graph?.coverage.filesSeen ?? persisted?.progress.totalFiles ?? null,
            percent: graph?.coverage.filesSeen
                ? Math.round((graph.coverage.filesIndexed / graph.coverage.filesSeen) * 100)
                : persisted?.progress.percent ?? null,
        },
        reasonCodes: freshness.reasonCodes,
        unsupportedFacts: [
            ...(freshness.unsupportedFileCount > 0 ? ['unsupported_languages'] : []),
            ...(graph?.coverage.filesFailed ? ['failed_file_analysis'] : []),
            ...(graph?.coverage.filesSkipped ? ['skipped_file_analysis'] : []),
        ],
        recoveryCommands: recoveryCommands(),
    };
}
function markBrainBuilding(repoRoot) {
    const previous = readBrainLifecycle(repoRoot) ?? defaultStatus('building');
    return writeBrainLifecycle(repoRoot, {
        ...previous,
        state: 'building',
        updatedAt: new Date().toISOString(),
        startedAt: previous.startedAt ?? new Date().toISOString(),
        completedAt: null,
        pid: process.pid,
        reasonCodes: ['index_in_progress'],
    });
}
function markBrainIndexResult(repoRoot, result) {
    const state = result.graph.coverage.filesIndexed === 0
        && result.graph.coverage.filesUnsupported > 0
        ? 'unsupported'
        : result.graph.freshness.state === 'partial' ? 'partial' : 'fresh';
    return writeBrainLifecycle(repoRoot, {
        schemaVersion: exports.BRAIN_LIFECYCLE_SCHEMA_VERSION,
        state,
        updatedAt: new Date().toISOString(),
        startedAt: readBrainLifecycle(repoRoot)?.startedAt ?? null,
        completedAt: new Date().toISOString(),
        pid: null,
        progress: {
            filesScanned: result.stats.filesScanned,
            filesIndexed: result.graph.coverage.filesIndexed,
            totalFiles: result.graph.coverage.filesSeen,
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
function markBrainFailed(repoRoot, reasonCode) {
    const previous = readBrainLifecycle(repoRoot) ?? defaultStatus('failed');
    return writeBrainLifecycle(repoRoot, {
        ...previous,
        state: 'failed',
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        pid: null,
        reasonCodes: [reasonCode],
        recoveryCommands: recoveryCommands(),
    });
}
async function scheduleBrainIndex(repoRoot, options = {}) {
    const current = await inspectBrainLifecycle(repoRoot);
    if (!options.force && (current.state === 'fresh' || current.state === 'partial'))
        return current;
    if (!options.force && (current.state === 'scheduled' || current.state === 'building') && pidAlive(current.pid))
        return current;
    const cliEntry = (0, cli_entry_1.getActiveCliEntry)();
    const args = [
        cliEntry,
        'brain',
        'repo-index',
        '--max-files',
        String(options.maxFiles ?? 8_000),
        '--max-total-bytes',
        String(options.maxTotalBytes ?? 256 * 1024 * 1024),
        '--max-bytes-per-file',
        String(options.maxBytesPerFile ?? 350_000),
        '--json',
    ];
    const child = (0, node_child_process_1.spawn)(process.execPath, args, {
        cwd: repoRoot,
        detached: true,
        stdio: 'ignore',
        env: {
            ...process.env,
            NEURCODE_BRAIN_LIFECYCLE_CHILD: '1',
            NEURCODE_CLI_SPAWN_ENTRY: cliEntry,
        },
    });
    child.once('error', () => {
        markBrainFailed(repoRoot, 'index_spawn_failed');
    });
    child.unref();
    return writeBrainLifecycle(repoRoot, {
        ...defaultStatus('scheduled'),
        state: 'scheduled',
        startedAt: new Date().toISOString(),
        pid: child.pid ?? null,
        reasonCodes: ['activation_scheduled_index'],
    });
}
function cancelBrainIndex(repoRoot) {
    const current = readBrainLifecycle(repoRoot) ?? defaultStatus('missing');
    if (pidAlive(current.pid)) {
        process.kill(current.pid, 'SIGTERM');
    }
    return markBrainFailed(repoRoot, 'cancelled_by_operator');
}
//# sourceMappingURL=brain-lifecycle.js.map