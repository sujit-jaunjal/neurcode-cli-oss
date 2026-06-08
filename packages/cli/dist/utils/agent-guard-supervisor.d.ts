export declare const AGENT_GUARD_SUPERVISOR_SCHEMA_VERSION: "neurcode.agent-guard-supervisor.v1";
export declare const AGENT_GUARD_SUPERVISOR_ACTIVE_STATE_FILE: "active.json";
export declare const DEFAULT_AGENT_GUARD_SUPERVISOR_DEBOUNCE_MS = 500;
export declare const DEFAULT_AGENT_GUARD_SUPERVISOR_HEARTBEAT_MS = 5000;
export declare const DEFAULT_AGENT_GUARD_SUPERVISOR_IDLE_TIMEOUT_MS: number;
export declare const DEFAULT_AGENT_GUARD_SUPERVISOR_MIN_EVAL_INTERVAL_MS = 2000;
export declare const AGENT_GUARD_SUPERVISOR_IGNORED_PATTERNS: string[];
export type AgentGuardSupervisorStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'stale' | 'failed';
export interface AgentGuardSupervisorState {
    schemaVersion: typeof AGENT_GUARD_SUPERVISOR_SCHEMA_VERSION;
    sessionId: string;
    guardPath: string;
    repoRoot: string;
    pid: number | null;
    status: AgentGuardSupervisorStatus;
    startedAt: string;
    updatedAt: string;
    heartbeatAt: string | null;
    stoppedAt: string | null;
    lastActivityAt: string | null;
    debounceMs: number;
    heartbeatMs: number;
    idleTimeoutMs: number;
    minEvalIntervalMs: number;
    evaluationCount: number;
    lastEvaluatedAt: string | null;
    lastPass: boolean | null;
    lastChangedFiles: number;
    lastError: string | null;
    privacy: {
        metadataOnly: true;
        sourceUploaded: false;
        sourceIncluded: false;
        watchesPathsOnly: true;
    };
}
export interface AgentGuardSupervisorInspection {
    statePath: string;
    exists: boolean;
    alive: boolean;
    state: AgentGuardSupervisorState | null;
    effectiveStatus: AgentGuardSupervisorStatus | 'missing';
    error?: string;
}
export interface AgentGuardSupervisorEvaluationResult {
    pass: boolean;
    changedFiles: number;
    evaluatedAt?: string;
}
export interface AgentGuardSupervisorEvaluationContext {
    changedPaths: string[];
}
export interface RunAgentGuardSupervisorOptions {
    repoRoot: string;
    sessionId: string;
    guardPath: string;
    debounceMs?: number;
    heartbeatMs?: number;
    idleTimeoutMs?: number;
    minEvalIntervalMs?: number;
    exitAfterMs?: number;
    evaluateImmediately?: boolean;
    onEvaluate: (context: AgentGuardSupervisorEvaluationContext) => Promise<AgentGuardSupervisorEvaluationResult>;
    onState?: (state: AgentGuardSupervisorState) => void;
}
export declare function cleanupStaleSupervisorsForRepo(repoRoot: string, exceptPid?: number): number;
export declare function inspectAgentGuardSupervisor(repoRoot: string, sessionId?: string): AgentGuardSupervisorInspection;
export declare function startAgentGuardSupervisorDetached(input: {
    repoRoot: string;
    sessionId: string;
    guardPath: string;
    cliEntry: string;
    debounceMs?: number;
    idleTimeoutMs?: number;
    minEvalIntervalMs?: number;
}): {
    started: boolean;
    alreadyRunning: boolean;
    replacedExisting: boolean;
    pid: number | null;
    statePath: string;
    state: AgentGuardSupervisorState;
};
export declare function stopAgentGuardSupervisorForRepo(repoRoot: string): {
    signaled: boolean;
    statePath: string;
    state: AgentGuardSupervisorState | null;
    effectiveStatus: AgentGuardSupervisorInspection['effectiveStatus'];
};
export declare function stopAgentGuardSupervisor(repoRoot: string, sessionId?: string): {
    signaled: boolean;
    statePath: string;
    state: AgentGuardSupervisorState | null;
    effectiveStatus: AgentGuardSupervisorInspection['effectiveStatus'];
};
export declare function stopSupervisorOnSessionCompletion(repoRoot: string): ReturnType<typeof stopAgentGuardSupervisorForRepo>;
export declare function runAgentGuardSupervisor(options: RunAgentGuardSupervisorOptions): Promise<AgentGuardSupervisorState>;
//# sourceMappingURL=agent-guard-supervisor.d.ts.map