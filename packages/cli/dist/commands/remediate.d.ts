interface RemediateOptions {
    goal?: string;
    planId?: string;
    projectId?: string;
    maxFixAttempts?: number;
    policyOnly?: boolean;
    requirePlan?: boolean;
    requirePolicyLock?: boolean;
    skipPolicyLock?: boolean;
    strictArtifacts?: boolean;
    enforceChangeContract?: boolean;
    requireRuntimeGuard?: boolean;
    requireApproval?: boolean;
    minApprovals?: number;
    approvalCommit?: string;
    autoRepairAiLog?: boolean;
    rollbackOnRegression?: boolean;
    requireRollbackSnapshot?: boolean;
    snapshotMaxFiles?: number;
    snapshotMaxBytes?: number;
    snapshotMaxFileBytes?: number;
    noRecord?: boolean;
    skipTests?: boolean;
    publishCard?: boolean;
    json?: boolean;
}
export declare function remediateCommand(options?: RemediateOptions): Promise<void>;
export {};
//# sourceMappingURL=remediate.d.ts.map