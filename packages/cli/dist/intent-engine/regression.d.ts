/**
 * Regression Detector — compares the current intent engine result against
 * the previously saved state to identify system degradation.
 *
 * This is NOT about detecting new problems.  It answers:
 * "What was working before but is now broken?"
 *
 * All checks are deterministic.  No LLM calls.  No disk I/O — that is
 * handled by state.ts; this module receives pre-loaded data.
 */
import type { IntentState } from './state';
import type { IntentSummary } from './coverage';
import type { FlowIssue } from './flow-validator';
export type RegressionType = 'component-regression' | 'critical-regression' | 'flow-regression' | 'coverage-regression';
export interface RegressionIssue {
    type: RegressionType;
    message: string;
    /** Always 'high' — all regressions are blocking. */
    severity: 'high';
    /** Rule id for deduplication and fix mapping. */
    rule: string;
}
/**
 * Compare the previous saved state against the current engine output and return
 * a deduplicated list of regression issues.
 *
 * Returns [] when:
 * - previousState is null (first run, nothing to compare)
 * - intent text changed significantly (different feature, not a regression)
 */
export declare function detectRegressions(previousState: IntentState | null, currentIntentSummary: IntentSummary | null, currentFlowIssues: FlowIssue[], currentComponentMap: Record<string, string[]>, currentIntentText: string): RegressionIssue[];
//# sourceMappingURL=regression.d.ts.map