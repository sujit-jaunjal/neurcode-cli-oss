/**
 * Bounded, explainable trust signals — no opaque ML.
 * All outputs are in [0, 1] unless noted.
 */
import type { GovernanceVerifyCompletedPayload } from './contracts';
import type { TelemetryRollup } from './precision/leaderboards';
export interface BoundedTrustScores {
    /** 1 − (suppressed findings / max(1, total findings)) from the last completed verify slice. */
    findingTrustScore: number;
    /** Mean of per-rule (1 − suppressionRate) over rules with ≥1 trigger, from rollups. */
    ruleTrustScore: number;
    /** 1 if replay exact, 0.65 if bounded degradation, 0.5 if unknown/missing. */
    replayTrustScore: number;
    /** Density of blocking findings vs advisory (blocking / max(1, total)). */
    reviewerTrustDensity: number;
    /** Harmonic-style blend of finding + rule trust (operational usefulness proxy). */
    governanceUsefulnessScore: number;
}
export declare function trustFromVerifyPayload(p: GovernanceVerifyCompletedPayload): BoundedTrustScores;
export declare function trustFromRollups(rollup: TelemetryRollup): Pick<BoundedTrustScores, 'ruleTrustScore'>;
