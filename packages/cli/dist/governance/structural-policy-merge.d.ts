import type { StructuralViolation } from '../structural-rules';
export type PolicyViolationRow = {
    rule: string;
    file: string;
    severity: string;
    message?: string;
    line?: number;
};
/**
 * Append structural violations to policy-engine rows so verdicts and JSON violations stay aligned.
 * Dedupes identical structural rule + file + line.
 */
export declare function mergeStructuralIntoPolicyViolations(policyViolations: PolicyViolationRow[], structuralViolations: StructuralViolation[]): void;
//# sourceMappingURL=structural-policy-merge.d.ts.map