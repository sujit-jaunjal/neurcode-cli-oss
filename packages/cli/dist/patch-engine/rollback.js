"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistPatchRollbackSnapshot = persistPatchRollbackSnapshot;
exports.applyPatchRollback = applyPatchRollback;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const transaction_1 = require("./transaction");
const ROLLBACK_SCHEMA_VERSION = 'neurcode.patch-rollback.v1';
const DEFAULT_RETENTION = 200;
function sanitizeSnapshotId(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const base = (0, node_path_1.basename)(trimmed);
    if (base !== trimmed)
        return null;
    if (!/^[A-Za-z0-9._-]+$/.test(base))
        return null;
    return base;
}
function resolveRollbackPaths(cwd) {
    const rootDir = (0, node_path_1.resolve)(cwd, '.neurcode/patch-rollbacks');
    return {
        rootDir,
        metadataDir: (0, node_path_1.join)(rootDir, 'metadata'),
        contentDir: (0, node_path_1.join)(rootDir, 'content'),
    };
}
function ensureRollbackPaths(paths) {
    (0, node_fs_1.mkdirSync)(paths.metadataDir, { recursive: true });
    (0, node_fs_1.mkdirSync)(paths.contentDir, { recursive: true });
}
function metadataFilePath(paths, snapshotId) {
    return (0, node_path_1.join)(paths.metadataDir, `${snapshotId}.json`);
}
function contentFilePath(paths, snapshotId) {
    return (0, node_path_1.join)(paths.contentDir, `${snapshotId}.before`);
}
function parseSnapshotRecord(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return null;
        const record = parsed;
        if (record.schemaVersion !== ROLLBACK_SCHEMA_VERSION)
            return null;
        if (typeof record.snapshotId !== 'string' || record.snapshotId.trim().length === 0)
            return null;
        if (typeof record.transactionId !== 'string' || record.transactionId.trim().length === 0)
            return null;
        if (typeof record.transactionHash !== 'string' || record.transactionHash.trim().length === 0)
            return null;
        if (typeof record.file !== 'string' || record.file.trim().length === 0)
            return null;
        if (typeof record.createdAt !== 'string' || record.createdAt.trim().length === 0)
            return null;
        if (record.beforeHash !== null && typeof record.beforeHash !== 'string')
            return null;
        if (record.afterHash !== null && typeof record.afterHash !== 'string')
            return null;
        if (record.diffHash !== null && typeof record.diffHash !== 'string')
            return null;
        if (record.patchHash !== null && typeof record.patchHash !== 'string')
            return null;
        if (typeof record.beforeContentPath !== 'string' || record.beforeContentPath.trim().length === 0)
            return null;
        return record;
    }
    catch {
        return null;
    }
}
function pruneSnapshots(paths, keepLatest = DEFAULT_RETENTION) {
    if (!(0, node_fs_1.existsSync)(paths.metadataDir))
        return;
    const files = (0, node_fs_1.readdirSync)(paths.metadataDir)
        .filter((entry) => entry.endsWith('.json'))
        .map((name) => ({
        name,
        path: (0, node_path_1.join)(paths.metadataDir, name),
        mtimeMs: (() => {
            try {
                return (0, node_fs_1.statSync)((0, node_path_1.join)(paths.metadataDir, name)).mtimeMs;
            }
            catch {
                return 0;
            }
        })(),
    }))
        .sort((left, right) => right.mtimeMs - left.mtimeMs);
    if (files.length <= keepLatest)
        return;
    const stale = files.slice(keepLatest);
    for (const entry of stale) {
        try {
            const parsed = parseSnapshotRecord((0, node_fs_1.readFileSync)(entry.path, 'utf-8'));
            if (parsed) {
                const contentPath = (0, node_path_1.join)(paths.rootDir, parsed.beforeContentPath);
                (0, node_fs_1.rmSync)(contentPath, { force: true });
            }
        }
        catch {
            // best-effort retention prune
        }
        (0, node_fs_1.rmSync)(entry.path, { force: true });
    }
}
function persistPatchRollbackSnapshot(input) {
    const snapshotId = sanitizeSnapshotId(input.receipt.rollbackSnapshotId || input.receipt.transactionId);
    if (!snapshotId) {
        return { saved: false, snapshotId: null, reason: 'invalid_snapshot_id' };
    }
    if (!input.receipt.beforeHash || !input.receipt.afterHash) {
        return { saved: false, snapshotId, reason: 'missing_receipt_hashes' };
    }
    if ((0, transaction_1.hashPatchValue)(input.beforeContent) !== input.receipt.beforeHash) {
        return { saved: false, snapshotId, reason: 'before_hash_mismatch' };
    }
    const paths = resolveRollbackPaths(input.cwd);
    ensureRollbackPaths(paths);
    const relativeContentPath = `content/${snapshotId}.before`;
    const absoluteContentPath = contentFilePath(paths, snapshotId);
    const absoluteMetadataPath = metadataFilePath(paths, snapshotId);
    const record = {
        schemaVersion: ROLLBACK_SCHEMA_VERSION,
        snapshotId,
        transactionId: input.receipt.transactionId,
        transactionHash: input.receipt.transactionHash,
        file: input.file,
        createdAt: new Date().toISOString(),
        beforeHash: input.receipt.beforeHash,
        afterHash: input.receipt.afterHash,
        diffHash: input.receipt.diffHash,
        patchHash: input.receipt.patchHash,
        beforeContentPath: relativeContentPath,
    };
    (0, node_fs_1.writeFileSync)(absoluteContentPath, input.beforeContent, { encoding: 'utf-8' });
    (0, node_fs_1.writeFileSync)(absoluteMetadataPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf-8' });
    pruneSnapshots(paths, Number.isFinite(input.retention) ? Math.max(10, Math.floor(input.retention || DEFAULT_RETENTION)) : DEFAULT_RETENTION);
    return { saved: true, snapshotId, reason: null };
}
function loadSnapshot(cwd, snapshotId) {
    const sanitized = sanitizeSnapshotId(snapshotId);
    if (!sanitized)
        return null;
    const paths = resolveRollbackPaths(cwd);
    const metadataPath = metadataFilePath(paths, sanitized);
    if (!(0, node_fs_1.existsSync)(metadataPath))
        return null;
    const parsed = parseSnapshotRecord((0, node_fs_1.readFileSync)(metadataPath, 'utf-8'));
    if (!parsed)
        return null;
    const contentPath = (0, node_path_1.join)(paths.rootDir, parsed.beforeContentPath);
    if (!(0, node_fs_1.existsSync)(contentPath))
        return null;
    const beforeContent = (0, node_fs_1.readFileSync)(contentPath, 'utf-8');
    return { record: parsed, beforeContent };
}
function applyPatchRollback(input) {
    const loaded = loadSnapshot(input.cwd, input.snapshotId);
    if (!loaded) {
        return {
            success: false,
            file: input.file || '',
            snapshotId: input.snapshotId,
            transactionId: input.snapshotId,
            transactionHash: '',
            status: 'rollback_rejected',
            changed: false,
            staleReason: 'rollback_snapshot_not_found',
            staleDetails: null,
            message: 'Rollback rejected: receipt snapshot not found.',
        };
    }
    const { record, beforeContent } = loaded;
    if (input.file && input.file !== record.file) {
        return {
            success: false,
            file: input.file,
            snapshotId: record.snapshotId,
            transactionId: record.transactionId,
            transactionHash: record.transactionHash,
            status: 'rollback_rejected',
            changed: false,
            staleReason: 'rollback_target_mismatch',
            staleDetails: {
                requestedFile: input.file,
                receiptFile: record.file,
            },
            message: 'Rollback rejected: requested file does not match receipt lineage.',
        };
    }
    const absoluteTarget = (0, node_path_1.resolve)(input.cwd, record.file);
    if (!(0, node_fs_1.existsSync)(absoluteTarget)) {
        return {
            success: false,
            file: record.file,
            snapshotId: record.snapshotId,
            transactionId: record.transactionId,
            transactionHash: record.transactionHash,
            status: 'rollback_stale',
            changed: false,
            staleReason: 'rollback_target_missing',
            staleDetails: null,
            message: 'Rollback rejected: target file is missing.',
        };
    }
    const currentContent = (0, node_fs_1.readFileSync)(absoluteTarget, 'utf-8');
    const currentHash = (0, transaction_1.hashPatchValue)(currentContent);
    if (record.afterHash && currentHash !== record.afterHash) {
        return {
            success: false,
            file: record.file,
            snapshotId: record.snapshotId,
            transactionId: record.transactionId,
            transactionHash: record.transactionHash,
            status: 'rollback_stale',
            changed: false,
            staleReason: 'filesystem_changed_since_patch',
            staleDetails: {
                expectedAfterHash: record.afterHash,
                currentHash,
            },
            message: 'Rollback rejected: filesystem changed since patch was applied.',
        };
    }
    const backupPath = `${absoluteTarget}.neurcode.rollback-backup.${Date.now()}.${process.pid}`;
    try {
        (0, node_fs_1.writeFileSync)(backupPath, currentContent, 'utf-8');
        (0, node_fs_1.writeFileSync)(absoluteTarget, beforeContent, 'utf-8');
        const verifyContent = (0, node_fs_1.readFileSync)(absoluteTarget, 'utf-8');
        if (record.beforeHash && (0, transaction_1.hashPatchValue)(verifyContent) !== record.beforeHash) {
            throw new Error('rollback_write_verification_failed');
        }
    }
    catch (error) {
        try {
            if ((0, node_fs_1.existsSync)(backupPath)) {
                (0, node_fs_1.writeFileSync)(absoluteTarget, (0, node_fs_1.readFileSync)(backupPath, 'utf-8'), 'utf-8');
            }
        }
        catch {
            // best-effort rollback restore
        }
        const message = error instanceof Error ? error.message : 'unknown_error';
        return {
            success: false,
            file: record.file,
            snapshotId: record.snapshotId,
            transactionId: record.transactionId,
            transactionHash: record.transactionHash,
            status: 'rollback_rejected',
            changed: false,
            staleReason: 'rollback_transactional_write_failed',
            staleDetails: { cause: message },
            message: `Rollback rejected: transactional rollback write failed (${message}).`,
        };
    }
    finally {
        (0, node_fs_1.rmSync)(backupPath, { force: true });
    }
    return {
        success: true,
        file: record.file,
        snapshotId: record.snapshotId,
        transactionId: record.transactionId,
        transactionHash: record.transactionHash,
        status: 'rollback_applied',
        changed: true,
        staleReason: null,
        staleDetails: null,
        message: 'Rollback applied successfully.',
    };
}
//# sourceMappingURL=rollback.js.map