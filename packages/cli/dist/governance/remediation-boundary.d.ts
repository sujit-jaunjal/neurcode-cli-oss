/**
 * Remediation Boundary Enforcement (Phase 4)
 *
 * Validates that a remediation suggestion respects strict boundaries:
 *   - Same language as the finding
 *   - Same package/subsystem boundary (inferred from file path)
 *   - No cross-frontend/backend boundary crossings
 *
 * If no safe remediation can be proposed within these constraints, returns
 * the sentinel string "No safe remediation suggestion available." which is
 * preferable to misleading cross-boundary guidance.
 *
 * This is a deterministic, pure-function module — no I/O, no LLM.
 */
import type { RuleLanguage } from '../structural-rules/types';
export interface RemediationBoundaryInput {
    /** The file path where the violation was found */
    findingFilePath: string;
    /** The language of the finding */
    findingLanguage: RuleLanguage | string;
    /** The proposed target file for the remediation */
    targetFilePath: string;
    /** The language the remediation targets (if known) */
    targetLanguage?: RuleLanguage | string;
}
export interface BoundaryCheckResult {
    allowed: boolean;
    reason: string;
    /** Sentinel value when no safe remediation is possible */
    safeRemediationUnavailable?: boolean;
}
/**
 * Validate whether a remediation suggestion crosses acceptable boundaries.
 *
 * Enforcement rules (in priority order):
 * 1. Language boundary: finding language must match target language
 *    Exception: typescript ↔ javascript is allowed (same ecosystem)
 * 2. Frontend/backend boundary: must not cross unless explicitly linked
 * 3. Infrastructure boundary: infra files cannot be remediation targets for
 *    application-layer findings
 */
export declare function validateRemediationBoundary(input: RemediationBoundaryInput): BoundaryCheckResult;
/**
 * The sentinel string returned when no safe remediation is available.
 * Consumers MUST check for this exact string and suppress remediation output.
 */
export declare const NO_SAFE_REMEDIATION: "No safe remediation suggestion available.";
/**
 * Wrap a remediation string with boundary validation.
 *
 * Returns the original remediation if the boundary is safe, or the
 * NO_SAFE_REMEDIATION sentinel if the boundary is violated.
 */
export declare function boundedRemediation(input: RemediationBoundaryInput, remediation: string): string;
//# sourceMappingURL=remediation-boundary.d.ts.map