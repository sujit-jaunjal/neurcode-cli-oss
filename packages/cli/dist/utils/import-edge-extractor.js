"use strict";
/**
 * Deterministic import-edge extractor.
 *
 * Pure regex over source lines — no AST, no inference, no probability.
 * Same input always produces the same output, in the same canonical order.
 *
 * Supported languages:
 *   - Python: `import x.y.z`, `from x.y import z`, relative `from .foo import bar`
 *   - TypeScript / JavaScript:
 *       `import ... from "..."`
 *       `import "..."` (side-effect)
 *       `import("...")` (dynamic)
 *       `require("...")` (CommonJS)
 *
 * The extractor is diff-aware: it consumes already-added source lines so we
 * only flag imports introduced by the current diff. Pre-existing imports
 * stay outside the governance frame.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractImportEdgesFromDiff = extractImportEdgesFromDiff;
exports.canonicalizeEdges = canonicalizeEdges;
const PY_EXTENSIONS = new Set(['py', 'pyi']);
const TS_EXTENSIONS = new Set(['ts', 'tsx', 'mts', 'cts']);
const JS_EXTENSIONS = new Set(['js', 'jsx', 'mjs', 'cjs']);
function languageFor(path) {
    const ext = (path.split('.').pop() ?? '').toLowerCase();
    if (PY_EXTENSIONS.has(ext))
        return 'python';
    if (TS_EXTENSIONS.has(ext))
        return 'typescript';
    if (JS_EXTENSIONS.has(ext))
        return 'javascript';
    return null;
}
// ────────────────────────────────────────────────────────────────────────────
// Python regex set
// ────────────────────────────────────────────────────────────────────────────
//   `import x.y.z` / `import x.y.z as foo`
//   `from x.y import z` / `from .foo import bar` / `from ..baz.q import r`
//   Multi-import on one line: `import a, b, c` (we capture each comma-separated entry)
const PY_IMPORT = /^\s*import\s+([\w\.,\s]+?)(?:\s+as\s+\w+)?\s*(?:#.*)?$/;
const PY_FROM = /^\s*from\s+(\.+)?([\w\.]*)\s+import\s+/;
// ────────────────────────────────────────────────────────────────────────────
// TS/JS regex set
// ────────────────────────────────────────────────────────────────────────────
const TS_STATIC = /\bimport\s+(?:[^'"\n;]+?\s+from\s+)?['"]([^'"]+)['"]/g;
const TS_SIDE_EFFECT = /\bimport\s+['"]([^'"]+)['"]/g;
const TS_DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const TS_REQUIRE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
function collectAddedLines(file) {
    const out = [];
    for (const hunk of file.hunks ?? []) {
        let cursor = hunk.newStart ?? 0;
        for (const line of (hunk.lines ?? [])) {
            if (line.type === 'added') {
                out.push({ text: line.content ?? '', lineNumber: line.lineNumber ?? cursor });
                cursor += 1;
            }
            else if (line.type === 'context') {
                cursor += 1;
            }
            // 'removed' lines do not advance the new-file cursor
        }
    }
    return out;
}
// ────────────────────────────────────────────────────────────────────────────
// Python extraction
// ────────────────────────────────────────────────────────────────────────────
function extractPython(file) {
    const edges = [];
    for (const { text, lineNumber } of collectAddedLines(file)) {
        if (!text.trim())
            continue;
        // `from x import y`
        const fromMatch = PY_FROM.exec(text);
        if (fromMatch) {
            const dots = fromMatch[1] ?? '';
            const dotted = fromMatch[2] ?? '';
            const importTarget = dots ? `${dots}${dotted}` : dotted;
            if (importTarget) {
                edges.push({
                    sourceFile: file.path,
                    sourceLine: lineNumber,
                    importStatement: text.trim(),
                    importTarget,
                    importKind: dots ? 'relative' : 'static',
                    language: 'python',
                    relativeLevel: dots.length,
                });
            }
            continue;
        }
        // `import x.y[, z[, w as foo]]`
        const importMatch = PY_IMPORT.exec(text);
        if (importMatch) {
            const body = importMatch[1] ?? '';
            // Split on commas, strip `as <alias>` per entry, ignore inline whitespace.
            const targets = body
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t) => t.replace(/\s+as\s+\w+$/, '').trim())
                .filter(Boolean);
            for (const importTarget of targets) {
                // `import .relative` is a SyntaxError in Python; only top-level dotted
                // names appear here. Still guard against leading dots defensively.
                if (importTarget.startsWith('.'))
                    continue;
                edges.push({
                    sourceFile: file.path,
                    sourceLine: lineNumber,
                    importStatement: text.trim(),
                    importTarget,
                    importKind: 'static',
                    language: 'python',
                    relativeLevel: 0,
                });
            }
        }
    }
    return edges;
}
// ────────────────────────────────────────────────────────────────────────────
// TS/JS extraction
// ────────────────────────────────────────────────────────────────────────────
function extractTypeScript(file, language) {
    const edges = [];
    for (const { text, lineNumber } of collectAddedLines(file)) {
        if (!text.trim())
            continue;
        const consumed = new Set();
        const push = (target, kind) => {
            const key = `${target}::${kind}`;
            if (consumed.has(key))
                return;
            consumed.add(key);
            edges.push({
                sourceFile: file.path,
                sourceLine: lineNumber,
                importStatement: text.trim(),
                importTarget: target,
                importKind: kind,
                language,
                relativeLevel: 0,
            });
        };
        // Static / side-effect imports
        TS_STATIC.lastIndex = 0;
        for (let m; (m = TS_STATIC.exec(text));) {
            push(m[1], 'static');
        }
        TS_SIDE_EFFECT.lastIndex = 0;
        for (let m; (m = TS_SIDE_EFFECT.exec(text));) {
            push(m[1], 'side-effect');
        }
        // Dynamic / require
        TS_DYNAMIC.lastIndex = 0;
        for (let m; (m = TS_DYNAMIC.exec(text));) {
            push(m[1], 'dynamic');
        }
        TS_REQUIRE.lastIndex = 0;
        for (let m; (m = TS_REQUIRE.exec(text));) {
            push(m[1], 'require');
        }
    }
    return edges;
}
// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────
/**
 * Extract import edges from the added lines of a diff. Deterministic and
 * order-stable: identical diffs yield identical edge arrays.
 */
