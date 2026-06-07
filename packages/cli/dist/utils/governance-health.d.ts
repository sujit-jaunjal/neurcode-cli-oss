export declare const GOVERNANCE_HEALTH_SCHEMA_VERSION: "neurcode.governance-health.v1";
export type GovernanceHealthVerdict = 'governed' | 'cooperative_only' | 'gate_only' | 'ungoverned';
export interface GovernanceHealthCheck {
    id: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
}
export interface GovernanceHealthReport {
    schemaVersion: typeof GOVERNANCE_HEALTH_SCHEMA_VERSION;
    ok: boolean;
    verdict: GovernanceHealthVerdict;
    repoRoot: string;
    summary: string;
    checks: GovernanceHealthCheck[];
    remediation: string[];
}
export declare function evaluateGovernanceHealth(dir?: string): GovernanceHealthReport;
//# sourceMappingURL=governance-health.d.ts.map