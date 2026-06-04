export declare const RUNTIME_BACKEND_RECEIPT_SCHEMA_VERSION: "neurcode.backend-evidence-receipt.v1";
export interface RuntimeBackendEvidenceReceipt {
    schemaVersion: typeof RUNTIME_BACKEND_RECEIPT_SCHEMA_VERSION;
    receiptId: string;
    issuer: string;
    issuedAt: string;
    organizationId: string;
    repoId: string | null;
    repoKey: string | null;
    sessionId: string;
    recordHash: string;
    replayHash: string | null;
    evidenceHash: string;
    policyEvidenceVersion: string;
    sourceFree: true;
    sessionSummary: Record<string, unknown>;
    canonicalHash: string;
    signatureStatus: 'signed' | 'unsigned_missing_secret' | string;
    signingKeyId: string | null;
    signatureAlgorithm: 'hmac-sha256' | string;
    signature: string | null;
    receiptHash: string;
    verification?: Record<string, unknown>;
}
export interface RuntimeReceiptVerificationResult {
    valid: boolean;
    status: 'valid' | 'unsigned' | 'unverifiable' | 'tampered';
    receiptId: string | null;
    canonicalHash: string | null;
    receiptHash: string | null;
    signatureStatus: string;
    signingKeyId: string | null;
    sourceFree: boolean;
    checks: {
        canonicalHash: boolean;
        receiptHash: boolean;
        signature: boolean;
        sourceFree: boolean;
    };
    reasons: string[];
}
export interface RuntimeReceiptArtifact {
    path: string;
    receipt: RuntimeBackendEvidenceReceipt;
}
export declare function canonicalStringify(value: unknown): string;
export declare function canonicalHash(value: unknown, length?: number): string;
export declare function extractRuntimeReceiptArtifacts(value: unknown): RuntimeReceiptArtifact[];
export declare function verifyRuntimeBackendEvidenceReceipt(value: unknown): RuntimeReceiptVerificationResult;
//# sourceMappingURL=runtime-receipt.d.ts.map