function extractImportEdgesFromDiff(diffFiles) {
    const edges = [];
    for (const file of diffFiles) {
        if (file.changeType === 'delete')
            continue;
        const language = languageFor(file.path);
        if (!language)
            continue;
        if (language === 'python') {
            edges.push(...extractPython(file));
        }
        else {
            edges.push(...extractTypeScript(file, language));
        }
    }
    return canonicalizeEdges(edges);
}
/**
 * Sort edges into a canonical, replay-stable order.
 *
 * Order: sourceFile → importTarget → sourceLine → importKind. Identical
 * tuples are deduplicated.
 */
function canonicalizeEdges(edges) {
    const seen = new Set();
    const out = [];
    for (const e of edges) {
        const key = `${e.sourceFile}|${e.importTarget}|${e.sourceLine}|${e.importKind}|${e.language}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(e);
    }
    out.sort((a, b) => {
        if (a.sourceFile !== b.sourceFile)
            return a.sourceFile < b.sourceFile ? -1 : 1;
        if (a.importTarget !== b.importTarget)
            return a.importTarget < b.importTarget ? -1 : 1;
        if (a.sourceLine !== b.sourceLine)
            return a.sourceLine - b.sourceLine;
        if (a.importKind !== b.importKind)
            return a.importKind < b.importKind ? -1 : 1;
        return 0;
    });
    return out;
}
//# sourceMappingURL=import-edge-extractor.js.map