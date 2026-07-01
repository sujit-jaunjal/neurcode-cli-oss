"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_START_TRANSACTION_SCHEMA_VERSION = void 0;
exports.beginSessionStartTransaction = beginSessionStartTransaction;
exports.updateSessionStartTransaction = updateSessionStartTransaction;
exports.clearSessionStartTransaction = clearSessionStartTransaction;
exports.inspectSessionStartTransaction = inspectSessionStartTransaction;
exports.recoverTimedOutSessionStart = recoverTimedOutSessionStart;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const brain_1 = require("@neurcode-ai/brain");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
exports.SESSION_START_TRANSACTION_SCHEMA_VERSION = 'neurcode.session-start-transaction.v1';
function transactionPath(repoRoot) {
    return (0, node_path_1.join)(repoRoot, '.neurcode', 'session-starting.json');
}
function syncParentDirectory(path) {
    try {
        const descriptor = (0, node_fs_1.openSync)((0, node_path_1.dirname)(path), 'r');
        try {
            (0, node_fs_1.fsyncSync)(descriptor);
        }
        finally {
            (0, node_fs_1.closeSync)(descriptor);
        }
    }
    catch {
        // Directory fsync is unavailable on some platforms.
    }
}
function atomicWrite(path, value) {
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    const temporary = `${path}.tmp.${process.pid}.${(0, node_crypto_1.randomUUID)()}`;
    let descriptor = null;
    try {
        descriptor = (0, node_fs_1.openSync)(temporary, 'w', 0o600);
        (0, node_fs_1.writeFileSync)(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        (0, node_fs_1.fsyncSync)(descriptor);
        (0, node_fs_1.closeSync)(descriptor);
        descriptor = null;
        (0, node_fs_1.renameSync)(temporary, path);
        syncParentDirectory(path);
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
function atomicCreate(path, value) {
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    const temporary = `${path}.candidate.${process.pid}.${(0, node_crypto_1.randomUUID)()}`;
    let descriptor = null;
    try {
        descriptor = (0, node_fs_1.openSync)(temporary, 'wx', 0o600);
        (0, node_fs_1.writeFileSync)(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        (0, node_fs_1.fsyncSync)(descriptor);
        (0, node_fs_1.closeSync)(descriptor);
        descriptor = null;
        // Publishing a fully-written candidate with a hard link gives concurrent
        // starters an atomic create-if-absent boundary without a partial JSON window.
        (0, node_fs_1.linkSync)(temporary, path);
        syncParentDirectory(path);
    }
    finally {
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
    }
}
function readTransaction(repoRoot) {
    const path = transactionPath(repoRoot);
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        if (parsed.schemaVersion !== exports.SESSION_START_TRANSACTION_SCHEMA_VERSION
            || !Number.isSafeInteger(parsed.pid)
            || typeof parsed.commandKey !== 'string'
            || typeof parsed.phase !== 'string') {
            return null;
        }
        return {
            ...parsed,
            jobId: typeof parsed.jobId === 'string' && parsed.jobId
                ? parsed.jobId
                : `legacy-${parsed.pid}`,
        };
    }
    catch {
        return null;
    }
}
function beginSessionStartTransaction(repoRoot, commandKey) {
    const path = transactionPath(repoRoot);
    const existing = readTransaction(repoRoot);
    if ((0, node_fs_1.existsSync)(path)) {
        const ownerState = existing
            ? (0, brain_1.inspectOwnedProcess)(existing.pid, existing.processStartFingerprint)
            : 'unknown';
        if (!existing || ownerState === 'alive_same' || ownerState === 'unknown') {
            throw new Error('session_start_already_running_or_unverifiable');
        }
        // Reclaim only a positively abandoned transaction, and only if its owner
        // identity still matches the value we inspected.
        const verified = readTransaction(repoRoot);
        if (!verified
            || verified.jobId !== existing.jobId
            || verified.pid !== existing.pid
            || verified.processStartFingerprint !== existing.processStartFingerprint) {
            throw new Error('session_start_transaction_changed_during_recovery');
        }
        if (verified.sessionId)
            (0, governance_runtime_1.removeSession)(repoRoot, verified.sessionId);
        (0, node_fs_1.rmSync)(path, { force: true });
    }
    const now = new Date().toISOString();
    const transaction = {
        schemaVersion: exports.SESSION_START_TRANSACTION_SCHEMA_VERSION,
        commandKey,
        jobId: (0, node_crypto_1.randomUUID)(),
        pid: process.pid,
        processStartFingerprint: (0, brain_1.processStartFingerprint)(process.pid),
        startedAt: now,
        updatedAt: now,
        phase: 'initializing_runtime',
        sessionId: null,
    };
    try {
        atomicCreate(path, transaction);
    }
    catch (error) {
        const code = error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : '';
        if (code === 'EEXIST')
            throw new Error('session_start_already_running');
        throw error;
    }
    return transaction;
}
function updateSessionStartTransaction(repoRoot, update) {
    const current = readTransaction(repoRoot);
    if (!current || current.pid !== process.pid)
        return current;
    const next = {
        ...current,
        updatedAt: new Date().toISOString(),
        phase: update.phase,
        sessionId: update.sessionId === undefined ? current.sessionId : update.sessionId,
    };
    atomicWrite(transactionPath(repoRoot), next);
    return next;
}
function clearSessionStartTransaction(repoRoot) {
    const current = readTransaction(repoRoot);
    if (!current
        || current.pid !== process.pid
        || current.processStartFingerprint !== (0, brain_1.processStartFingerprint)(process.pid))
        return;
    try {
        (0, node_fs_1.rmSync)(transactionPath(repoRoot), { force: true });
    }
    catch { /* best effort */ }
}
function inspectSessionStartTransaction(repoRoot) {
    const current = readTransaction(repoRoot);
    return current ? {
        phase: current.phase,
        sessionId: current.sessionId,
        ownerState: (0, brain_1.inspectOwnedProcess)(current.pid, current.processStartFingerprint),
    } : null;
}
function recoverTimedOutSessionStart(repoRoot, childPid) {
    const current = readTransaction(repoRoot);
    if (!current || current.pid !== childPid)
        return { recovered: false, phase: current?.phase ?? null };
    const identity = (0, brain_1.inspectOwnedProcess)(current.pid, current.processStartFingerprint);
    if (identity === 'alive_same' || identity === 'unknown') {
        return { recovered: false, phase: current.phase };
    }
    if (current.sessionId) {
        (0, governance_runtime_1.removeSession)(repoRoot, current.sessionId);
    }
    try {
        (0, node_fs_1.rmSync)(transactionPath(repoRoot), { force: true });
    }
    catch { /* best effort */ }
    return { recovered: true, phase: current.phase };
}
//# sourceMappingURL=session-start-transaction.js.map