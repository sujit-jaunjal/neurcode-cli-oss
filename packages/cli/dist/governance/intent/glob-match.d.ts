/**
 * Bounded deterministic glob matcher for intent governance.
 *
 * Why a local implementation:
 *   - Zero filesystem access. Pattern-vs-string only.
 *   - Replay determinism: identical (pattern, path) → identical boolean, forever.
 *   - No dependency on `glob`, `minimatch`, or `micromatch` (which have version drift,
 *     locale-sensitive behaviour, and historical bugs around `**` semantics).
 *
 * Supported syntax (intentionally minimal):
 *   `**`  — match any number of path segments (including zero)
 *   `*`   — match any sequence of chars except `/`
 *   `?`   — match exactly one char except `/`
 *   Literal characters match themselves. No brace expansion, no character classes,
 *   no negation (negation is expressed at the contract layer, not the glob layer).
 *
 * Paths are normalised to forward slashes before matching. Leading `./` is stripped.
 *
 * Intelligence classification: DETERMINISTIC.
 */
/** Normalise a file path for matching: forward slashes, no leading `./`. */
export declare function normalizePathForGlob(path: string): string;
/**
 * Compile a glob into a deterministic RegExp.
 * The regex is anchored: it matches the full path, not a substring.
 */
export declare function compileGlob(pattern: string): RegExp;
/**
 * Test whether `path` matches `pattern`. Both are normalised before comparison.
 * Pure function — same inputs always produce the same output.
 */
export declare function matchesGlob(pattern: string, path: string): boolean;
/**
 * Return true if `path` matches any pattern in `patterns`.
 * Useful for layer membership checks where multiple globs are OR'd together.
 */
export declare function matchesAnyGlob(patterns: ReadonlyArray<string>, path: string): boolean;
/**
 * Return the first pattern in `patterns` that matches `path`, or `null` if none match.
 * Order matters — caller is responsible for arranging patterns in priority order.
 */
export declare function firstMatchingGlob(patterns: ReadonlyArray<string>, path: string): string | null;
//# sourceMappingURL=glob-match.d.ts.map