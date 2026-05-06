export interface VerificationEvidenceContext {
    commitSha?: string;
    branch?: string;
    repoUrl?: string;
    workflowRunId?: string;
}
export interface WriteVerificationEvidenceInput {
    enabled: boolean;
    projectRoot: string;
    startedAtMs: number;
    exitCode: number;
    ciMode: boolean;
    deterministicMode: boolean;
    evidenceDir?: string;
    canonicalOutput?: Record<string, unknown> | null;
    fallbackOutput?: Record<string, unknown> | null;
    runtimeMetadata?: Record<string, unknown>;
    ciContext?: VerificationEvidenceContext;
    retentionMax?: number;
}
export declare function writeVerificationEvidence(input: WriteVerificationEvidenceInput): string | null;
//# sourceMappingURL=verification-evidence.d.ts.map