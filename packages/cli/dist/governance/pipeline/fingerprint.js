"use strict";
/**
 * Deterministic stage fingerprinting.
 *
 * A stage fingerprint is a SHA-256 over the stable identifiers of the stage's
 * input or output. It MUST be:
 *   - Independent of wall-clock time, run IDs, and process state
 *   - Stable across operating systems and Node versions
 *   - Computed only from canonical fields (no excerpts, no PII)
 *
 * Callers should provide a `signal` object containing the minimum stable
 * descriptors. Anything not present in the signal is ignored by the fingerprint.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fingerprintStageSignal = fingerprintStageSignal;
exports.stableStringify = stableStringify;
const crypto_1 = require("crypto");
/**
 * Compute a deterministic SHA-256 fingerprint from a stage signal object.
 *
 * The signal is serialized via stable key ordering so logically identical inputs
 * always produce the same hash, regardless of source object key insertion order.
 *
 * @param signal  An object containing stable, PII-free identifiers.
 * @returns       64-char hex SHA-256 digest, or undefined when signal is empty.
 */
function fingerprintStageSignal(signal) {
    if (signal === null || signal === undefined) {
        return undefined;
    }
    const stable = stableStringify(signal);
    if (!stable || stable === '{}' || stable === '[]') {
        return undefined;
    }
    return (0, crypto_1.createHash)('sha256').update(stable, 'utf-8').digest('hex');
}
/**
 * Deterministic JSON serialization with sorted object keys.
 *
 * Mirrors the contract of `@neurcode-ai/telemetry`'s `stableStringify` to avoid
 * a cross-package dependency at this layer. Identical implementation invariants:
 *   - Objects: keys sorted lexicographically
 *   - Arrays: order preserved
 *   - Numbers: NaN/Infinity become null (JSON-compatible)
 *   - Functions / undefined values: omitted
 */
function stableStringify(value) {
    return JSON.stringify(canonicalize(value));
}
function canonicalize(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (typeof value === 'object') {
        const obj = value;
        const keys = Object.keys(obj).sort();
        const out = {};
        for (const k of keys) {
            const v = obj[k];
            if (v === undefined || typeof v === 'function')
                continue;
            out[k] = canonicalize(v);
        }
        return out;
    }
    // bigint, symbol, etc. — drop
    return null;
}
//# sourceMappingURL=fingerprint.js.map