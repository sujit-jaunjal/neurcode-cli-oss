"use strict";
/**
 * Dependency Graph Builder — constructs a lightweight, in-memory graph of
 * file relationships from an already-built FileMeta index.
 *
 * No disk I/O.  Purely derived from the diff data the indexer has already
 * parsed, so it adds negligible time to verification.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFlowGraph = buildFlowGraph;
exports.nodesOfLayer = nodesOfLayer;
exports.anyNodeMatches = anyNodeMatches;
exports.nodeImportsFile = nodeImportsFile;
// ── Layer refinement ──────────────────────────────────────────────────────────
const MIDDLEWARE_PATH = /\bmiddleware\b/i;
// Signature patterns that indicate a file exports middleware functions
const MIDDLEWARE_EXPORT_RE = /\b(RequestHandler|NextFunction|express\.Request)\b|module\.exports\s*=\s*\w*[Mm]iddleware|\bexport\s+(default\s+)?function\s+\w*[Mm]iddleware/i;
function refineLayer(meta) {
    if (MIDDLEWARE_PATH.test(meta.path))
        return 'middleware';
    if (MIDDLEWARE_EXPORT_RE.test(meta.addedContent))
        return 'middleware';
    return meta.layer;
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Build a FileNode graph from the FileMeta index produced by indexDiffFiles().
 * Returns Map<filePath, FileNode>.
 */
function buildFlowGraph(index) {
    const graph = new Map();
    for (const [path, meta] of index) {
        graph.set(path, {
            file: path,
            imports: meta.imports,
            layer: refineLayer(meta),
            addedContent: meta.addedContent,
            keywords: meta.keywords,
        });
    }
    return graph;
}
// ── Query helpers ─────────────────────────────────────────────────────────────
/** Returns nodes whose layer matches any of the given layers. */
function nodesOfLayer(graph, ...layers) {
    const set = new Set(layers);
    return [...graph.values()].filter((n) => set.has(n.layer));
}
/** Returns true when any node in the graph has content matching the pattern. */
function anyNodeMatches(graph, re) {
    for (const node of graph.values()) {
        if (re.test(node.addedContent))
            return true;
    }
    return false;
}
/** Returns true when node `a` imports something that matches the path of node `b`. */
function nodeImportsFile(a, bPath) {
    // Strip extension + leading './' so "import from '../auth/auth.middleware'"
    // matches a file at 'src/auth/auth.middleware.ts'.
    const bBasename = bPath.replace(/\.[jt]sx?$/, '').replace(/.*[/\\]/, '');
    return a.imports.some((imp) => {
        const impBasename = imp.replace(/.*[/\\]/, '');
        return impBasename === bBasename || imp.includes(bBasename);
    });
}
//# sourceMappingURL=graph.js.map