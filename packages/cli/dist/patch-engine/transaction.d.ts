import type { PatchConfidence } from './safety';
export interface PatchPreviewTokenPayload {
    schemaVersion: 'neurcode.patch-preview-token.v1';
    file: string;
    createdAt: string;
    beforeHash: string;
    afterHash: string;
    diffHash: string;
    patchHash: string;
    patternKind: string;
    confidence: PatchConfidence;
}
export interface PatchTransactionReceipt {
    schemaVersion: 'neurcode.patch-receipt.v1';
    transactionId: string;
    transactionHash: string;
    file: string;
    createdAt: string;
    beforeHash: string | null;
    afterHash: string | null;
    diffHash: string | null;
    patchHash: string | null;
    previewTokenUsed: boolean;
    stalePreviewRejected: boolean;
    staleReason: string | null;
    rollbackAvailable: boolean;
    rollbackSnapshotId: string | null;
}
export declare function hashPatchValue(value: string): string;
export declare function buildPatchHash(input: {
    file: string;
    beforeHash: string;
    afterHash: string;
    diffHash: string;
    patternKind: string;
}): string;
export declare function createPatchPreviewToken(payload: PatchPreviewTokenPayload): string;
export declare function parsePatchPreviewToken(token: string): PatchPreviewTokenPayload | null;
export declare function newPatchReceipt(input: {
    transactionId?: string;
    file: string;
    beforeHash?: string | null;
    afterHash?: string | null;
    diffHash?: string | null;
    patchHash?: string | null;
    previewTokenUsed?: boolean;
    stalePreviewRejected?: boolean;
    staleReason?: string | null;
    rollbackAvailable?: boolean;
    rollbackSnapshotId?: string | null;
}): PatchTransactionReceipt;
//# sourceMappingURL=transaction.d.ts.map