"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stableJson = stableJson;
exports.atomicWriteUtf8FileSync = atomicWriteUtf8FileSync;
exports.atomicWriteJsonFileSync = atomicWriteJsonFileSync;
exports.appendUtf8FileSync = appendUtf8FileSync;
exports.appendJsonLineSync = appendJsonLineSync;
exports.withFileLockSync = withFileLockSync;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
function ensureParentDirectory(filePath) {
    const dir = (0, path_1.dirname)(filePath);
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    return dir;
}
function bestEffortFsyncFile(fd, enabled) {
    if (!enabled)
        return;
    try {
        (0, fs_1.fsyncSync)(fd);
    }
    catch {
        // Some CI filesystems do not support fsync. The atomic rename still
        // prevents partial JSON from becoming the final artifact.
    }
}
function bestEffortFsyncDirectory(dir, enabled) {
    if (!enabled)
        return;
    let fd = null;
    try {
        fd = (0, fs_1.openSync)(dir, 'r');
        (0, fs_1.fsyncSync)(fd);
    }
    catch {
        // Directory fsync is not available on all platforms/filesystems.
    }
    finally {
        if (fd !== null) {
            try {
                (0, fs_1.closeSync)(fd);
            }
            catch {
                // Nothing useful to do during best-effort durability cleanup.
            }
        }
    }
}
function stableJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function atomicWriteUtf8FileSync(filePath, content, options = {}) {
    const dir = ensureParentDirectory(filePath);
    const fsyncEnabled = options.fsync !== false;
    const tmpPath = (0, path_1.join)(dir, `.${(0, path_1.basename)(filePath)}.${process.pid}.${Date.now()}.${(0, crypto_1.randomUUID)()}.tmp`);
    const bytes = Buffer.byteLength(content, 'utf-8');
    const sha256 = (0, crypto_1.createHash)('sha256').update(content, 'utf-8').digest('hex');
    let fd = null;
    try {
        fd = (0, fs_1.openSync)(tmpPath, 'wx');
        (0, fs_1.writeFileSync)(fd, content, 'utf-8');
        bestEffortFsyncFile(fd, fsyncEnabled);
        (0, fs_1.closeSync)(fd);
        fd = null;
        (0, fs_1.renameSync)(tmpPath, filePath);
        bestEffortFsyncDirectory(dir, fsyncEnabled);
        return { path: filePath, bytes, sha256 };
    }
    catch (error) {
        if (fd !== null) {
            try {
                (0, fs_1.closeSync)(fd);
            }
            catch {
                // Ignore close failures while preserving the original write error.
            }
        }
        (0, fs_1.rmSync)(tmpPath, { force: true });
        throw error;
    }
}
function atomicWriteJsonFileSync(filePath, value, options = {}) {
    return atomicWriteUtf8FileSync(filePath, stableJson(value), options);
}
function appendUtf8FileSync(filePath, content, options = {}) {
    ensureParentDirectory(filePath);
    const fsyncEnabled = options.fsync !== false;
    const bytes = Buffer.byteLength(content, 'utf-8');
    const sha256 = (0, crypto_1.createHash)('sha256').update(content, 'utf-8').digest('hex');
    let fd = null;
    try {
        fd = (0, fs_1.openSync)(filePath, 'a');
        (0, fs_1.writeFileSync)(fd, content, 'utf-8');
        bestEffortFsyncFile(fd, fsyncEnabled);
        return { path: filePath, bytes, sha256 };
    }
    finally {
        if (fd !== null) {
            try {
                (0, fs_1.closeSync)(fd);
            }
            catch {
                // Nothing useful to do during best-effort append cleanup.
            }
        }
    }
}
function appendJsonLineSync(filePath, value, options = {}) {
    return appendUtf8FileSync(filePath, `${JSON.stringify(value)}\n`, options);
}
function withFileLockSync(lockPath, fn, options = {}) {
    ensureParentDirectory(lockPath);
    const timeoutMs = Math.max(0, Math.floor(options.timeoutMs ?? 2000));
    const staleMs = Math.max(timeoutMs + 1, Math.floor(options.staleMs ?? 30000));
    const retryMs = Math.max(5, Math.floor(options.retryMs ?? 25));
    const startedAt = Date.now();
    while (true) {
        let fd = null;
        try {
            fd = (0, fs_1.openSync)(lockPath, 'wx');
            (0, fs_1.writeFileSync)(fd, `${JSON.stringify({
                pid: process.pid,
                acquiredAt: new Date().toISOString(),
            })}\n`, 'utf-8');
            bestEffortFsyncFile(fd, false);
            try {
                return fn();
            }
            finally {
                try {
                    (0, fs_1.rmSync)(lockPath, { force: true });
                }
                finally {
                    try {
                        (0, fs_1.closeSync)(fd);
                    }
                    catch {
                        // Preserve the work result; lock cleanup is best-effort after rm.
                    }
                    fd = null;
                }
            }
        }
        catch (error) {
            if (fd !== null) {
                try {
                    (0, fs_1.closeSync)(fd);
                }
                catch {
                    // Preserve the original lock/acquisition error.
                }
            }
            const errorCode = typeof error === 'object' && error && 'code' in error
                ? String(error.code)
                : '';
            if (errorCode !== 'EEXIST') {
                throw error;
            }
            try {
                const ageMs = Date.now() - (0, fs_1.statSync)(lockPath).mtimeMs;
                if (ageMs > staleMs) {
                    (0, fs_1.rmSync)(lockPath, { force: true });
                    continue;
                }
            }
            catch {
                // The contender may have released the lock between open/stat attempts.
                continue;
            }
            if (Date.now() - startedAt >= timeoutMs) {
                throw new Error(`Timed out acquiring file lock: ${lockPath}`);
            }
            sleepSync(retryMs);
        }
    }
}
//# sourceMappingURL=artifact-io.js.map