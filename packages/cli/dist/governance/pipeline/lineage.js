"use strict";
/**
 * Governance computation lineage helpers.
 *
 * Stamps a `producedByStage` lineage marker onto canonical findings without
 * mutating their identity (id, severity, evidence) or replay checksum inputs.
 *
 * Use case: after a stage has emitted a set of findings, call
 * `stampFindingLineage(findings, stageId)` to annotate them. This is purely
 * observability — the canonical pipeline's stripping/sort/dedup logic remains
 * authoritative for what reaches the envelope.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.stampFindingLineage = stampFindingLineage;
exports.groupFindingsByStage = groupFindingsByStage;
/**
 * Mutates each finding in place to attach `provenanceMetadata.producedByStage`.
 * If a finding already has a stage stamp from an earlier wrapper, the existing
 * value is preserved (closest stage wins).
 *
 * Returns the same array reference for chaining.
 */
function stampFindingLineage(findings, stageId) {
    for (const f of findings) {
        if (!f.provenanceMetadata) {
            f.provenanceMetadata = { producedByStage: stageId };
            continue;
        }
        if (!f.provenanceMetadata.producedByStage) {
            f.provenanceMetadata.producedByStage = stageId;
        }
    }
    return findings;
}
/**
 * Read-only view: group findings by the stage that produced them.
 * Findings with no lineage stamp are bucketed under '<unattributed>'.
 */
function groupFindingsByStage(findings) {
    const map = new Map();
    for (const f of findings) {
        const key = f.provenanceMetadata?.producedByStage ?? '<unattributed>';
        const list = map.get(key);
        if (list)
            list.push(f);
        else
            map.set(key, [f]);
    }
    return map;
}
//# sourceMappingURL=lineage.js.map