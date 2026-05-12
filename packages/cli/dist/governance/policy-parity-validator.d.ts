/**
 * Policy Enforcement Parity Validator
 *
 * Closes the governance theatre gap: a policy can appear in policy.yml
 * claiming "deterministic" enforcement, but have zero structural rule
 * implementation. This validator surfaces those mismatches explicitly.
 *
 * Benchmark finding (Apache Airflow, 2026-05-12):
 *   7 of 15 policies were unenforced. Enterprise teams believed those
 *   policies were being checked. They were not.
 *
 * This module is called from `neurcode verify --policy-only` to emit
 * GOV_PARITY_MISMATCH advisory findings for every enforcement gap.
 */
export type EnforcementType = 'deterministic' | 'advisory' | 'semantic' | 'none';
export interface PolicyParityEntry {
    ruleId: string;
    name?: string;
    enforcementType: EnforcementType;
    hasStructuralImpl: boolean;
    hasPolicyEngineImpl: boolean;
}
export interface PolicyParityReport {
    totalPolicies: number;
    deterministicCount: number;
    advisoryCount: number;
    semanticCount: number;
    noneCount: number;
    /** Percentage of policies with deterministic structural enforcement (0-100) */
    coveragePct: number;
    /** Policies claiming deterministic but with no registered implementation */
    unenforced: string[];
    /** All entries with full detail */
    entries: PolicyParityEntry[];
}
export interface ParityMismatchFinding {
    ruleId: string;
    policyName?: string;
    message: string;
    severity: 'advisory';
    governanceCode: 'GOV_PARITY_MISMATCH';
}
/**
 * Validate enforcement parity between policy declarations and the structural rule engine.
 *
 * @param policyRules - Rules from the compiled/loaded policy (array of { id, name, enforcementType? })
 * @param registeredStructuralRuleIds - Set of rule IDs currently registered in StructuralRuleEngine
 * @returns PolicyParityReport + mismatch findings (one per unenforced deterministic policy)
 */
export declare function validatePolicyEnforcementParity(policyRules: Array<{
    id: string;
    name?: string;
    enforcementType?: string;
}>, registeredStructuralRuleIds: Set<string>): {
    report: PolicyParityReport;
    findings: ParityMismatchFinding[];
};
/**
 * Generate a compact governance coverage summary string for CLI output.
 */
export declare function formatParityReport(report: PolicyParityReport): string;
//# sourceMappingURL=policy-parity-validator.d.ts.map