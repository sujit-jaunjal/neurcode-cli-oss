import type { SuppressedViolation } from './suppressions';
import type { SeverityAdjustment } from './context-severity';
export type { SuppressedViolation } from './suppressions';
export type { SeverityAdjustment } from './context-severity';
export type DeterminismLevel = 'deterministic-structural' | 'deterministic-semantic' | 'heuristic-advisory' | 'llm-assisted-planning';
export type RuleSeverity = 'BLOCKING' | 'ADVISORY';
export type RuleLanguage = 'typescript' | 'python' | 'javascript';
export interface StructuralViolation {
    ruleId: string;
    ruleName: string;
    policyRef: string;
    severity: RuleSeverity;
    filePath: string;
    line: number;
    column: number;
    evidence: string;
    operationalRisk: string;
    remediation: string;
    determinism: DeterminismLevel;
    confidence: number;
    language: RuleLanguage;
}
export interface StructuralRuleResult {
    violations: StructuralViolation[];
    filesAnalyzed: number;
    analysisMs: number;
    rulesApplied: string[];
    skippedFiles: string[];
    suppressedCount: number;
    suppressedViolations: SuppressedViolation[];
    severityAdjustments: SeverityAdjustment[];
}
export interface StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: RuleSeverity;
    languages: RuleLanguage[];
    description: string;
    /** Check a single file's source text. Returns violations found. */
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=types.d.ts.map