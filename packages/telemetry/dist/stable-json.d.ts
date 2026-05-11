/**
 * Deterministic JSON serialization: sorted object keys at every depth.
 * Used so identical logical events stringify identically across Node versions.
 */
export declare function stableStringify(value: unknown): string;
