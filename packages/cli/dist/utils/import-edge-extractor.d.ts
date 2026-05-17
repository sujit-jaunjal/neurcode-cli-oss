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
import type { DiffFile } from '@neurcode-ai/diff-parser';
export type ImportLanguage = 'python' | 'typescript' | 'javascript';
export type ImportEdgeKind = 'static' | 'relative' | 'dynamic' | 'require' | 'side-effect';
export interface ImportEdge {
    /** The diff file that contains the new import line. */
    sourceFile: string;
    /** 1-based line number within sourceFile, where deterministically known. */
    sourceLine: number;
    /** Verbatim text of the import-bearing line (trimmed). */
    importStatement: string;
    /**
     * The raw import target as authored.
     *   - Python: `x.y.z`, `.foo`, `..foo.bar`
     *   - TS/JS: `./bar`, `../baz`, `@org/pkg/sub`, `node:fs`
     */
    importTarget: string;
    importKind: ImportEdgeKind;
    language: ImportLanguage;
    /** Number of leading dots for Python relative imports; 0 otherwise. */
    relativeLevel: number;
}
/**
 * Extract import edges from the added lines of a diff. Deterministic and
 * order-stable: identical diffs yield identical edge arrays.
 */
export declare function extractImportEdgesFromDiff(diffFiles: readonly DiffFile[]): ImportEdge[];
/**
 * Sort edges into a canonical, replay-stable order.
 *
 * Order: sourceFile → importTarget → sourceLine → importKind. Identical
 * tuples are deduplicated.
 */
export declare function canonicalizeEdges(edges: readonly ImportEdge[]): ImportEdge[];
//# sourceMappingURL=import-edge-extractor.d.ts.map