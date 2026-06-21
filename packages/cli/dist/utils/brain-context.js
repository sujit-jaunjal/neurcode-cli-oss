"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBrainContextPath = getBrainContextPath;
exports.upsertBrainFileContextFromContent = upsertBrainFileContextFromContent;
exports.removeBrainFileContext = removeBrainFileContext;
exports.refreshBrainContextForFiles = refreshBrainContextForFiles;
exports.refreshBrainContextFromWorkspace = refreshBrainContextFromWorkspace;
exports.recordBrainProgressEvent = recordBrainProgressEvent;
exports.buildBrainContextPack = buildBrainContextPack;
exports.searchBrainContextEntries = searchBrainContextEntries;
exports.getBrainContextStats = getBrainContextStats;
exports.clearBrainContext = clearBrainContext;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const secret_masking_1 = require("./secret-masking");
const team_memory_path_hygiene_1 = require("./team-memory-path-hygiene");
const CONTEXT_SCHEMA_VERSION = 1;
const BRAIN_CONTEXT_FILE = 'brain-context.json';
const MAX_FILE_ENTRIES_PER_SCOPE = 2000;
const MAX_EVENTS_PER_SCOPE = 500;
const MAX_SUMMARY_LEN = 560;
const MAX_FILE_BYTES_TO_SUMMARIZE = 512 * 1024;
const MAX_REFRESH_FILES = 120;
const INDEXABLE_EXTENSIONS = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'go', 'rs', 'java', 'kt', 'swift', 'rb', 'php', 'cs',
    'json', 'yaml', 'yml', 'toml', 'md', 'sql', 'graphql', 'gql',
    'sh', 'bash', 'zsh', 'ps1', 'env',
    'html', 'css', 'scss', 'less',
    'prisma',
]);
function nowIso() {
    return new Date().toISOString();
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
function normalizeFilePath(filePath) {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function scopeKey(scope) {
    if (!scope.orgId || !scope.projectId)
        return null;
    return `${scope.orgId}::${scope.projectId}`;
}
function getContextPath(cwd) {
    return (0, path_1.join)(cwd, '.neurcode', BRAIN_CONTEXT_FILE);
}
function ensureNeurcodeDir(cwd) {
    const dir = (0, path_1.join)(cwd, '.neurcode');
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
}
function readStore(cwd) {
    const path = getContextPath(cwd);
    if (!(0, fs_1.existsSync)(path)) {
        return { schemaVersion: CONTEXT_SCHEMA_VERSION, scopes: {} };
    }
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.schemaVersion !== CONTEXT_SCHEMA_VERSION || !parsed.scopes || typeof parsed.scopes !== 'object') {
            throw new Error('Invalid context schema');
        }
        return parsed;
    }
    catch {
        try {
            (0, fs_1.renameSync)(path, path.replace(/\.json$/, `.corrupt-${Date.now()}.json`));
        }
        catch {
            // ignore
        }
        return { schemaVersion: CONTEXT_SCHEMA_VERSION, scopes: {} };
    }
}
function writeStore(cwd, store) {
    ensureNeurcodeDir(cwd);
    const path = getContextPath(cwd);
    const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    (0, fs_1.writeFileSync)(tmp, JSON.stringify(store, null, 2) + '\n', 'utf-8');
    (0, fs_1.renameSync)(tmp, path);
}
function ensureScopeStore(store, key, scope) {
    const existing = store.scopes[key];
    if (existing) {
        for (const filePath of Object.keys(existing.files)) {
            if (!(0, team_memory_path_hygiene_1.isTeamMemoryProjectPath)(filePath))
                delete existing.files[filePath];
        }
        existing.events = existing.events.filter((event) => !event.filePath || (0, team_memory_path_hygiene_1.isTeamMemoryProjectPath)(event.filePath));
        return existing;
    }
    const created = {
        orgId: scope.orgId,
        projectId: scope.projectId,
        updatedAt: nowIso(),
        files: {},
        events: [],
    };
    store.scopes[key] = created;
    return created;
}
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3);
}
function jaccard(a, b) {
    if (a.size === 0 || b.size === 0)
        return 0;
    let inter = 0;
    for (const token of a) {
        if (b.has(token))
            inter++;
    }
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}
function inferLanguage(filePath) {
    const path = normalizeFilePath(filePath);
    const ext = path.includes('.') ? path.split('.').pop()?.toLowerCase() || '' : '';
    const byExt = {
        ts: 'typescript',
        tsx: 'typescript-react',
        js: 'javascript',
        jsx: 'javascript-react',
        mjs: 'javascript',
        cjs: 'javascript',
        py: 'python',
        go: 'go',
        rs: 'rust',
        java: 'java',
        kt: 'kotlin',
        swift: 'swift',
        rb: 'ruby',
        php: 'php',
        cs: 'csharp',
        json: 'json',
        yaml: 'yaml',
        yml: 'yaml',
        toml: 'toml',
        md: 'markdown',
        sql: 'sql',
        sh: 'shell',
        bash: 'shell',
        zsh: 'shell',
        html: 'html',
        css: 'css',
        scss: 'scss',
        less: 'less',
        prisma: 'prisma',
    };
    return byExt[ext] || 'text';
}
function shouldIndexFile(filePath, content) {
    const normalized = normalizeFilePath(filePath);
    if (!normalized || !(0, team_memory_path_hygiene_1.isTeamMemoryProjectPath)(normalized))
        return false;
    if (normalized.startsWith('node_modules/'))
        return false;
    if (normalized.startsWith('.git/'))
        return false;
    if (normalized.endsWith('.lock'))
        return false;
    if (normalized.endsWith('.map'))
        return false;
    const ext = normalized.includes('.') ? normalized.split('.').pop()?.toLowerCase() || '' : '';
    if (ext && !INDEXABLE_EXTENSIONS.has(ext))
        return false;
    if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_BYTES_TO_SUMMARIZE)
        return false;
    if (content.includes('\u0000'))
        return false;
    return true;
}
function collectSymbols(content, language) {
    const symbols = new Set();
    const push = (name) => {
        const trimmed = name.trim();
        if (!trimmed)
            return;
        if (trimmed.length > 80)
            return;
        symbols.add(trimmed);
    };
    const applyRegex = (regex, index = 1) => {
        for (const match of content.matchAll(regex)) {
            if (!match[index])
                continue;
            push(match[index]);
            if (symbols.size >= 24)
                break;
        }
    };
    if (language.startsWith('typescript') || language.startsWith('javascript')) {
        applyRegex(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_][\w$]*)/g, 1);
        applyRegex(/\b(?:function|class)\s+([A-Za-z_][\w$]*)/g, 1);
        applyRegex(/\bconst\s+([A-Za-z_][\w$]*)\s*=\s*(?:async\s*)?\(/g, 1);
    }
    else if (language === 'python') {
        applyRegex(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm, 1);
        applyRegex(/^\s*class\s+([A-Za-z_]\w*)\s*(?:\(|:)/gm, 1);
    }
    else if (language === 'go') {
        applyRegex(/^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z_]\w*)\s*\(/gm, 1);
        applyRegex(/^\s*type\s+([A-Za-z_]\w*)\s+/gm, 1);
    }
    else {
        applyRegex(/^\s*(?:class|interface|type|enum|function)\s+([A-Za-z_]\w*)/gm, 1);
    }
    return Array.from(symbols).slice(0, 12);
}
function detectConcerns(content, filePath) {
    const text = `${filePath}\n${content}`.toLowerCase();
    const concerns = [];
    const checks = [
        ['auth', /\bauth|jwt|token|login|oauth|session\b/],
        ['api', /\broute|controller|endpoint|http|fastify|express|fetch\b/],
        ['db', /\bquery|sql|migration|prisma|typeorm|database|model\b/],
        ['billing', /\bbilling|subscription|invoice|payment|stripe\b/],
        ['cli', /\bcommand|argv|commander|cli\b/],
        ['tests', /\bdescribe\(|it\(|test\(|assert|expect\(/],
        ['ui', /\bcomponent|render|jsx|tsx|tailwind|css\b/],
        ['security', /\bsecurity|sanitize|encrypt|decrypt|permission|policy\b/],
    ];
    for (const [label, regex] of checks) {
        if (regex.test(text))
            concerns.push(label);
        if (concerns.length >= 5)
            break;
    }
    return concerns;
}
function summarizeContent(filePath, content) {
    const language = inferLanguage(filePath);
    const sizeBytes = Buffer.byteLength(content, 'utf-8');
    const lineCount = content.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    const symbols = collectSymbols(content, language);
    const concerns = detectConcerns(content, filePath);
    const parts = [];
    parts.push(`${language} file`);
    parts.push(`${lineCount} non-empty lines`);
    if (symbols.length > 0)
        parts.push(`symbols: ${symbols.slice(0, 6).join(', ')}`);
    if (concerns.length > 0)
        parts.push(`concerns: ${concerns.join(', ')}`);
    const summary = (0, secret_masking_1.maskSecretsInText)(parts.join(' | ')).masked.slice(0, MAX_SUMMARY_LEN);
    return { summary, symbols, language, sizeBytes };
}
function upsertEntry(scopeStore, filePath, content) {
    const path = normalizeFilePath(filePath);
    const timestamp = nowIso();
    const contentHash = sha256Hex(content);
    const existing = scopeStore.files[path];
    if (existing && existing.contentHash === contentHash) {
        existing.lastSeenAt = timestamp;
        scopeStore.updatedAt = timestamp;
        return { created: false, updated: false };
    }
    const { summary, symbols, language, sizeBytes } = summarizeContent(path, content);
    scopeStore.files[path] = {
        path,
        contentHash,
        language,
        symbols,
        summary,
        sizeBytes,
        updatedAt: timestamp,
        lastSeenAt: timestamp,
    };
    scopeStore.updatedAt = timestamp;
    return { created: !existing, updated: Boolean(existing) };
}
function pruneScope(scopeStore) {
    const entries = Object.values(scopeStore.files);
    if (entries.length > MAX_FILE_ENTRIES_PER_SCOPE) {
        entries.sort((a, b) => {
            const aTime = Date.parse(a.lastSeenAt) || 0;
            const bTime = Date.parse(b.lastSeenAt) || 0;
            return aTime - bTime;
        });
        const toDelete = entries.slice(0, entries.length - MAX_FILE_ENTRIES_PER_SCOPE);
        for (const entry of toDelete) {
            delete scopeStore.files[entry.path];
        }
    }
    if (scopeStore.events.length > MAX_EVENTS_PER_SCOPE) {
        scopeStore.events = scopeStore.events.slice(scopeStore.events.length - MAX_EVENTS_PER_SCOPE);
    }
}
function addEvent(scopeStore, event) {
    const next = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: nowIso(),
        ...event,
    };
    scopeStore.events.push(next);
    scopeStore.updatedAt = next.timestamp;
    pruneScope(scopeStore);
}
function parseGitStatusPaths(cwd, limit) {
    try {
        const status = (0, child_process_1.execSync)('git status --porcelain', {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const lines = status.split(/\r?\n/).filter((line) => line.trim().length > 0);
        const out = [];
        for (const line of lines) {
            if (out.length >= limit)
                break;
            if (line.length < 4)
                continue;
            const code = line.slice(0, 2);
            const raw = line.slice(3).trim();
            if (!raw)
                continue;
            const deleted = code.includes('D');
            const normalizedRaw = raw.includes(' -> ')
                ? raw.split(' -> ').pop() || raw
                : raw;
            const unquoted = normalizedRaw.startsWith('"') && normalizedRaw.endsWith('"')
                ? normalizedRaw.slice(1, -1).replace(/\\"/g, '"')
                : normalizedRaw;
            out.push({ path: normalizeFilePath(unquoted), deleted });
        }
        return out;
    }
    catch {
        return [];
    }
}
function collectDependencyHints(cwd) {
    const hints = [];
    const packageJsonPath = (0, path_1.join)(cwd, 'package.json');
    if (!(0, fs_1.existsSync)(packageJsonPath))
        return hints;
    try {
        const raw = (0, fs_1.readFileSync)(packageJsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const deps = Object.keys(parsed.dependencies || {});
        const devDeps = Object.keys(parsed.devDependencies || {});
        const merged = [...new Set([...deps, ...devDeps])].sort();
        return merged.slice(0, 80);
    }
    catch {
        return hints;
    }
}
function getBrainContextPath(cwd) {
    return getContextPath(cwd);
}
function upsertBrainFileContextFromContent(cwd, scope, filePath, content) {
    const key = scopeKey(scope);
    if (!key)
        return { indexed: false, created: false, updated: false };
    const normalizedPath = normalizeFilePath(filePath);
    if (!shouldIndexFile(normalizedPath, content)) {
        return { indexed: false, created: false, updated: false };
    }
    const store = readStore(cwd);
    const scopeStore = ensureScopeStore(store, key, scope);
    const result = upsertEntry(scopeStore, normalizedPath, content);
    pruneScope(scopeStore);
    writeStore(cwd, store);
    return { indexed: true, ...result };
}
function removeBrainFileContext(cwd, scope, filePath) {
    const key = scopeKey(scope);
    if (!key)
        return { removed: false };
    const store = readStore(cwd);
    const scopeStore = store.scopes[key];
    if (!scopeStore)
        return { removed: false };
    const normalizedPath = normalizeFilePath(filePath);
    if (!scopeStore.files[normalizedPath])
        return { removed: false };
    delete scopeStore.files[normalizedPath];
    scopeStore.updatedAt = nowIso();
    pruneScope(scopeStore);
    writeStore(cwd, store);
    return { removed: true };
}
function refreshBrainContextForFiles(cwd, scope, filePaths) {
    const key = scopeKey(scope);
    if (!key)
        return { indexed: 0, removed: 0, skipped: filePaths.length };
    const uniquePaths = [...new Set(filePaths.map(normalizeFilePath).filter(Boolean))].slice(0, MAX_REFRESH_FILES);
    if (uniquePaths.length === 0)
        return { indexed: 0, removed: 0, skipped: 0 };
    const store = readStore(cwd);
    const scopeStore = ensureScopeStore(store, key, scope);
    let indexed = 0;
    let removed = 0;
    let skipped = 0;
    for (const relPath of uniquePaths) {
        const fullPath = (0, path_1.join)(cwd, relPath);
        if (!(0, fs_1.existsSync)(fullPath)) {
            if (scopeStore.files[relPath]) {
                delete scopeStore.files[relPath];
                removed++;
            }
            else {
                skipped++;
            }
            continue;
        }
        try {
            const content = (0, fs_1.readFileSync)(fullPath, 'utf-8');
            if (!shouldIndexFile(relPath, content)) {
                skipped++;
                continue;
            }
            const change = upsertEntry(scopeStore, relPath, content);
            if (change.created || change.updated)
                indexed++;
        }
        catch {
            skipped++;
        }
    }
    scopeStore.lastRefreshAt = nowIso();
    pruneScope(scopeStore);
    writeStore(cwd, store);
    return { indexed, removed, skipped };
}
function refreshBrainContextFromWorkspace(cwd, scope, options) {
    const key = scopeKey(scope);
    if (!key) {
        return { indexed: 0, removed: 0, skipped: 0, considered: 0, refreshed: false };
    }
    const store = readStore(cwd);
    const scopeStore = ensureScopeStore(store, key, scope);
    const incomingHash = options?.workingTreeHash;
    if (incomingHash && scopeStore.lastWorkingTreeHash === incomingHash) {
        return { indexed: 0, removed: 0, skipped: 0, considered: 0, refreshed: false };
    }
    const limit = Math.max(1, Math.min(options?.maxFiles || MAX_REFRESH_FILES, MAX_REFRESH_FILES));
    const changed = parseGitStatusPaths(cwd, limit);
    if (changed.length === 0) {
        scopeStore.lastWorkingTreeHash = incomingHash;
        scopeStore.lastRefreshAt = nowIso();
        writeStore(cwd, store);
        return { indexed: 0, removed: 0, skipped: 0, considered: 0, refreshed: true };
    }
    let indexed = 0;
    let removed = 0;
    let skipped = 0;
    for (const item of changed) {
        if (!item.path)
            continue;
        const fullPath = (0, path_1.join)(cwd, item.path);
        if (item.deleted || !(0, fs_1.existsSync)(fullPath)) {
            if (scopeStore.files[item.path]) {
                delete scopeStore.files[item.path];
                removed++;
            }
            else {
                skipped++;
            }
            continue;
        }
        try {
            const content = (0, fs_1.readFileSync)(fullPath, 'utf-8');
            if (!shouldIndexFile(item.path, content)) {
                skipped++;
                continue;
            }
            const change = upsertEntry(scopeStore, item.path, content);
            if (change.created || change.updated)
                indexed++;
        }
        catch {
            skipped++;
        }
    }
    scopeStore.lastWorkingTreeHash = incomingHash;
    scopeStore.lastRefreshAt = nowIso();
    if (options?.recordEvent) {
        addEvent(scopeStore, {
            type: 'refresh',
            note: `indexed=${indexed}, removed=${removed}, considered=${changed.length}`,
        });
    }
    pruneScope(scopeStore);
    writeStore(cwd, store);
    return { indexed, removed, skipped, considered: changed.length, refreshed: true };
}
function recordBrainProgressEvent(cwd, scope, event) {
    const key = scopeKey(scope);
    if (!key)
        return;
    if (event.filePath && !(0, team_memory_path_hygiene_1.isTeamMemoryProjectPath)(event.filePath))
        return;
    const store = readStore(cwd);
    const scopeStore = ensureScopeStore(store, key, scope);
    addEvent(scopeStore, event);
    writeStore(cwd, store);
}
function buildBrainContextPack(cwd, scope, intent, options) {
    const key = scopeKey(scope);
    if (!key) {
        return { text: '', selectedFiles: 0, recentEvents: 0, totalIndexedFiles: 0 };
    }
    const store = readStore(cwd);
    const scopeStore = store.scopes[key];
    if (!scopeStore) {
        return { text: '', selectedFiles: 0, recentEvents: 0, totalIndexedFiles: 0 };
    }
    const maxFiles = Math.max(1, Math.min(options?.maxFiles || 8, 12));
    const maxEvents = Math.max(0, Math.min(options?.maxEvents || 6, 12));
    const maxBytes = Math.max(1024, Math.min(options?.maxBytes || 12 * 1024, 24 * 1024));
    const intentTokens = new Set(tokenize(intent));
    const nowMs = Date.now();
    const scored = Object.values(scopeStore.files).map((entry) => {
        const entryText = [entry.path, entry.language, entry.summary, entry.symbols.join(' ')].join(' ');
        const entryTokens = new Set(tokenize(entryText));
        let score = jaccard(intentTokens, entryTokens);
        for (const token of intentTokens) {
            if (entry.path.toLowerCase().includes(token)) {
                score += 0.06;
            }
        }
        const recencyHours = Math.max(0, (nowMs - Date.parse(entry.lastSeenAt || entry.updatedAt || nowIso())) / (1000 * 60 * 60));
        if (Number.isFinite(recencyHours)) {
            score += Math.max(0, 0.12 - recencyHours * 0.005);
        }
        return { entry, score };
    });
    const selected = scored
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxFiles)
        .map((row) => row.entry);
    if (selected.length === 0) {
        return {
            text: '',
            selectedFiles: 0,
            recentEvents: 0,
            totalIndexedFiles: Object.keys(scopeStore.files).length,
        };
    }
    const recentEvents = [...scopeStore.events]
        .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))
        .slice(0, maxEvents);
    const dependencyHints = collectDependencyHints(cwd);
    const lines = [];
    lines.push('NEURCODE LIVE CONTEXT PACK (repo-grounded, local memory)');
    lines.push('');
    if (recentEvents.length > 0) {
        lines.push('Recent Human Progress:');
        for (const event of recentEvents) {
            const ts = event.timestamp.replace('T', ' ').replace('Z', 'Z');
            const details = [
                event.filePath ? `file=${event.filePath}` : '',
                event.planId ? `planId=${event.planId}` : '',
                event.verdict ? `verdict=${event.verdict}` : '',
                event.note ? event.note : '',
            ].filter(Boolean).join(' | ');
            lines.push(`- [${ts}] ${event.type}${details ? `: ${details}` : ''}`);
        }
        lines.push('');
    }
    lines.push('Relevant File Summaries:');
    selected.forEach((entry, idx) => {
        lines.push(`${idx + 1}) ${entry.path} [${entry.language}] hash=${entry.contentHash.slice(0, 12)}...`);
        lines.push(`   summary: ${entry.summary}`);
        if (entry.symbols.length > 0) {
            lines.push(`   symbols: ${entry.symbols.join(', ')}`);
        }
    });
    lines.push('');
    if (dependencyHints.length > 0) {
        lines.push(`Known Dependency Hints (${dependencyHints.length}):`);
        lines.push(dependencyHints.join(', '));
        lines.push('');
    }
    lines.push('Grounding Rules:');
    lines.push('- Prioritize files and symbols listed above before proposing unrelated modules.');
    lines.push('- Do not assume new package imports unless they appear in dependency hints or user explicitly requests them.');
    lines.push('- If uncertain, propose reading additional existing files first.');
    lines.push('');
    let text = lines.join('\n');
    if (Buffer.byteLength(text, 'utf-8') > maxBytes) {
        text = text.slice(0, maxBytes);
    }
    return {
        text,
        selectedFiles: selected.length,
        recentEvents: recentEvents.length,
        totalIndexedFiles: Object.keys(scopeStore.files).length,
    };
}
function searchBrainContextEntries(cwd, scope, query, options) {
    const key = scopeKey(scope);
    if (!key) {
        return { entries: [], totalIndexedFiles: 0 };
    }
    const store = readStore(cwd);
    const scopeStore = store.scopes[key];
    if (!scopeStore) {
        return { entries: [], totalIndexedFiles: 0 };
    }
    const limit = Math.max(1, Math.min(options?.limit || 20, 120));
    const queryTokens = new Set(tokenize(query));
    const nowMs = Date.now();
    const scored = Object.values(scopeStore.files).map((entry) => {
        const entryText = [entry.path, entry.language, entry.summary, entry.symbols.join(' ')].join(' ');
        const entryTokens = new Set(tokenize(entryText));
        let score = 0;
        if (queryTokens.size > 0) {
            score = jaccard(queryTokens, entryTokens);
            for (const token of queryTokens) {
                if (entry.path.toLowerCase().includes(token)) {
                    score += 0.06;
                }
            }
        }
        else {
            score = 0.01;
        }
        const recencyHours = Math.max(0, (nowMs - Date.parse(entry.lastSeenAt || entry.updatedAt || nowIso())) / (1000 * 60 * 60));
        if (Number.isFinite(recencyHours)) {
            score += Math.max(0, 0.12 - recencyHours * 0.005);
        }
        return { entry, score };
    });
    const entries = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((row) => ({
        path: row.entry.path,
        summary: row.entry.summary,
        language: row.entry.language,
        symbols: row.entry.symbols,
        contentHash: row.entry.contentHash,
        updatedAt: row.entry.updatedAt,
        lastSeenAt: row.entry.lastSeenAt,
        score: row.score,
    }));
    return {
        entries,
        totalIndexedFiles: Object.keys(scopeStore.files).length,
        lastUpdatedAt: scopeStore.updatedAt,
        lastRefreshAt: scopeStore.lastRefreshAt,
    };
}
function getBrainContextStats(cwd, scope) {
    const path = getContextPath(cwd);
    const exists = (0, fs_1.existsSync)(path);
    const store = readStore(cwd);
    const key = scopeKey(scope);
    const scopeStore = key ? store.scopes[key] : undefined;
    return {
        path,
        exists,
        scopeFound: Boolean(scopeStore),
        totalScopes: Object.keys(store.scopes).length,
        fileEntries: scopeStore ? Object.keys(scopeStore.files).length : 0,
        eventEntries: scopeStore ? scopeStore.events.length : 0,
        lastUpdatedAt: scopeStore?.updatedAt,
        lastRefreshAt: scopeStore?.lastRefreshAt,
        lastWorkingTreeHash: scopeStore?.lastWorkingTreeHash,
    };
}
function clearBrainContext(cwd, mode, scope) {
    const path = getContextPath(cwd);
    if (!(0, fs_1.existsSync)(path)) {
        return { removedScopes: 0, removedFiles: 0, removedEvents: 0, removedStoreFile: false };
    }
    if (mode === 'repo') {
        try {
            (0, fs_1.renameSync)(path, path.replace(/\.json$/, `.cleared-${Date.now()}.json`));
            return { removedScopes: 0, removedFiles: 0, removedEvents: 0, removedStoreFile: true };
        }
        catch {
            return { removedScopes: 0, removedFiles: 0, removedEvents: 0, removedStoreFile: false };
        }
    }
    const store = readStore(cwd);
    const keys = Object.keys(store.scopes);
    let removedScopes = 0;
    let removedFiles = 0;
    let removedEvents = 0;
    for (const key of keys) {
        const scopeStore = store.scopes[key];
        if (!scopeStore)
            continue;
        const matchesOrg = scope.orgId && scopeStore.orgId === scope.orgId;
        const matchesProject = scope.projectId && scopeStore.projectId === scope.projectId;
        const shouldRemove = mode === 'org' ? Boolean(matchesOrg) : Boolean(matchesOrg && matchesProject);
        if (!shouldRemove)
            continue;
        removedScopes++;
        removedFiles += Object.keys(scopeStore.files).length;
        removedEvents += scopeStore.events.length;
        delete store.scopes[key];
    }
    writeStore(cwd, store);
    return { removedScopes, removedFiles, removedEvents, removedStoreFile: false };
}
//# sourceMappingURL=brain-context.js.map