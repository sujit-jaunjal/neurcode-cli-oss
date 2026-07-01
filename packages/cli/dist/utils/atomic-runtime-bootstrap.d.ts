import type { AgentSessionLauncherAgent } from './agent-session-launcher';
export declare const ATOMIC_RUNTIME_BOOTSTRAP_SCHEMA_VERSION: "neurcode.atomic-runtime-bootstrap.v1";
export type RuntimeManifestStatus = 'healthy' | 'repaired' | 'missing' | 'incompatible';
export interface AtomicRuntimeBootstrapResult {
    schemaVersion: typeof ATOMIC_RUNTIME_BOOTSTRAP_SCHEMA_VERSION;
    attempted: boolean;
    repaired: string[];
    preserved: string[];
    runtimeState: string;
    manifestStatus: RuntimeManifestStatus;
    sessionCreated: boolean;
    recoveryCommand: string | null;
    reasonCodes: string[];
    manifestPath: string | null;
    manifestHash: string | null;
    ok: boolean;
}
export type AtomicBootstrapFailPhase = 'hook_install' | 'manifest_write' | 'profile_generation' | 'session_persist';
export declare function atomicRuntimeBootstrap(repoRootInput: string, input: {
    agent: AgentSessionLauncherAgent;
    activate: boolean;
    forceProfile?: boolean;
}): Promise<AtomicRuntimeBootstrapResult>;
//# sourceMappingURL=atomic-runtime-bootstrap.d.ts.map