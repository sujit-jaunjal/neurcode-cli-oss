"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchApplyCommand = patchApplyCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const patch_engine_1 = require("../patch-engine");
const transaction_1 = require("../patch-engine/transaction");
const rollback_1 = require("../patch-engine/rollback");
const cli_json_1 = require("../utils/cli-json");
const contracts_1 = require("@neurcode-ai/contracts");
const chalk = (0, cli_json_1.loadChalk)();
function emitJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
function emitRejected(options, payload) {
    if (options.json) {
        emitJson({
            success: false,
            file: payload.file,
            changed: payload.changed ?? false,
            status: payload.status,
            previewTokenUsed: payload.previewTokenUsed === true,
            staleReason: payload.staleReason ?? null,
            message: payload.message,
            receipt: payload.receipt ?? null,
            validation: payload.validation ?? null,
            staleDetails: payload.staleDetails ?? null,
            reverifyRequired: false,
        });
    }
    else {
        console.log(chalk.yellow(payload.message));
    }
}
function patchApplyCommand(options) {
    const rollbackReceipt = typeof options.rollbackReceipt === 'string' && options.rollbackReceipt.trim().length > 0
        ? options.rollbackReceipt.trim()
        : null;
    if (rollbackReceipt) {
        const rollback = (0, rollback_1.applyPatchRollback)({
            cwd: process.cwd(),
            snapshotId: rollbackReceipt,
            file: options.file,
        });
        const receipt = (0, transaction_1.newPatchReceipt)({
            file: rollback.file || options.file,
            beforeHash: null,
            afterHash: null,
            diffHash: null,
            patchHash: null,
            previewTokenUsed: false,
            stalePreviewRejected: rollback.status !== 'rollback_applied',
            staleReason: rollback.staleReason,
            rollbackAvailable: false,
            rollbackSnapshotId: rollback.snapshotId,
        });
        if (options.json) {
            emitJson({
                success: rollback.success,
                file: rollback.file || options.file,
                changed: rollback.changed,
                status: rollback.status,
                message: rollback.message,
                staleReason: rollback.staleReason,
                staleDetails: rollback.staleDetails,
                rollback: {
                    snapshotId: rollback.snapshotId,
                    transactionId: rollback.transactionId,
                    transactionHash: rollback.transactionHash || null,
                },
                patternKind: 'rollback',
                patchConfidence: 'high',
                receipt,
                reverifyRequired: rollback.success,
            });
        }
        else if (rollback.success) {
            console.log(chalk.green(rollback.message));
            console.log(chalk.dim(`  File:       ${rollback.file}`));
            console.log(chalk.dim(`  Receipt:    ${rollback.snapshotId}`));
            console.log(chalk.dim('  Run `neurcode verify` to confirm the rollback outcome.'));
        }
        else {
            console.log(chalk.yellow(rollback.message));
            if (rollback.staleReason) {
                console.log(chalk.dim(`  Reason:     ${rollback.staleReason}`));
            }
        }
        return;
    }
    const filePath = (0, path_1.resolve)(process.cwd(), options.file);
    if (!(0, fs_1.existsSync)(filePath)) {
        const message = `File not found: ${options.file}`;
        if (options.json) {
            emitJson({ success: false, file: options.file, status: 'rejected', message, reverifyRequired: false });
        }
        else {
            console.log(chalk.red(message));
        }
        process.exit(1);
        return;
    }
    let content;
    try {
        content = (0, fs_1.readFileSync)(filePath, 'utf-8');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not read file';
        if (options.json) {
            emitJson({ success: false, file: options.file, status: 'rejected', message, reverifyRequired: false });
        }
        else {
            console.log(chalk.red(`Could not read ${options.file}: ${message}`));
        }
        process.exit(1);
        return;
    }
    const beforeHash = (0, transaction_1.hashPatchValue)(content);
    const previewToken = typeof options.previewToken === 'string' && options.previewToken.trim().length > 0
        ? options.previewToken.trim()
        : null;
    const parsedPreviewToken = previewToken ? (0, transaction_1.parsePatchPreviewToken)(previewToken) : null;
    if (previewToken && !parsedPreviewToken) {
        const receipt = (0, transaction_1.newPatchReceipt)({
            file: options.file,
            beforeHash,
            previewTokenUsed: true,
            stalePreviewRejected: true,
            staleReason: 'preview_token_invalid',
            rollbackAvailable: false,
        });
        emitRejected(options, {
            file: options.file,
            message: `${contracts_1.STATUS_TERMS.patchRejected}: invalid preview token. Regenerate preview and retry. ${contracts_1.STATUS_TERMS.retrySafe}.`,
            status: 'filesystem_changed_since_preview',
            previewTokenUsed: true,
            staleReason: 'preview_token_invalid',
            receipt,
        });
        return;
    }
    if (parsedPreviewToken) {
        if (parsedPreviewToken.file !== options.file) {
            const receipt = (0, transaction_1.newPatchReceipt)({
                file: options.file,
                beforeHash,
                previewTokenUsed: true,
                stalePreviewRejected: true,
                staleReason: 'preview_target_mismatch',
                rollbackAvailable: false,
            });
            emitRejected(options, {
                file: options.file,
                message: `${contracts_1.STATUS_TERMS.patchRejected}: preview token target does not match requested file.`,
                status: 'filesystem_changed_since_preview',
                previewTokenUsed: true,
                staleReason: 'preview_target_mismatch',
                receipt,
            });
            return;
        }
        if (parsedPreviewToken.beforeHash !== beforeHash) {
            const receipt = (0, transaction_1.newPatchReceipt)({
                file: options.file,
                beforeHash,
                previewTokenUsed: true,
                stalePreviewRejected: true,
                staleReason: 'filesystem_changed_since_preview',
                rollbackAvailable: false,
            });
            emitRejected(options, {
                file: options.file,
                message: `${contracts_1.STATUS_TERMS.filesystemChangedSincePreview}. Regenerate preview and retry. ${contracts_1.STATUS_TERMS.retrySafe}.`,
                status: 'filesystem_changed_since_preview',
                previewTokenUsed: true,
                staleReason: 'filesystem_changed_since_preview',
                receipt,
                staleDetails: {
                    expectedBeforeHash: parsedPreviewToken.beforeHash,
                    currentBeforeHash: beforeHash,
                    explanation: 'File fingerprint mismatch: the file changed after preview was generated.',
                },
            });
            return;
        }
    }
    const result = (0, patch_engine_1.applyFirstMatchingPatch)(options.file, content);
    if (!result) {
        emitRejected(options, {
            file: options.file,
            message: `No applicable deterministic patch found for ${options.file}`,
            status: 'rejected',
        });
        return;
    }
    if (parsedPreviewToken) {
        if (parsedPreviewToken.patchHash !== result.patchHash
            || parsedPreviewToken.afterHash !== result.afterHash
            || parsedPreviewToken.diffHash !== result.validation.diffHash
            || parsedPreviewToken.patternKind !== result.patternKind) {
            const receipt = (0, transaction_1.newPatchReceipt)({
                file: options.file,
                beforeHash,
                afterHash: result.afterHash,
                diffHash: result.validation.diffHash,
                patchHash: result.patchHash,
                previewTokenUsed: true,
                stalePreviewRejected: true,
                staleReason: 'preview_mismatch_regenerated',
                rollbackAvailable: false,
            });
            emitRejected(options, {
                file: options.file,
                message: `${contracts_1.STATUS_TERMS.patchRejected}: preview no longer matches deterministic patch output. Regenerate preview and retry. ${contracts_1.STATUS_TERMS.retrySafe}.`,
                status: 'filesystem_changed_since_preview',
                previewTokenUsed: true,
                staleReason: 'preview_mismatch_regenerated',
                receipt,
                validation: result.validation,
                staleDetails: {
                    expectedPatchHash: parsedPreviewToken.patchHash,
                    currentPatchHash: result.patchHash,
                    expectedDiffHash: parsedPreviewToken.diffHash,
                    currentDiffHash: result.validation.diffHash,
                    explanation: 'Preview token and regenerated deterministic patch no longer match.',
                },
            });
            return;
        }
    }
    if (!result.validation.safe) {
        const receipt = (0, transaction_1.newPatchReceipt)({
            file: options.file,
            beforeHash,
            afterHash: result.afterHash,
            diffHash: result.validation.diffHash,
            patchHash: result.patchHash,
            previewTokenUsed: parsedPreviewToken !== null,
            stalePreviewRejected: false,
            rollbackAvailable: false,
        });
        emitRejected(options, {
            file: options.file,
            message: `${contracts_1.STATUS_TERMS.patchRejected}: validation checks failed (${result.validation.reasonCodes.join(', ') || 'unknown'}).`,
            status: 'rejected',
            previewTokenUsed: parsedPreviewToken !== null,
            receipt,
            validation: result.validation,
        });
        return;
    }
    const backupPath = `${filePath}.neurcode.patch-backup.${Date.now()}.${process.pid}`;
    let backupCreated = false;
    let rollbackAvailable = false;
    try {
        (0, fs_1.writeFileSync)(backupPath, content, 'utf-8');
        backupCreated = true;
        rollbackAvailable = true;
        (0, fs_1.writeFileSync)(filePath, result.updatedContent, 'utf-8');
        const verifyWritten = (0, fs_1.readFileSync)(filePath, 'utf-8');
        if ((0, transaction_1.hashPatchValue)(verifyWritten) !== result.afterHash) {
            throw new Error('file_write_verification_failed');
        }
        try {
            (0, fs_1.unlinkSync)(backupPath);
        }
        catch {
            // best-effort cleanup only
        }
    }
    catch (error) {
        if (backupCreated) {
            try {
                const backupContent = (0, fs_1.readFileSync)(backupPath, 'utf-8');
                (0, fs_1.writeFileSync)(filePath, backupContent, 'utf-8');
            }
            catch {
                // best-effort rollback only
            }
        }
        const message = error instanceof Error ? error.message : 'Could not write file';
        if (options.json) {
            emitJson({
                success: false,
                file: options.file,
                status: 'rejected',
                changed: false,
                patternKind: result.patternKind,
                patchConfidence: result.patchConfidence,
                diff: result.diff,
                message: `Patch rejected: transactional write failed (${message})`,
                recipe: result.recipe,
                validation: result.validation,
                previewToken: result.previewToken,
                patchHash: result.patchHash,
                receipt: (0, transaction_1.newPatchReceipt)({
                    file: options.file,
                    beforeHash,
                    afterHash: (0, transaction_1.hashPatchValue)((0, fs_1.readFileSync)(filePath, 'utf-8')),
                    diffHash: result.validation.diffHash,
                    patchHash: result.patchHash,
                    previewTokenUsed: parsedPreviewToken !== null,
                    stalePreviewRejected: false,
                    staleReason: 'transactional_write_failed',
                    rollbackAvailable,
                }),
                reverifyRequired: false,
            });
        }
        else {
            console.log(chalk.red(`${contracts_1.STATUS_TERMS.patchRejected}: transactional write failed (${message})`));
            if (rollbackAvailable) {
                console.log(chalk.dim(`Rollback snapshot retained at ${backupPath}`));
            }
        }
        return;
    }
    const contentAfter = (0, fs_1.readFileSync)(filePath, 'utf-8');
    const changed = contentAfter !== content;
    rollbackAvailable = changed;
    let receipt = (0, transaction_1.newPatchReceipt)({
        file: options.file,
        beforeHash,
        afterHash: (0, transaction_1.hashPatchValue)(contentAfter),
        diffHash: result.validation.diffHash,
        patchHash: result.patchHash,
        previewTokenUsed: parsedPreviewToken !== null,
        stalePreviewRejected: false,
        rollbackAvailable,
        rollbackSnapshotId: rollbackAvailable ? undefined : null,
    });
    if (rollbackAvailable) {
        const rollbackSnapshot = (0, rollback_1.persistPatchRollbackSnapshot)({
            cwd: process.cwd(),
            file: options.file,
            beforeContent: content,
            receipt,
        });
        if (rollbackSnapshot.saved && rollbackSnapshot.snapshotId) {
            receipt = (0, transaction_1.newPatchReceipt)({
                transactionId: receipt.transactionId,
                file: options.file,
                beforeHash: receipt.beforeHash,
                afterHash: receipt.afterHash,
                diffHash: receipt.diffHash,
                patchHash: receipt.patchHash,
                previewTokenUsed: receipt.previewTokenUsed,
                stalePreviewRejected: receipt.stalePreviewRejected,
                staleReason: receipt.staleReason,
                rollbackAvailable: true,
                rollbackSnapshotId: rollbackSnapshot.snapshotId,
            });
        }
        else {
            receipt = (0, transaction_1.newPatchReceipt)({
                transactionId: receipt.transactionId,
                file: options.file,
                beforeHash: receipt.beforeHash,
                afterHash: receipt.afterHash,
                diffHash: receipt.diffHash,
                patchHash: receipt.patchHash,
                previewTokenUsed: receipt.previewTokenUsed,
                stalePreviewRejected: receipt.stalePreviewRejected,
                staleReason: rollbackSnapshot.reason || receipt.staleReason,
                rollbackAvailable: false,
                rollbackSnapshotId: null,
            });
            rollbackAvailable = false;
        }
    }
    if (options.json) {
        emitJson({
            success: changed,
            file: options.file,
            changed,
            status: changed ? 'applied' : 'rejected',
            patternKind: result.patternKind,
            patchConfidence: result.patchConfidence,
            diff: result.diff,
            message: changed ? contracts_1.STATUS_TERMS.safePatchApplied : `${contracts_1.STATUS_TERMS.patchRejected}: file unchanged after apply`,
            recipe: result.recipe,
            validation: result.validation,
            previewToken: result.previewToken,
            patchHash: result.patchHash,
            receipt,
            reverifyRequired: changed,
        });
    }
    else {
        console.log(chalk.green(contracts_1.STATUS_TERMS.safePatchApplied));
        console.log(chalk.dim(`  File:       ${options.file}`));
        console.log(chalk.dim(`  Pattern:    ${result.patternKind}`));
        console.log(chalk.dim(`  Confidence: ${result.patchConfidence}`));
        console.log(chalk.dim(`  Recipe:     ${result.recipe.recipeId}`));
        console.log(chalk.dim(`  Run \`neurcode verify\` to confirm the fix. ${contracts_1.STATUS_TERMS.retrySafe}.`));
    }
}
//# sourceMappingURL=patch-apply.js.map