"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenize = tokenize;
exports.computeIDF = computeIDF;
exports.buildCorpus = buildCorpus;
exports.searchCorpus = searchCorpus;
exports.upsertDocumentInCorpus = upsertDocumentInCorpus;
exports.removeDocumentFromCorpus = removeDocumentFromCorpus;
// ── Constants ──────────────────────────────────────────────────────────────────
/** Terms shorter than this are discarded. */
const MIN_TERM_LEN = 2;
/** Max distinct terms stored per document (cap to control memory). */
const MAX_TERMS_PER_DOC = 400;
/**
 * Stop-words that carry no semantic signal for code search.
 * Keep this tight — over-pruning hurts recall.
 */
const STOP_WORDS = new Set([
    'the', 'and', 'for', 'are', 'was', 'were', 'has', 'have', 'had',
    'not', 'but', 'with', 'from', 'this', 'that', 'they', 'their',
    'its', 'also', 'will', 'can', 'may', 'would', 'could', 'should',
    'into', 'out', 'any', 'all', 'one', 'two', 'new', 'use', 'used',
    'var', 'let', 'const', 'type', 'interface', 'class', 'function',
    'return', 'import', 'export', 'from', 'default', 'async', 'await',
    'true', 'false', 'null', 'undefined', 'void', 'string', 'number',
    'boolean', 'object', 'array', 'promise', 'error', 'extends', 'implements',
]);
// ── Tokenisation ───────────────────────────────────────────────────────────────
/**
 * Tokenises source text into normalised terms.
 * Splits on: whitespace, punctuation, camelCase, PascalCase, snake_case.
 */
function tokenize(text) {
    if (!text)
        return [];
    // Split camelCase / PascalCase into sub-words: getUserById → get User By Id
    const camelSplit = text.replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    const tokens = camelSplit
        .toLowerCase()
        .split(/[\s\W_]+/) // split on whitespace, punctuation, underscores
        .filter((t) => t.length >= MIN_TERM_LEN && !STOP_WORDS.has(t));
    return tokens;
}
// ── TF computation ─────────────────────────────────────────────────────────────
/**
 * Returns a term-frequency map for a single document.
 * Uses log-normalised TF: log(1 + count / doc_length)
 */
function computeTF(tokens) {
    const freq = new Map();
    for (const token of tokens) {
        freq.set(token, (freq.get(token) ?? 0) + 1);
    }
    const docLen = Math.max(1, tokens.length);
    const tf = new Map();
    for (const [term, count] of freq) {
        tf.set(term, Math.log(1 + count / docLen));
    }
    return tf;
}
// ── IDF computation ────────────────────────────────────────────────────────────
/**
 * Computes smoothed IDF for every term in the vocabulary.
 * IDF(t) = log((N + 1) / (df(t) + 1)) + 1
 */
function computeIDF(df, N) {
    const idf = new Map();
    for (const [term, docFreq] of Object.entries(df)) {
        idf.set(term, Math.log((N + 1) / (docFreq + 1)) + 1);
    }
    return idf;
}
// ── Corpus building ────────────────────────────────────────────────────────────
function buildCorpus(documents) {
    const N = documents.length;
    // Pass 1: collect per-document token lists and global DF
    const docTokens = [];
    const df = {};
    for (const doc of documents) {
        const tokens = tokenize(doc.text);
        docTokens.push({ id: doc.id, tokens, metadata: doc.metadata });
        // Each unique term contributes 1 to DF
        const unique = new Set(tokens);
        for (const term of unique) {
            df[term] = (df[term] ?? 0) + 1;
        }
    }
    const idf = computeIDF(df, N);
    // Pass 2: compute TF-IDF vectors and norms
    const entries = [];
    for (const { id, tokens, metadata } of docTokens) {
        const tf = computeTF(tokens);
        // Build sparse TF-IDF vector, capped at MAX_TERMS_PER_DOC by weight
        const weightedTerms = [];
        for (const [term, tfVal] of tf) {
            const idfVal = idf.get(term) ?? 1;
            weightedTerms.push([term, tfVal * idfVal]);
        }
        // Sort by weight descending and keep top MAX_TERMS_PER_DOC
        weightedTerms.sort((a, b) => b[1] - a[1]);
        const topTerms = weightedTerms.slice(0, MAX_TERMS_PER_DOC);
        const vector = {};
        let normSq = 0;
        for (const [term, weight] of topTerms) {
            vector[term] = weight;
            normSq += weight * weight;
        }
        const norm = Math.sqrt(normSq);
        entries.push({ id, vector, norm, termCount: topTerms.length, metadata });
    }
    return {
        schemaVersion: 1,
        builtAt: new Date().toISOString(),
        documentCount: N,
        df,
        entries,
    };
}
// ── Search ─────────────────────────────────────────────────────────────────────
/**
 * Vectorises a query using the corpus IDF weights, then ranks documents
 * by cosine similarity.
 *
 * Returns results sorted descending by score, filtered by minScore.
 */
