"use strict";
/**
 * Runtime Guard Stage
 * -------------------
 * Validates the runtime guard artifact against the actual diff. Pure wrapper
 * around `readRuntimeGuardArtifact` + `evaluateRuntimeGuardArtifact` from
 * `utils/runtime-guard`.
 *
 * SEMANTIC PRESERVATION:
 *   The `RuntimeGuardEvaluation` returned here is byte-identical to what
 *   verify.ts produces inline. This stage adds lineage + fingerprinting only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeGuardStage = void 0;
const runtime_guard_1 = require("../../../utils/runtime-guard");
const fingerprint_1 = require("../fingerprint");
exports.runtimeGuardStage = {
    id: 'runtime-guard',
    determinism: 'deterministic-structural',
    boundary: {
        isolateFailure: true,
        required: false,
        dependencies: ['diff-normalization'],
    },
    description: 'Validate runtime guard artifact against diff; report out-of-scope files and constraint violations.',
    execute(input) {
        const read = (0, runtime_guard_1.readRuntimeGuardArtifact)(input.projectRoot, input.guardPath);
        if (!read.artifact) {
            return {
                path: read.path,
                exists: read.exists,
                artifact: null,
                error: read.error,
                evaluation: null,
            };
        }
        const evaluation = (0, runtime_guard_1.evaluateRuntimeGuardArtifact)(read.artifact, input.diffFiles, input.fileContents);
        return {
            path: read.path,
            exists: read.exists,
            artifact: read.artifact,
            evaluation,
        };
    },
    fingerprintInput(input) {
        return (0, fingerprint_1.fingerprintStageSignal)({
            guardPath: input.guardPath ?? null,
            files: input.diffFiles.map(f => f.path).sort(),
        });
    },
    fingerprintOutput(output) {
        return (0, fingerprint_1.fingerprintStageSignal)({
            exists: output.exists,
            expectedFilesFingerprint: output.artifact?.expectedFilesFingerprint ?? null,
            compiledPolicyFingerprint: output.artifact?.source?.compiledPolicyFingerprint ?? null,
            passed: output.evaluation?.pass ?? null,
            violationCount: output.evaluation?.violations.length ?? 0,
            outOfScopeFileCount: output.evaluation?.outOfScopeFiles.length ?? 0,
        });
    },
    outputItemCount(output) {
        return output.evaluation?.violations.length ?? 0;
    },
};
//# sourceMappingURL=runtime-guard-stage.js.map