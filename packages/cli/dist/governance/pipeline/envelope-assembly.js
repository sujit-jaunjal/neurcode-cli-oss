"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPolicyOnlyCanonicalPayload = buildPolicyOnlyCanonicalPayload;
exports.buildVerifyCanonicalPayload = buildVerifyCanonicalPayload;
/**
 * Assemble the policy-only canonical payload. Replaces the inline literal
 * previously at `commands/verify.ts:2685–2724`.
 *
 * Field order is preserved byte-for-byte from the prior implementation so
 * `JSON.stringify` output (and therefore stdout writes, evidence captures,
 * and any string-equality fixtures) remains identical.
 */
function buildPolicyOnlyCanonicalPayload(input) {
    return {
        grade: input.grade,
        score: input.score,
        verdict: input.verdict,
        violations: input.violations,
        message: input.message,
        scopeGuardPassed: true, // N/A in policy-only mode
        bloatCount: 0,
        bloatFiles: [],
        plannedFilesModified: 0,
        totalPlannedFiles: 0,
        adherenceScore: input.score,
        structuralViolations: input.structuralViolations,
        structuralRulesApplied: input.structuralRulesApplied,
        structuralSuppressedCount: input.structuralSuppressedCount,
        mode: 'policy_only',
        policyOnly: true,
        policyOnlySource: input.source,
        replayChecksum: input.replayChecksum,
        replayMode: 'local-structural',
        ...input.governancePayload,
        policyLock: {
            enforced: input.policyLock.enforced,
            matched: input.policyLock.matched,
            path: input.policyLock.path,
            mismatches: input.policyLock.mismatches,
        },
        policyExceptions: input.policyExceptions,
        policyGovernance: input.policyGovernance,
        ...(input.policyPack
            ? {
                policyPack: {
                    id: input.policyPack.id,
                    name: input.policyPack.name,
                    version: input.policyPack.version,
                    ruleCount: input.policyPack.ruleCount,
                },
            }
            : {}),
    };
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
function buildVerifyCanonicalPayload(input) {
    const payload = {
        grade: input.grade,
        score: input.score,
        verdict: input.verdict,
        violations: input.violations,
        message: input.message,
        adherenceScore: input.score,
        scopeGuardPassed: input.scopeGuardPassed,
        bloatCount: input.bloatCount,
        bloatFiles: input.bloatFiles,
        plannedFilesModified: input.plannedFilesModified,
        totalPlannedFiles: input.totalPlannedFiles,
        verificationSource: input.verificationSource,
        structuralViolations: input.structuralViolations,
        structuralRulesApplied: input.structuralRulesApplied,
        structuralSuppressedCount: input.structuralSuppressedCount,
        mode: 'plan_enforced',
        policyOnly: false,
        aiDebt: input.aiDebt,
        changeContract: input.changeContract,
        ...(input.compiledPolicyMetadata ? { policyCompilation: input.compiledPolicyMetadata } : {}),
        ...(input.governancePayload || {}),
        policyLock: {
            enforced: input.policyLock.enforced,
            matched: input.policyLock.matched,
            path: input.policyLock.path,
            mismatches: input.policyLock.mismatches,
        },
        policyExceptions: input.policyExceptions,
        policyGovernance: input.policyGovernance,
        intentProof: input.intentProof,
        ...(input.runtimeGuard && input.runtimeGuard.required
            ? { runtimeGuard: input.runtimeGuard }
            : {}),
        ...(input.policyDecision !== undefined ? { policyDecision: input.policyDecision } : {}),
        ...(input.policyPack
            ? {
                policyPack: {
                    id: input.policyPack.id,
                    name: input.policyPack.name,
                    version: input.policyPack.version,
                    ruleCount: input.policyPack.ruleCount,
                },
            }
            : {}),
    };
    return payload;
}
//# sourceMappingURL=envelope-assembly.js.map