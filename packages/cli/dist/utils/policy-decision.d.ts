export type PolicyDecision = 'allow' | 'warn' | 'block';
export declare function resolvePolicyDecisionFromViolations(violations: Array<{
    severity: string;
}>): PolicyDecision;
//# sourceMappingURL=policy-decision.d.ts.map