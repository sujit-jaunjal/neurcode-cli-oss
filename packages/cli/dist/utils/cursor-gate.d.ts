import { type AgentGuardPostureSummary } from '@neurcode-ai/governance-runtime';
import { type AgentGuardEvaluation } from './agent-guard';
export declare const CURSOR_GATE_SCHEMA_VERSION: "neurcode.cursor-gate.v1";
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
    hookPath: string;
    neurcodeHookPath: string;
    hooksPathConfigured: boolean;
    message: string;
}
export declare function installCursorGateHook(input: {
    dir?: string;
    force?: boolean;
}): CursorGateInstallResult;
export interface CursorGateDoctorResult {
    ok: boolean;
    checks: Array<{
        id: string;
        status: 'pass' | 'fail';
        message: string;
    }>;
    repoRoot: string;
}
export declare function doctorCursorGateHook(input: {
    dir?: string;
}): CursorGateDoctorResult;
//# sourceMappingURL=cursor-gate.d.ts.map