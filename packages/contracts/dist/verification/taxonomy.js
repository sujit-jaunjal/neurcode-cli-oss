"use strict";
/**
 * Canonical determinism taxonomy — every governance finding MUST map to exactly one.
 * Do not blur or infer across these buckets in consumer UIs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOVERNANCE_FINDINGS_SCHEMA_VERSION = void 0;
exports.isDeterminismClassification = isDeterminismClassification;
exports.GOVERNANCE_FINDINGS_SCHEMA_VERSION = '2026-05-11.1';
function isDeterminismClassification(value) {
    return (value === 'deterministic-structural'
        || value === 'deterministic-semantic'
        || value === 'heuristic-advisory'
        || value === 'llm-assisted-planning');
}
//# sourceMappingURL=taxonomy.js.map