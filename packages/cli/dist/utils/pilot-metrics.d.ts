/**
 * Pilot observability metrics tracker.
 * Stores a rolling 90-day window of governance events.
 * Stored at: .neurcode/pilot-metrics.json
 */
export interface PilotMetricsEntry {
    date: string;
    planCount: number;
    verifyCount: number;
    passCount: number;
    failCount: number;
    blockingCaught: number;
    advisoryCaught: number;
    suppressions: number;
    structuralCaught: number;
    aiDebtDelta: number;
    ruleCounts?: Record<string, number>;
}
export interface PilotMetricsSummary {
    periodDays: number;
    totalVerifyRuns: number;
    totalBlockingCaught: number;
    totalStructuralCaught: number;
    averagePassRate: number;
    suppressionRate: number;
    estimatedFalsePositiveRate: number;
    topViolatedRules: Array<{
        ruleId: string;
        count: number;
    }>;
    aiDebtTrend: 'improving' | 'stable' | 'degrading';
    reportLines: string[];
}
/**
 * Record a verify run into today's metrics entry (upsert).
 */
export declare function recordVerifyRun(repoRoot: string, entry: Omit<PilotMetricsEntry, 'date'>): void;
/**
 * Load last 90 days of pilot metrics entries.
 */
export declare function loadPilotMetrics(repoRoot: string): PilotMetricsEntry[];
/**
 * Compute summary stats for the pilot program over a given number of days.
 */
export declare function generatePilotSummary(repoRoot: string, days?: number): PilotMetricsSummary;
//# sourceMappingURL=pilot-metrics.d.ts.map