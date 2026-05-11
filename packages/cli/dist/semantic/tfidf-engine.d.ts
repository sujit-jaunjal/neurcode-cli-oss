/**
 * TF-IDF Semantic Engine — fully deterministic, zero external dependencies.
 *
 * Implements the classic TF-IDF (Term Frequency × Inverse Document Frequency)
 * information-retrieval model with cosine similarity ranking.
 *
 * Why this over raw keyword matching:
 *  - Weights rare/distinctive terms higher (IDF) than common ones
 *  - File-length normalised (TF prevents long files dominating)
 *  - Cosine similarity handles partial matches gracefully
 *  - Identical results every run — fully deterministic, no LLM required
 *  - Upgradeable: the same SparseVector type works with real embeddings later
 *
 * Algorithm:
 *  TF(t, d)   = log(1 + freq(t, d) / |d|)
 *  IDF(t, D)  = log((|D| + 1) / (df(t) + 1)) + 1   [smoothed]
 *  weight     = TF × IDF
 *  similarity = cosine(vec_query, vec_doc)
 */
/** Sparse vector: termId → TF-IDF weight.  Keys are term strings, not integers. */
export type SparseVector = Map<string, number>;
export interface TfIdfDocument {
    id: string;
    text: string;
    metadata?: Record<string, unknown>;
}
export interface TfIdfSearchResult {
    id: string;
    score: number;
    metadata?: Record<string, unknown>;
}
/** Serialisable form of SparseVector (for JSON persistence). */
export type SparseVectorRecord = Record<string, number>;
export interface TfIdfIndexEntry {
    id: string;
    vector: SparseVectorRecord;
    norm: number;
    termCount: number;
    metadata?: Record<string, unknown>;
}
export interface TfIdfCorpus {
    schemaVersion: 1;
    builtAt: string;
    documentCount: number;
    /** term → document-frequency (how many docs contain it) */
    df: Record<string, number>;
    entries: TfIdfIndexEntry[];
}
/**
 * Tokenises source text into normalised terms.
 * Splits on: whitespace, punctuation, camelCase, PascalCase, snake_case.
 */
export declare function tokenize(text: string): string[];
/**
 * Computes smoothed IDF for every term in the vocabulary.
 * IDF(t) = log((N + 1) / (df(t) + 1)) + 1
 */
export declare function computeIDF(df: Record<string, number>, N: number): Map<string, number>;
export declare function buildCorpus(documents: TfIdfDocument[]): TfIdfCorpus;
/**
 * Vectorises a query using the corpus IDF weights, then ranks documents
 * by cosine similarity.
 *
 * Returns results sorted descending by score, filtered by minScore.
 */
export declare function searchCorpus(query: string, corpus: TfIdfCorpus, options?: {
    limit?: number;
    minScore?: number;
}): TfIdfSearchResult[];
/**
 * Adds or replaces a single document in an existing corpus.
 * DF is updated incrementally to avoid full rebuilds on every watch change.
 * Note: IDF values become slightly approximate after incremental updates;
 * a full rebuild is recommended periodically (e.g. on `neurcode brain build`).
 */
export declare function upsertDocumentInCorpus(corpus: TfIdfCorpus, doc: TfIdfDocument): TfIdfCorpus;
/**
 * Removes a document from the corpus.
 */
export declare function removeDocumentFromCorpus(corpus: TfIdfCorpus, docId: string): TfIdfCorpus;
//# sourceMappingURL=tfidf-engine.d.ts.map