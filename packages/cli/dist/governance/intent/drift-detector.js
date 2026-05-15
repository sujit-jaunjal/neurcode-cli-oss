"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDriftDetection = runDriftDetection;
exports.intentGraphIsEnforceable = intentGraphIsEnforceable;
const path_1 = require("path");
const import_graph_1 = require("./import-graph");
const glob_match_1 = require("./glob-match");
const intent_graph_1 = require("./intent-graph");
// ── Public API ───────────────────────────────────────────────────────────────
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
function runDriftDetection(input) {
    const { graph, diffFiles } = input;
    const enforce = input.enforce ?? false;
    if ((0, intent_graph_1.isEmptyIntentGraph)(graph)) {
        return emptyReport(graph.fingerprint);
    }
    // 1. Classify diff files.
    const classifiedFiles = [];
    const fileLayerMap = new Map();
    const unclassified = [];
    for (const f of diffFiles) {
        const classification = classifyFile(f.path, graph);
        classifiedFiles.push(classification);
        if (classification.layer) {
            fileLayerMap.set(f.path, classification.layer);
        }
        else {
            unclassified.push(f.path);
        }
    }
    // 2. Extract imports.
    const allEdges = (0, import_graph_1.extractImportEdgesFromDiff)(diffFiles);
    const byFile = (0, import_graph_1.groupImportEdgesByFile)(allEdges);
    // 3. Evaluate edges.
    const violations = [];
    const external = [];
    const layersTouched = new Set();
    const forbiddenEdgesViolated = new Set();
    let importsAnalyzed = 0;
    for (const [file, edges] of byFile) {
        const fromLayer = fileLayerMap.get(file);
        if (!fromLayer) {
            // We already recorded the file as unclassified; nothing to evaluate.
            continue;
        }
        layersTouched.add(fromLayer);
        for (const edge of edges) {
            importsAnalyzed += 1;
            const resolution = resolveImportTarget(edge, graph, file);
            if (resolution.kind === 'external') {
                external.push({ file, specifier: edge.specifier, line: edge.line });
                continue;
            }
            if (resolution.kind === 'unresolved') {
                // Internal-looking specifier we could not pin to a layer. Skip silently
                // in Phase 1 — surface upgrades come in Phase 2 (semantic diff).
                continue;
            }
            const toLayer = resolution.layer;
            layersTouched.add(toLayer);
            // Forbidden edge check
            const forbidden = graph.forbiddenEdges.find((e) => e.from === fromLayer && e.to === toLayer);
            if (forbidden) {
                const rule = `forbidden: ${fromLayer} → ${toLayer}`;
                forbiddenEdgesViolated.add(rule);
                violations.push({
                    kind: 'forbidden_edge',
                    severity: enforce ? 'block' : 'warn',
                    file,
                    line: edge.line,
                    fromLayer,
                    toLayer,
                    specifier: edge.specifier,
                    reason: forbidden.reason ??
                        `Layer "${fromLayer}" must not import from layer "${toLayer}".`,
                    evidence: {
                        rawStatement: edge.rawStatement,
                        contractRule: rule,
                    },
                });
                continue;
            }
            // Undeclared edge check (only when allowedEdges is non-empty)
            if (graph.allowedEdges.length > 0) {
                const allowed = graph.allowedEdges.some((e) => e.from === fromLayer && e.to === toLayer);
                if (!allowed && fromLayer !== toLayer) {
                    violations.push({
                        kind: 'undeclared_edge',
                        severity: 'warn',
                        file,
                        line: edge.line,
                        fromLayer,
                        toLayer,
                        specifier: edge.specifier,
                        reason: `Edge ${fromLayer} → ${toLayer} is not in the contract's allowedEdges. ` +
                            `Either add it to the contract or refactor the dependency.`,
                        evidence: {
                            rawStatement: edge.rawStatement,
                            contractRule: `not-in-allowed: ${fromLayer} → ${toLayer}`,
                        },
                    });
                }
            }
        }
    }
    // Sort for determinism
    violations.sort(sortByFileLineSpecifier);
    const blockCount = violations.filter((v) => v.severity === 'block').length;
    const warnCount = violations.filter((v) => v.severity === 'warn').length;
    return {
        schemaVersion: 1,
        driftDetected: violations.length > 0,
        violations,
        classifiedFiles,
        unclassifiedFiles: unclassified.slice().sort(),
        externalImports: external,
        summary: {
            filesAnalyzed: diffFiles.length,
            importsAnalyzed,
            violationCount: violations.length,
            blockCount,
            warnCount,
            layersTouched: [...layersTouched].sort(),
            forbiddenEdgesViolated: [...forbiddenEdgesViolated].sort(),
        },
        contractFingerprint: graph.fingerprint,
        intelligenceClassification: 'deterministic',
    };
}
// Marker for use when enforcement is disabled and we want to short-circuit
function intentGraphIsEnforceable(graph) {
    return (0, intent_graph_1.intentGraphHasEnforcement)(graph);
}
// ── Internal — classification ────────────────────────────────────────────────
function classifyFile(path, graph) {
    for (const layer of graph.layers) {
        const matched = (0, glob_match_1.firstMatchingGlob)(layer.glob, path);
        if (matched) {
            return { path, layer: layer.id, matchedGlob: matched };
        }
    }
    return { path, layer: null, matchedGlob: null };
}
function resolveImportTarget(edge, graph, sourceFile) {
    const spec = edge.specifier;
    // Relative specifiers: resolve against the source file's directory.
    if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) {
        const resolved = resolveRelativeSpecifier(sourceFile, spec);
        if (!resolved)
            return { kind: 'unresolved' };
        const layer = classifyPathToLayer(resolved, graph.layers);
        if (layer)
            return { kind: 'classified', layer };
        return { kind: 'unresolved' };
    }
    // Bare specifier — external dependency, not a layer.
    // Includes `@scope/pkg` since we don't have a workspace-package → layer
    // map in Phase 1. Workspace-package layer mapping is a Phase 2 enhancement.
    return { kind: 'external' };
}
/**
 * Resolve a relative specifier (e.g. `../service/auth`) against a source file
 * (e.g. `src/commands/login.ts`) to a project-relative path (e.g.
 * `src/service/auth`). Extension is not appended — the layer globs are expected
 * to be flexible enough to match either form, but we additionally try common
 * extensions for a best-effort hit.
 */
