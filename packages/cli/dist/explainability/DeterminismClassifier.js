"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeterminismClassifier = void 0;
/**
 * Classifies governance signals by their determinism level.
 * Every signal surfaced to users must declare its determinism class.
 * This is non-negotiable: engineers must know if a finding is
 * AST-proven or heuristic-advised.
 */
class DeterminismClassifier {
    /**
     * Returns a human-readable trust label for a determinism class.
     */
    static label(d) {
        switch (d) {
            case 'deterministic-structural':
                return 'AST-verified (100% deterministic)';
            case 'deterministic-semantic':
                return 'Pattern-matched (fully reproducible)';
            case 'heuristic-advisory':
                return 'Heuristic (low false-positive risk)';
            case 'llm-assisted-planning':
                return 'LLM-assisted (planning only, not enforcement)';
        }
    }
    /**
     * Returns an icon for terminal/markdown display.
     */
    static icon(d) {
        switch (d) {
            case 'deterministic-structural':
                return '⚙️';
            case 'deterministic-semantic':
                return '🔍';
            case 'heuristic-advisory':
                return '⚡';
            case 'llm-assisted-planning':
                return '🤖';
        }
    }
    /**
     * Returns the trust tier (1 = highest trust, 4 = lowest).
     */
    static tier(d) {
        switch (d) {
            case 'deterministic-structural':
                return 1;
            case 'deterministic-semantic':
                return 2;
            case 'heuristic-advisory':
                return 3;
            case 'llm-assisted-planning':
                return 4;
        }
    }
    /**
     * Aggregate determinism stats across a set of violations.
     * Returns counts per class and an overall trust score (0-100).
     */
    static aggregate(violations) {
        const counts = {
            'deterministic-structural': 0,
            'deterministic-semantic': 0,
            'heuristic-advisory': 0,
            'llm-assisted-planning': 0,
        };
        if (violations.length === 0) {
            return { counts, trustScore: 100, falsePositiveRisk: 'low' };
        }
        for (const v of violations) {
            counts[v.determinism] += 1;
        }
        // Trust score: weighted average of tier scores scaled to 0-100.
        // Tier 1 (structural) = 100 pts, tier 2 = 75, tier 3 = 40, tier 4 = 10.
        // Also factor in confidence per violation.
        const tierWeight = {
            'deterministic-structural': 100,
            'deterministic-semantic': 75,
            'heuristic-advisory': 40,
            'llm-assisted-planning': 10,
        };
        let totalWeight = 0;
        for (const v of violations) {
            totalWeight += tierWeight[v.determinism] * v.confidence;
        }
        const trustScore = Math.round(totalWeight / violations.length);
        // False-positive risk based on composition
        const heuristicAndLLM = counts['heuristic-advisory'] + counts['llm-assisted-planning'];
        const heuristicRatio = heuristicAndLLM / violations.length;
        let falsePositiveRisk;
        if (heuristicRatio >= 0.5) {
            falsePositiveRisk = 'high';
        }
        else if (heuristicRatio >= 0.2) {
            falsePositiveRisk = 'medium';
        }
        else {
            falsePositiveRisk = 'low';
        }
        return { counts, trustScore, falsePositiveRisk };
    }
}
exports.DeterminismClassifier = DeterminismClassifier;
//# sourceMappingURL=DeterminismClassifier.js.map