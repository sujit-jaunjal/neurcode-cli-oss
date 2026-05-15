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
/**
 * Compute a deterministic SHA-256 fingerprint from a stage signal object.
 *
 * The signal is serialized via stable key ordering so logically identical inputs
 * always produce the same hash, regardless of source object key insertion order.
 *
 * @param signal  An object containing stable, PII-free identifiers.
 * @returns       64-char hex SHA-256 digest, or undefined when signal is empty.
 */
export declare function fingerprintStageSignal(signal: unknown): string | undefined;
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
export declare function stableStringify(value: unknown): string;
//# sourceMappingURL=fingerprint.d.ts.map