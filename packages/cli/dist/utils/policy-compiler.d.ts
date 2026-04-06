import { type DeterministicConstraintRule } from '@neurcode-ai/governance-runtime';
import type { GovernanceArtifactSignature } from './artifact-signature';
export interface CompiledDeterministicRuleRecord {
    id: string;
    source: 'intent' | 'policy';
    statement: string;
    displayName: string;
    matchToken: string;
    pattern: {
        source: string;
        flags: string;
    };
    pathIncludePatterns?: string[];
    pathExcludePatterns?: string[];
    minMatchesPerFile?: number;
    maxMatchesPerFile?: number;
    evaluationMode?: 'added_lines' | 'full_file' | 'signature_delta';
    evaluationScope?: 'file' | 'repo';
}
export interface CompiledPolicyArtifact {
    schemaVersion: 1;
    generatedAt: string;
    fingerprint: string;
    signature?: GovernanceArtifactSignature;
    source: {
        includeDashboardPolicies: boolean;
        policyLockPath: string;
        policyLockFingerprint: string | null;
        policyPack: {
            id: string;
            name: string;
            version: string;
        } | null;
        defaultRuleCount: number;
        policyPackRuleCount: number;
        customRuleCount: number;
        effectiveRuleCount: number;
    };
    statements: {
        intentConstraints: string | null;
        policyRules: string[];
    };
    compilation: {
        deterministicRuleCount: number;
        unmatchedStatements: string[];
        deterministicRules: CompiledDeterministicRuleRecord[];
    };
}
export interface ReadCompiledPolicyResult {
    path: string;
    exists: boolean;
    artifact: CompiledPolicyArtifact | null;
    error?: string;
}
export declare function buildCompiledPolicyArtifact(input: {
    generatedAt?: string;
    includeDashboardPolicies: boolean;
    policyLockPath: string;
    policyLockFingerprint: string | null;
    policyPack: {
        id: string;
        name: string;
        version: string;
    } | null;
    defaultRuleCount: number;
    policyPackRuleCount: number;
    customRuleCount: number;
    effectiveRuleCount: number;
    intentConstraints?: string;
    policyRules: string[];
}): CompiledPolicyArtifact;
export declare function resolveCompiledPolicyPath(projectRoot: string, outputPath?: string): string;
export declare function writeCompiledPolicyArtifact(projectRoot: string, artifact: CompiledPolicyArtifact, outputPath?: string): string;
export declare function readCompiledPolicyArtifact(projectRoot: string, inputPath?: string): ReadCompiledPolicyResult;
export declare function hydrateCompiledPolicyRules(artifact: CompiledPolicyArtifact): DeterministicConstraintRule[];
//# sourceMappingURL=policy-compiler.d.ts.map