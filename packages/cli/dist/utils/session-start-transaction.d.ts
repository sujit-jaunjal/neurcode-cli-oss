import { inspectOwnedProcess } from '@neurcode-ai/brain';
export declare const SESSION_START_TRANSACTION_SCHEMA_VERSION: "neurcode.session-start-transaction.v1";
export type SessionStartPhase = 'initializing_runtime' | 'fingerprinting_profile' | 'persisting_deferred_session' | 'shaping_session' | 'activating_session' | 'reconciling_cloud';
interface SessionStartTransaction {
    schemaVersion: typeof SESSION_START_TRANSACTION_SCHEMA_VERSION;
    commandKey: string;
    jobId: string;
    pid: number;
    processStartFingerprint: string | null;
    startedAt: string;
    updatedAt: string;
    phase: SessionStartPhase;
    sessionId: string | null;
}
export declare function beginSessionStartTransaction(repoRoot: string, commandKey: string): SessionStartTransaction;
export declare function updateSessionStartTransaction(repoRoot: string, update: {
    phase: SessionStartPhase;
    sessionId?: string | null;
}): SessionStartTransaction | null;
export declare function clearSessionStartTransaction(repoRoot: string): void;
export declare function inspectSessionStartTransaction(repoRoot: string): {
    phase: SessionStartPhase;
    sessionId: string | null;
    ownerState: ReturnType<typeof inspectOwnedProcess>;
} | null;
export declare function recoverTimedOutSessionStart(repoRoot: string, childPid: number): {
    recovered: boolean;
    phase: SessionStartPhase | null;
};
export {};
//# sourceMappingURL=session-start-transaction.d.ts.map