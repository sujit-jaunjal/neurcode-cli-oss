"use strict";
/**
 * Compiled Policy Stage
 * ---------------------
 * Loads the compiled policy artifact (signed JSON) from disk, exposes its
 * fingerprint, and reports load/parse failures via stage status. Pure wrapper
 * around `readCompiledPolicyArtifact` from `utils/policy-compiler`.
 *
 * SEMANTIC PRESERVATION:
 *   The returned `artifact` and `error` fields are byte-identical to what
 *   `readCompiledPolicyArtifact` returns inline. Signature verification and
 *   strict-artifact-mode policy live in verify.ts — this stage only loads.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.compiledPolicyStage = void 0;
const policy_compiler_1 = require("../../../utils/policy-compiler");
const fingerprint_1 = require("../fingerprint");
exports.compiledPolicyStage = {
    id: 'compiled-policy',
    determinism: 'deterministic-structural',
    boundary: {
        isolateFailure: true, // loading the compiled artifact is best-effort; verify.ts handles strict mode
        required: false,
        dependencies: [],
    },
    description: 'Load compiled policy artifact and expose its fingerprint for replay lineage.',
    execute(input) {
        const result = (0, policy_compiler_1.readCompiledPolicyArtifact)(input.projectRoot, input.compiledPolicyPath);
        return {
            path: result.path,
            exists: result.exists,
            artifact: result.artifact ?? null,
            error: result.error,
            fingerprint: result.artifact?.fingerprint ?? null,
        };
    },
    fingerprintInput(input) {
        return (0, fingerprint_1.fingerprintStageSignal)({
            compiledPolicyPath: input.compiledPolicyPath ?? null,
        });
    },
    fingerprintOutput(output) {
        return (0, fingerprint_1.fingerprintStageSignal)({
            exists: output.exists,
            fingerprint: output.fingerprint,
            hasError: Boolean(output.error),
        });
    },
    outputItemCount(output) {
        return output.artifact?.compilation?.deterministicRules?.length ?? 0;
    },
};
//# sourceMappingURL=compiled-policy-stage.js.map