/**
 * Deterministic import-edge classifier.
 *
 * Pure path arithmetic — no AST, no filesystem walks beyond explicit
 * candidate-file existence checks, no probability. Same input always
 * produces the same output.
 *
 * The classifier takes an `ImportEdge`, resolves it to one or more candidate
 * repository paths, and matches those candidates against:
 *   - the explicit `forbiddenBoundaries` declared by the intent contract
 *   - the existing path-boundary classifier (generated-code, infra, ci,
 *     dependency-manifest, sensitive)
 *
 * Only edges whose target falls within a forbidden boundary OR a
 * `review-required` boundary OR a generated-code path produce findings.
 * Edges that resolve to unrelated, unflagged paths are silently skipped —
 * they are signal-free.
 */
import type { ImportEdge, ImportLanguage } from './import-edge-extractor';
export type ImportEdgeSeverity = 'blocking' | 'advisory';
export type ImportEdgePolicy = 'forbidden' | 'review-required' | 'generated-code';
export type ImportEdgeBoundaryType = 'sensitive' | 'infra' | 'ci' | 'dependency-manifest' | 'service' | 'module' | 'generated-code' | 'unspecified';
export interface ImportEdgeFinding {
    /** The diff file that introduced the new import. */
    sourceFile: string;
    /** 1-based line number where the import appeared. */
    sourceLine: number;
    /** Verbatim authored target text (e.g. `airflow.providers.celery.executors.celery_executor`). */
    importTarget: string;
    /** Repository-relative path the target resolved to, when known. */
    resolvedTargetPath: string;
    /** The forbidden-boundary or classifier path that matched. */
    resolvedBoundary: string;
    /** Boundary classification carried into the canonical envelope. */
    boundaryType: ImportEdgeBoundaryType;
    /** Governance policy applied to the edge. */
    policy: ImportEdgePolicy;
    /** Derived severity (forbidden → blocking, review-required → advisory). */
    governanceSeverity: ImportEdgeSeverity;
    /** Human reason copied from the intent boundary, when available. */
    reason: string;
    /** Edge kind echoed from the extractor (static / relative / dynamic / require / side-effect). */
    edgeKind: 'static' | 'relative' | 'dynamic' | 'require' | 'side-effect';
    language: ImportLanguage;
    /** Guarantee markers — never inferred, always literal. */
    deterministic: true;
    replayStable: true;
}
export interface IntentForbiddenBoundary {
    type: string;
    path: string;
    policy: 'forbidden' | 'review-required' | 'allowed';
    reason?: string;
}
export interface IntentApprovedScope {
    files: readonly string[];
    modules: readonly string[];
    services: readonly string[];
}
export interface IntentContextSnapshot {
    approvedScope: IntentApprovedScope;
    forbiddenBoundaries: readonly IntentForbiddenBoundary[];
}
/** Candidate repository-relative paths for an import edge, in priority order. */
export declare function candidatePathsForEdge(edge: ImportEdge, projectRoot: string, intent: IntentContextSnapshot): string[];
/**
 * Resolve an edge to a single ImportEdgeFinding, or null if the edge is
 * either unresolvable or resolves outside any flagged boundary.
 *
 * Resolution priority:
 *   1. Explicit `forbiddenBoundaries` (forbidden first, then review-required)
 *   2. Path-boundary classifier (generated-code only — other classifier
 *      categories are diagnostic but not auto-blocking for imports)
 */
export declare function classifyImportEdge(edge: ImportEdge, projectRoot: string, intent: IntentContextSnapshot): ImportEdgeFinding | null;
//# sourceMappingURL=import-edge-classifier.d.ts.map