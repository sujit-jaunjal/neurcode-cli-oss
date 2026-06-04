"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_BACKEND_RECEIPT_SCHEMA_VERSION = void 0;
exports.canonicalStringify = canonicalStringify;
exports.canonicalHash = canonicalHash;
exports.extractRuntimeReceiptArtifacts = extractRuntimeReceiptArtifacts;
exports.verifyRuntimeBackendEvidenceReceipt = verifyRuntimeBackendEvidenceReceipt;
const node_crypto_1 = require("node:crypto");
exports.RUNTIME_BACKEND_RECEIPT_SCHEMA_VERSION = 'neurcode.backend-evidence-receipt.v1';
const SOURCE_LIKE_KEYS = new Set([
    'content',
    'filecontent',
    'file_content',
    'sourcetext',
    'source_text',
    'sourcecode',
    'source_code',
    'diff',
    'difftext',
    'diff_text',
    'patch',
    'before',
    'after',
    'promptwithsource',
    'prompt_with_source',
]);
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function canonicalize(value) {
    if (value === undefined)
        return null;
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (Array.isArray(value))
        return value.map((entry) => canonicalize(entry));
    const record = asRecord(value);
    if (!record)
        return String(value);
    const output = {};
    for (const key of Object.keys(record).sort()) {
        const child = record[key];
        if (child !== undefined)
            output[key] = canonicalize(child);
    }
    return output;
}
function canonicalStringify(value) {
    return JSON.stringify(canonicalize(value));
}
function canonicalHash(value, length = 32) {
    return (0, node_crypto_1.createHash)('sha256').update(canonicalStringify(value)).digest('hex').slice(0, length);
}
function assertSourceFreeRuntimeReceipt(value, path = 'receipt') {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => assertSourceFreeRuntimeReceipt(entry, `${path}[${index}]`));
        return;
    }
    const record = asRecord(value);
    if (!record)
        return;
    for (const [key, child] of Object.entries(record)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
        const compactKey = normalizedKey.replace(/_/g, '');
        if (SOURCE_LIKE_KEYS.has(normalizedKey) || SOURCE_LIKE_KEYS.has(compactKey)) {
            throw new Error(`source-like receipt payload key is not allowed: ${path}.${key}`);
        }
        assertSourceFreeRuntimeReceipt(child, `${path}.${key}`);
    }
}
function signingSecret() {
    return typeof process.env.NEURCODE_RECEIPT_SIGNING_SECRET === 'string'
        ? process.env.NEURCODE_RECEIPT_SIGNING_SECRET.trim()
        : '';
}
function hmacSha256(secret, payload) {
    return (0, node_crypto_1.createHmac)('sha256', secret).update(payload).digest('hex');
}
function safeEqualHex(left, right) {
    if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right))
        return false;
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return leftBuffer.length === rightBuffer.length && (0, node_crypto_1.timingSafeEqual)(leftBuffer, rightBuffer);
}
function looksLikeReceipt(value) {
    const record = asRecord(value);
    return record?.schemaVersion === exports.RUNTIME_BACKEND_RECEIPT_SCHEMA_VERSION
        && typeof record.receiptId === 'string'
        && typeof record.recordHash === 'string'
        && typeof record.canonicalHash === 'string'
        && typeof record.receiptHash === 'string';
}
function signedPayload(receipt) {
    return {
        schemaVersion: receipt.schemaVersion,
        receiptId: receipt.receiptId,
        issuer: receipt.issuer,
        issuedAt: receipt.issuedAt,
        organizationId: receipt.organizationId,
        repoId: receipt.repoId ?? null,
        repoKey: receipt.repoKey ?? null,
        sessionId: receipt.sessionId,
        recordHash: receipt.recordHash,
        replayHash: receipt.replayHash ?? null,
        evidenceHash: receipt.evidenceHash,
        policyEvidenceVersion: receipt.policyEvidenceVersion,
        sourceFree: receipt.sourceFree,
        sessionSummary: receipt.sessionSummary,
    };
}
function extractRuntimeReceiptArtifacts(value) {
    const receipts = [];
    function visit(candidate, path) {
        if (looksLikeReceipt(candidate)) {
            receipts.push({ path, receipt: candidate });
            return;
        }
        const record = asRecord(candidate);
        if (!record)
            return;
        if (looksLikeReceipt(record.backendReceipt)) {
            receipts.push({ path: `${path}.backendReceipt`, receipt: record.backendReceipt });
        }
        if (looksLikeReceipt(record.receipt)) {
            receipts.push({ path: `${path}.receipt`, receipt: record.receipt });
        }
        if (Array.isArray(record.receipts)) {
            record.receipts.forEach((entry, index) => {
                if (looksLikeReceipt(entry))
                    receipts.push({ path: `${path}.receipts[${index}]`, receipt: entry });
            });
        }
    }
    visit(value, '$');
    return receipts;
}
function verifyRuntimeBackendEvidenceReceipt(value) {
    const receipt = asRecord(value);
    const reasons = [];
    if (!receipt) {
        return {
            valid: false,
            status: 'tampered',
            receiptId: null,
            canonicalHash: null,
            receiptHash: null,
            signatureStatus: 'unknown',
            signingKeyId: null,
            sourceFree: false,
            checks: { canonicalHash: false, receiptHash: false, signature: false, sourceFree: false },
            reasons: ['receipt must be an object'],
        };
    }
    let sourceFree = true;
    try {
        assertSourceFreeRuntimeReceipt(receipt);
    }
    catch (error) {
        sourceFree = false;
        reasons.push(error instanceof Error ? error.message : String(error));
    }
    const candidate = signedPayload(receipt);
    const expectedCanonicalHash = canonicalHash(candidate);
    const canonicalHashValid = receipt.canonicalHash === expectedCanonicalHash;
    if (!canonicalHashValid)
        reasons.push('canonical hash mismatch');
    const expectedReceiptHash = canonicalHash({
        ...candidate,
        canonicalHash: receipt.canonicalHash,
        signatureStatus: receipt.signatureStatus,
        signingKeyId: receipt.signingKeyId ?? null,
        signatureAlgorithm: receipt.signatureAlgorithm,
        signature: receipt.signature ?? null,
    });
    const receiptHashValid = receipt.receiptHash === expectedReceiptHash;
    if (!receiptHashValid)
        reasons.push('receipt hash mismatch');
    let signatureValid = false;
    const secret = signingSecret();
    if (receipt.signatureStatus !== 'signed' || !receipt.signature) {
        reasons.push('receipt is unsigned');
    }
    else if (!secret) {
        reasons.push('NEURCODE_RECEIPT_SIGNING_SECRET is not configured for verification');
    }
    else {
        const expectedSignature = hmacSha256(secret, canonicalStringify(candidate));
        signatureValid = safeEqualHex(receipt.signature, expectedSignature);
        if (!signatureValid)
            reasons.push('signature mismatch');
    }
    const valid = sourceFree && canonicalHashValid && receiptHashValid && signatureValid;
    const status = valid
        ? 'valid'
        : receipt.signatureStatus !== 'signed'
            ? 'unsigned'
            : !secret
                ? 'unverifiable'
                : 'tampered';
    return {
        valid,
        status,
        receiptId: typeof receipt.receiptId === 'string' ? receipt.receiptId : null,
        canonicalHash: typeof receipt.canonicalHash === 'string' ? receipt.canonicalHash : null,
        receiptHash: typeof receipt.receiptHash === 'string' ? receipt.receiptHash : null,
        signatureStatus: typeof receipt.signatureStatus === 'string' ? receipt.signatureStatus : 'unknown',
        signingKeyId: typeof receipt.signingKeyId === 'string' ? receipt.signingKeyId : null,
        sourceFree,
        checks: {
            canonicalHash: canonicalHashValid,
            receiptHash: receiptHashValid,
            signature: signatureValid,
            sourceFree,
        },
        reasons,
    };
}
//# sourceMappingURL=runtime-receipt.js.map