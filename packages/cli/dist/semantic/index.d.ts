/**
 * Neurcode Semantic Layer — public API
 *
 * Phase 1: TF-IDF semantic vector store (deterministic, zero external deps)
 * Phase 2: Optional embedding upgrade (drop-in, same API surface)
 *
 * Usage:
 *   import { buildSemanticIndex, semanticSearch } from '../semantic';
 */
export { tokenize, buildCorpus, searchCorpus, computeIDF, upsertDocumentInCorpus, removeDocumentFromCorpus, } from './tfidf-engine';
export type { TfIdfDocument, TfIdfSearchResult, TfIdfCorpus, TfIdfIndexEntry, SparseVector, SparseVectorRecord, } from './tfidf-engine';
export { buildSemanticIndex, semanticSearch, upsertFileInIndex, removeFileFromIndex, getSemanticIndexStats, clearSemanticIndex, explainQuery, } from './vector-store';
export type { SemanticIndexScope, SemanticRetrievalConfidence, SemanticSearchResult, SemanticIndexStats, } from './vector-store';
//# sourceMappingURL=index.d.ts.map