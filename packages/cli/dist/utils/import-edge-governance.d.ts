/**
 * Deterministic import-edge governance orchestrator.
 *
 * Glues the extractor + classifier into a single replay-stable surface that
 * verify.ts can consume. Every output array is sorted canonically and
 * deduplicated; identical inputs always produce identical output bytes.
 */
import type { DiffFile } from '@neurcode-ai/diff-parser';
import { type ImportEdge } from './import-edge-extractor';
import { type ImportEdgeFinding, type IntentContextSnapshot } from './import-edge-classifier';
export type { ImportEdge } from './import-edge-extractor';
export type { ImportEdgeFinding, IntentContextSnapshot, IntentApprovedScope, IntentForbiddenBoundary, ImportEdgePolicy, ImportEdgeBoundaryType, ImportEdgeSeverity, } from './import-edge-classifier';
export interface ImportEdgeGovernanceInput {
    diffFiles: readonly DiffFile[];
    projectRoot: string;
    intent: IntentContextSnapshot;
}
export interface ImportEdgeGovernanceResult {
    /** All import edges extracted from the added diff lines (canonical order). */
    edges: ImportEdge[];
    /** Edges that resolved into a flagged boundary, canonicalised + deduped. */
    findings: ImportEdgeFinding[];
    /** Convenience counts so callers do not have to recompute. */
    edgeCount: number;
    blockingFindingCount: number;
    advisoryFindingCount: number;
    /** A sorted, unique list of observed boundary types — useful for capability envelopes. */
    observedBoundaryTypes: string[];
    /** A sorted, unique list of observed policies — useful for capability envelopes. */
    observedPolicies: string[];
}
/**
 * Evaluate import-edge governance for the given diff against the given
 * intent context. Pure, deterministic, replay-stable.
 */
export declare function evaluateImportEdgeGovernance(input: ImportEdgeGovernanceInput): ImportEdgeGovernanceResult;
//# sourceMappingURL=import-edge-governance.d.ts.map