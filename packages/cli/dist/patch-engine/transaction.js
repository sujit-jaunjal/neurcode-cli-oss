"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPatchValue = hashPatchValue;
exports.buildPatchHash = buildPatchHash;
exports.createPatchPreviewToken = createPatchPreviewToken;
exports.parsePatchPreviewToken = parsePatchPreviewToken;
exports.newPatchReceipt = newPatchReceipt;
const node_crypto_1 = require("node:crypto");
function base64UrlEncode(value) {
    return Buffer.from(value, 'utf-8').toString('base64url');
}
function base64UrlDecode(value) {
    return Buffer.from(value, 'base64url').toString('utf-8');
}
function hashPatchValue(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
function buildPatchHash(input) {
    return hashPatchValue(JSON.stringify(input));
}
function createPatchPreviewToken(payload) {
    const rawPayload = JSON.stringify(payload);
    const encodedPayload = base64UrlEncode(rawPayload);
    const signature = hashPatchValue(rawPayload);
    return `${encodedPayload}.${signature}`;
}
function parsePatchPreviewToken(token) {
    const trimmed = token.trim();
    if (trimmed.length === 0)
        return null;
    const [encodedPayload, signature] = trimmed.split('.');
    if (!encodedPayload || !signature)
        return null;
    try {
        const rawPayload = base64UrlDecode(encodedPayload);
        const expectedSignature = hashPatchValue(rawPayload);
        if (expectedSignature !== signature)
            return null;
        const parsed = JSON.parse(rawPayload);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return null;
        const payload = parsed;
        if (payload.schemaVersion !== 'neurcode.patch-preview-token.v1')
            return null;
        if (typeof payload.file !== 'string' || payload.file.trim().length === 0)
            return null;
        if (typeof payload.createdAt !== 'string' || payload.createdAt.trim().length === 0)
            return null;
        if (typeof payload.beforeHash !== 'string' || payload.beforeHash.length === 0)
            return null;
        if (typeof payload.afterHash !== 'string' || payload.afterHash.length === 0)
            return null;
        if (typeof payload.diffHash !== 'string' || payload.diffHash.length === 0)
            return null;
        if (typeof payload.patchHash !== 'string' || payload.patchHash.length === 0)
            return null;
        if (typeof payload.patternKind !== 'string' || payload.patternKind.length === 0)
            return null;
        if (payload.confidence !== 'high' && payload.confidence !== 'medium' && payload.confidence !== 'low')
            return null;
        return payload;
    }
    catch {
        return null;
    }
}
function newPatchReceipt(input) {
    const transactionId = input.transactionId && input.transactionId.trim().length > 0
        ? input.transactionId.trim()
        : `patch_${(0, node_crypto_1.randomUUID)()}`;
    const createdAt = new Date().toISOString();
    const receiptWithoutHash = {
        schemaVersion: 'neurcode.patch-receipt.v1',
        transactionId,
        file: input.file,
        createdAt,
        beforeHash: input.beforeHash ?? null,
        afterHash: input.afterHash ?? null,
        diffHash: input.diffHash ?? null,
        patchHash: input.patchHash ?? null,
        previewTokenUsed: input.previewTokenUsed === true,
        stalePreviewRejected: input.stalePreviewRejected === true,
        staleReason: input.staleReason ?? null,
        rollbackAvailable: input.rollbackAvailable === true,
        rollbackSnapshotId: input.rollbackSnapshotId ?? null,
    };
    const transactionHash = hashPatchValue(JSON.stringify(receiptWithoutHash));
    return {
        ...receiptWithoutHash,
        transactionHash,
    };
}
//# sourceMappingURL=transaction.js.map