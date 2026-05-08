import { type PatchTransactionReceipt } from './transaction';
export interface PersistRollbackSnapshotResult {
    saved: boolean;
    snapshotId: string | null;
    reason: string | null;
}
export interface RollbackApplyResult {
    success: boolean;
    file: string;
    snapshotId: string;
    transactionId: string;
    transactionHash: string;
    status: 'rollback_applied' | 'rollback_rejected' | 'rollback_stale';
    changed: boolean;
    staleReason: string | null;
    staleDetails: Record<string, unknown> | null;
    message: string;
}
export declare function persistPatchRollbackSnapshot(input: {
    cwd: string;
    file: string;
    beforeContent: string;
    receipt: PatchTransactionReceipt;
    retention?: number;
}): PersistRollbackSnapshotResult;
export declare function applyPatchRollback(input: {
    cwd: string;
    snapshotId: string;
    file?: string;
}): RollbackApplyResult;
//# sourceMappingURL=rollback.d.ts.map