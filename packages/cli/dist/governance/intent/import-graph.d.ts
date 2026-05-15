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
import type { DiffFile } from '@neurcode-ai/diff-parser';
/**
 * One extracted import edge: a file imports a specifier on a specific line.
 *
 * `specifier` is the literal string from the source (e.g. `"./auth/login"`,
 * `"@neurcode-ai/diff-parser"`, `"sqlalchemy.orm"`). Resolution to a layer is
 * the next phase's job — this module produces raw, faithful edges.
 */
export interface ImportEdge {
    /** Source file (project-relative). */
    fromFile: string;
    /** Raw imported specifier. */
    specifier: string;
    /** 1-based line number (best-effort, from the diff hunk). */
    line: number;
    /** Original matched text — used in drift reports as evidence. */
    rawStatement: string;
    /** Which matcher produced this edge. Aids debuggability. */
    matcherId: string;
}
/**
 * Extract all import edges from the added lines of the diff.
 *
 * Pure function — same `diffFiles` produces the same `ImportEdge[]` every time,
 * with deterministic ordering (files in input order; lines in hunk order;
 * matchers in declaration order).
 */
export declare function extractImportEdgesFromDiff(diffFiles: DiffFile[]): ImportEdge[];
/**
 * Group edges by source file. Used by the drift detector to iterate
 * file-by-file when classifying layers.
 */
export declare function groupImportEdgesByFile(edges: ImportEdge[]): Map<string, ImportEdge[]>;
//# sourceMappingURL=import-graph.d.ts.map