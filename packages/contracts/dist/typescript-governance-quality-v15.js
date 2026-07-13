"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOVERNANCE_PREWRITE_V15_SCHEMA_VERSION = exports.GOVERNANCE_CALIBRATION_V15_SCHEMA_VERSION = void 0;
exports.boundGovernancePreWriteDecisionV15 = boundGovernancePreWriteDecisionV15;
exports.GOVERNANCE_CALIBRATION_V15_SCHEMA_VERSION = 'neurcode.governance-calibration.v1.5';
exports.GOVERNANCE_PREWRITE_V15_SCHEMA_VERSION = 'neurcode.governance-prewrite.v1.5';
function boundGovernancePreWriteDecisionV15(input) {
    const reasons = [];
    let decision;
    let permissionDecision;
    let authority;
    if (input.evidence.structuralProtected && !input.evidence.exactApprovalCurrentContext) {
        decision = 'block';
        permissionDecision = 'deny';
        authority = 'approval_required_denial';
        reasons.push('structural_protected_path', 'approval_required');
        if (input.evidence.approvalContextMismatch)
            reasons.push('approval_context_mismatch');
    }
    else if (input.evidence.structuralProtected && input.evidence.exactApprovalCurrentContext) {
        decision = 'advisory';
        permissionDecision = 'allow';
        authority = 'advisory_evidence';
        reasons.push('structural_protected_path', 'exact_approval_current_context');
    }
    else if (input.evidence.deterministicStructuralBlock) {
        decision = 'block';
        permissionDecision = 'deny';
        authority = 'deterministic_structural_fact';
        reasons.push('deterministic_structural_block');
    }
    else if (input.evidence.semanticState === 'ready'
        && input.evidence.semanticRelevantPlanCoverage === 1
        && !input.evidence.repositoryChanged) {
        decision = input.rawHostProposal ?? 'allow';
        permissionDecision = decision === 'block' || decision === 'unknown' ? 'deny' : 'allow';
        authority = decision === 'advisory' ? 'advisory_evidence' : 'deterministic_semantic_fact';
        reasons.push('semantic_slice_ready');
    }
    else {
        decision = 'unknown';
        permissionDecision = 'deny';
        authority = 'unknown';
        if (input.evidence.repositoryChanged)
            reasons.push('repository_changed');
        const stateReason = {
            ready: 'semantic_partial',
            deadline_exceeded: 'semantic_deadline_exceeded',
            unavailable: 'semantic_unavailable',
            stale: 'semantic_stale',
            partial: 'semantic_partial',
            unsupported: 'semantic_unsupported',
            resource_constrained: 'semantic_resource_constrained',
        };
        reasons.push(stateReason[input.evidence.semanticState], 'missing_evidence_cannot_prove_absence');
    }
    if (input.rawHostProposal && input.rawHostProposal !== decision)
        reasons.push('host_authority_reduced');
    return {
        schemaVersion: exports.GOVERNANCE_PREWRITE_V15_SCHEMA_VERSION,
        decision,
        permissionDecision,
        authority,
        reasonCodes: [...new Set(reasons)],
        rawHostProposal: input.rawHostProposal,
        boundedNeurcodeDecision: decision,
        deadlineMs: Math.max(1, Math.floor(input.deadlineMs)),
        elapsedMs: Math.max(0, Math.floor(input.elapsedMs)),
        evidenceObservedAt: input.evidenceObservedAt ?? new Date().toISOString(),
        provenance: {
            sourceFree: true,
            clientAuthorityTrusted: false,
            graphId: input.evidence.graphId,
            graphGeneration: input.evidence.graphGeneration,
            semanticSliceId: input.evidence.semanticSliceId,
        },
    };
}
//# sourceMappingURL=typescript-governance-quality-v15.js.map