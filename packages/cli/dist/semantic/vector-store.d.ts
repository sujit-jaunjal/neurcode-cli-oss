/**
 * Persistent Semantic Vector Store
 *
 * Manages a TF-IDF index over the project's brain-context file entries.
 * Stored at: .neurcode/semantic-index.json
 *
 * Design principles:
 *  - Built FROM the existing brain-context.json — no new scanning required
 *  - Incremental updates on file changes (watch events)
 *  - Atomic writes (tmp → rename) to prevent corruption
 *  - Schema versioned for safe migrations
 *  - Completely offline, zero API calls, zero latency cost
 *
 * Usage:
 *   buildSemanticIndex(cwd, scope)   — full rebuild from brain context
 *   semanticSearch(cwd, scope, query) — search the index
 *   upsertFileInIndex(cwd, scope, filePath, content) — incremental update
 */
import { TfIdfSearchResult } from './tfidf-engine';
export interface SemanticIndexScope {
    orgId: string | null;
    projectId: string | null;
}
export interface SemanticRetrievalConfidence {
    /** Normalized TF-IDF score for this hit (not cross-corpus calibrated). */
    retrievalScore: number;
    /** Estimated share of brain-context docs that entered the index (0–1). */
    corpusCoverageRatio: number;
    /** True when indexing stopped at MAX_INDEX_DOCS. */
    indexTruncated: boolean;
    documentsIndexed: number;
    documentsCap: number;
    /** Deterministic TF-IDF retrieval — reproducible given same index + query. */
    retrievalMethod: 'deterministic-tfidf';
}
export interface SemanticSearchResult extends TfIdfSearchResult {
    filePath: string;
    language: string;
    summary: string;
    symbols: string[];
    contentHash: string;
    confidence: SemanticRetrievalConfidence;
    explainability: {
        retrievalCategory: 'deterministic-semantic';
        includedBecause: string;
        matchedTerms: string[];
        retrievalPath: string[];
        federationSource: 'local-repo-index';
        truncationStatus: 'none' | 'index-truncated';
    };
}
export interface SemanticIndexStats {
    exists: boolean;
    documentCount: number;
    builtAt: string | null;
    schemaVersion: number | null;
    sizeBytes: number | null;
}
/**
 * Builds a full semantic index from the current brain-context entries.
 * Should be called after `neurcode brain build` or equivalent full refresh.
 *
 * Returns: number of documents indexed.
 */
export declare function buildSemanticIndex(cwd: string, scope: SemanticIndexScope): number;
/**
 * Searches the semantic index.
 *
 * Falls back gracefully to an empty result if no index exists (never throws).
 */
export declare function semanticSearch(cwd: string, scope: SemanticIndexScope, query: string, options?: {
    limit?: number;
    minScore?: number;
}): SemanticSearchResult[];
/**
 * Incrementally adds or updates a single file in the semantic index.
 * Called by the watch daemon on file changes.
 *
 * `content` is the raw file content to vectorize.
 * If the content hash matches what's already indexed, this is a no-op.
 */
export declare function upsertFileInIndex(cwd: string, scope: SemanticIndexScope, filePath: string, content: string, metadata?: {
    language?: string;
    summary?: string;
    symbols?: string[];
}): boolean;
/**
 * Removes a file from the semantic index.
 * Called by the watch daemon on file deletions.
 */
export declare function removeFileFromIndex(cwd: string, scope: SemanticIndexScope, filePath: string): boolean;
/**
 * Returns metadata about the current index without loading the full corpus.
 */
export declare function getSemanticIndexStats(cwd: string, scope: SemanticIndexScope): SemanticIndexStats;
/**
 * Deletes the semantic index file for this workspace.
 * Called by `neurcode brain clear`.
 */
export declare function clearSemanticIndex(cwd: string): boolean;
/**
 * Returns the query's tokenized representation for debugging/transparency.
 */
export declare function explainQuery(query: string): {
    tokens: string[];
    termCount: number;
};
//# sourceMappingURL=vector-store.d.ts.map