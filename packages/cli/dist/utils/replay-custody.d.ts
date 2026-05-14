import type { ExecutionSource } from './execution-bus';
import { type ProvenanceRecord } from './governance-provenance';
export interface VerifyReplayCustodyCaptureInput {
    projectRoot: string;
    diffContext: string;
    filesAnalyzed: number;
    planId: string | null;
    verificationSource: string;
    policyLockFingerprint: string | null;
    compiledPolicyFingerprint: string | null;
    ruleIds: string[];
    blockingCount: number;
    advisoryCount: number;
    suppressedCount: number;
    structuralBlockingCount: number;
    structuralAdvisoryCount: number;
    deterministicSignals: number;
    heuristicSignals: number;
    overallTrustScore: number;
    verdict: 'PASS' | 'FAIL' | 'WARN';
    governanceDecision: string;
    actor: string;
    source: ExecutionSource;
    replayChecksum: string | null;
}
export interface VerifyReplayCustodyCaptureResult {
    provenanceRecord: ProvenanceRecord | null;
    provenanceSaved: boolean;
    verificationSource: string;
    planId: string | null;
    policyLockFingerprint: string | null;
    compiledPolicyFingerprint: string | null;
    controlPlaneSnapshotId: string | null;
    controlPlaneSnapshotPath: string | null;
    workspaceSnapshotId: string | null;
    workspaceSnapshotPath: string | null;
    workspaceSnapshotRequired: boolean;
    missingArtifacts: string[];
    notes: string[];
}
export declare function captureVerifyReplayCustody(input: VerifyReplayCustodyCaptureInput): VerifyReplayCustodyCaptureResult;
export declare function applyReplayCustodyToCanonicalOutput(canonicalOutput: Record<string, unknown> | null, custody: VerifyReplayCustodyCaptureResult): void;
//# sourceMappingURL=replay-custody.d.ts.map