"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.candidatePathsForEdge = candidatePathsForEdge;
exports.classifyImportEdge = classifyImportEdge;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const core_1 = require("@neurcode-ai/core");
const path_boundary_classifier_1 = require("./path-boundary-classifier");
// ────────────────────────────────────────────────────────────────────────────
// Resolution helpers
// ────────────────────────────────────────────────────────────────────────────
const PY_INIT = '__init__.py';
const PY_INIT_STUB = '__init__.pyi';
const PY_FILE_EXTS = ['.py', '.pyi'];
/** Candidate repository-relative paths for an import edge, in priority order. */
function candidatePathsForEdge(edge, projectRoot, intent) {
    if (edge.language === 'python') {
        return candidatesForPython(edge, projectRoot, intent);
    }
    return candidatesForJavaScript(edge, projectRoot);
}
function candidatesForPython(edge, projectRoot, intent) {
    const out = [];
    // Relative imports: `from .foo import x` / `from ..bar import y`
    if (edge.relativeLevel > 0) {
        const sourceDirParts = path.posix
            .normalize(edge.sourceFile)
            .split('/')
            .slice(0, -1);
        const goUp = Math.max(0, edge.relativeLevel - 1);
        const base = sourceDirParts.slice(0, sourceDirParts.length - goUp);
        const targetParts = edge.importTarget
            .replace(/^\.+/, '')
            .split('.')
            .filter(Boolean);
        const baseJoined = [...base, ...targetParts].join('/');
        if (baseJoined) {
            out.push(...materializePythonModulePaths(baseJoined, projectRoot));
        }
        return uniqueOrdered(out);
    }
    // Absolute imports: try several layout roots so monorepos (Airflow,
    // Celery, etc.) and src/-style packages all resolve.
    const dotted = edge.importTarget.split('.').filter(Boolean);
    if (dotted.length === 0)
        return out;
    const moduleRel = dotted.join('/');
    const layoutRoots = inferLayoutRoots(intent);
    for (const rootPrefix of layoutRoots) {
        const composed = rootPrefix ? `${rootPrefix}/${moduleRel}` : moduleRel;
        out.push(...materializePythonModulePaths(composed, projectRoot));
    }
    return uniqueOrdered(out);
}
function materializePythonModulePaths(modulePath, projectRoot) {
    const out = [];
    for (const ext of PY_FILE_EXTS) {
        const candidate = `${modulePath}${ext}`;
        if (existsAtRoot(projectRoot, candidate))
            out.push(candidate);
    }
    for (const init of [PY_INIT, PY_INIT_STUB]) {
        const candidate = `${modulePath}/${init}`;
        if (existsAtRoot(projectRoot, candidate))
            out.push(candidate);
    }
    // Always include the unresolved candidates for boundary matching even if
    // the file does not physically exist (e.g. when intent forbids importing
    // a not-yet-installed module).
    for (const ext of PY_FILE_EXTS)
        out.push(`${modulePath}${ext}`);
    out.push(`${modulePath}/${PY_INIT}`);
    out.push(modulePath);
    return out;
}
function candidatesForJavaScript(edge, projectRoot) {
    const target = edge.importTarget;
    // External packages: anything that does not start with `./`, `../`, `/`
    // is treated as bare and skipped from boundary-match resolution.
    if (!target.startsWith('.') && !target.startsWith('/'))
        return [];
    const sourceDirParts = path.posix
        .normalize(edge.sourceFile)
        .split('/')
        .slice(0, -1);
    const relative = target.startsWith('/') ? target.slice(1) : path.posix.normalize([...sourceDirParts, target].join('/'));
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    const out = [];
    for (const ext of exts) {
        const candidate = `${relative}${ext}`;
        if (existsAtRoot(projectRoot, candidate))
            out.push(candidate);
        out.push(candidate); // also include unresolved form for boundary matching
    }
    for (const indexFile of ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs']) {
        const candidate = `${relative}/${indexFile}`;
        if (existsAtRoot(projectRoot, candidate))
            out.push(candidate);
        out.push(candidate);
    }
    out.push(relative);
    return uniqueOrdered(out);
}
function inferLayoutRoots(intent) {
    // Always include the bare root first; then derive additional layout
    // prefixes from any approved module that ends in a canonical Python
    // source root (`/src`). This is bounded and deterministic.
    const roots = new Set(['']);
    for (const mod of intent.approvedScope.modules) {
        const normalized = (0, core_1.normalizeRepoPath)(mod);
        if (!normalized)
            continue;
        const parts = normalized.split('/');
        for (let i = 1; i <= parts.length; i++) {
            const prefix = parts.slice(0, i).join('/');
            // Common monorepo source roots:
            //   `airflow-core/src/airflow/jobs`  → `airflow-core/src`
            //   `apps/api/src/foo`               → `apps/api/src`
            //   `packages/core/src/util`         → `packages/core/src`
            if (prefix.endsWith('/src') || prefix === 'src')
                roots.add(prefix);
        }
        // Whole-prefix mode: also useful for shallow projects (`apps/api`)
        roots.add(normalized);
    }
    return [...roots].sort();
}
function existsAtRoot(projectRoot, repoRelative) {
    try {
        return fs.existsSync(path.join(projectRoot, repoRelative));
    }
    catch {
        return false;
    }
}
function uniqueOrdered(values) {
    const seen = new Set();
    const out = [];
    for (const v of values) {
        if (seen.has(v))
            continue;
        seen.add(v);
        out.push(v);
    }
    return out;
}
// ────────────────────────────────────────────────────────────────────────────
// Boundary matching
// ────────────────────────────────────────────────────────────────────────────
const ALLOWED_BOUNDARY_TYPES = new Set([
    'sensitive', 'infra', 'ci', 'dependency-manifest', 'service', 'module', 'generated-code', 'unspecified',
]);
function asBoundaryType(value) {
    if (value && ALLOWED_BOUNDARY_TYPES.has(value)) {
        return value;
    }
    return 'unspecified';
}
/**
 * Resolve an edge to a single ImportEdgeFinding, or null if the edge is
 * either unresolvable or resolves outside any flagged boundary.
 *
 * Resolution priority:
 *   1. Explicit `forbiddenBoundaries` (forbidden first, then review-required)
 *   2. Path-boundary classifier (generated-code only — other classifier
 *      categories are diagnostic but not auto-blocking for imports)
 */
