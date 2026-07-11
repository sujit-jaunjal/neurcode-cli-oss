"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.progressiveDecisionAuthority = progressiveDecisionAuthority;
const contracts_1 = require("@neurcode-ai/contracts");
/**
 * Canonical decision provenance. Callers may choose advisory instead of unknown
 * only when a non-enforcing signal exists; the evidence itself never upgrades.
 */
function progressiveDecisionAuthority(input) {
    const evidence = (0, contracts_1.normalizeProgressiveAuthorityEvidence)(input.evidence);
    const evaluated = (0, contracts_1.evaluateProgressiveAuthorityRequirement)({ evidence, requirement: input.requirement });
    return {
        truth: evaluated.deterministic ? 'deterministic' : input.advisorySignal ? 'advisory' : 'unknown',
        requirement: input.requirement,
        authorityCeiling: evidence.authorityCeiling,
        state: evidence.state,
        repositoryFingerprint: evidence.repositoryFingerprint,
        graphGeneration: evidence.graphGeneration,
        semanticSliceId: evidence.semanticSliceId,
        planFingerprint: evidence.planFingerprint,
        reasonCodes: evaluated.reasonCodes,
        sourceFree: true,
    };
}
//# sourceMappingURL=progressive-authority.js.map