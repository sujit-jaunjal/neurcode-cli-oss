import type { ConsequenceTopFinding, StructuralUnderstandingArtifact } from './structural-understanding';
export interface InFlowConsequenceNudge {
    nudgeKey: string;
    severity: 'high' | 'medium';
    headline: string;
    finding: ConsequenceTopFinding;
    surfacedFindings: ConsequenceTopFinding[];
    artifactHash: string;
    provenance: 'deterministic-static';
}
export declare function consequenceNudgesEnabled(env?: NodeJS.ProcessEnv): boolean;
export declare function selectInFlowConsequenceNudges(artifact: StructuralUnderstandingArtifact, options?: {
    max?: number;
}): InFlowConsequenceNudge[];
export declare function isHighTrustInFlowFinding(finding: ConsequenceTopFinding): boolean;
export declare function formatInFlowConsequenceNudge(finding: ConsequenceTopFinding): string;
export declare function nudgeKey(artifactHash: string, finding: ConsequenceTopFinding): string;
//# sourceMappingURL=consequence-nudges.d.ts.map