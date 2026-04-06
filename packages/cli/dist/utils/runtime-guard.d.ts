import { type DeterministicConstraintRule } from '@neurcode-ai/governance-runtime';
import type { DiffFile } from '@neurcode-ai/diff-parser';
export interface RuntimeGuardRuleRecord {
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
export interface RuntimeGuardArtifact {
    schemaVersion: 1;
    guardId: string;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    active: boolean;
    mode: 'strict' | 'advisory';
    source: {
        planId: string | null;
        sessionId: string | null;
        projectId: string | null;
        changeContractPath: string | null;
        changeContractId: string | null;
        changeContractExpectedFilesFingerprint: string | null;
        compiledPolicyPath: string | null;
        compiledPolicyFingerprint: string | null;
    };
    expectedFiles: string[];
    expectedFilesFingerprint: string;
    deterministic: {
        ruleCount: number;
        unmatchedStatements: string[];
        rules: RuntimeGuardRuleRecord[];
    };
    stats: {
        checksRun: number;
        blockedChecks: number;
        lastCheckedAt: string | null;
    };
}
export interface ReadRuntimeGuardResult {
    path: string;
    exists: boolean;
    artifact: RuntimeGuardArtifact | null;
    error?: string;
}
export interface RuntimeGuardViolation {
    code: 'RUNTIME_GUARD_UNEXPECTED_FILE' | 'RUNTIME_GUARD_CONSTRAINT_VIOLATION' | 'RUNTIME_GUARD_CHANGE_CONTRACT_DRIFT' | 'RUNTIME_GUARD_COMPILED_POLICY_DRIFT' | 'RUNTIME_GUARD_INACTIVE';
    message: string;
    file?: string;
}
export interface RuntimeGuardEvaluation {
    pass: boolean;
    changedFiles: string[];
    outOfScopeFiles: string[];
    constraintViolations: string[];
    adherenceScore: number;
    plannedFilesModified: number;
    totalPlannedFiles: number;
    violations: RuntimeGuardViolation[];
}
export declare function resolveRuntimeGuardPath(projectRoot: string, inputPath?: string): string;
export declare function createRuntimeGuardArtifact(input: {
    mode: 'strict' | 'advisory';
    planId?: string | null;
    sessionId?: string | null;
    projectId?: string | null;
    changeContractPath?: string | null;
    changeContractId?: string | null;
    changeContractExpectedFilesFingerprint?: string | null;
    compiledPolicyPath?: string | null;
    compiledPolicyFingerprint?: string | null;
    expectedFiles: string[];
    deterministicRules: DeterministicConstraintRule[];
    unmatchedStatements?: string[];
}): RuntimeGuardArtifact;
export declare function writeRuntimeGuardArtifact(projectRoot: string, artifact: RuntimeGuardArtifact, outputPath?: string): string;
export declare function readRuntimeGuardArtifact(projectRoot: string, inputPath?: string): ReadRuntimeGuardResult;
export declare function evaluateRuntimeGuardArtifact(artifact: RuntimeGuardArtifact, diffFiles: DiffFile[], fileContents?: Record<string, string>): RuntimeGuardEvaluation;
export declare function withRuntimeGuardCheckStats(artifact: RuntimeGuardArtifact, input: {
    blocked: boolean;
    checkedAt?: string;
}): RuntimeGuardArtifact;
export declare function markRuntimeGuardStopped(artifact: RuntimeGuardArtifact, stoppedAt?: string): RuntimeGuardArtifact;
//# sourceMappingURL=runtime-guard.d.ts.map