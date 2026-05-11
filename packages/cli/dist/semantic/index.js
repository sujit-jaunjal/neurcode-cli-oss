"use strict";
/**
 * Neurcode Semantic Layer — public API
 *
 * Phase 1: TF-IDF semantic vector store (deterministic, zero external deps)
 * Phase 2: Optional embedding upgrade (drop-in, same API surface)
 *
 * Usage:
 *   import { buildSemanticIndex, semanticSearch } from '../semantic';
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainQuery = exports.clearSemanticIndex = exports.getSemanticIndexStats = exports.removeFileFromIndex = exports.upsertFileInIndex = exports.semanticSearch = exports.buildSemanticIndex = exports.removeDocumentFromCorpus = exports.upsertDocumentInCorpus = exports.computeIDF = exports.searchCorpus = exports.buildCorpus = exports.tokenize = void 0;
var tfidf_engine_1 = require("./tfidf-engine");
// TF-IDF engine primitives (for testing / advanced use)
Object.defineProperty(exports, "tokenize", { enumerable: true, get: function () { return tfidf_engine_1.tokenize; } });
Object.defineProperty(exports, "buildCorpus", { enumerable: true, get: function () { return tfidf_engine_1.buildCorpus; } });
Object.defineProperty(exports, "searchCorpus", { enumerable: true, get: function () { return tfidf_engine_1.searchCorpus; } });
Object.defineProperty(exports, "computeIDF", { enumerable: true, get: function () { return tfidf_engine_1.computeIDF; } });
Object.defineProperty(exports, "upsertDocumentInCorpus", { enumerable: true, get: function () { return tfidf_engine_1.upsertDocumentInCorpus; } });
Object.defineProperty(exports, "removeDocumentFromCorpus", { enumerable: true, get: function () { return tfidf_engine_1.removeDocumentFromCorpus; } });
var vector_store_1 = require("./vector-store");
// High-level vector store (persists to .neurcode/semantic-index.json)
Object.defineProperty(exports, "buildSemanticIndex", { enumerable: true, get: function () { return vector_store_1.buildSemanticIndex; } });
Object.defineProperty(exports, "semanticSearch", { enumerable: true, get: function () { return vector_store_1.semanticSearch; } });
Object.defineProperty(exports, "upsertFileInIndex", { enumerable: true, get: function () { return vector_store_1.upsertFileInIndex; } });
Object.defineProperty(exports, "removeFileFromIndex", { enumerable: true, get: function () { return vector_store_1.removeFileFromIndex; } });
Object.defineProperty(exports, "getSemanticIndexStats", { enumerable: true, get: function () { return vector_store_1.getSemanticIndexStats; } });
Object.defineProperty(exports, "clearSemanticIndex", { enumerable: true, get: function () { return vector_store_1.clearSemanticIndex; } });
Object.defineProperty(exports, "explainQuery", { enumerable: true, get: function () { return vector_store_1.explainQuery; } });
//# sourceMappingURL=index.js.map