import { type ProposedChangeEnvelope, type RepoIntelligenceEvidence, type StructuralPolicyEvaluation } from '@neurcode-ai/contracts';
export declare const DEFAULT_STRUCTURAL_POLICY_V2_PATH = ".neurcode/structural-policy-v2.json";
export interface LocalRepoIntelligenceV2Result {
    evidence: RepoIntelligenceEvidence;
    policyConfigured: boolean;
    policyPath: string;
    evaluation: StructuralPolicyEvaluation;
}
export declare function evaluateLocalRepoIntelligenceV2(input: {
    repoRoot: string;
    change: ProposedChangeEnvelope;
    policyPath?: string;
    includeAdvisory?: boolean;
    /** Pre-write mode never deserializes a repository-wide graph. */
    boundedPreWrite?: boolean;
    generatedAt?: string;
    approvedPaths?: string[];
    approvalGrants?: Array<{
        path: string;
        approvedBy?: string | null;
        expiresAt?: string | null;
        revokedAt?: string | null;
        sessionId?: string;
        profileHash?: string;
        planRevision?: number | null;
        brainGeneration?: number | null;
    }>;
    sessionId?: string;
    profileHash?: string;
    planRevision?: number | null;
    brainGeneration?: number | null;
    approvals?: Array<{
        path: string;
        owners: string[];
        approvedBy: string;
    }>;
}): Promise<LocalRepoIntelligenceV2Result>;
//# sourceMappingURL=repo-intelligence-v2.d.ts.map