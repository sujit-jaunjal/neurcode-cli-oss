"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.policyLockStage = void 0;
const policy_packs_1 = require("../../../utils/policy-packs");
const fingerprint_1 = require("../fingerprint");
const types_1 = require("../types");
exports.policyLockStage = {
    id: 'policy-lock',
    determinism: 'deterministic-structural',
    boundary: {
        ...types_1.STRICT_REQUIRED_BOUNDARY,
        dependencies: ['diff-normalization'],
    },
    description: 'Compare resolved policy snapshot against the policy lock file; report fingerprint mismatches.',
    execute(input) {
        if (input.skipLock) {
            return {
                enforced: false,
                matched: true,
                lockPresent: false,
                lockPath: '',
                mismatches: [],
                skipped: true,
            };
        }
        const validation = (0, policy_packs_1.evaluatePolicyLock)(input.projectRoot, input.currentSnapshot, {
            requireLock: input.requireLock,
        });
        return {
            enforced: validation.enforced,
            matched: validation.matched,
            lockPresent: validation.lockPresent,
            lockPath: validation.lockPath,
            mismatches: [...validation.mismatches],
            skipped: false,
        };
    },
    fingerprintInput(input) {
        return (0, fingerprint_1.fingerprintStageSignal)({
            requireLock: input.requireLock,
            skipLock: input.skipLock,
            snapshotFingerprint: input.currentSnapshot.effective?.fingerprint ?? null,
        });
    },
    fingerprintOutput(output) {
        return (0, fingerprint_1.fingerprintStageSignal)({
            enforced: output.enforced,
            matched: output.matched,
            lockPresent: output.lockPresent,
            skipped: output.skipped,
            mismatchCodes: output.mismatches.map(m => m.code).sort(),
        });
    },
    outputItemCount(output) {
        return output.mismatches.length;
    },
};
//# sourceMappingURL=policy-lock-stage.js.map