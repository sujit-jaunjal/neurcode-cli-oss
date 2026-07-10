"use strict";
/**
 * Canonical Governance Pipeline Contracts
 * ----------------------------------------
 * Shared, immutable types describing the staged decomposition of the verify runtime.
 *
 * These contracts are ADDITIVE. They do not replace, mutate, or re-encode the canonical
 * governance envelope (`GovernanceVerificationEnvelope`), the finding identity scheme,
 * or the replay checksum. Stage metadata flows alongside the envelope as an
 * out-of-band observability + replay-reconstruction surface.
 *
 * Design invariants:
 *   - Stage IDs are a closed set. Adding a new stage requires bumping the schema version.
 *   - Stage metadata never carries excerpts, file content, or PII.
 *   - Stage fingerprints are computed from stable identifiers — never wall-clock timestamps.
 *   - A stage's `replay.outputFingerprint` is independent of `replayChecksum`; the two
 *     are consistent but serve different audiences (stage lineage vs. envelope identity).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOVERNANCE_STAGE_ORDER = exports.GOVERNANCE_PIPELINE_SCHEMA_VERSION = void 0;
exports.isGovernanceStageId = isGovernanceStageId;
exports.GOVERNANCE_PIPELINE_SCHEMA_VERSION = '2026-05-14.1';
/**
 * Type guard: is the given string a known stage identifier?
 */
function isGovernanceStageId(value) {
    return exports.GOVERNANCE_STAGE_ORDER.includes(value);
}
/**
 * Canonical execution order. Mirror of the union above — exported as a runtime
 * value for iteration, indexing, and stage-ordering invariants.
 */
exports.GOVERNANCE_STAGE_ORDER = [
    'diff-normalization',
    'plan-sync',
    'policy-lock',
    'compiled-policy',
    'policy-exceptions',
    'structural-analysis',
    'runtime-guard',
    'intent-evaluation',
    'semantic-analysis',
    'policy-evaluation',
    'suppression-evaluation',
    'advisory-signals',
    'change-contract',
    'ai-debt-budget',
    'governance-synthesis',
    'provenance-generation',
    'replay-integrity',
    'remediation-export-preparation',
    'evidence-generation',
    'telemetry-harvest',
    'ci-shaping',
    'output-rendering',
];
//# sourceMappingURL=pipeline.js.map