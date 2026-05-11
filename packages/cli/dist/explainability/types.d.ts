export type DeterminismClass = 'deterministic-structural' | 'deterministic-semantic' | 'heuristic-advisory' | 'llm-assisted-planning';
export interface ExplainedViolation {
    violationId: string;
    ruleId: string;
    ruleName: string;
    policyRef: string;
    severity: 'BLOCKING' | 'ADVISORY';
    filePath: string;
    line: number;
    column: number;
    evidence: {
        codeSnippet: string;
        astNodeType: string;
        matchReason: string;
    };
    operationalRisk: string;
    worstCase: string;
    remediation: string;
    remediationCode?: string;
    determinism: DeterminismClass;
    confidence: number;
    language: string;
}
export interface ViolationReport {
    generatedAt: string;
    repoRoot: string;
    totalViolations: number;
    blocking: ExplainedViolation[];
    advisory: ExplainedViolation[];
    byFile: Record<string, ExplainedViolation[]>;
    byRule: Record<string, ExplainedViolation[]>;
    byDeterminism: Record<DeterminismClass, number>;
    deterministicCount: number;
    heuristicCount: number;
    falsePositiveRisk: 'low' | 'medium' | 'high';
}
//# sourceMappingURL=types.d.ts.map