/**
 * Shared canonical-payload assembly.
 *
 * Both `verifyCommand` and `executePolicyOnlyMode` build a "canonical payload"
 * — the dict that becomes the verify JSON output (and, via
 * `synthesizeGovernance`, the canonical governance envelope).
 *
 * The two orchestrators previously inlined this assembly with mostly-identical
 * fields and small mode-specific differences. This module extracts the
 * shared core into a single helper that takes a typed input describing the
 * mode-specific extras.
 *
 * Replay invariant:
 *   The resulting payload, after `synthesizeGovernance`, MUST produce the same
 *   `replayChecksum` it did under the prior inline implementation, for any
 *   given input. The fields that contribute to the checksum (canonical sorted
 *   findings) flow through `payload.structuralViolations` and the various
 *   issue arrays — exactly as before.
 *
 * What this module does NOT do:
 *   - It does not emit JSON.
 *   - It does not call `synthesizeGovernance` (caller does that).
 *   - It does not finalize evidence (caller does that).
 *   - It does not record telemetry (caller does that).
 *   - It is not a generic builder pattern; it is a typed extraction of a
 *     duplicated literal-object construction.
 */
import type { StructuralViolation } from '../../structural-rules/types';
import type { PolicyOnlySource } from './shared-types';
/**
 * Minimal "governance payload" surface — the parts of the canonical payload
 * that are produced by the governance evaluator and threaded into both modes.
 * Caller passes in an opaque object; we spread it.
 */
export type GovernancePayloadFragment = Record<string, unknown>;
/**
 * Policy-pack fragment — present when an installed pack contributed rules.
 */
export interface PolicyPackFragment {
    id: string;
    name: string;
    version: string;
    ruleCount: number;
}
export interface PolicyLockSummaryFragment {
    enforced: boolean;
    matched: boolean;
    path: string;
    mismatches: ReadonlyArray<unknown>;
}
export interface PolicyOnlyCanonicalPayloadInput {
    grade: string;
    score: number;
    verdict: string;
    message: string;
    violations: ReadonlyArray<unknown>;
    structuralViolations: ReadonlyArray<StructuralViolation>;
    structuralRulesApplied: ReadonlyArray<string>;
    structuralSuppressedCount: number;
    source: PolicyOnlySource;
    replayChecksum: string;
    governancePayload: GovernancePayloadFragment;
    policyLock: PolicyLockSummaryFragment;
    policyExceptions: unknown;
    policyGovernance: unknown;
    policyPack?: PolicyPackFragment | null;
}
/**
 * Assemble the policy-only canonical payload. Replaces the inline literal
 * previously at `commands/verify.ts:2685–2724`.
 *
 * Field order is preserved byte-for-byte from the prior implementation so
 * `JSON.stringify` output (and therefore stdout writes, evidence captures,
 * and any string-equality fixtures) remains identical.
 */
export declare function buildPolicyOnlyCanonicalPayload(input: PolicyOnlyCanonicalPayloadInput): Record<string, unknown>;
/**
 * AI-debt summary fragment — pass-through; consumed by buildAiDebtReportViolations
 * in the caller. The verify.ts payload includes this as an explicit `aiDebt` key.
 */
export type AiDebtSummaryFragment = unknown;
/** Change-contract summary fragment — pass-through. */
export type ChangeContractSummaryFragment = unknown;
/** Compiled policy metadata fragment — pass-through. */
export type CompiledPolicyMetadataFragment = Record<string, unknown> | null;
/** Runtime guard summary fragment — pass-through. */
export interface RuntimeGuardSummaryFragment {
    required: boolean;
    [key: string]: unknown;
}
/** Intent proof summary fragment — pass-through. */
export type IntentProofSummaryFragment = unknown;
/** Policy decision fragment — pass-through, only emitted when violations exist. */
export type PolicyDecisionFragment = unknown;
export interface VerifyCanonicalPayloadInput {
    grade: string;
    score: number;
    verdict: string;
    message: string;
    violations: ReadonlyArray<unknown>;
    scopeGuardPassed: boolean;
    bloatCount: number;
    bloatFiles: ReadonlyArray<string>;
    plannedFilesModified: number;
    totalPlannedFiles: number;
    verificationSource: string;
    structuralViolations: ReadonlyArray<StructuralViolation>;
    structuralRulesApplied: ReadonlyArray<string>;
    structuralSuppressedCount: number;
    aiDebt: AiDebtSummaryFragment;
    changeContract: ChangeContractSummaryFragment;
    compiledPolicyMetadata: CompiledPolicyMetadataFragment;
    governancePayload: GovernancePayloadFragment | undefined;
    policyLock: PolicyLockSummaryFragment;
    policyExceptions: unknown;
    policyGovernance: unknown;
    intentProof: IntentProofSummaryFragment;
    runtimeGuard?: RuntimeGuardSummaryFragment | null;
    policyDecision?: PolicyDecisionFragment;
    policyPack?: PolicyPackFragment | null;
}
/**
 * Assemble the main-flow (plan_enforced) canonical payload. Twin of
 * `buildPolicyOnlyCanonicalPayload` for the verifyCommand main path.
 * Replaces the inline literal previously at `commands/verify.ts:5542–5585`.
 *
 * Field order MUST be preserved byte-for-byte from the prior inline
 * implementation. Replay consumers (audit dashboards, action JSON parsers)
 * may depend on JSON serialization order.
 */
export declare function buildVerifyCanonicalPayload(input: VerifyCanonicalPayloadInput): Record<string, unknown>;
//# sourceMappingURL=envelope-assembly.d.ts.map