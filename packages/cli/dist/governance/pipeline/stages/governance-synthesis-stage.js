"use strict";
/**
 * Governance Synthesis Stage
 * --------------------------
 * Wraps `attachCanonicalGovernance` — the single canonical pipeline entry point
 * that converts heterogeneous raw violations into the deterministic
 * `GovernanceVerificationEnvelope`. After attachment, each finding is stamped
 * with its computation-graph stage of origin (inferred from `sourceSystem`).
 *
 * SEMANTIC PRESERVATION:
 *   - The envelope structure, finding IDs, replay checksum, and ordering
 *     produced by `attachCanonicalGovernance` are preserved BYTE-FOR-BYTE.
 *   - Lineage stamping writes ONLY into `provenanceMetadata.producedByStage`,
 *     which is excluded from the canonical finding identity and from the
 *     replay-checksum input. Verified in `canonical-invariants.ts`.
 *
 *   This stage is therefore observability-additive: removing the stamp call
 *   restores byte-for-byte identical output.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.stampFindingLineage = exports.governanceSynthesisStage = void 0;
exports.synthesizeGovernance = synthesizeGovernance;
const canonical_pipeline_1 = require("../../canonical-pipeline");
const fingerprint_1 = require("../fingerprint");
const lineage_1 = require("../lineage");
Object.defineProperty(exports, "stampFindingLineage", { enumerable: true, get: function () { return lineage_1.stampFindingLineage; } });
const summary_1 = require("../summary");
const types_1 = require("../types");
/**
 * Map a canonical sourceSystem to the stage in the pipeline that emitted it.
 * Used for inferring lineage when stages did not stamp directly.
 */
function inferStageFromSourceSystem(source) {
    switch (source) {
        case 'structural-rules':
            return 'structural-analysis';
        case 'policy-engine':
            return 'policy-evaluation';
        case 'intent-engine':
            return 'intent-evaluation';
        case 'governance-runtime':
            return 'runtime-guard';
        case 'replay-runtime':
            return 'replay-integrity';
        case 'semantic-index':
            return 'semantic-analysis';
        case 'ci-adapter':
            return 'ci-shaping';
        case 'pilot-metrics':
            return 'telemetry-harvest';
        case 'workspace-federation':
        default:
            return 'governance-synthesis';
    }
}
exports.governanceSynthesisStage = {
    id: 'governance-synthesis',
    determinism: 'deterministic-structural',
    boundary: {
        ...types_1.STRICT_REQUIRED_BOUNDARY,
        dependencies: ['structural-analysis'],
    },
    description: 'Build canonical GovernanceVerificationEnvelope from raw violations; stamp findings with computation-graph lineage.',
    execute(input) {
        return synthesizeGovernance(input.payload);
    },
    fingerprintInput(input) {
        const p = input.payload;
        return (0, fingerprint_1.fingerprintStageSignal)({
            structuralCount: Array.isArray(p.structuralViolations) ? p.structuralViolations.length : 0,
            policyCount: Array.isArray(p.violations) ? p.violations.length : 0,
            intentCount: Array.isArray(p.intentIssues) ? p.intentIssues.length : 0,
            flowCount: Array.isArray(p.flowIssues) ? p.flowIssues.length : 0,
            regressionCount: Array.isArray(p.regressions) ? p.regressions.length : 0,
            planId: typeof p.planId === 'string' ? p.planId : null,
        });
    },
    fingerprintOutput(output) {
        // Output fingerprint is the envelope's replay checksum (already deterministic
        // and computed from canonical sorted findings). This keeps the stage's
        // replay fingerprint and the envelope's checksum in lockstep.
        return output.envelope.replayChecksum;
    },
    outputItemCount(output) {
        return output.findings.length;
    },
};
/**
 * Pure helper: synthesize the canonical governance envelope from a verify
 * payload, then stamp computation-graph lineage onto every finding.
 *
 * Identical to `governanceSynthesisStage.execute({ payload })` but callable
 * without a pipeline context. Use this from verify.ts code paths that emit
 * canonical JSON directly (early-exit branches, etc.).
 *
 * Guarantee: this function preserves the byte identity of the canonical
 * envelope produced by `attachCanonicalGovernance`. Lineage stamping only
 * writes to `provenanceMetadata.producedByStage`, which is excluded from
 * the finding identity and from `replayChecksum`.
 */
function synthesizeGovernance(payload, options = {}) {
    const enriched = (0, canonical_pipeline_1.attachCanonicalGovernance)(payload);
    const envelope = enriched.governanceVerification;
    if (!envelope) {
        throw new Error('governance-synthesis invariant violated: attachCanonicalGovernance did not attach an envelope');
    }
    for (const f of envelope.findings) {
        const inferred = inferStageFromSourceSystem(f.sourceSystem);
        if (!f.provenanceMetadata) {
            f.provenanceMetadata = { producedByStage: inferred };
        }
        else if (!f.provenanceMetadata.producedByStage) {
            f.provenanceMetadata.producedByStage = inferred;
        }
    }
    // Optional: attach pipeline-summary observability to the envelope. This
    // additive surface is excluded from finding identity and from replayChecksum
    // by design (see canonical-finding.ts and canonical-invariants.ts), so it
    // cannot perturb replay drift detection.
    if (options.pipelineLedger && options.pipelineLedger.length > 0) {
        envelope.pipelineSummary = (0, summary_1.buildPipelineSummary)(options.pipelineLedger);
    }
    return {
        payload: enriched,
        envelope,
        findings: envelope.findings,
    };
}
//# sourceMappingURL=governance-synthesis-stage.js.map