import type { ConsequenceImpactGroup, ConsequenceTopFinding, StructuralUnderstandingArtifact } from './structural-understanding';
export interface InFlowConsequenceNudge {
    nudgeVersion: 'v1' | 'v2';
    nudgeKey: string;
    severity: 'high' | 'medium';
    headline: string;
    impact: ConsequenceImpactGroup | null;
    finding: ConsequenceTopFinding;
    surfacedImpacts: ConsequenceImpactGroup[];
    surfacedFindings: ConsequenceTopFinding[];
    artifactHash: string;
    provenance: 'deterministic-static';
}
export declare function consequenceNudgesEnabled(env?: NodeJS.ProcessEnv): boolean;
export declare function selectInFlowConsequenceNudges(artifact: StructuralUnderstandingArtifact, options?: {
    max?: number;
}): InFlowConsequenceNudge[];
export declare function isHighTrustInFlowFinding(finding: ConsequenceTopFinding): boolean;
export declare function isHighTrustInFlowImpact(impact: ConsequenceImpactGroup): boolean;
export declare function formatInFlowImpactNudge(impact: ConsequenceImpactGroup): string;
export declare function formatInFlowConsequenceNudge(finding: ConsequenceTopFinding): string;
export declare function impactNudgeKey(artifactHash: string, impact: ConsequenceImpactGroup): string;
export declare function nudgeKey(artifactHash: string, finding: ConsequenceTopFinding): string;
//# sourceMappingURL=consequence-nudges.d.ts.map