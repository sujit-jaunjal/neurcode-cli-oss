export type DeterministicConstraintSource = 'intent' | 'policy';
export interface DeterministicConstraintRule {
    id: string;
    source: DeterministicConstraintSource;
    statement: string;
    displayName: string;
    pattern: RegExp;
    matchToken: string;
    provenance?: DeterministicConstraintProvenance;
    pathIncludePatterns?: string[];
    pathExcludePatterns?: string[];
    pathIncludes?: RegExp[];
    pathExcludes?: RegExp[];
    minMatchesPerFile?: number;
    maxMatchesPerFile?: number;
    evaluationMode?: 'added_lines' | 'full_file' | 'signature_delta';
    evaluationScope?: 'file' | 'repo';
}
export interface DeterministicConstraintProvenance {
    why: string;
    evidence: string[];
    contributingGraphPaths: string[];
    trustBoundaries: string[];
}
export interface DeterministicConstraintCompilation {
    rules: DeterministicConstraintRule[];
    unmatchedStatements: string[];
}
export interface DeterministicConstraintCompilationInput {
    intentConstraints?: string;
    policyRules?: string[];
}
export declare function compileDeterministicConstraints(input: DeterministicConstraintCompilationInput): DeterministicConstraintCompilation;
//# sourceMappingURL=constraints.d.ts.map