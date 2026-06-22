import { type ActivatedRuntimeIntegration, type RuntimeAdapter, type RuntimeAuthorityAssessment } from '@neurcode-ai/cli-runtime';
import { type BrainLifecycleStatus } from './brain-lifecycle';
export interface RuntimeAuthorityRepairResult {
    ok: true;
    repoRoot: string;
    manifestPath: string;
    manifestHash: string;
    changed: boolean;
    integrations: ActivatedRuntimeIntegration[];
    repaired: string[];
    preserved: string[];
    brain: BrainLifecycleStatus;
    restartRequired: boolean;
    nextCheck: string;
}
export declare function recordActivatedRuntime(repoRootInput: string, adapters: RuntimeAdapter[]): Promise<{
    manifestPath: string;
    manifestHash: string;
    changed: boolean;
    brain: BrainLifecycleStatus;
}>;
export declare function repairRuntimeAuthority(repoRootInput: string): Promise<RuntimeAuthorityRepairResult>;
export declare function inspectRuntimeAuthority(repoRootInput: string, adapter?: RuntimeAdapter, protectedOperation?: boolean): RuntimeAuthorityAssessment;
export declare function assertProtectedRuntimeAuthority(repoRootInput: string, adapter: RuntimeAdapter | 'neurcode-cli'): RuntimeAuthorityAssessment;
export declare function runtimeManifestExists(repoRootInput: string): boolean;
export declare function activeRuntimeEntrypoint(): string;
//# sourceMappingURL=runtime-authority.d.ts.map