import { classifyDependencyManifestChange, classifyRuntimeSafetySurface, ENTERPRISE_RUNTIME_SAFETY_V1_POLICY, evaluateCredentialPreWrite, type PlanControlMode, type RuntimeSafetyEnforcementResult, type RuntimeSafetyPhase, type RuntimeSafetyPolicyProfile } from '@neurcode-ai/governance-runtime';
import type { RepoGovernanceProfile } from '@neurcode-ai/governance-runtime';
export interface RuntimeSafetyCheckInput {
    filePath: string;
    proposedContent?: string | null;
    previousContent?: string | null;
    profile?: RepoGovernanceProfile | null;
    allowedGlobs?: string[];
    approvedPaths?: string[];
    planFiles?: string[];
    phase?: RuntimeSafetyPhase;
    planMode?: PlanControlMode;
    policy?: Partial<RuntimeSafetyPolicyProfile>;
}
export interface RuntimeSafetyCheckResult {
    classification: ReturnType<typeof classifyRuntimeSafetySurface>;
    credential: ReturnType<typeof evaluateCredentialPreWrite> | null;
    dependency: ReturnType<typeof classifyDependencyManifestChange> | null;
    enforcement: RuntimeSafetyEnforcementResult;
    policy: RuntimeSafetyPolicyProfile;
}
export declare function evaluateRuntimeSafetyCheck(input: RuntimeSafetyCheckInput): RuntimeSafetyCheckResult;
export { ENTERPRISE_RUNTIME_SAFETY_V1_POLICY };
//# sourceMappingURL=runtime-safety-check.d.ts.map