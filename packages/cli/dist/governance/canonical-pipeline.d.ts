import type { GovernanceFinding, GovernanceReplayIntegrity, GovernanceVerificationEnvelope } from '@neurcode-ai/contracts';
import type { StructuralViolation } from '../structural-rules/types';
import type { IntentIssue } from '../intent-engine/matcher';
import type { FlowIssue } from '../intent-engine/flow-validator';
import type { RegressionIssue } from '../intent-engine/regression';
import type { RuleViolation } from '@neurcode-ai/policy-engine';
export declare function findingFromStructural(v: StructuralViolation): GovernanceFinding;
export declare function findingFromPolicyEngine(v: RuleViolation): GovernanceFinding;
export declare function findingFromIntentIssue(i: IntentIssue): GovernanceFinding;
export declare function findingFromFlowIssue(f: FlowIssue): GovernanceFinding;
export declare function findingFromRegression(r: RegressionIssue): GovernanceFinding;
export declare function findingFromScope(file: string, message: string): GovernanceFinding;
export declare function findingFromGovernanceConstraint(message: string, fileHint: string): GovernanceFinding;
export declare function buildGovernanceVerificationEnvelope(input: {
    structuralViolations?: StructuralViolation[];
    policyViolations?: RuleViolation[];
    intentIssues?: IntentIssue[];
    flowIssues?: FlowIssue[];
    regressions?: RegressionIssue[];
    scopeFiles?: Array<{
        file: string;
        message?: string;
    }>;
    constraintMessages?: Array<{
        message: string;
        file?: string;
    }>;
    provenance?: GovernanceFinding['provenanceMetadata'];
}): GovernanceVerificationEnvelope;
/**
 * Merge canonical governance envelope onto a verify JSON payload (mutates copy).
 */
export declare function attachCanonicalGovernance(payload: Record<string, unknown>): Record<string, unknown>;
export declare function evaluateGovernanceReplayIntegrity(input: {
    evidencePayload: Record<string, unknown>;
    reconstructedPayload?: Record<string, unknown>;
}): GovernanceReplayIntegrity;
//# sourceMappingURL=canonical-pipeline.d.ts.map