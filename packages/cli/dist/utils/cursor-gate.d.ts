import { type AgentGuardPostureSummary } from '@neurcode-ai/governance-runtime';
import { type AgentGuardEvaluation } from './agent-guard';
export declare const CURSOR_GATE_SCHEMA_VERSION: "neurcode.cursor-gate.v1";
export declare const MIN_CURSOR_GATE_CLI_VERSION: "0.15.4";
export type CursorGateHookKind = 'pre-push' | 'pre-commit';
export interface CliVersionStaleWarning {
    id: 'cli_version_stale';
    status: 'warn';
    runningVersion: string;
    expectedVersion: string;
    minimumVersion: string;
    message: string;
    remediation: string[];
}
export declare function readBundledCliVersion(): string;
/** Warn when the running CLI is too old for cursor gate (e.g. stale global @neurcode-ai/cli). */
export declare function buildCliVersionStaleWarning(options?: {
    minimumVersion?: string;
    runningVersionOverride?: string;
}): CliVersionStaleWarning | null;
export declare function emitCliVersionStaleWarning(warning: CliVersionStaleWarning, json?: boolean): void;
export interface CursorGateEvaluateOptions {
    dir?: string;
    sessionId?: string;
    guardPath?: string;
    allowNoSession?: boolean;
    ci?: boolean;
}
export interface CursorGatePayload {
    schemaVersion: typeof CURSOR_GATE_SCHEMA_VERSION;
    ok: boolean;
    exitCode: number;
    sessionId: string | null;
    agentGuardPosture: AgentGuardPostureSummary | null;
    summary: {
        unverifiedWrites: number;
        deniedButChanged: number;
        changedFiles: number;
    };
    remediation: string[];
    enforcement: {
        level: string;
        controlLevel: string;
        honestSummary: string;
    };
    evaluation?: AgentGuardEvaluation;
    artifactPath?: string;
    error?: string;
    errorCode?: string;
}
export declare function resolveCursorGateExitCode(input: {
    errorCode?: string;
    pass?: boolean;
}): number;
export declare function evaluateCursorGate(options: CursorGateEvaluateOptions): Promise<CursorGatePayload>;
export declare function formatCursorGateCiErrors(payload: CursorGatePayload): string[];
export interface CursorGateInstallResult {
    ok: boolean;
    repoRoot: string;
    hooksPath: string;
    hookKind: CursorGateHookKind;
    hookPath: string;
    neurcodeHookPath: string;
    hooksPathConfigured: boolean;
    message: string;
}
export interface CursorGateInstallBatchResult {
    ok: boolean;
    repoRoot: string;
    hooksPath: string;
    hooks: CursorGateInstallResult[];
    hooksPathConfigured: boolean;
    message: string;
}
export declare function installCursorGateHook(input: {
    dir?: string;
    force?: boolean;
    hook?: 'pre-push' | 'pre-commit' | 'both';
}): CursorGateInstallBatchResult;
export interface CursorGateDoctorResult {
    ok: boolean;
    checks: Array<{
        id: string;
        status: 'pass' | 'fail' | 'skip';
        message: string;
    }>;
    repoRoot: string;
    cliVersionWarning?: CliVersionStaleWarning | null;
}
export declare function doctorCursorGateHook(input: {
    dir?: string;
}): CursorGateDoctorResult;
//# sourceMappingURL=cursor-gate.d.ts.map