import type { StructuralViolation } from '../structural-rules';
export type PolicyViolationRow = {
    rule: string;
    file: string;
    severity: string;
    message?: string;
    line?: number;
    /** Phase 4: language of the original finding — required for remediation boundary checks. */
    language?: string;
};
/**
 * Append structural violations to policy-engine rows so verdicts and JSON violations stay aligned.
 * Dedupes identical structural rule + file + line.
 *
 * @deprecated The canonical pipeline (`buildGovernanceVerificationEnvelope`) is the single
 * aggregation point. Prefer passing `structuralViolations` directly rather than merging here.
 * Structural rows merged here are stripped by `stripStructuralPolicyRows()` in the pipeline
 * to prevent duplicate GovernanceFinding objects. This function is kept for backward compat
 * with existing callers that rely on the combined `violations` array for non-canonical output.
 */
export declare function mergeStructuralIntoPolicyViolations(policyViolations: PolicyViolationRow[], structuralViolations: StructuralViolation[]): void;
//# sourceMappingURL=structural-policy-merge.d.ts.map