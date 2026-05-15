/**
 * Architectural Drift Detector — deterministic, bounded, explainable.
 *
 * Given an intent graph (declared architecture) and a diff (proposed change),
 * the detector answers: *did this change introduce a dependency edge that
 * violates the declared architecture?*
 *
 * Algorithm (entirely deterministic):
 *   1. Classify each diff-file into a layer using `firstMatchingGlob` over the
 *      contract's `layers[].glob`. First match wins. Files with no matching
 *      layer are "unclassified" and surface as soft findings (not violations).
 *   2. Extract import edges from added lines via `extractImportEdgesFromDiff`.
 *   3. For each edge, resolve the *target layer*:
 *        a. Relative specifiers (`./`, `../`) → resolve to a project-relative
 *           path, then classify by glob.
 *        b. Workspace-package specifiers (`@scope/name`) → mapped to the
 *           package's layer via a module entry, when available.
 *        c. Bare specifiers (`react`, `lodash`) → marked as `external`.
 *      External imports are not subject to layer rules in Phase 1.
 *   4. For each (fromLayer, toLayer) pair where both are known:
 *        - If the pair appears in `forbiddenEdges` → produce a BLOCK violation.
 *        - If `allowedEdges` is non-empty and the pair is not in it →
 *          produce a WARN violation (`undeclared_edge`).
 *
 * Determinism: same diff + same contract = same `DriftReport` byte-for-byte.
 * Output keys are emitted in stable order; arrays are sorted by `fromFile,line,specifier`.
 *
 * Intelligence classification: DETERMINISTIC.
 */
import { type IntentGraph } from './intent-graph';
import type { DiffFile } from '@neurcode-ai/diff-parser';
export interface DriftDetectorInput {
    graph: IntentGraph;
    diffFiles: DiffFile[];
    /**
     * When true, the detector emits `forbidden_edge` violations as `block`.
     * When false (default), all violations are `warn`. This makes the engine
     * safe to roll out before policy teams have hardened their contract.
     */
    enforce?: boolean;
}
export interface DriftViolation {
    kind: 'forbidden_edge' | 'undeclared_edge';
    severity: 'warn' | 'block';
    file: string;
    line: number;
    fromLayer: string;
    toLayer: string;
    specifier: string;
    reason: string;
    evidence: {
        rawStatement: string;
        contractRule: string;
    };
}
export interface ClassifiedFile {
    path: string;
    layer: string | null;
    matchedGlob: string | null;
}
export interface DriftReport {
    schemaVersion: 1;
    /** True if at least one violation surfaced. Independent of severity. */
    driftDetected: boolean;
    violations: DriftViolation[];
    classifiedFiles: ClassifiedFile[];
    unclassifiedFiles: string[];
    /** External (`bare specifier`) imports — informational only in Phase 1. */
    externalImports: Array<{
        file: string;
        specifier: string;
        line: number;
    }>;
    summary: {
        filesAnalyzed: number;
        importsAnalyzed: number;
        violationCount: number;
        blockCount: number;
        warnCount: number;
        layersTouched: string[];
        forbiddenEdgesViolated: string[];
    };
    /** Fingerprint of the contract this report was produced against. */
    contractFingerprint: string;
    /** Always `'deterministic'` in Phase 1. Future phases may add heuristic outputs here. */
    intelligenceClassification: 'deterministic';
}
/**
 * Run drift detection. Returns a stable, typed report.
 *
 * Behaviour edge-cases:
 *   - Empty graph → empty report, `driftDetected: false`. Zero cost.
 *   - Graph has layers but no edges → classification runs, no violations emitted.
 *     Useful for "observe before enforce" rollouts.
 *   - File-of-file with no matching layer → file surfaces in `unclassifiedFiles`,
 *     but its imports are skipped (we cannot evaluate a rule on an unknown layer).
 */
export declare function runDriftDetection(input: DriftDetectorInput): DriftReport;
export declare function intentGraphIsEnforceable(graph: IntentGraph): boolean;
//# sourceMappingURL=drift-detector.d.ts.map