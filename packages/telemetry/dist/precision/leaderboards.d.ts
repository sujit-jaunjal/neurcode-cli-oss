import type { GovernanceTelemetryEnvelope } from '../contracts';
export interface RulePrecisionRollup {
    ruleId: string;
    triggerCount: number;
    suppressionCount: number;
    suppressionRate: number;
}
export interface TelemetryRollup {
    verifyCompletedEvents: number;
    ruleRollups: RulePrecisionRollup[];
}
/**
 * Aggregate rule-level signals from governance.verify.completed events only.
 * Deterministic: rules sorted by ruleId for stable output order.
 */
export declare function rollupRulePrecisionFromEvents(events: GovernanceTelemetryEnvelope[]): TelemetryRollup;
/** Higher score = more noise (suppressions relative to triggers). */
export declare function noisyRuleLeaderboard(rollup: TelemetryRollup, limit?: number): RulePrecisionRollup[];
/** Higher score = fewer suppressions per trigger (reviewer trust proxy). */
export declare function highTrustRuleLeaderboard(rollup: TelemetryRollup, limit?: number): RulePrecisionRollup[];
