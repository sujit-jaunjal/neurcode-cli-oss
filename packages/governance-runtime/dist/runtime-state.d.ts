export declare const RUNTIME_STATE_SCHEMA_VERSION: "neurcode.runtime-state.v1";
export type RuntimeEnforcementState = 'not_installed' | 'installed_not_activated' | 'active_compatible_session' | 'session_starting' | 'session_start_failed' | 'stale_or_incompatible_session' | 'enforcement_paused' | 'runtime_unavailable';
export interface RuntimeStateEvidence {
    metadataOnly: true;
    hooksOrAdapterInstalled: boolean;
    runtimeManifestPresent: boolean;
    profilePresent: boolean;
    profileReadable: boolean;
    activePointerPresent: boolean;
    activeSessionPresent: boolean;
    sessionProfileCompatible: boolean | null;
    trackedFileCount: number | null;
    ownershipBoundaryCount: number;
    approvalBoundaryCount: number;
    sensitiveBoundaryCounts: Partial<Record<'auth' | 'crypto' | 'secrets' | 'payments' | 'migrations' | 'security' | 'custom', number>>;
    configuredBoundaryCount: number;
    reasonCodes: string[];
}
export interface RuntimeStateAssessment {
    schemaVersion: typeof RUNTIME_STATE_SCHEMA_VERSION;
    state: RuntimeEnforcementState;
    governanceExpected: boolean;
    protectedPathsFailClosed: boolean;
    recoveryCommand: string;
    evidence: RuntimeStateEvidence;
}
//# sourceMappingURL=runtime-state.d.ts.map