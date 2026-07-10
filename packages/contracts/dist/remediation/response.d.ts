/**
 * GovernanceRemediationResponse — the structured output from an external remediation provider.
 *
 * IMPORTANT:
 *   - This is ADVISORY. It must never be applied without engineer approval.
 *   - Governance re-verification (neurcode verify) is required after application.
 *   - The response is not a governance verdict — it is a suggestion.
 */
/**
 * A verifiable condition the patch must satisfy for the finding to be resolved.
 * Generated deterministically from the structural rule — not by an LLM.
 */
export interface RemediationPostcondition {
    /** Unique identifier for this postcondition. */
    id: string;
    /** Human-readable description. */
    description: string;
    /**
     * Verification method:
     *   structural-re-run     → re-run the original structural rule; violation must be absent
     *   pattern-absent        → the violating pattern must not appear in the patched file
     *   pattern-present       → a required pattern must appear (e.g. "throw err")
     *   syntax-valid          → file must parse without TypeScript/Python syntax errors
     *   scope-within-boundary → all changes must be within allowed modification boundary
     */
    verificationMethod: 'structural-re-run' | 'pattern-absent' | 'pattern-present' | 'syntax-valid' | 'scope-within-boundary';
    /** For pattern-based methods: the pattern to check (regex string). */
    pattern?: string;
    /** Whether failing this postcondition is blocking (true) or advisory (false). */
    blocking: boolean;
}
export interface RemediationProviderMetadata {
    /** Stable provider identifier (e.g. "cursor", "claude-3-5-sonnet", "codex"). */
    providerId: string;
    /** Human-readable provider name. */
    providerName: string;
    /** Model version if applicable. */
    modelVersion?: string;
    /** Total input tokens used (for cost tracking). */
    inputTokens?: number;
    /** Total output tokens generated. */
    outputTokens?: number;
    /** Wall-clock time from prompt send to response receive (ms). */
    latencyMs?: number;
}
/**
 * GovernanceRemediationResponse — structured output from remediation provider.
 *
 * Invariants:
 *   1. requestId must match the GovernanceRemediationRequest this responds to.
 *   2. patchDiff must be a valid unified diff (--- a/... +++ b/... format).
 *   3. This object is not applied automatically — engineer approval required.
 *   4. Governance re-verification must run after any application.
 */
export interface GovernanceRemediationResponse {
    /** Fixed schema version. */
    schemaVersion: '2026-05-11.1';
    /** Unique ID for this response. */
    responseId: string;
    /** Links to GovernanceRemediationRequest.requestId. */
    requestId: string;
    /** ISO 8601 generation timestamp. */
    createdAt: string;
    /** Provider that generated this response. */
    provider: RemediationProviderMetadata;
    /**
     * Unified diff of the proposed fix.
     * Format: git-compatible unified diff (--- a/... +++ b/...).
     * Empty when no patch could be generated (see status).
     */
    patchDiff: string;
    /**
     * Full patched file content (after applying patchDiff).
     * Included when the provider returns full content.
     * Optional — validation can work from patchDiff alone.
     */
    patchedContent?: string;
    /**
     * Response status:
     *   generated       → patch successfully produced
     *   no-fix-needed   → provider determined no change required
     *   unable-to-fix   → provider could not generate a valid fix
     *   out-of-scope    → provider declined (change would exceed modification boundary)
     */
    status: 'generated' | 'no-fix-needed' | 'unable-to-fix' | 'out-of-scope';
    /** Provider's explanation of the fix (or why no fix was generated). */
    explanation: string;
    /** Provider's self-reported confidence (0–1). Advisory — not used for governance. */
    providerConfidence: number;
    /** True when the provider flags this for mandatory human review. */
    requiresManualReview: boolean;
    /** Postconditions the patch should satisfy (copied from request, for validation reference). */
    postconditions: RemediationPostcondition[];
    /**
     * Raw prompt used to generate this response.
     * Included for auditability — engineers can inspect exactly what was sent.
     */
    promptUsed?: string;
}
//# sourceMappingURL=response.d.ts.map