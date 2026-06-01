"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeConnectionPath = runtimeConnectionPath;
exports.collectRuntimeRepoMetadata = collectRuntimeRepoMetadata;
exports.loadRuntimeConnection = loadRuntimeConnection;
exports.saveRuntimeConnection = saveRuntimeConnection;
exports.updateRuntimeConnection = updateRuntimeConnection;
exports.triggerRuntimeAutoSync = triggerRuntimeAutoSync;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const gitignore_1 = require("./gitignore");
const CONNECTION_FILE = 'connection.json';
function connectionDir(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode');
}
function runtimeConnectionPath(repoRoot) {
    return (0, path_1.join)(connectionDir(repoRoot), CONNECTION_FILE);
}
function readJsonFile(path) {
    try {
        if (!(0, fs_1.existsSync)(path))
            return null;
        return JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
    }
    catch {
        return null;
    }
}
function sha256(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex').slice(0, 32);
}
function gitValue(repoRoot, args) {
    try {
        const value = (0, child_process_1.execFileSync)('git', args, {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
        }).trim();
        return value || null;
    }
    catch {
        return null;
    }
}
function ensureConnectionDir(repoRoot) {
    const dir = connectionDir(repoRoot);
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    (0, gitignore_1.ensureNeurcodeInGitignore)(repoRoot);
}
function runtimeSafeProfileFreshness(signal) {
    return {
        ...signal,
        profilePath: '.neurcode/profile.json',
    };
}
function collectRuntimeRepoMetadata(repoRoot, profileFreshness) {
    const profile = readJsonFile((0, path_1.join)(repoRoot, '.neurcode', 'profile.json'));
    const remote = gitValue(repoRoot, ['config', '--get', 'remote.origin.url']);
    const repoName = typeof profile?.repo?.name === 'string' && profile.repo.name.trim()
        ? profile.repo.name.trim()
        : (0, path_1.basename)(repoRoot);
    return {
        name: repoName,
        rootHash: sha256(repoRoot),
        remoteHash: remote ? sha256(remote) : undefined,
        profileHash: typeof profile?.profileHash === 'string' ? profile.profileHash : undefined,
        topologyHash: typeof profile?.topology?.hash === 'string' ? profile.topology.hash : undefined,
        ...(profileFreshness ? { profileFreshness: runtimeSafeProfileFreshness(profileFreshness) } : {}),
        source: 'local',
    };
}
function loadRuntimeConnection(repoRoot) {
    const data = readJsonFile(runtimeConnectionPath(repoRoot));
    if (!data || data.schemaVersion !== 1)
        return null;
    if (typeof data.apiUrl !== 'string' || typeof data.organizationId !== 'string')
        return null;
    if (!data.repo || typeof data.repo !== 'object')
        return null;
    return data;
}
function saveRuntimeConnection(repoRoot, connection) {
    ensureConnectionDir(repoRoot);
    (0, fs_1.writeFileSync)(runtimeConnectionPath(repoRoot), JSON.stringify(connection, null, 2) + '\n', 'utf8');
}
function updateRuntimeConnection(repoRoot, update) {
    const current = loadRuntimeConnection(repoRoot);
    if (!current)
        return null;
    const next = update(current);
    saveRuntimeConnection(repoRoot, next);
    return next;
}
function envFlag(value) {
    if (!value)
        return false;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
function triggerRuntimeAutoSync(repoRoot) {
    const connection = loadRuntimeConnection(repoRoot);
    if (!connection)
        return { started: false, reason: 'not connected' };
    if (!connection.autoSync?.enabled)
        return { started: false, reason: 'disabled' };
    if (envFlag(process.env.NEURCODE_DISABLE_AUTO_SYNC))
        return { started: false, reason: 'disabled by env' };
    if (envFlag(process.env.NEURCODE_AUTO_SYNC_CHILD))
        return { started: false, reason: 'already in sync child' };
    const cliEntry = process.argv[1];
    if (!cliEntry)
        return { started: false, reason: 'missing cli entrypoint' };
    updateRuntimeConnection(repoRoot, (current) => ({
        ...current,
        autoSync: {
            ...current.autoSync,
            enabled: current.autoSync?.enabled !== false,
            lastQueuedAt: new Date().toISOString(),
            lastStatus: 'queued',
            lastError: undefined,
        },
    }));
    if (envFlag(process.env.NEURCODE_AUTO_SYNC_DRY_RUN)) {
        return { started: true, reason: 'dry run' };
    }
    const child = (0, child_process_1.spawn)(process.execPath, [
        cliEntry,
        'sync',
        '--runtime',
        '--dir',
        repoRoot,
        '--json',
    ], {
        cwd: repoRoot,
        detached: true,
        stdio: 'ignore',
        env: {
            ...process.env,
            NEURCODE_AUTO_SYNC_CHILD: '1',
        },
    });
    child.unref();
    return { started: true };
}
//# sourceMappingURL=runtime-connection.js.map