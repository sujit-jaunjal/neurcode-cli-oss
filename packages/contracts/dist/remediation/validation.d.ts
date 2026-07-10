/**
 * RemediationValidationResult — output of the deterministic patch validation pipeline.
 *
 * The validation pipeline is always deterministic:
 *   - syntax validation uses the TypeScript/Python parser
 *   - scope validation checks file paths and line counts
 *   - governance validation re-runs the original structural rule
 *   - postcondition validation checks regex patterns
 *
 * LLM output is NEVER trusted without passing this pipeline.
 * A failed validation does not modify any files.
 */
export interface RemediationSyntaxCheckResult {
    valid: boolean;
    errors: string[];
    /** True when the parser was available; false when check was skipped. */
    checkerAvailable: boolean;
}
export interface RemediationScopeCheckResult {
    valid: boolean;
    /** Files in the patch that are outside ModificationBoundary.allowedFiles. */
    outOfScopeFiles: string[];
    /** True when line count changes exceed boundary limits. */
    lineLimitExceeded: boolean;
    /** True when new imports were added in violation of noNewImports boundary. */
    newImportsAdded: boolean;
    details: string[];
}
export interface RemediationGovernanceCheckResult {
    /**
     * True when re-running the original structural rule on the patched file
     * produces zero violations for the specific ruleId.
     */
    originalFindingResolved: boolean;
    /** Any new structural violations introduced by the patch. */
    newViolationsIntroduced: string[];
    /** True when re-running governance found no regressions. */
    noRegressions: boolean;
    details: string[];
}
export interface RemediationPostconditionCheckResult {
    postconditionId: string;
    passed: boolean;
    verificationMethod: string;
    detail: string;
}
/**
 * Immutable receipt created by the validation pipeline.
 * Stored as a governance artifact — append-only.
 */
export interface RemediationValidationReceipt {
    schemaVersion: '2026-05-11.1';
    receiptId: string;
    /** Links to GovernanceRemediationRequest.requestId. */
    requestId: string;
    /** Links to GovernanceRemediationResponse.responseId. */
    responseId: string;
    validatedAt: string;
    /** SHA-256 of the response patchDiff (for replay integrity). */
    patchDiffHash: string;
    /** SHA-256 of the patched file content (after applying diff). */
    patchedContentHash?: string;
    /** Overall validation verdict. */
    verdict: 'approved' | 'rejected' | 'requires-review';
    /** Human-readable summary of the validation result. */
    summary: string;
}
export interface RemediationValidationResult {
    schemaVersion: '2026-05-11.1';
    /** Overall: true only when all blocking checks pass. */
    valid: boolean;
    /** Whether the patch can be applied safely (valid + no new governance violations). */
    safeToApply: boolean;
    /** True when the original governance finding is resolved by the patch. */
    findingResolved: boolean;
    syntax: RemediationSyntaxCheckResult;
    scope: RemediationScopeCheckResult;
    governance: RemediationGovernanceCheckResult;
    postconditions: RemediationPostconditionCheckResult[];
    /** All blocking errors that prevent application. */
    blockingErrors: string[];
    /** Non-blocking warnings for engineer review. */
    warnings: string[];
    /** Immutable audit receipt. */
    receipt: RemediationValidationReceipt;
}
//# sourceMappingURL=validation.d.ts.map