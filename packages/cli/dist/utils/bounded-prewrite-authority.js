"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOVERNANCE_PREWRITE_DEADLINE_MS = void 0;
exports.evaluateBoundedPreWriteAuthority = evaluateBoundedPreWriteAuthority;
const contracts_1 = require("@neurcode-ai/contracts");
const brain_1 = require("@neurcode-ai/brain");
exports.GOVERNANCE_PREWRITE_DEADLINE_MS = 2_000;
function evaluateBoundedPreWriteAuthority(input) {
    const nowMs = input.nowMs ?? Date.now();
    const elapsedMs = Math.max(0, nowMs - input.startedAtMs);
    const reference = input.session.contract.brainGeneration;
    let semanticState = 'unavailable';
    let relevantPlanCoverage = null;
    let graphId = reference?.graphId ?? null;
    let graphGeneration = reference?.generation ?? null;
    let semanticSliceId = reference?.semanticSliceId ?? null;
    let repositoryChanged = false;
    if (elapsedMs >= exports.GOVERNANCE_PREWRITE_DEADLINE_MS) {
        semanticState = 'deadline_exceeded';
    }
    else if (reference) {
        const current = (0, brain_1.readProgressiveAuthority)(input.repoRoot);
        relevantPlanCoverage = current.relevantPlanCoverage;
        graphGeneration = current.graphGeneration ?? reference.generation;
        semanticSliceId = current.semanticSliceId;
        repositoryChanged = Boolean(reference.repositoryFingerprint
            && current.repositoryFingerprint
            && reference.repositoryFingerprint !== current.repositoryFingerprint) || (current.graphGeneration !== null && current.graphGeneration !== reference.generation);
        if (current.state === 'semantic_slice_ready' || current.state === 'fully_enriched') {
            semanticState = current.relevantPlanCoverage === 1 ? 'ready' : 'partial';
        }
        else if (current.state === 'stale') {
            semanticState = 'stale';
        }
        else if (current.state === 'failed' || current.state === 'unavailable') {
            semanticState = 'unavailable';
        }
        else if (current.state === 'semantic_slice_pending' || current.state === 'background_enrichment') {
            semanticState = 'resource_constrained';
        }
        else {
            semanticState = 'partial';
        }
    }
    return (0, contracts_1.boundGovernancePreWriteDecisionV15)({
        rawHostProposal: input.rawDecision,
        deadlineMs: exports.GOVERNANCE_PREWRITE_DEADLINE_MS,
        elapsedMs,
        evidence: {
            deterministicStructuralBlock: input.deterministicStructuralBlock,
            structuralProtected: input.structuralProtected,
            exactApprovalCurrentContext: input.exactApprovalCurrentContext,
            semanticState,
            semanticRelevantPlanCoverage: relevantPlanCoverage,
            repositoryChanged,
            graphId,
            graphGeneration,
            semanticSliceId,
        },
    });
}
//# sourceMappingURL=bounded-prewrite-authority.js.map