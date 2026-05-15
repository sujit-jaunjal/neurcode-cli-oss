/**
 * Policy Lock Stage
 * -----------------
 * Verifies the policy lock fingerprint against the currently-resolved policy
 * snapshot. This is a thin wrapper around `evaluatePolicyLock` from
 * `utils/policy-packs` — it preserves all existing semantics and only adds
 * stage lineage, fingerprinting, and replay receipts.
 *
 * SEMANTIC PRESERVATION:
 *   The output `enforced`, `matched`, `lockPresent`, `lockPath`, and
 *   `mismatches[]` fields are produced by `evaluatePolicyLock` directly —
 *   they MUST be identical to the values verify.ts records inline.
 */
import { type PolicyLockMismatch, type PolicyStateSnapshot } from '../../../utils/policy-packs';
import type { GovernancePipelineStage } from '../types';
export interface PolicyLockInput {
    projectRoot: string;
    currentSnapshot: PolicyStateSnapshot;
    requireLock: boolean;
    skipLock: boolean;
}
export interface PolicyLockOutput {
    enforced: boolean;
    matched: boolean;
    lockPresent: boolean;
    lockPath: string;
    mismatches: PolicyLockMismatch[];
    skipped: boolean;
}
export declare const policyLockStage: GovernancePipelineStage<PolicyLockInput, PolicyLockOutput>;
//# sourceMappingURL=policy-lock-stage.d.ts.map