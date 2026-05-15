"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPolicyEvaluationSummaries = buildPolicyEvaluationSummaries;
// ── Private helpers ───────────────────────────────────────────────────────────
/**
 * Maps an eligibility-reason code to a human-readable message.
 * Moved from verify.ts:1940 (was private, only used in the regions being extracted).
 */
function explainExceptionEligibilityReason(reason) {
    switch (reason) {
        case 'reason_required':
            return 'exception reason does not meet governance minimum length';
        case 'duration_exceeds_max':
            return 'exception expiry window exceeds governance maximum duration';
        case 'approval_required':
            return 'exception exists but approvals are required';
        case 'critical_approvals_required':
            return 'critical rule exception requires additional independent approvals';
        case 'insufficient_approvals':
            return 'exception exists but approval threshold is not met';
        case 'self_approval_only':
            return 'exception only has requester self-approval';
        case 'approver_not_allowed':
            return 'exception approvals are from non-allowlisted approvers';
        default:
            return 'exception is inactive or expired';
    }
}
/** Pure decision helper — identical semantics to verify.ts:1924. */
function policyDecisionFromViolations(violations) {
    let hasWarn = false;
    for (const v of violations) {
        const sev = String(v.severity || '').toLowerCase();
        if (sev === 'block')
            return 'block';
        if (sev === 'warn')
            hasWarn = true;
    }
    return hasWarn ? 'warn' : 'allow';
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Build the shaped policy-exception and governance-audit summaries.
 *
 * Replaces the duplicated inline shaping regions in both
 * `executePolicyOnlyMode` and the main `verifyCommand` flow.
 * Does not emit JSON, does not log, does not exit.
 */
function buildPolicyEvaluationSummaries(input) {
    const { exceptionDecision, policyExceptionResolution, policyViolations, exceptionApprovals, audit, auditIntegrity, shouldIgnore, policyAuditFile, } = input;
    // ── Filter suppressed/blocked by shouldIgnore ─────────────────────────────
    const suppressedViolations = exceptionDecision.suppressedViolations.filter((item) => !shouldIgnore(item.file));
    const blockedPolicyViolationItems = exceptionDecision.blockedViolations
        .filter((item) => !shouldIgnore(item.file))
        .map((item) => ({
        file: item.file,
        rule: item.rule,
        severity: 'block',
        message: `Exception ${item.exceptionId} cannot be applied: ${explainExceptionEligibilityReason(item.eligibilityReason)}` +
            (item.requiredApprovals > 0
                ? ` (approvals ${item.effectiveApprovals}/${item.requiredApprovals}${item.critical ? ', critical rule gate' : ''})`
                : ''),
        ...(item.line != null ? { line: item.line } : {}),
    }));
    // ── Effective violations = remaining + blocked (after ignore filtering) ───
    let effectivePolicyViolations = [
        ...exceptionDecision.remainingViolations.filter((item) => !shouldIgnore(item.file)),
        ...blockedPolicyViolationItems,
    ];
    // ── Audit integrity violation (additive when enforcement enabled) ─────────
    if (audit.requireIntegrity && !auditIntegrity.valid) {
        effectivePolicyViolations.push({
            file: policyAuditFile,
            rule: 'policy_audit_integrity',
            severity: 'block',
            message: `Policy audit chain is invalid: ${auditIntegrity.issues.join('; ') || 'unknown issue'}`,
        });
    }
    const policyDecision = policyDecisionFromViolations(effectivePolicyViolations);
    // ── policyExceptionsSummary (field order matches prior inline) ────────────
    const policyExceptionsSummary = {
        sourceMode: policyExceptionResolution.mode,
        sourceWarning: policyExceptionResolution.warning,
        localConfigured: policyExceptionResolution.localConfigured,
        orgConfigured: policyExceptionResolution.orgConfigured,
        configured: policyExceptionResolution.exceptions.length,
        active: exceptionDecision.activeExceptions.length,
        usable: exceptionDecision.usableExceptions.length,
        matched: exceptionDecision.matchedExceptionIds.length,
        suppressed: suppressedViolations.length,
        blocked: blockedPolicyViolationItems.length,
        matchedExceptionIds: exceptionDecision.matchedExceptionIds,
        suppressedViolations: suppressedViolations.map((item) => ({
            file: item.file,
            rule: item.rule,
            severity: item.severity,
            message: item.message,
            exceptionId: item.exceptionId,
            reason: item.reason,
            expiresAt: item.expiresAt,
            ...(item.line != null ? { startLine: item.line } : {}),
        })),
        blockedViolations: blockedPolicyViolationItems.map((item) => ({
            file: item.file,
            rule: item.rule,
            severity: item.severity,
            message: item.message,
            ...(item.line != null ? { startLine: item.line } : {}),
        })),
    };
    // ── policyGovernanceSummary (field order matches prior inline) ────────────
    const policyGovernanceSummary = {
        exceptionApprovals,
        audit: {
            requireIntegrity: audit.requireIntegrity,
            valid: auditIntegrity.valid,
            issues: auditIntegrity.issues,
            lastHash: auditIntegrity.lastHash,
            eventCount: auditIntegrity.count,
        },
    };
    return {
        policyExceptionsSummary,
        policyGovernanceSummary,
        effectivePolicyViolations,
        blockedPolicyViolationItems,
        policyDecision,
    };
}
//# sourceMappingURL=policy-evaluation-summaries.js.map