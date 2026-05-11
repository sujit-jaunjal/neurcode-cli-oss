/**
 * PR Review Compression
 *
 * Converts full governance output into a concise, actionable summary
 * that reduces reviewer cognitive load.
 *
 * Target output: 3–7 lines covering the operationally significant changes.
 */
export interface CompressionInput {
    blockingCount: number;
    advisoryCount: number;
    suppressedCount: number;
    structuralViolations: Array<{
        ruleId: string;
        ruleName: string;
        severity: string;
        filePath: string;
        line: number;
        operationalRisk: string;
        determinism: string;
    }>;
    intentDomains: string[];
    blastRadius: {
        filesChanged: number;
        riskLevel: 'low' | 'medium' | 'high';
        modulesAffected: string[];
    };
    aiDebtDelta: number;
    verdict: 'PASS' | 'FAIL' | 'WARN';
    planId: string | null;
    provenanceRunId: string | null;
    deterministicSignals?: number;
}
export interface CompressedReview {
    /** One-line verdict */
    headline: string;
    /** 2–5 bullet points, each under 100 chars */
    bullets: string[];
    /** Severity: how urgent is reviewer attention? */
    urgency: 'none' | 'low' | 'medium' | 'high' | 'critical';
    /** Terminal-formatted string */
    terminal: string;
    /** GitHub markdown (< 500 chars) */
    markdown: string;
}
/**
 * Generate a compressed review summary from full governance output.
 */
export declare function generateCompressedReview(input: CompressionInput): CompressedReview;
//# sourceMappingURL=index.d.ts.map