function classifyImportEdge(edge, projectRoot, intent) {
    const candidates = candidatePathsForEdge(edge, projectRoot, intent);
    if (candidates.length === 0)
        return null;
    // Pre-normalise approved-scope so we can short-circuit edges that resolve
    // inside the declared scope. An import from an allowed file *into* an
    // allowed module is signal-free.
    const approvedFileSet = new Set(intent.approvedScope.files.map((p) => (0, core_1.normalizeRepoPath)(p)).filter(Boolean));
    const approvedModulePaths = intent.approvedScope.modules.map((p) => (0, core_1.normalizeRepoPath)(p)).filter(Boolean);
    // First pass: forbidden boundaries (forbidden > review-required).
    const forbiddenSorted = [...intent.forbiddenBoundaries].sort((a, b) => {
        if (a.policy === b.policy)
            return 0;
        if (a.policy === 'forbidden')
            return -1;
        if (b.policy === 'forbidden')
            return 1;
        return 0;
    });
    for (const boundary of forbiddenSorted) {
        if (boundary.policy === 'allowed')
            continue;
        const boundaryPath = (0, core_1.normalizeRepoPath)(boundary.path);
        if (!boundaryPath)
            continue;
        for (const candidate of candidates) {
            const normalized = (0, core_1.normalizeRepoPath)(candidate);
            if (!normalized)
                continue;
            if (normalized === boundaryPath || normalized.startsWith(`${boundaryPath}/`)) {
                // Skip if the resolved target is also inside the approved scope —
                // that means the intent allowed the import explicitly.
                if (approvedFileSet.has(normalized))
                    continue;
                if (matchesPrefix(normalized, approvedModulePaths) && boundary.policy !== 'forbidden') {
                    continue;
                }
                return {
                    sourceFile: edge.sourceFile,
                    sourceLine: edge.sourceLine,
                    importTarget: edge.importTarget,
                    resolvedTargetPath: normalized,
                    resolvedBoundary: boundaryPath,
                    boundaryType: asBoundaryType(boundary.type),
                    policy: boundary.policy === 'forbidden' ? 'forbidden' : 'review-required',
                    governanceSeverity: boundary.policy === 'forbidden' ? 'blocking' : 'advisory',
                    reason: boundary.reason ?? `Import edge crosses ${boundary.type} boundary (${boundary.path}).`,
                    edgeKind: edge.importKind,
                    language: edge.language,
                    deterministic: true,
                    replayStable: true,
                };
            }
        }
    }
    // Second pass: generated-code classifier. Only fire if the target was not
    // already explicitly allowed.
    for (const candidate of candidates) {
        const normalized = (0, core_1.normalizeRepoPath)(candidate);
        if (!normalized)
            continue;
        if (approvedFileSet.has(normalized))
            continue;
        if (matchesPrefix(normalized, approvedModulePaths))
            continue;
        const classification = (0, path_boundary_classifier_1.classifyPathBoundary)(normalized);
        if (classification?.category === 'generated-code') {
            return {
                sourceFile: edge.sourceFile,
                sourceLine: edge.sourceLine,
                importTarget: edge.importTarget,
                resolvedTargetPath: normalized,
                resolvedBoundary: normalized,
                boundaryType: 'generated-code',
                policy: 'generated-code',
                governanceSeverity: 'blocking',
                reason: `Import edge targets generated-code (${classification.reason}). Regenerate from source instead of importing from a hand-written path.`,
                edgeKind: edge.importKind,
                language: edge.language,
                deterministic: true,
                replayStable: true,
            };
        }
    }
    return null;
}
function matchesPrefix(file, prefixes) {
    return prefixes.some((p) => p && (file === p || file.startsWith(`${p}/`)));
}
//# sourceMappingURL=import-edge-classifier.js.map