function resolveRelativeSpecifier(sourceFile, specifier) {
    try {
        const sourceDir = (0, path_1.dirname)((0, glob_match_1.normalizePathForGlob)(sourceFile));
        const joined = path_1.posix.normalize(path_1.posix.join(sourceDir, specifier));
        return joined;
    }
    catch {
        return null;
    }
}
/**
 * Classify a resolved path into a layer. Tries the bare path first, then
 * common extensions, then path-with-/index appended. This handles the most
 * common ESM/CJS resolution shapes without doing real filesystem lookups
 * (which would be non-deterministic and slow).
 */
function classifyPathToLayer(resolvedPath, layers) {
    const candidates = [
        resolvedPath,
        `${resolvedPath}.ts`,
        `${resolvedPath}.tsx`,
        `${resolvedPath}.js`,
        `${resolvedPath}.jsx`,
        `${resolvedPath}.py`,
        `${resolvedPath}/index.ts`,
        `${resolvedPath}/index.js`,
        `${resolvedPath}/__init__.py`,
    ];
    for (const layer of layers) {
        for (const candidate of candidates) {
            if ((0, glob_match_1.firstMatchingGlob)(layer.glob, candidate)) {
                return layer.id;
            }
        }
    }
    return null;
}
// ── Internal — sorting ───────────────────────────────────────────────────────
function sortByFileLineSpecifier(a, b) {
    if (a.file !== b.file)
        return a.file < b.file ? -1 : 1;
    if (a.line !== b.line)
        return a.line - b.line;
    if (a.specifier !== b.specifier)
        return a.specifier < b.specifier ? -1 : 1;
    return 0;
}
// ── Empty result ─────────────────────────────────────────────────────────────
function emptyReport(fingerprint) {
    return {
        schemaVersion: 1,
        driftDetected: false,
        violations: [],
        classifiedFiles: [],
        unclassifiedFiles: [],
        externalImports: [],
        summary: {
            filesAnalyzed: 0,
            importsAnalyzed: 0,
            violationCount: 0,
            blockCount: 0,
            warnCount: 0,
            layersTouched: [],
            forbiddenEdgesViolated: [],
        },
        contractFingerprint: fingerprint,
        intelligenceClassification: 'deterministic',
    };
}
//# sourceMappingURL=drift-detector.js.map