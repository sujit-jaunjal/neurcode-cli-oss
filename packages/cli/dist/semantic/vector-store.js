"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSemanticIndex = buildSemanticIndex;
exports.semanticSearch = semanticSearch;
exports.upsertFileInIndex = upsertFileInIndex;
exports.removeFileFromIndex = removeFileFromIndex;
exports.getSemanticIndexStats = getSemanticIndexStats;
exports.clearSemanticIndex = clearSemanticIndex;
exports.explainQuery = explainQuery;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const tfidf_engine_1 = require("./tfidf-engine");
// ── Constants ──────────────────────────────────────────────────────────────────
const SEMANTIC_INDEX_FILE = 'semantic-index.json';
const NEURCODE_DIR = '.neurcode';
const SEMANTIC_SCHEMA_VER = 1;
/** Maximum number of documents to index (mirrors brain-context limit). */
const MAX_INDEX_DOCS = 2000;
// ── Path helpers ───────────────────────────────────────────────────────────────
function indexPath(cwd) {
    return (0, path_1.join)(cwd, NEURCODE_DIR, SEMANTIC_INDEX_FILE);
}
function neurcodeDir(cwd) {
    return (0, path_1.join)(cwd, NEURCODE_DIR);
}
function brainContextPath(cwd) {
    return (0, path_1.join)(cwd, NEURCODE_DIR, 'brain-context.json');
}
function scopeKey(scope) {
    return `${scope.orgId ?? 'anon'}::${scope.projectId ?? 'default'}`;
}
// ── Persistence ────────────────────────────────────────────────────────────────
function readIndex(cwd, scope) {
    const path = indexPath(cwd);
    if (!(0, fs_1.existsSync)(path))
        return null;
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.schemaVersion !== SEMANTIC_SCHEMA_VER ||
            parsed.scopeKey !== scopeKey(scope) ||
            !parsed.corpus) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function writeIndex(cwd, index) {
    const dir = neurcodeDir(cwd);
    if (!(0, fs_1.existsSync)(dir))
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    const path = indexPath(cwd);
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    (0, fs_1.writeFileSync)(tmp, JSON.stringify(index), 'utf-8');
    (0, fs_1.renameSync)(tmp, path);
}
function readBrainContextEntries(cwd, scope) {
    const path = brainContextPath(cwd);
    if (!(0, fs_1.existsSync)(path))
        return [];
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed?.scopes)
            return [];
        const key = scopeKey(scope);
        const scoped = parsed.scopes[key];
        if (scoped?.files) {
            return Object.values(scoped.files);
        }
        // Fallback: merge all scopes when scope not initialized
        if (!scope.orgId || !scope.projectId) {
            const merged = {};
            for (const s of Object.values(parsed.scopes)) {
                for (const [p, entry] of Object.entries(s.files || {})) {
                    const existing = merged[p];
                    const existTs = Date.parse(existing?.lastSeenAt || '') || 0;
                    const incomingTs = Date.parse(entry?.lastSeenAt || '') || 0;
                    if (!existing || incomingTs >= existTs)
                        merged[p] = entry;
                }
            }
            return Object.values(merged);
        }
        return [];
    }
    catch {
        return [];
    }
}
function entryToDocument(entry) {
    // Build rich text from all indexed signals
    const text = [
        entry.path,
        entry.language,
        entry.summary,
        entry.symbols.join(' '),
        // Expand file path segments (e.g. src/auth/middleware → src auth middleware)
        entry.path.replace(/[/\\._-]/g, ' '),
    ].join(' ');
    return {
        id: entry.path,
        text,
        metadata: {
            language: entry.language,
            summary: entry.summary,
            symbols: entry.symbols,
            contentHash: entry.contentHash,
        },
    };
}
function sha256(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * Builds a full semantic index from the current brain-context entries.
 * Should be called after `neurcode brain build` or equivalent full refresh.
 *
 * Returns: number of documents indexed.
 */
function buildSemanticIndex(cwd, scope) {
    const entries = readBrainContextEntries(cwd, scope).slice(0, MAX_INDEX_DOCS);
    if (entries.length === 0)
        return 0;
    const docs = entries.map(entryToDocument);
    const corpus = (0, tfidf_engine_1.buildCorpus)(docs);
    const contentHashes = {};
    for (const entry of entries) {
        contentHashes[entry.path] = entry.contentHash;
    }
    writeIndex(cwd, {
        schemaVersion: SEMANTIC_SCHEMA_VER,
        scopeKey: scopeKey(scope),
        corpus,
        contentHashes,
    });
    return entries.length;
}
/**
 * Searches the semantic index.
 *
 * Falls back gracefully to an empty result if no index exists (never throws).
 */
function semanticSearch(cwd, scope, query, options = {}) {
    if (!query?.trim())
        return [];
    const stored = readIndex(cwd, scope);
    if (!stored)
        return [];
    const raw = (0, tfidf_engine_1.searchCorpus)(query, stored.corpus, {
        limit: options.limit ?? 20,
        minScore: options.minScore ?? 0.01,
    });
    const docCount = stored.corpus.documentCount ?? stored.corpus.entries.length;
    const indexTruncated = docCount >= MAX_INDEX_DOCS;
    const entries = readBrainContextEntries(cwd, scope);
    const eligibleDocs = Math.min(entries.length, MAX_INDEX_DOCS);
    const corpusCoverageRatio = entries.length === 0 ? 1 : Math.min(1, eligibleDocs / entries.length);
    const queryTerms = (0, tfidf_engine_1.tokenize)(query).slice(0, 24);
    return raw.map((r) => ({
        filePath: r.id,
        score: r.score,
        id: r.id,
        language: r.metadata?.language || '',
        summary: r.metadata?.summary || '',
        symbols: r.metadata?.symbols || [],
        contentHash: r.metadata?.contentHash || '',
        confidence: {
            retrievalScore: r.score,
            corpusCoverageRatio,
            indexTruncated,
            documentsIndexed: docCount,
            documentsCap: MAX_INDEX_DOCS,
            retrievalMethod: 'deterministic-tfidf',
        },
        explainability: {
            retrievalCategory: 'deterministic-semantic',
            includedBecause: `TF-IDF rank ${r.score.toFixed(4)} for query "${query.trim()}"`,
            matchedTerms: queryTerms.filter((term) => {
                const haystack = `${r.id} ${r.metadata?.summary || ''} ${(r.metadata?.symbols || []).join(' ')}`.toLowerCase();
                return haystack.includes(term.toLowerCase());
            }).slice(0, 8),
            retrievalPath: [r.id],
            federationSource: 'local-repo-index',
            truncationStatus: indexTruncated ? 'index-truncated' : 'none',
        },
    }));
}
/**
 * Incrementally adds or updates a single file in the semantic index.
 * Called by the watch daemon on file changes.
 *
 * `content` is the raw file content to vectorize.
 * If the content hash matches what's already indexed, this is a no-op.
 */
function upsertFileInIndex(cwd, scope, filePath, content, metadata) {
    const stored = readIndex(cwd, scope);
    if (!stored)
        return false; // Index must exist before incremental updates
    const hash = sha256(content);
    if (stored.contentHashes[filePath] === hash)
        return false; // No change
    const text = [
        filePath,
        metadata?.language || '',
        metadata?.summary || '',
        (metadata?.symbols || []).join(' '),
        filePath.replace(/[/\\._-]/g, ' '),
        content.slice(0, 4000), // First 4KB of content for extra signal
    ].join(' ');
    const doc = {
        id: filePath,
        text,
        metadata: {
            language: metadata?.language || '',
            summary: metadata?.summary || '',
            symbols: metadata?.symbols || [],
            contentHash: hash,
        },
    };
    const updatedCorpus = (0, tfidf_engine_1.upsertDocumentInCorpus)(stored.corpus, doc);
    const updatedHashes = { ...stored.contentHashes, [filePath]: hash };
    writeIndex(cwd, {
        ...stored,
        corpus: updatedCorpus,
        contentHashes: updatedHashes,
    });
    return true;
}
/**
 * Removes a file from the semantic index.
 * Called by the watch daemon on file deletions.
 */
function removeFileFromIndex(cwd, scope, filePath) {
    const stored = readIndex(cwd, scope);
    if (!stored)
        return false;
    if (!stored.contentHashes[filePath])
        return false;
    const updatedCorpus = (0, tfidf_engine_1.removeDocumentFromCorpus)(stored.corpus, filePath);
    const updatedHashes = { ...stored.contentHashes };
    delete updatedHashes[filePath];
    writeIndex(cwd, {
        ...stored,
        corpus: updatedCorpus,
        contentHashes: updatedHashes,
    });
    return true;
}
/**
 * Returns metadata about the current index without loading the full corpus.
 */
function getSemanticIndexStats(cwd, scope) {
    const path = indexPath(cwd);
    if (!(0, fs_1.existsSync)(path)) {
        return { exists: false, documentCount: 0, builtAt: null, schemaVersion: null, sizeBytes: null };
    }
    try {
        const { statSync } = require('fs');
        const sizeBytes = statSync(path).size;
        const stored = readIndex(cwd, scope);
        return {
            exists: true,
            documentCount: stored?.corpus?.documentCount ?? 0,
            builtAt: stored?.corpus?.builtAt ?? null,
            schemaVersion: stored?.schemaVersion ?? null,
            sizeBytes,
        };
    }
    catch {
        return { exists: true, documentCount: 0, builtAt: null, schemaVersion: null, sizeBytes: null };
    }
}
/**
 * Deletes the semantic index file for this workspace.
 * Called by `neurcode brain clear`.
 */
function clearSemanticIndex(cwd) {
    const path = indexPath(cwd);
    if (!(0, fs_1.existsSync)(path))
        return false;
    try {
        const { renameSync: mv } = require('fs');
        mv(path, path.replace(/\.json$/, `.cleared-${Date.now()}.json`));
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Returns the query's tokenized representation for debugging/transparency.
 */
function explainQuery(query) {
    const tokens = (0, tfidf_engine_1.tokenize)(query);
    return { tokens, termCount: tokens.length };
}
//# sourceMappingURL=vector-store.js.map