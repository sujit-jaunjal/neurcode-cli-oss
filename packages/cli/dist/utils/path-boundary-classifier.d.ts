/**
 * Deterministic, replay-safe path-boundary classification.
 *
 * Maps a repo-relative file path to one of a small, well-defined set of
 * governance boundary categories (generated-code, infra, ci,
 * dependency-manifest, sensitive). Uses ONLY pattern matching — no file I/O,
 * no AI inference, no probabilistic scoring. Same path string → same
 * classification across machines, runs, and CLI versions. Boundary patterns
 * are intentionally conservative: when in doubt the classifier returns
 * `null`, leaving the path uncategorised rather than asserting an incorrect
 * boundary.
 */
export type PathBoundaryCategory = 'generated-code' | 'infra' | 'ci' | 'dependency-manifest' | 'sensitive';
export interface PathBoundaryClassification {
    category: PathBoundaryCategory;
    /**
     * Stable rationale ID. Used so dashboard/replay surfaces can group + render
     * classifications without reading the human message.
     */
    reasonId: string;
    /**
     * Short human-readable description of why this path was classified this
     * way. Stable: not parameterised by repo state.
     */
    reason: string;
}
/**
 * Classify a single repo-relative path. Returns the FIRST matching boundary
 * (rules are ordered by specificity / severity), or `null` when the path
 * does not match any well-known boundary pattern.
 *
 * The classifier is intentionally first-match-wins so the ordering above
 * encodes the priority: generated-code > CI > infra > sensitive > dep-manifest.
 */
export declare function classifyPathBoundary(path: string): PathBoundaryClassification | null;
/**
 * Bulk classify and bucket. Returns a deterministic { category → paths } map.
 * Empty buckets are omitted from the result for compactness; consumers should
 * defensively check `result.<category]?.length`.
 */
export declare function classifyAndBucket(paths: readonly string[]): Partial<Record<PathBoundaryCategory, string[]>>;
//# sourceMappingURL=path-boundary-classifier.d.ts.map