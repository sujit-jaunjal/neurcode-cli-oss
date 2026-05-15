"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePathForGlob = normalizePathForGlob;
exports.compileGlob = compileGlob;
exports.matchesGlob = matchesGlob;
exports.matchesAnyGlob = matchesAnyGlob;
exports.firstMatchingGlob = firstMatchingGlob;
const ESCAPE_RE = /[.+^${}()|[\]\\]/g;
/** Normalise a file path for matching: forward slashes, no leading `./`. */
function normalizePathForGlob(path) {
    let p = path.replace(/\\/g, '/');
    if (p.startsWith('./'))
        p = p.slice(2);
    return p;
}
/**
 * Compile a glob into a deterministic RegExp.
 * The regex is anchored: it matches the full path, not a substring.
 */
function compileGlob(pattern) {
    const normalized = normalizePathForGlob(pattern);
    let i = 0;
    let out = '^';
    while (i < normalized.length) {
        const c = normalized[i];
        // `**` — any number of segments (zero or more)
        if (c === '*' && normalized[i + 1] === '*') {
            // `**/` or `/**` collapses to "anything (including empty)" without trailing slash artifacts
            if (normalized[i + 2] === '/') {
                out += '(?:.*/)?';
                i += 3;
                continue;
            }
            out += '.*';
            i += 2;
            continue;
        }
        // `*` — any chars except `/`
        if (c === '*') {
            out += '[^/]*';
            i += 1;
            continue;
        }
        // `?` — one char except `/`
        if (c === '?') {
            out += '[^/]';
            i += 1;
            continue;
        }
        // literal
        out += c.replace(ESCAPE_RE, '\\$&');
        i += 1;
    }
    out += '$';
    return new RegExp(out);
}
/**
 * Test whether `path` matches `pattern`. Both are normalised before comparison.
 * Pure function — same inputs always produce the same output.
 */
function matchesGlob(pattern, path) {
    return compileGlob(pattern).test(normalizePathForGlob(path));
}
/**
 * Return true if `path` matches any pattern in `patterns`.
 * Useful for layer membership checks where multiple globs are OR'd together.
 */
function matchesAnyGlob(patterns, path) {
    const normalised = normalizePathForGlob(path);
    for (const pattern of patterns) {
        if (compileGlob(pattern).test(normalised))
            return true;
    }
    return false;
}
/**
 * Return the first pattern in `patterns` that matches `path`, or `null` if none match.
 * Order matters — caller is responsible for arranging patterns in priority order.
 */
function firstMatchingGlob(patterns, path) {
    const normalised = normalizePathForGlob(path);
    for (const pattern of patterns) {
        if (compileGlob(pattern).test(normalised))
            return pattern;
    }
    return null;
}
//# sourceMappingURL=glob-match.js.map