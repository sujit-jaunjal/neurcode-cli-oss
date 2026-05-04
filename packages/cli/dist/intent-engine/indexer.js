"use strict";
/**
 * Code Indexer — builds a lightweight FileMeta index from diff hunks.
 * Operates entirely on the parsed diff (no disk I/O beyond what the diff
 * parser has already done), so it adds negligible time to verify.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexDiffFiles = indexDiffFiles;
// ── Layer detection ───────────────────────────────────────────────────────────
const UI_PATH = /(\/|^)(components?|pages?|views?|screens?|containers?|ui)[/\\]|\.tsx$/i;
const API_PATH = /(\/|^)(routes?|controllers?|handlers?|api|endpoints?)[/\\]/i;
const SERVICE_PATH = /(\/|^)(services?|repositories?|domain|usecases?)[/\\]/i;
const TEST_PATH = /\.(test|spec)\.[jt]sx?$|(\/|^)(__tests?__|tests?)[/\\]/i;
const CONFIG_PATH = /(\/|^)(config|configs?|settings?)[/\\]|\.config\.[jt]sx?$/i;
function inferLayer(filePath) {
    if (TEST_PATH.test(filePath))
        return 'test';
    if (UI_PATH.test(filePath))
        return 'ui';
    if (API_PATH.test(filePath))
        return 'api';
    if (SERVICE_PATH.test(filePath))
        return 'service';
    if (CONFIG_PATH.test(filePath))
        return 'config';
    return 'unknown';
}
// ── Keyword extraction ────────────────────────────────────────────────────────
const IMPORT_RE = /import\s+.*from\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
function extractImports(code) {
    const imports = [];
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(code)) !== null)
        imports.push(m[1]);
    REQUIRE_RE.lastIndex = 0;
    while ((m = REQUIRE_RE.exec(code)) !== null)
        imports.push(m[1]);
    return imports;
}
const KEYWORD_TOKENS = new Set([
    // auth
    'jwt', 'token', 'session', 'login', 'logout', 'auth', 'password', 'hash',
    'bcrypt', 'role', 'permission', 'bearer', 'oauth', 'middleware',
    // validation
    'validate', 'validation', 'schema', 'zod', 'joi', 'yup', 'sanitize',
    'sanitization', 'parse',
    // db
    'prisma', 'db', 'database', 'query', 'findMany', 'findOne', 'create',
    'update', 'delete', 'transaction', 'pool', 'knex', 'sequelize',
    // api
    'req', 'res', 'request', 'response', 'router', 'route', 'endpoint',
    'controller', 'handler', 'express', 'fastify', 'hono', 'next',
    // payment
    'stripe', 'payment', 'checkout', 'invoice', 'billing', 'webhook',
    // security
    'encrypt', 'decrypt', 'crypto', 'hmac', 'tls', 'ssl',
    // test
    'describe', 'it', 'test', 'expect', 'mock', 'beforeEach', 'afterEach',
]);
function extractKeywords(code) {
    const tokens = code.split(/\W+/).filter(Boolean);
    const found = [];
    const seen = new Set();
    for (const tok of tokens) {
        const lower = tok.toLowerCase();
        if (KEYWORD_TOKENS.has(lower) && !seen.has(lower)) {
            found.push(lower);
            seen.add(lower);
        }
    }
    return found;
}
// ── Public API ────────────────────────────────────────────────────────────────
function indexDiffFiles(diffFiles) {
    const index = new Map();
    for (const file of diffFiles) {
        const addedLines = [];
        for (const hunk of file.hunks ?? []) {
            for (const line of hunk.lines ?? []) {
                if (line.type === 'added')
                    addedLines.push(line.content);
            }
        }
        const addedContent = addedLines.join('\n');
        const meta = {
            path: file.path,
            layer: inferLayer(file.path),
            imports: extractImports(addedContent),
            keywords: extractKeywords(addedContent),
            addedLines: file.addedLines,
            removedLines: file.removedLines,
            addedContent,
        };
        index.set(file.path, meta);
    }
    return index;
}
//# sourceMappingURL=indexer.js.map