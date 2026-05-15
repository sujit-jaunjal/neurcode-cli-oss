"use strict";
/**
 * Import Graph Extraction — bounded, deterministic, diff-scoped.
 *
 * Extracts import edges (file → imported specifier) from the **added** lines of
 * a parsed diff. This is intentionally narrow:
 *
 *   - **Bounded scope**: only files in the diff, only added lines.
 *     We never re-parse the entire project. This keeps drift detection fast
 *     and proportional to the size of the change, not the size of the codebase.
 *
 *   - **Regex-based parsing**: not AST. For governance signals on imports
 *     specifically, ECMAScript `import`/`require` statements are unambiguous
 *     enough that regex matches what an AST would catch. False positives in
 *     pathological edge cases (e.g. import strings inside template literals)
 *     are acceptable — drift findings are advisory in Phase 1.
 *
 *   - **TS/JS/Python first**: matchers for ESM imports, CJS requires, and
 *     Python `from X import` / `import X`. Other languages can be added as
 *     additional matcher entries.
 *
 * Intelligence classification: DETERMINISTIC.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractImportEdgesFromDiff = extractImportEdgesFromDiff;
exports.groupImportEdgesByFile = groupImportEdgesByFile;
/**
 * The matcher set. Order is irrelevant — every matcher is run against every
 * added line. A single line could in theory match multiple matchers; in
 * practice the regexes are disjoint.
 */
const IMPORT_MATCHERS = [
    // ESM: `import X from "..."`, `import "..."`, `import { X } from "..."`
    {
        id: 'esm-import-from',
        pattern: /\bimport\s+[^'"]*?from\s+['"]([^'"]+)['"]/,
    },
    {
        id: 'esm-import-side-effect',
        pattern: /\bimport\s+['"]([^'"]+)['"]/,
    },
    // ESM: dynamic `import("...")`
    {
        id: 'esm-import-dynamic',
        pattern: /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    },
    // CJS: `require("...")`
    {
        id: 'cjs-require',
        pattern: /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    },
    // Python: `from foo.bar import baz`
    {
        id: 'py-from-import',
        pattern: /^\s*from\s+([\w.]+)\s+import\s+/,
    },
    // Python: `import foo.bar`
    {
        id: 'py-import',
        pattern: /^\s*import\s+([\w.]+)(?:\s+as\s+\w+)?\s*$/,
    },
];
// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Extract all import edges from the added lines of the diff.
 *
 * Pure function — same `diffFiles` produces the same `ImportEdge[]` every time,
 * with deterministic ordering (files in input order; lines in hunk order;
 * matchers in declaration order).
 */
function extractImportEdgesFromDiff(diffFiles) {
    const edges = [];
    for (const file of diffFiles) {
        if (!file.hunks)
            continue;
        for (const hunk of file.hunks) {
            if (!hunk.lines)
                continue;
            // newStart is the line number of the first line in the new file
            let currentLine = hunk.newStart ?? 1;
            for (const line of hunk.lines) {
                if (line.type === 'added') {
                    collectMatchesFromLine(file.path, line.content ?? '', currentLine, edges);
                    currentLine += 1;
                }
                else if (line.type === 'context') {
                    currentLine += 1;
                }
                // 'removed' lines do not advance newStart counter
            }
        }
    }
    return edges;
}
/**
 * Group edges by source file. Used by the drift detector to iterate
 * file-by-file when classifying layers.
 */
function groupImportEdgesByFile(edges) {
    const grouped = new Map();
    for (const edge of edges) {
        const existing = grouped.get(edge.fromFile);
        if (existing) {
            existing.push(edge);
        }
        else {
            grouped.set(edge.fromFile, [edge]);
        }
    }
    return grouped;
}
// ── Internal ─────────────────────────────────────────────────────────────────
function collectMatchesFromLine(fromFile, rawContent, line, out) {
    // Diff hunks may include a leading "+" in some representations; the
    // @neurcode-ai/diff-parser strips it but we guard defensively.
    const content = rawContent.startsWith('+') ? rawContent.slice(1) : rawContent;
    for (const matcher of IMPORT_MATCHERS) {
        const match = matcher.pattern.exec(content);
        if (!match)
            continue;
        const specifier = match[1];
        if (!specifier)
            continue;
        out.push({
            fromFile,
            specifier,
            line,
            rawStatement: content.trim(),
            matcherId: matcher.id,
        });
    }
}
//# sourceMappingURL=import-graph.js.map