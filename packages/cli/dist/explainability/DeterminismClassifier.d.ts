import type { DeterminismClass } from './types';
/**
 * Classifies governance signals by their determinism level.
 * Every signal surfaced to users must declare its determinism class.
 * This is non-negotiable: engineers must know if a finding is
 * AST-proven or heuristic-advised.
 */
export declare class DeterminismClassifier {
    /**
     * Returns a human-readable trust label for a determinism class.
     */
    static label(d: DeterminismClass): string;
    /**
     * Returns an icon for terminal/markdown display.
     */
    static icon(d: DeterminismClass): string;
    /**
     * Returns the trust tier (1 = highest trust, 4 = lowest).
     */
    static tier(d: DeterminismClass): 1 | 2 | 3 | 4;
    /**
     * Aggregate determinism stats across a set of violations.
     * Returns counts per class and an overall trust score (0-100).
     */
    static aggregate(violations: Array<{
        determinism: DeterminismClass;
        confidence: number;
    }>): {
        counts: Record<DeterminismClass, number>;
        trustScore: number;
        falsePositiveRisk: 'low' | 'medium' | 'high';
    };
}
//# sourceMappingURL=DeterminismClassifier.d.ts.map