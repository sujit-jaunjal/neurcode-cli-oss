/**
 * Policy Evaluation Summaries Orchestration
 * ------------------------------------------
 * Extracts the duplicated policy-exception-summary + governance-summary
 * shaping logic previously duplicated at:
 *   - `commands/verify.ts:2610–2709`  (executePolicyOnlyMode)
 *   - `commands/verify.ts:4818–4889`  (verifyCommand main flow)
 *
 * RESPONSIBILITIES (data-pure):
 *   - shape `policyExceptionsSummary` from exceptionDecision + resolution
 *   - shape `policyGovernanceSummary` from governance + audit status
 *   - apply audit-integrity violation to the effective violation list
 *   - apply shouldIgnore filtering to suppressed/blocked violation lists
 *   - compute `policyDecision` from effective violations
 *
 * EXPLICITLY NOT RESPONSIBLE FOR:
 *   - calling `applyPolicyExceptions` (caller owns that before invoking us)
 *   - calling `resolveEffectivePolicyExceptions` (caller owns that)
 *   - rendering (chalk, console.log)
 *   - emitting JSON or exiting
 *
 * SEMANTIC PRESERVATION:
 *   The output shapes are byte-identical to the prior inline implementations.
 *   Field order matches the inline construction so JSON serialization is stable.
 *
 * REPLAY INVARIANT:
 *   - `explainExceptionEligibilityReason` moved from verify.ts (private) to here
 *   - `resolvePolicyDecisionFromViolations` duplicated as a pure local helper to
 *     avoid circular import — semantics are identical
 */
import type { PolicyExceptionDecision, PolicyExceptionEntry } from '../../../utils/policy-exceptions';
/** Narrowed shape from ResolvedPolicyExceptions (verify.ts internal interface). */
export interface PolicyExceptionResolutionSummary {
    mode: 'local' | 'org' | 'org_fallback_local';
    exceptions: PolicyExceptionEntry[];
    localConfigured: number;
    orgConfigured: number;
    warning: string | null;
}
/** Narrowed from governance.exceptionApprovals (OrgGovernanceSettings). */
export interface ExceptionApprovalConfig {
    required: boolean;
    minApprovals: number;
    disallowSelfApproval: boolean;
    allowedApprovers: string[];
    requireReason: boolean;
    minReasonLength: number;
    maxExpiryDays: number;
    criticalRulePatterns: string[];
    criticalMinApprovals: number;
}
/** Narrowed from governance.audit (OrgGovernanceSettings). */
export interface GovernanceAuditConfig {
    requireIntegrity: boolean;
}
/** From PolicyAuditVerification. */
export interface AuditIntegrityData {
    valid: boolean;
    count: number;
    lastHash: string | null;
    issues: string[];
}
export interface PolicyEvaluationSummariesInput {
    /** Result of applyPolicyExceptions — caller is responsible for this call. */
    exceptionDecision: PolicyExceptionDecision;
    /** Result of resolveEffectivePolicyExceptions. */
    policyExceptionResolution: PolicyExceptionResolutionSummary;
    /** Policy violations present BEFORE exception application. */
    policyViolations: Array<{
        file: string;
        rule: string;
        severity: string;
        message?: string;
        line?: number;
    }>;
    /** Governance exception-approval configuration. */
    exceptionApprovals: ExceptionApprovalConfig;
    /** Governance audit configuration. */
    audit: GovernanceAuditConfig;
    /** Audit integrity verification result. */
    auditIntegrity: AuditIntegrityData;
    /** Returns true for file paths to exclude from governance checks. */
    shouldIgnore: (file: string) => boolean;
    /**
     * Canonical path token for the policy audit file entry.
     * Callers use 'neurcode.policy.audit.log.jsonl'.
     */
    policyAuditFile: string;
}
export interface PolicyExceptionsSummary {
    sourceMode: PolicyExceptionResolutionSummary['mode'];
    sourceWarning: string | null;
    localConfigured: number;
    orgConfigured: number;
    configured: number;
    active: number;
    usable: number;
    matched: number;
    suppressed: number;
    blocked: number;
    matchedExceptionIds: string[];
    suppressedViolations: Array<{
        file: string;
        rule: string;
        severity: string;
        message: string | undefined;
        exceptionId: string;
        reason: string;
        expiresAt: string;
        startLine?: number;
    }>;
    blockedViolations: Array<{
        file: string;
        rule: string;
        severity: string;
        message: string | undefined;
        startLine?: number;
    }>;
}
export interface PolicyGovernanceSummary {
    exceptionApprovals: ExceptionApprovalConfig;
    audit: {
        requireIntegrity: boolean;
        valid: boolean;
        issues: string[];
        lastHash: string | null;
        eventCount: number;
    };
}
export interface PolicyEvaluationSummariesResult {
    /** Shaped policy exceptions summary — ready for canonical payload. */
    policyExceptionsSummary: PolicyExceptionsSummary;
    /** Shaped governance audit summary — ready for canonical payload. */
    policyGovernanceSummary: PolicyGovernanceSummary;
    /**
     * Effective policy violations after exception application and audit check:
     * remaining + blocked + (optional audit violation).
     */
    effectivePolicyViolations: Array<{
        file: string;
        rule: string;
        severity: string;
        message?: string;
        line?: number;
    }>;
    /** Formatted blocked violations (subset of effectivePolicyViolations). */
    blockedPolicyViolationItems: Array<{
        file: string;
        rule: string;
        severity: string;
        message: string;
        line?: number;
    }>;
    /** Policy decision derived from effectivePolicyViolations. */
    policyDecision: 'allow' | 'warn' | 'block';
}
/**
 * Build the shaped policy-exception and governance-audit summaries.
 *
 * Replaces the duplicated inline shaping regions in both
 * `executePolicyOnlyMode` and the main `verifyCommand` flow.
 * Does not emit JSON, does not log, does not exit.
 */
export declare function buildPolicyEvaluationSummaries(input: PolicyEvaluationSummariesInput): PolicyEvaluationSummariesResult;
//# sourceMappingURL=policy-evaluation-summaries.d.ts.map