import { type ProgressiveAuthorityEvidence, type ProgressiveAuthorityRequirement } from '@neurcode-ai/contracts';
export type ProgressiveDecisionTruth = 'deterministic' | 'advisory' | 'unknown';
export interface ProgressiveDecisionAuthority {
    truth: ProgressiveDecisionTruth;
    requirement: ProgressiveAuthorityRequirement;
    authorityCeiling: ProgressiveAuthorityEvidence['authorityCeiling'];
    state: ProgressiveAuthorityEvidence['state'];
    repositoryFingerprint: string | null;
    graphGeneration: number | null;
    semanticSliceId: string | null;
    planFingerprint: string | null;
    reasonCodes: string[];
    sourceFree: true;
}
/**
 * Canonical decision provenance. Callers may choose advisory instead of unknown
 * only when a non-enforcing signal exists; the evidence itself never upgrades.
 */
export declare function progressiveDecisionAuthority(input: {
    evidence: ProgressiveAuthorityEvidence;
    requirement: ProgressiveAuthorityRequirement;
    advisorySignal?: boolean;
}): ProgressiveDecisionAuthority;
//# sourceMappingURL=progressive-authority.d.ts.map