function searchCorpus(query, corpus, options = {}) {
    const limit = Math.max(1, options.limit ?? 20);
    const minScore = Math.max(0, options.minScore ?? 0.01);
    const N = Math.max(1, corpus.documentCount);
    const idf = computeIDF(corpus.df, N);
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0)
        return [];
    // Build query TF-IDF vector
    const queryTF = computeTF(queryTokens);
    const queryVec = new Map();
    let queryNormSq = 0;
    for (const [term, tfVal] of queryTF) {
        const idfVal = idf.get(term) ?? (Math.log((N + 1) / 1) + 1); // IDF for unseen term
        const weight = tfVal * idfVal;
        queryVec.set(term, weight);
        queryNormSq += weight * weight;
    }
    const queryNorm = Math.sqrt(queryNormSq);
    if (queryNorm === 0)
        return [];
    // Score each document
    const scored = [];
    for (const entry of corpus.entries) {
        if (entry.norm === 0)
            continue;
        // Dot product of query and document sparse vectors
        let dot = 0;
        for (const [term, qWeight] of queryVec) {
            const dWeight = entry.vector[term];
            if (dWeight !== undefined) {
                dot += qWeight * dWeight;
            }
        }
        const cosine = dot / (queryNorm * entry.norm);
        if (cosine >= minScore) {
            scored.push({ id: entry.id, score: cosine, metadata: entry.metadata });
        }
    }
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
// ── Incremental update helpers ─────────────────────────────────────────────────
/**
 * Adds or replaces a single document in an existing corpus.
 * DF is updated incrementally to avoid full rebuilds on every watch change.
 * Note: IDF values become slightly approximate after incremental updates;
 * a full rebuild is recommended periodically (e.g. on `neurcode brain build`).
 */
function upsertDocumentInCorpus(corpus, doc) {
    const existingIdx = corpus.entries.findIndex((e) => e.id === doc.id);
    // If replacing, first remove old DF contributions
    const dfMutable = { ...corpus.df };
    let N = corpus.documentCount;
    if (existingIdx !== -1) {
        const old = corpus.entries[existingIdx];
        for (const term of Object.keys(old.vector)) {
            if (dfMutable[term] !== undefined) {
                dfMutable[term] -= 1;
                if (dfMutable[term] <= 0)
                    delete dfMutable[term];
            }
        }
    }
    else {
        N += 1;
    }
    // Add new DF contributions
    const tokens = tokenize(doc.text);
    const unique = new Set(tokens);
    for (const term of unique) {
        dfMutable[term] = (dfMutable[term] ?? 0) + 1;
    }
    const idf = computeIDF(dfMutable, N);
    const tf = computeTF(tokens);
    const weightedTerms = [];
    for (const [term, tfVal] of tf) {
        const idfVal = idf.get(term) ?? 1;
        weightedTerms.push([term, tfVal * idfVal]);
    }
    weightedTerms.sort((a, b) => b[1] - a[1]);
    const topTerms = weightedTerms.slice(0, MAX_TERMS_PER_DOC);
    const vector = {};
    let normSq = 0;
    for (const [term, weight] of topTerms) {
        vector[term] = weight;
        normSq += weight * weight;
    }
    const norm = Math.sqrt(normSq);
    const newEntry = {
        id: doc.id,
        vector,
        norm,
        termCount: topTerms.length,
        metadata: doc.metadata,
    };
    const newEntries = existingIdx !== -1
        ? corpus.entries.map((e, i) => (i === existingIdx ? newEntry : e))
        : [...corpus.entries, newEntry];
    return {
        schemaVersion: 1,
        builtAt: new Date().toISOString(),
        documentCount: N,
        df: dfMutable,
        entries: newEntries,
    };
}
/**
 * Removes a document from the corpus.
 */
function removeDocumentFromCorpus(corpus, docId) {
    const existingIdx = corpus.entries.findIndex((e) => e.id === docId);
    if (existingIdx === -1)
        return corpus;
    const dfMutable = { ...corpus.df };
    const old = corpus.entries[existingIdx];
    for (const term of Object.keys(old.vector)) {
        if (dfMutable[term] !== undefined) {
            dfMutable[term] -= 1;
            if (dfMutable[term] <= 0)
                delete dfMutable[term];
        }
    }
    return {
        schemaVersion: 1,
        builtAt: new Date().toISOString(),
        documentCount: corpus.documentCount - 1,
        df: dfMutable,
        entries: corpus.entries.filter((_, i) => i !== existingIdx),
    };
}
//# sourceMappingURL=tfidf-engine.js.map