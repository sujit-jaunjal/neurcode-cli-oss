"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENTERPRISE_RUNTIME_SAFETY_V1_POLICY = void 0;
exports.evaluateRuntimeSafetyCheck = evaluateRuntimeSafetyCheck;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
Object.defineProperty(exports, "ENTERPRISE_RUNTIME_SAFETY_V1_POLICY", { enumerable: true, get: function () { return governance_runtime_1.ENTERPRISE_RUNTIME_SAFETY_V1_POLICY; } });
function evaluateRuntimeSafetyCheck(input) {
    const policy = (0, governance_runtime_1.parseRuntimeSafetyPolicyProfile)(input.policy ?? input.profile?.runtimeConfig?.runtimeSafetyPolicy);
    const phase = input.phase ?? 'implementation';
    const classifierInput = {
        filePath: input.filePath,
        sensitiveBoundaries: input.profile?.sensitiveBoundaries,
        ownershipBoundaries: input.profile?.ownershipBoundaries,
        approvalRequiredGlobs: input.profile?.approvalRequiredPaths ?? [],
        sensitiveGlobs: input.profile?.sensitiveBoundaries.map((b) => b.glob) ?? [],
        allowedGlobs: input.allowedGlobs,
        approvedPaths: input.approvedPaths,
    };
    const classification = (0, governance_runtime_1.classifyRuntimeSafetySurface)(classifierInput);
    const credential = input.proposedContent != null
        ? (0, governance_runtime_1.evaluateCredentialPreWrite)({
            filePath: input.filePath,
            proposedContent: input.proposedContent,
            policyAction: (0, governance_runtime_1.resolvePolicyActionForFamily)('credential_or_secret', policy),
        })
        : null;
    const dependency = input.proposedContent != null &&
        classification.primaryFamily === 'dependency_supply_chain'
        ? (0, governance_runtime_1.classifyDependencyManifestChange)({
            filePath: input.filePath,
            previousContent: input.previousContent,
            proposedContent: input.proposedContent,
            policyAction: (0, governance_runtime_1.resolvePolicyActionForFamily)('dependency_supply_chain', policy),
        })
        : null;
    const effectivePolicy = {
        ...policy,
        planMode: input.planMode ?? input.profile?.runtimeConfig?.planMode ?? policy.planMode,
    };
    const enforcement = (0, governance_runtime_1.resolveRuntimeSafetyEnforcement)({
        classification,
        credential,
        dependency,
        policy: effectivePolicy,
        phase,
        planFiles: input.planFiles,
    });
    return { classification, credential, dependency, enforcement, policy: effectivePolicy };
}
//# sourceMappingURL=runtime-safety-check.js.map