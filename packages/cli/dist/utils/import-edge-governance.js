"use strict";
/**
 * Deterministic import-edge governance orchestrator.
 *
 * Glues the extractor + classifier into a single replay-stable surface that
 * verify.ts can consume. Every output array is sorted canonically and
 * deduplicated; identical inputs always produce identical output bytes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateImportEdgeGovernance = evaluateImportEdgeGovernance;
const import_edge_extractor_1 = require("./import-edge-extractor");
const import_edge_classifier_1 = require("./import-edge-classifier");
/**
 * Evaluate import-edge governance for the given diff against the given
 * intent context. Pure, deterministic, replay-stable.
 */
function evaluateImportEdgeGovernance(input) {
    const edges = (0, import_edge_extractor_1.canonicalizeEdges)((0, import_edge_extractor_1.extractImportEdgesFromDiff)(input.diffFiles));
    const findings = [];
    const dedupe = new Set();
    for (const edge of edges) {
        const finding = (0, import_edge_classifier_1.classifyImportEdge)(edge, input.projectRoot, input.intent);
        if (!finding)
            continue;
        const key = `${finding.sourceFile}|${finding.importTarget}|${finding.resolvedBoundary}|${finding.policy}`;
        if (dedupe.has(key))
            continue;
        dedupe.add(key);
        findings.push(finding);
    }
    findings.sort((a, b) => {
        if (a.sourceFile !== b.sourceFile)
            return a.sourceFile < b.sourceFile ? -1 : 1;
        if (a.resolvedBoundary !== b.resolvedBoundary)
            return a.resolvedBoundary < b.resolvedBoundary ? -1 : 1;
        if (a.importTarget !== b.importTarget)
            return a.importTarget < b.importTarget ? -1 : 1;
        if (a.sourceLine !== b.sourceLine)
            return a.sourceLine - b.sourceLine;
        return 0;
    });
    const blockingFindingCount = findings.filter((f) => f.governanceSeverity === 'blocking').length;
    const advisoryFindingCount = findings.filter((f) => f.governanceSeverity === 'advisory').length;
    const observedBoundaryTypes = Array.from(new Set(findings.map((f) => f.boundaryType))).sort();
    const observedPolicies = Array.from(new Set(findings.map((f) => f.policy))).sort();
    return {
        edges,
        findings,
        edgeCount: edges.length,
        blockingFindingCount,
        advisoryFindingCount,
        observedBoundaryTypes,
        observedPolicies,
    };
}
//# sourceMappingURL=import-edge-governance.js.map