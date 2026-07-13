"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_REPO_BRAIN_SCHEMA_VERSION = void 0;
exports.localRepoBrainLanguageFor = localRepoBrainLanguageFor;
exports.sensitiveKindsFor = sensitiveKindsFor;
exports.resolvePythonModulePath = resolvePythonModulePath;
exports.analyzeLocalProposedSource = analyzeLocalProposedSource;
exports.localRepoBrainPath = localRepoBrainPath;
exports.localRepoBrainMarkdownPath = localRepoBrainMarkdownPath;
exports.projectRepositoryGraphToLocalRepoBrain = projectRepositoryGraphToLocalRepoBrain;
exports.buildLocalRepoBrain = buildLocalRepoBrain;
exports.writeLocalRepoBrain = writeLocalRepoBrain;
exports.readLocalRepoBrain = readLocalRepoBrain;
exports.renderLocalRepoBrainMarkdown = renderLocalRepoBrainMarkdown;
exports.evaluateRepoSymbolDuplicatePolicy = evaluateRepoSymbolDuplicatePolicy;
exports.getRepoBrainContext = getRepoBrainContext;
exports.formatRepoBrainFactsForMessage = formatRepoBrainFactsForMessage;
exports.searchLocalRepoBrain = searchLocalRepoBrain;
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const team_memory_path_hygiene_1 = require("./team-memory-path-hygiene");
const brain_1 = require("@neurcode-ai/brain");
exports.LOCAL_REPO_BRAIN_SCHEMA_VERSION = 'neurcode.local-repo-brain.v1';
const IGNORE_DIRS = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.turbo',
    '.cache',
    '.neurcode/brain',
    '.neurcode/repo-brain',
    '.neurcode/sessions',
    '.neurcode/understanding',
]);
const GENERATED_PATTERNS = [
    /(^|\/)dist\//,
    /(^|\/)build\//,
    /(^|\/)coverage\//,
    /(^|\/)vendor\//,
    /(^|\/)generated\//,
    /\.min\.(js|css)$/i,
    /\.map$/i,
    /(^|\/)pnpm-lock\.yaml$/i,
    /(^|\/)package-lock\.json$/i,
    /(^|\/)yarn\.lock$/i,
    /(^|\/)uv\.lock$/i,
];
const ANALYZABLE_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.py',
    '.go',
    '.java',
    '.rb',
    '.rs',
    '.md',
    '.yml',
    '.yaml',
    '.json',
    '.sh',
    '.bash',
]);
const JS_TS_RESERVED_WORDS = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'return', 'throw', 'try', 'catch', 'finally', 'yield',
    'var', 'let', 'const', 'function', 'class', 'import', 'export', 'default',
    'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'void',
    'async', 'await', 'from', 'as', 'with', 'debugger',
    'this', 'super', 'extends', 'implements',
    'static', 'abstract', 'override', 'readonly', 'declare',
    'then',
    'def', 'pass', 'and', 'or', 'not', 'is', 'lambda', 'assert',
    'del', 'raise', 'except', 'global', 'nonlocal',
]);
const TEST_PATH_PATTERNS = [
    /\/__tests__\//,
    /\/tests?\//,
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
];
function isTestPath(filePath) {
    return TEST_PATH_PATTERNS.some((p) => p.test(filePath));
}
function hash(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
function shortHash(value) {
    return hash(value).slice(0, 24);
}
function normalizePath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '');
}
function moduleKey(filePath) {
    const parts = normalizePath(filePath).split('/').filter(Boolean);
    if (parts.length >= 2 && ['packages', 'services', 'web', 'apps'].includes(parts[0])) {
        return `${parts[0]}/${parts[1]}`;
    }
    return parts[0] || 'root';
}
function localRepoBrainLanguageFor(filePath) {
    const ext = (0, node_path_1.extname)(filePath).toLowerCase();
    if (ext === '.ts' || ext === '.tsx')
        return 'typescript';
    if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext))
        return 'javascript';
    if (ext === '.py')
        return 'python';
    if (ext === '.go')
        return 'go';
    if (ext === '.java')
        return 'java';
    if (ext === '.rb')
        return 'ruby';
    if (ext === '.rs')
        return 'rust';
    if (ext === '.md')
        return 'markdown';
    if (ext === '.yml' || ext === '.yaml')
        return 'yaml';
    if (ext === '.json')
        return 'json';
    if (ext === '.sh' || ext === '.bash')
        return 'shell';
    return 'other';
}
function isGeneratedPath(filePath) {
    return GENERATED_PATTERNS.some((pattern) => pattern.test(filePath));
}
function sensitiveKindsFor(filePath) {
    const lower = filePath.toLowerCase();
    const kinds = new Set();
    if (/(^|\/)(auth|oauth|jwt|session|permission|rbac|sso)(\/|\.|-|_)/.test(lower))
        kinds.add('auth');
    if (/(^|\/)(billing|payment|checkout|invoice|subscription|stripe)(\/|\.|-|_)/.test(lower))
        kinds.add('billing');
    if (/(^|\/)(db|database|schema|prisma)(\/|\.|-|_)/.test(lower))
        kinds.add('database');
    if (/(^|\/)(migrations?|schema)(\/|\.|-|_)/.test(lower))
        kinds.add('migration');
    if (/(^|\/)\.github\/workflows\//.test(lower) || /(^|\/)(ci|workflows?)(\/|\.|-|_)/.test(lower))
        kinds.add('workflow');
    if (/(^|\/)(\.env|secrets?|credentials?|keys?)(\/|\.|-|_)/.test(lower))
        kinds.add('secret');
    if (/(^|\/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|uv\.lock|requirements\.txt|pyproject\.toml|go\.mod|cargo\.toml)$/.test(lower))
        kinds.add('dependency');
    if (/(^|\/)(config|settings|env\.production|dockerfile|docker-compose|k8s|helm|terraform)(\/|\.|-|_)/.test(lower))
        kinds.add('configuration');
    if (/(^|\/)(packages\/governance-runtime|packages\/cli\/src\/commands\/session-hook|services\/api\/src\/routes\/runtime-evidence|web\/dashboard\/src\/pages\/runtimecontrolplane)/.test(lower))
        kinds.add('runtime_governance');
    return [...kinds].sort();
}
function listRepoFiles(projectRoot, maxFiles) {
    try {
        const output = (0, node_child_process_1.execFileSync)('git', ['ls-files', '-co', '--exclude-standard'], {
            cwd: projectRoot,
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 20,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return output
            .split(/\r?\n/)
            .map((line) => normalizePath(line.trim()))
            .filter(Boolean)
            .filter(team_memory_path_hygiene_1.isTeamMemoryProjectPath)
            .filter((file) => ANALYZABLE_EXTENSIONS.has((0, node_path_1.extname)(file).toLowerCase()))
            .slice(0, maxFiles);
    }
    catch {
        const files = [];
        const walk = (dir) => {
            if (files.length >= maxFiles)
                return;
            for (const entry of (0, node_fs_1.readdirSync)(dir)) {
                if (files.length >= maxFiles)
                    break;
                const full = (0, node_path_1.join)(dir, entry);
                const rel = normalizePath((0, node_path_1.relative)(projectRoot, full));
                if (!(0, team_memory_path_hygiene_1.isTeamMemoryProjectPath)(rel))
                    continue;
                if ([...IGNORE_DIRS].some((ignored) => rel === ignored || rel.startsWith(`${ignored}/`)))
                    continue;
                const st = (0, node_fs_1.statSync)(full);
                if (st.isDirectory()) {
                    walk(full);
                }
                else if (st.isFile() && ANALYZABLE_EXTENSIONS.has((0, node_path_1.extname)(entry).toLowerCase())) {
                    files.push(rel);
                }
            }
        };
        walk(projectRoot);
        return files;
    }
}
function normalizeTokenFingerprint(source) {
    const tokens = source
        .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, ' str ')
        .replace(/\b\d+(?:\.\d+)?\b/g, ' num ')
        .replace(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g, (token) => {
        if (['if', 'for', 'while', 'return', 'await', 'async', 'try', 'catch', 'throw', 'new', 'const', 'let', 'var', 'function', 'class', 'def'].includes(token)) {
            return token;
        }
        return 'id';
    })
        .match(/[A-Za-z_]+|[{}()[\].,;:+\-*/%<>=!&|?]/g);
    if (!tokens || tokens.length < 8)
        return null;
    return shortHash(tokens.slice(0, 160).join(' '));
}
function arityFrom(params) {
    if (params == null)
        return null;
    const trimmed = params.trim();
    if (!trimmed)
        return 0;
    return trimmed.split(',').map((part) => part.trim()).filter(Boolean).length;
}
function normalizedSignature(language, kind, arity) {
    if (!['typescript', 'javascript', 'python'].includes(language))
        return null;
    if (!['function', 'class', 'interface', 'type', 'const'].includes(kind))
        return null;
    return `${language}:${kind}:arity=${arity == null ? 'unknown' : arity}`;
}
function lineNumberAt(source, index) {
    return source.slice(0, index).split(/\r?\n/).length;
}
function extractSymbols(filePath, source, language) {
    if (!['typescript', 'javascript', 'python'].includes(language))
        return [];
    const symbols = [];
    const pushMatches = (pattern, kind, nameIndex, paramsIndex, exportedByPattern) => {
        for (const match of source.matchAll(pattern)) {
            const name = match[nameIndex];
            if (!name || name.length > 120)
                continue;
            if (kind === 'method' && JS_TS_RESERVED_WORDS.has(name))
                continue;
            const matchText = match[0] || name;
            const line = lineNumberAt(source, match.index || 0);
            const params = paramsIndex == null ? undefined : match[paramsIndex];
            const exported = exportedByPattern || /^\s*export\b/.test(matchText);
            const arity = arityFrom(params);
            const normalized = normalizedSignature(language, kind, arity);
            symbols.push({
                name,
                kind,
                file: filePath,
                line,
                exported,
                local: !exported,
                arity,
                normalizedSignature: normalized,
                normalizedSignatureHash: normalized ? shortHash(normalized) : null,
                signatureHash: shortHash(`${language}:${kind}:${name}:${params || ''}`),
                tokenFingerprintHash: normalizeTokenFingerprint(matchText),
                language,
            });
        }
    };
    if (language === 'python') {
        pushMatches(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/gm, 'function', 1, 2, false);
        pushMatches(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?/gm, 'class', 1, 2, false);
        return dedupeSymbols(symbols);
    }
    pushMatches(/^\s*(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)(?:<[^>\n]+>)?\s*\(([^)]*)\)/gm, 'function', 2, 3, false);
    pushMatches(/^\s*(export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/gm, 'class', 2, null, false);
    pushMatches(/^\s*export\s+interface\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/gm, 'interface', 1, null, true);
    pushMatches(/^\s*export\s+type\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/gm, 'type', 1, null, true);
    pushMatches(/^\s*(export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)(?:\s*:\s*[^=]+)?\s*=\s*(?:async\s*)?\(?([^=;{}]*)\)?\s*=>/gm, 'const', 2, 3, false);
    pushMatches(/^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*[:{]/gm, 'method', 1, 2, false);
    return dedupeSymbols(symbols);
}
function dedupeSymbols(symbols) {
    const seen = new Set();
    const out = [];
    for (const symbol of symbols) {
        const key = `${symbol.file}:${symbol.line}:${symbol.kind}:${symbol.name}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(symbol);
    }
    return out;
}
function resolvePythonModulePath(modulePath, fileSet) {
    const normalizedModule = modulePath.replace(/\./g, '/');
    const directCandidates = [
        `${normalizedModule}.py`,
        `${normalizedModule}/__init__.py`,
    ].map(normalizePath);
    const directHit = directCandidates.find((candidate) => fileSet.has(candidate));
    if (directHit)
        return directHit;
    const suffixes = [`/${normalizedModule}.py`, `/${normalizedModule}/__init__.py`];
    const matches = [...fileSet].filter((candidate) => suffixes.some((suffix) => candidate.endsWith(suffix)));
    if (matches.length === 0)
        return null;
    if (matches.length === 1)
        return matches[0];
    return matches.sort((left, right) => left.length - right.length || left.localeCompare(right))[0];
}
function resolveRelativeImport(fromFile, target, fileSet, language) {
    if (!target.startsWith('.')) {
        if (language === 'python') {
            return resolvePythonModulePath(target, fileSet);
        }
        return null;
    }
    const dotCount = target.match(/^\.+/)?.[0].length ?? 0;
    const remainder = target.slice(dotCount).replace(/^\./, '');
    let baseDir = (0, node_path_1.dirname)(fromFile);
    for (let step = 1; step < dotCount; step += 1) {
        baseDir = (0, node_path_1.dirname)(baseDir);
    }
    const base = normalizePath((0, node_path_1.join)(baseDir, remainder.replace(/\./g, '/')));
    const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        `${base}.py`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
        `${base}/index.js`,
        `${base}/__init__.py`,
    ].map(normalizePath);
    return candidates.find((candidate) => fileSet.has(candidate)) || null;
}
function extractImports(filePath, source, language, fileSet) {
    if (!['typescript', 'javascript', 'python'].includes(language))
        return [];
    const imports = [];
    const add = (target, index, targetKind) => {
        imports.push({
            fromFile: filePath,
            target,
            targetKind,
            resolvedFile: resolveRelativeImport(filePath, target, fileSet, language),
            line: lineNumberAt(source, index),
            language,
        });
    };
    if (language === 'python') {
        for (const match of source.matchAll(/^\s*(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.]+))/gm)) {
            add(match[1] || match[2], match.index || 0, 'python_module');
        }
        return imports;
    }
    for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
        const target = match[1];
        add(target, match.index || 0, target.startsWith('.') ? 'relative' : 'package');
    }
    for (const match of source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const target = match[1];
        add(target, match.index || 0, target.startsWith('.') ? 'relative' : 'package');
    }
    return imports;
}
function analyzeLocalProposedSource(filePath, source) {
    const normalizedFilePath = normalizePath(filePath);
    const language = localRepoBrainLanguageFor(normalizedFilePath);
    return {
        language,
        symbols: extractSymbols(normalizedFilePath, source, language),
        imports: extractImports(normalizedFilePath, source, language, new Set([normalizedFilePath])),
    };
}
function discoverCodeownersFiles(projectRoot) {
    try {
        const output = (0, node_child_process_1.execFileSync)('git', ['ls-files', '-co', '--exclude-standard'], {
            cwd: projectRoot,
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 20,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const found = output
            .split(/\r?\n/)
            .map((line) => normalizePath(line.trim()))
            .filter((p) => p === 'CODEOWNERS' || p.endsWith('/CODEOWNERS'));
        if (found.length > 0)
            return found;
    }
    catch {
        // fall through to filesystem fallback
    }
    return ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']
        .filter((candidate) => (0, node_fs_1.existsSync)((0, node_path_1.join)(projectRoot, candidate)));
}
function parseCodeowners(projectRoot) {
    const candidatePaths = discoverCodeownersFiles(projectRoot);
    if (candidatePaths.length === 0)
        return { boundaries: [], status: 'not_found' };
    const allBoundaries = [];
    for (const candidatePath of candidatePaths) {
        const full = (0, node_path_1.join)(projectRoot, candidatePath);
        try {
            const parsed = (0, node_fs_1.readFileSync)(full, 'utf8')
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('#'))
                .map((line) => line.split(/\s+/))
                .filter((parts) => parts.length >= 2)
                .map((parts) => ({
                pattern: parts[0],
                owners: parts.slice(1).filter((owner) => owner.startsWith('@')),
                source: 'CODEOWNERS',
            }))
                .filter((entry) => entry.owners.length > 0);
            allBoundaries.push(...parsed);
        }
        catch {
            // skip unreadable CODEOWNERS file
        }
    }
    return { boundaries: allBoundaries, status: allBoundaries.length > 0 ? 'found' : 'not_found' };
}
function buildReuseFindings(symbols, options = {}) {
    const { includeFingerprint = false } = options;
    const findings = [];
    const byName = new Map();
    const byFingerprint = includeFingerprint ? new Map() : null;
    for (const symbol of symbols) {
        if (symbol.kind === 'method')
            continue;
        if (isTestPath(symbol.file))
            continue;
        byName.set(symbol.name, [...(byName.get(symbol.name) || []), symbol]);
        if (byFingerprint && symbol.tokenFingerprintHash) {
            byFingerprint.set(symbol.tokenFingerprintHash, [...(byFingerprint.get(symbol.tokenFingerprintHash) || []), symbol]);
        }
    }
    for (const [name, group] of byName.entries()) {
        const files = [...new Set(group.map((symbol) => symbol.file))].sort();
        if (files.length < 2)
            continue;
        findings.push({
            kind: 'symbol_name_reuse',
            severity: group.some((symbol) => symbol.exported) ? 'warn' : 'info',
            confidence: group.some((symbol) => symbol.exported) ? 'high' : 'medium',
            symbolName: name,
            files: files.slice(0, 12),
            symbolCount: group.length,
            reasonCodes: group.some((symbol) => symbol.exported)
                ? ['same_symbol_name', 'exported_symbol_present', 'cross_file']
                : ['same_symbol_name', 'cross_file'],
            evidenceHash: shortHash(`name:${name}:${files.join('|')}`),
        });
    }
    if (byFingerprint) {
        for (const [fingerprint, group] of byFingerprint.entries()) {
            const files = [...new Set(group.map((symbol) => symbol.file))].sort();
            const names = [...new Set(group.map((symbol) => symbol.name))].sort();
            if (files.length < 2 || names.length < 1)
                continue;
            findings.push({
                kind: 'fingerprint_reuse',
                severity: 'info',
                confidence: 'low',
                symbolName: names.length === 1 ? names[0] : null,
                files: files.slice(0, 8),
                symbolCount: group.length,
                reasonCodes: ['same_token_fingerprint', 'cross_file', 'experimental'],
                evidenceHash: shortHash(`fingerprint:${fingerprint}:${files.join('|')}`),
            });
        }
    }
    return findings
        .sort((a, b) => {
        const severityScore = (b.severity === 'warn' ? 1 : 0) - (a.severity === 'warn' ? 1 : 0);
        if (severityScore !== 0)
            return severityScore;
        return b.symbolCount - a.symbolCount || a.evidenceHash.localeCompare(b.evidenceHash);
    })
        .slice(0, 50);
}
function gitHead(projectRoot) {
    try {
        const out = (0, node_child_process_1.execFileSync)('git', ['rev-parse', 'HEAD'], {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return out || null;
    }
    catch {
        return null;
    }
}
function gitDirty(projectRoot) {
    try {
        const out = (0, node_child_process_1.execFileSync)('git', ['status', '--short'], {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            maxBuffer: 1024 * 1024 * 4,
        });
        return out.trim().length > 0;
    }
    catch {
        return null;
    }
}
function buildFreshness(projectRoot, generatedAt) {
    const head = gitHead(projectRoot);
    const dirty = gitDirty(projectRoot);
    return {
        generatedAt,
        gitHead: head,
        gitDirty: dirty,
        workingTreeStatus: dirty === null ? 'unknown' : dirty ? 'dirty' : 'clean',
        freshnessBasis: head ? 'git-head-and-working-tree' : 'filesystem-scan',
    };
}
function buildModules(files) {
    const map = new Map();
    for (const file of files) {
        const current = map.get(file.module) || {
            name: file.module,
            fileCount: 0,
            symbolCount: 0,
            importCount: 0,
            sensitiveKinds: [],
        };
        current.fileCount += 1;
        current.symbolCount += file.symbolCount;
        current.importCount += file.importCount;
        current.sensitiveKinds = [...new Set([...current.sensitiveKinds, ...file.sensitiveKinds])].sort();
        map.set(file.module, current);
    }
    return [...map.values()].sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));
}
function buildHotspots(files, imports) {
    const fanIn = new Map();
    const fanOut = new Map();
    for (const edge of imports) {
        fanOut.set(edge.fromFile, (fanOut.get(edge.fromFile) || 0) + 1);
        if (edge.resolvedFile)
            fanIn.set(edge.resolvedFile, (fanIn.get(edge.resolvedFile) || 0) + 1);
    }
    return files.filter((file) => !isTestPath(file.path)).map((file) => {
        const inCount = fanIn.get(file.path) || 0;
        const outCount = fanOut.get(file.path) || 0;
        const reasons = [];
        let score = 0;
        if (inCount > 0) {
            score += inCount * 8;
            reasons.push('referenced_by_other_files');
        }
        if (outCount > 3) {
            score += outCount * 2;
            reasons.push('many_dependencies');
        }
        if (file.sensitiveKinds.length > 0) {
            score += file.sensitiveKinds.length * 18;
            reasons.push('sensitive_surface');
        }
        if (file.symbolCount > 8) {
            score += file.symbolCount;
            reasons.push('large_symbol_surface');
        }
        if (file.lineCount > 400) {
            score += 10;
            reasons.push('large_file');
        }
        return {
            file: file.path,
            score,
            reasons,
            importFanIn: inCount,
            importFanOut: outCount,
            symbolCount: file.symbolCount,
            sensitiveKinds: file.sensitiveKinds,
        };
    }).filter((hotspot) => hotspot.score > 0)
        .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
        .slice(0, 40);
}
function artifactHashInput(artifact) {
    return JSON.stringify({
        ...artifact,
        freshness: artifact.freshness ? { ...artifact.freshness, generatedAt: null } : artifact.freshness,
        files: artifact.files.map((file) => ({ ...file, indexedAt: null, mtimeMs: 0 })),
    });
}
function localRepoBrainPath(projectRoot) {
    return (0, node_path_1.join)(projectRoot, '.neurcode', 'repo-brain', 'index.json');
}
function localRepoBrainMarkdownPath(projectRoot) {
    return (0, node_path_1.join)(projectRoot, '.neurcode', 'repo-brain', 'summary.md');
}
/** Read-only LocalRepoBrain V1 compatibility projection from canonical Graph V2. */
function projectRepositoryGraphToLocalRepoBrain(projectRoot, graph) {
    const generatedAt = graph.updatedAt;
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const importResolution = new Map();
    for (const edge of graph.edges.filter((edge) => edge.type === 'imports')) {
        const from = nodesById.get(edge.fromId);
        const to = nodesById.get(edge.toId);
        if (from?.kind === 'import' && to?.path)
            importResolution.set(from.id, to.path);
    }
    const imports = graph.nodes
        .filter((node) => node.kind === 'import' && typeof node.attributes.sourcePath === 'string')
        .map((node) => ({
        fromFile: String(node.attributes.sourcePath),
        target: String(node.attributes.target ?? ''),
        targetKind: String(node.attributes.target ?? '').startsWith('.') ? 'relative' : 'package',
        resolvedFile: importResolution.get(node.id) ?? null,
        line: Number(node.attributes.line ?? 0),
        language: (node.language === 'typescript' || node.language === 'javascript' || node.language === 'python'
            ? node.language : 'other'),
    }));
    const symbols = graph.nodes
        .filter((node) => node.kind === 'symbol' && node.path && node.name)
        .filter((node) => ['function', 'class', 'interface', 'type', 'const', 'method'].includes(String(node.attributes.symbolKind)))
        .map((node) => ({
        name: node.name,
        kind: String(node.attributes.symbolKind),
        file: node.path,
        line: Number(node.attributes.line ?? 0),
        exported: node.attributes.exported === true,
        local: node.attributes.local !== false,
        normalizedSignature: null,
        normalizedSignatureHash: null,
        signatureHash: String(node.attributes.signatureHash ?? node.contentHash ?? ''),
        tokenFingerprintHash: typeof node.attributes.structuralFingerprint === 'string' ? node.attributes.structuralFingerprint : null,
        arity: typeof node.attributes.arity === 'number' ? node.attributes.arity : null,
        language: (node.language === 'typescript' || node.language === 'javascript' || node.language === 'python'
            ? node.language : 'other'),
    }));
    const symbolCounts = new Map();
    const importCounts = new Map();
    symbols.forEach((symbol) => symbolCounts.set(symbol.file, (symbolCounts.get(symbol.file) ?? 0) + 1));
    imports.forEach((edge) => importCounts.set(edge.fromFile, (importCounts.get(edge.fromFile) ?? 0) + 1));
    const files = graph.nodes
        .filter((node) => (node.kind === 'file' || node.kind === 'test') && node.path)
        .map((node) => {
        const state = graph.fileStates?.[node.path];
        return {
            path: node.path,
            module: typeof node.attributes.module === 'string' ? node.attributes.module : moduleKey(node.path),
            language: (node.language === 'typescript' || node.language === 'javascript' || node.language === 'python'
                ? node.language : 'other'),
            bytes: state?.sizeBytes ?? Number(node.attributes.sizeBytes ?? 0),
            lineCount: 0,
            fileHash: node.contentHash ?? graph.fileHashes[node.path] ?? '',
            mtimeMs: state?.mtimeMs ?? 0,
            indexedAt: node.provenance.indexedAt,
            symbolCount: symbolCounts.get(node.path) ?? 0,
            importCount: importCounts.get(node.path) ?? 0,
            sensitiveKinds: sensitiveKindsFor(node.path),
            generated: node.attributes.generated === true,
        };
    });
    const modules = buildModules(files);
    const { boundaries: ownerBoundaries, status: ownerBoundaryStatus } = parseCodeowners(projectRoot);
    const freshness = {
        generatedAt,
        gitHead: graph.freshness.gitHead,
        gitDirty: graph.freshness.workingTreeHash ? true : null,
        workingTreeStatus: graph.freshness.workingTreeHash ? 'dirty' : 'unknown',
        freshnessBasis: 'git-head-and-working-tree',
    };
    const core = {
        schemaVersion: exports.LOCAL_REPO_BRAIN_SCHEMA_VERSION,
        repoRootHash: hash(projectRoot),
        freshness,
        privacy: {
            sourceUploaded: false, sourceStored: false, diffStored: false,
            promptStored: false, modelUsed: false,
            storedFields: ['Repository Graph V2 compatibility projection'],
        },
        summary: {
            filesIndexed: files.length, filesSkipped: graph.coverage.filesSkipped ?? 0,
            bytesIndexed: files.reduce((sum, file) => sum + file.bytes, 0), symbolsIndexed: symbols.length,
            importEdges: imports.length, modules: modules.length,
            sensitiveFiles: files.filter((file) => file.sensitiveKinds.length > 0).length,
            ownerBoundaries: ownerBoundaries.length, ownerBoundaryStatus, reuseFindings: 0,
            generatedFilesSkipped: graph.coverage.filesGenerated,
        },
        files: files.sort((a, b) => a.path.localeCompare(b.path)),
        symbols: symbols.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name)),
        imports: imports.sort((a, b) => a.fromFile.localeCompare(b.fromFile) || a.line - b.line),
        modules,
        ownerBoundaries,
        reuseFindings: [],
        hotspots: buildHotspots(files, imports),
        limitations: [
            'Compatibility projection only; Repository Graph V2 is the sole decision authority.',
            'Fields unavailable in Graph V2 remain empty rather than being independently re-scanned.',
        ],
    };
    return { ...core, generatedAt, artifactHash: hash(artifactHashInput(core)) };
}
function buildLocalRepoBrain(projectRoot, options = {}) {
    const canonicalGraph = (0, brain_1.readRepositoryGraph)(projectRoot);
    if (canonicalGraph)
        return projectRepositoryGraphToLocalRepoBrain(projectRoot, canonicalGraph);
    const generatedAt = options.generatedAt || new Date().toISOString();
    const freshness = buildFreshness(projectRoot, generatedAt);
    const maxFiles = Math.max(1, Math.min(50000, options.maxFiles || 8000));
    const maxBytesPerFile = Math.max(2048, Math.min(2_000_000, options.maxBytesPerFile || 350_000));
    const candidates = listRepoFiles(projectRoot, maxFiles);
    const fileSet = new Set(candidates);
    const files = [];
    const symbols = [];
    const imports = [];
    let filesSkipped = 0;
    let generatedFilesSkipped = 0;
    let bytesIndexed = 0;
    for (const filePath of candidates) {
        const full = (0, node_path_1.join)(projectRoot, filePath);
        let stat;
        try {
            stat = (0, node_fs_1.statSync)(full);
        }
        catch {
            filesSkipped += 1;
            continue;
        }
        const generated = isGeneratedPath(filePath);
        if (!stat.isFile() || stat.size > maxBytesPerFile || generated) {
            filesSkipped += 1;
            if (generated)
                generatedFilesSkipped += 1;
            continue;
        }
        let source = '';
        try {
            source = (0, node_fs_1.readFileSync)(full, 'utf8');
        }
        catch {
            filesSkipped += 1;
            continue;
        }
        const language = localRepoBrainLanguageFor(filePath);
        const fileSymbols = extractSymbols(filePath, source, language);
        const fileImports = extractImports(filePath, source, language, fileSet);
        bytesIndexed += stat.size;
        symbols.push(...fileSymbols);
        imports.push(...fileImports);
        files.push({
            path: filePath,
            module: moduleKey(filePath),
            language,
            bytes: stat.size,
            lineCount: source.split(/\r?\n/).length,
            fileHash: shortHash(source),
            mtimeMs: Math.floor(stat.mtimeMs),
            indexedAt: generatedAt,
            symbolCount: fileSymbols.length,
            importCount: fileImports.length,
            sensitiveKinds: sensitiveKindsFor(filePath),
            generated: false,
        });
    }
    const modules = buildModules(files);
    const { boundaries: ownerBoundaries, status: ownerBoundaryStatus } = parseCodeowners(projectRoot);
    const reuseFindings = buildReuseFindings(symbols, { includeFingerprint: options.experimentalFingerprintReuse });
    const hotspots = buildHotspots(files, imports);
    const core = {
        schemaVersion: exports.LOCAL_REPO_BRAIN_SCHEMA_VERSION,
        repoRootHash: hash(projectRoot),
        freshness,
        privacy: {
            sourceUploaded: false,
            sourceStored: false,
            diffStored: false,
            promptStored: false,
            modelUsed: false,
            storedFields: [
                'relative paths',
                'symbol names and kinds',
                'line numbers',
                'counts',
                'mtime and index freshness metadata',
                'hashes and token fingerprints',
                'import targets',
                'CODEOWNERS owner tokens',
            ],
        },
        summary: {
            filesIndexed: files.length,
            filesSkipped,
            bytesIndexed,
            symbolsIndexed: symbols.length,
            importEdges: imports.length,
            modules: modules.length,
            sensitiveFiles: files.filter((file) => file.sensitiveKinds.length > 0).length,
            ownerBoundaries: ownerBoundaries.length,
            ownerBoundaryStatus,
            reuseFindings: reuseFindings.length,
            generatedFilesSkipped,
        },
        files: files.sort((a, b) => a.path.localeCompare(b.path)),
        symbols: symbols.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name)),
        imports: imports.sort((a, b) => a.fromFile.localeCompare(b.fromFile) || a.line - b.line || a.target.localeCompare(b.target)),
        modules,
        ownerBoundaries,
        reuseFindings,
        hotspots,
        limitations: [
            'V1 is deterministic and source-free; it does not store code bodies, raw diffs, raw prompts, or chat transcripts.',
            'TS/JS/Python symbols are indexed in V1; other languages are counted at file/module level unless future extractors are added.',
            'Reuse findings show same-name exported declarations across files; fingerprint-based detection is experimental and off by default.',
            'Import resolution is conservative and may miss dynamic imports, framework wiring, reflection, and generated code.',
        ],
    };
    const artifactHash = hash(artifactHashInput(core));
    return {
        ...core,
        generatedAt,
        artifactHash,
    };
}
function writeLocalRepoBrain(projectRoot, artifact) {
    const jsonPath = localRepoBrainPath(projectRoot);
    const markdownPath = localRepoBrainMarkdownPath(projectRoot);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(jsonPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(jsonPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
    (0, node_fs_1.writeFileSync)(markdownPath, renderLocalRepoBrainMarkdown(artifact), 'utf8');
    return { jsonPath, markdownPath };
}
function readLocalRepoBrain(projectRoot) {
    const path = localRepoBrainPath(projectRoot);
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        if (parsed?.schemaVersion !== exports.LOCAL_REPO_BRAIN_SCHEMA_VERSION)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function renderLocalRepoBrainMarkdown(artifact) {
    const lines = [];
    lines.push('# Neurcode Local Repo Brain');
    lines.push('');
    lines.push(`Generated: ${artifact.generatedAt}`);
    lines.push(`Artifact hash: ${artifact.artifactHash}`);
    if (artifact.freshness) {
        lines.push(`Freshness: ${artifact.freshness.workingTreeStatus} (${artifact.freshness.gitHead ? `HEAD ${artifact.freshness.gitHead.slice(0, 12)}` : 'no git HEAD'})`);
    }
    lines.push('');
    lines.push('## Source-free guarantee');
    lines.push('- No source code is uploaded.');
    lines.push('- No source code, raw diffs, raw prompts, or chat transcripts are stored in this artifact.');
    lines.push('- Stored fields are paths, symbols, counts, hashes/fingerprints, import targets, and owner tokens.');
    lines.push('');
    lines.push('## Summary');
    for (const [key, value] of Object.entries(artifact.summary)) {
        lines.push(`- ${key}: ${value}`);
    }
    lines.push('');
    lines.push('## Owner boundaries');
    if (artifact.summary.ownerBoundaryStatus === 'not_found') {
        lines.push('- No CODEOWNERS found; owner boundaries unavailable.');
    }
    else {
        for (const boundary of artifact.ownerBoundaries.slice(0, 20)) {
            lines.push(`- ${boundary.pattern}: ${boundary.owners.join(', ')}`);
        }
    }
    lines.push('');
    lines.push('## Top modules');
    for (const module of artifact.modules.slice(0, 12)) {
        lines.push(`- ${module.name}: ${module.fileCount} files, ${module.symbolCount} declarations, sensitive ${module.sensitiveKinds.join(', ') || 'none'}`);
    }
    lines.push('');
    lines.push('## Hotspots');
    for (const hotspot of artifact.hotspots.slice(0, 12)) {
        lines.push(`- ${hotspot.file}: score ${hotspot.score}, fan-in ${hotspot.importFanIn}, fan-out ${hotspot.importFanOut}, reasons ${hotspot.reasons.join(', ')}`);
    }
    lines.push('');
    lines.push('## Reuse advisories (same-name exported declarations)');
    if (artifact.reuseFindings.length === 0) {
        lines.push('- none found — no exported symbol names appear in more than one non-test file.');
    }
    else {
        for (const finding of artifact.reuseFindings.slice(0, 12)) {
            lines.push(`- ${finding.kind}: ${finding.symbolName || 'fingerprint'} across ${finding.files.join(', ')} (${finding.confidence} confidence)`);
        }
    }
    lines.push('');
    lines.push('## Limitations');
    for (const limitation of artifact.limitations)
        lines.push(`- ${limitation}`);
    lines.push('');
    return lines.join('\n');
}
function defaultAdvisorySimilarity() {
    return {
        classification: 'advisory_similarity',
        evaluated: false,
        reason: 'Semantic similarity, token-fingerprint resemblance, and architecture judgment are advisory only and do not participate in deterministic duplicate enforcement.',
    };
}
function symbolPolicyPrivacy() {
    return {
        sourceUploaded: false,
        sourceStored: false,
        diffStored: false,
        promptStored: false,
        evaluatedInMemoryOnly: true,
    };
}
function notEvaluatedSymbolPolicy(policyMode, reason, artifact = null) {
    return {
        schemaVersion: 'neurcode.repo-symbol-policy.v1',
        evaluated: false,
        verdict: 'not_evaluated',
        policyMode,
        classification: 'not_evaluated',
        reason,
        artifactHash: artifact?.artifactHash ?? null,
        generatedAt: artifact?.generatedAt ?? null,
        freshness: artifact?.freshness ?? null,
        findings: [],
        advisorySimilarity: defaultAdvisorySimilarity(),
        privacy: symbolPolicyPrivacy(),
    };
}
function cleanSymbolPolicy(policyMode, artifact) {
    return {
        schemaVersion: 'neurcode.repo-symbol-policy.v1',
        evaluated: true,
        verdict: 'ok',
        policyMode,
        classification: 'clean',
        reason: 'No same-name symbols were found in the same repo language for the proposed write.',
        artifactHash: artifact.artifactHash,
        generatedAt: artifact.generatedAt,
        freshness: artifact.freshness ?? null,
        findings: [],
        advisorySimilarity: defaultAdvisorySimilarity(),
        privacy: symbolPolicyPrivacy(),
    };
}
function symbolPolicyRef(symbol) {
    return {
        file: symbol.file,
        name: symbol.name,
        kind: symbol.kind,
        language: symbol.language,
        exported: symbol.exported,
        local: symbol.local ?? !symbol.exported,
        line: symbol.line,
        normalizedSignature: symbol.normalizedSignature ?? null,
        normalizedSignatureHash: symbol.normalizedSignatureHash ?? null,
        signatureHash: symbol.signatureHash,
    };
}
function policyCandidate(symbol) {
    if (symbol.kind === 'method')
        return false;
    if (!['typescript', 'javascript', 'python'].includes(symbol.language))
        return false;
    if (!symbol.name || JS_TS_RESERVED_WORDS.has(symbol.name))
        return false;
    return !isTestPath(symbol.file);
}
function duplicateStrength(changed, existing) {
    if (changed.exported && existing.some((symbol) => symbol.exported))
        return 'exported_symbol';
    if (changed.kind === 'function' || existing.some((symbol) => symbol.kind === 'function'))
        return 'same_function_name';
    return 'same_local_symbol_name';
}
function duplicateReasonCodes(strength) {
    const base = ['same_symbol_name', 'same_repo_language', 'source_free_repo_brain'];
    if (strength === 'exported_symbol')
        return [...base, 'exported_symbol_name'];
    if (strength === 'same_function_name')
        return [...base, 'function_name'];
    return [...base, 'local_symbol_name'];
}
function duplicateMessage(finding) {
    const files = finding.evidence.matchingFiles.slice(0, 4).join(', ');
    const subject = finding.strength === 'exported_symbol'
        ? 'exported symbol'
        : finding.strength === 'same_function_name'
            ? 'function name'
            : 'local symbol name';
    return `Deterministic symbol duplicate: ${subject} ${finding.changed.name} already exists in ${finding.changed.language} file(s): ${files}.`;
}
function evaluateRepoSymbolDuplicatePolicy(input) {
    const policyMode = input.policyMode || 'warn';
    if (policyMode === 'off') {
        return notEvaluatedSymbolPolicy(policyMode, 'repoSymbolDuplicateMode is off.');
    }
    if ((!input.proposedSource || !input.proposedSource.trim()) &&
        (!input.proposedSymbols || input.proposedSymbols.length === 0)) {
        return notEvaluatedSymbolPolicy(policyMode, 'No proposed source text was available from the host hook payload.');
    }
    const language = localRepoBrainLanguageFor(input.filePath);
    if (!['typescript', 'javascript', 'python'].includes(language)) {
        return notEvaluatedSymbolPolicy(policyMode, `Unsupported language for deterministic symbol duplicate policy: ${language}.`);
    }
    const proposedSymbols = (input.proposedSymbols ??
        extractSymbols(input.filePath, input.proposedSource ?? '', language)).filter(policyCandidate);
    const metadata = input.boundedPreWrite ? (0, brain_1.readRepositoryGraphMetadata)(input.projectRoot) : null;
    const boundedSymbols = input.boundedPreWrite && metadata
        ? [...new Map(proposedSymbols
                .flatMap((symbol) => (0, brain_1.queryStoredRepositoryGraphNodes)(input.projectRoot, {
                kind: 'symbol', name: symbol.name, limit: 100,
            }))
                .map((node) => [node.id, {
                    name: node.name ?? '',
                    kind: String(node.attributes.symbolKind ?? 'const'),
                    file: node.path ?? '',
                    line: Number(node.attributes.line ?? 1),
                    exported: node.attributes.exported === true,
                    local: node.attributes.local === true,
                    normalizedSignature: null,
                    normalizedSignatureHash: typeof node.attributes.signatureHash === 'string' ? node.attributes.signatureHash : null,
                    signatureHash: typeof node.attributes.signatureHash === 'string' ? node.attributes.signatureHash : node.id,
                    tokenFingerprintHash: typeof node.attributes.structuralFingerprint === 'string' ? node.attributes.structuralFingerprint : null,
                    arity: typeof node.attributes.arity === 'number' ? node.attributes.arity : null,
                    language: (node.language ?? 'other'),
                }])).values()]
        : null;
    const artifact = input.boundedPreWrite && metadata
        ? {
            artifactHash: `${metadata.graphId}:${metadata.generation}`,
            generatedAt: metadata.updatedAt,
            freshness: null,
            symbols: boundedSymbols ?? [],
        }
        : readLocalRepoBrain(input.projectRoot);
    if (!artifact) {
        return notEvaluatedSymbolPolicy(policyMode, 'Local repo brain is missing; run neurcode brain index.');
    }
    if (proposedSymbols.length === 0) {
        return cleanSymbolPolicy(policyMode, artifact);
    }
    const existingSymbols = artifact.symbols.filter((symbol) => policyCandidate(symbol) &&
        symbol.language === language &&
        symbol.file !== input.filePath);
    const findings = [];
    const seen = new Set();
    for (const changed of proposedSymbols) {
        const matches = existingSymbols
            .filter((symbol) => symbol.name === changed.name)
            .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
        if (matches.length === 0)
            continue;
        const strength = duplicateStrength(changed, matches);
        const matchingFiles = [...new Set(matches.map((symbol) => symbol.file))].sort();
        const key = `${changed.name}:${changed.kind}:${changed.language}:${matchingFiles.join('|')}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        const partial = {
            schemaVersion: 'neurcode.repo-symbol-duplicate.v1',
            classification: 'deterministic_symbol_duplicate',
            policyMode,
            verdict: policyMode === 'block' ? 'block' : 'warn',
            strength,
            changed: symbolPolicyRef(changed),
            existing: matches.slice(0, 12).map(symbolPolicyRef),
            evidence: {
                sourceFree: true,
                repoBrainArtifactHash: artifact.artifactHash,
                repoBrainGeneratedAt: artifact.generatedAt,
                repoBrainGitHead: artifact.freshness?.gitHead ?? null,
                repoBrainWorkingTreeStatus: artifact.freshness?.workingTreeStatus ?? 'unknown',
                matchingFiles,
                existingSymbolCount: matches.length,
                reasonCodes: duplicateReasonCodes(strength),
            },
            provenance: 'repo-brain-index',
        };
        findings.push({ ...partial, message: duplicateMessage(partial) });
    }
    if (findings.length === 0)
        return cleanSymbolPolicy(policyMode, artifact);
    const verdict = policyMode === 'block' ? 'block' : 'warn';
    const rank = (finding) => finding.strength === 'exported_symbol' ? 0 : finding.strength === 'same_function_name' ? 1 : 2;
    return {
        schemaVersion: 'neurcode.repo-symbol-policy.v1',
        evaluated: true,
        verdict,
        policyMode,
        classification: 'deterministic_symbol_duplicate',
        reason: verdict === 'block'
            ? 'Deterministic same-name symbol duplicate policy is configured to block.'
            : 'Deterministic same-name symbol duplicate policy is configured to warn.',
        artifactHash: artifact.artifactHash,
        generatedAt: artifact.generatedAt,
        freshness: artifact.freshness ?? null,
        findings: findings
            .sort((a, b) => rank(a) - rank(b) ||
            a.changed.name.localeCompare(b.changed.name) ||
            a.changed.file.localeCompare(b.changed.file))
            .slice(0, 20),
        advisorySimilarity: defaultAdvisorySimilarity(),
        privacy: symbolPolicyPrivacy(),
    };
}
function queryTokens(query) {
    return query.toLowerCase().match(/[a-z0-9_./-]+/g) || [];
}
function scoreText(tokens, values) {
    const haystack = values.join(' ').toLowerCase();
    return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}
const SEARCH_KIND_WEIGHT = {
    symbol: 2.0,
    file: 1.8,
    hotspot: 1.4,
    module: 1.2,
    reuse: 0.6,
};
function matchesOwnerPattern(filePath, pattern) {
    const norm = pattern.replace(/^\//, '');
    if (norm.endsWith('/'))
        return filePath.startsWith(norm) || filePath === norm.slice(0, -1);
    return filePath === norm || filePath.startsWith(norm + '/');
}
function getRepoBrainContext(projectRoot, filePaths) {
    const emptyFileFacts = (fp) => ({
        filePath: fp,
        sensitiveKinds: [],
        module: null,
        hotspot: null,
        ownerBoundary: null,
        reuseAdvisories: [],
    });
    const artifact = readLocalRepoBrain(projectRoot);
    if (!artifact) {
        return {
            status: 'missing',
            artifactHash: null,
            generatedAt: null,
            declarationsIndexed: null,
            sensitiveFilesCount: null,
            ownerBoundaryStatus: null,
            recoveryCommand: 'neurcode brain index',
            files: filePaths.map(emptyFileFacts),
        };
    }
    const fileFacts = filePaths.map((fp) => {
        const file = artifact.files.find((f) => f.path === fp);
        const hotspot = artifact.hotspots.find((h) => h.file === fp) ?? null;
        const ownerBoundary = artifact.ownerBoundaries.find((b) => matchesOwnerPattern(fp, b.pattern)) ?? null;
        const reuseAdvisories = artifact.reuseFindings
            .filter((r) => r.files.includes(fp))
            .slice(0, 3)
            .map((r) => ({ kind: r.kind, symbolName: r.symbolName ?? null, confidence: r.confidence, reasonCodes: r.reasonCodes }));
        return {
            filePath: fp,
            sensitiveKinds: file?.sensitiveKinds ?? [],
            module: file?.module ?? null,
            hotspot: hotspot
                ? { score: hotspot.score, fanIn: hotspot.importFanIn, fanOut: hotspot.importFanOut, reasons: hotspot.reasons }
                : null,
            ownerBoundary: ownerBoundary ? { pattern: ownerBoundary.pattern, owners: ownerBoundary.owners } : null,
            reuseAdvisories,
        };
    });
    return {
        status: 'found',
        artifactHash: artifact.artifactHash,
        generatedAt: artifact.generatedAt,
        declarationsIndexed: artifact.summary.symbolsIndexed,
        sensitiveFilesCount: artifact.summary.sensitiveFiles,
        ownerBoundaryStatus: artifact.summary.ownerBoundaryStatus,
        recoveryCommand: 'neurcode brain index',
        files: fileFacts,
    };
}
function formatRepoBrainFactsForMessage(facts) {
    const parts = [];
    if (facts.sensitiveKinds.length > 0)
        parts.push(`Sensitive: ${facts.sensitiveKinds.join(', ')}`);
    if (facts.ownerBoundary)
        parts.push(`CODEOWNERS: ${facts.ownerBoundary.owners.join(' ')}`);
    if (facts.hotspot)
        parts.push(`Hotspot fan-in: ${facts.hotspot.fanIn}`);
    if (facts.reuseAdvisories.length > 0 && facts.reuseAdvisories[0].symbolName) {
        parts.push(`Reuse advisory: ${facts.reuseAdvisories[0].symbolName}`);
    }
    return parts.join(' | ');
}
function searchLocalRepoBrain(artifact, query, limit = 12) {
    const tokens = queryTokens(query);
    if (tokens.length === 0)
        return [];
    const seen = new Set();
    const results = [];
    const addResult = (result) => {
        const key = `${result.kind}|${result.title}|${result.file ?? ''}`;
        if (seen.has(key))
            return;
        seen.add(key);
        results.push(result);
    };
    for (const file of artifact.files) {
        const score = scoreText(tokens, [file.path, file.module, file.language, ...file.sensitiveKinds]);
        if (score > 0) {
            addResult({
                kind: 'file',
                score,
                title: file.path,
                file: file.path,
                detail: `${file.language}; ${file.symbolCount} declarations; sensitive ${file.sensitiveKinds.join(', ') || 'none'}`,
            });
        }
    }
    for (const symbol of artifact.symbols) {
        const score = scoreText(tokens, [symbol.name, symbol.kind, symbol.file, symbol.language]);
        if (score > 0) {
            addResult({
                kind: 'symbol',
                score: score + (symbol.exported ? 0.5 : 0),
                title: `${symbol.name} (${symbol.kind})`,
                file: symbol.file,
                detail: `${symbol.exported ? 'exported' : 'local'} ${symbol.language} symbol at line ${symbol.line}`,
            });
        }
    }
    for (const module of artifact.modules) {
        const score = scoreText(tokens, [module.name, ...module.sensitiveKinds]);
        if (score > 0) {
            addResult({
                kind: 'module',
                score,
                title: module.name,
                file: null,
                detail: `${module.fileCount} files; ${module.symbolCount} declarations; sensitive ${module.sensitiveKinds.join(', ') || 'none'}`,
            });
        }
    }
    for (const finding of artifact.reuseFindings) {
        const score = scoreText(tokens, [finding.kind, finding.symbolName || '', ...finding.files, ...finding.reasonCodes]);
        if (score > 0) {
            addResult({
                kind: 'reuse',
                score: score + (finding.severity === 'warn' ? 1 : 0),
                title: `${finding.kind}: ${finding.symbolName || 'fingerprint'}`,
                file: finding.files[0] || null,
                detail: `${finding.confidence} confidence across ${finding.files.length} files`,
            });
        }
    }
    for (const hotspot of artifact.hotspots) {
        const score = scoreText(tokens, [hotspot.file, ...hotspot.reasons, ...hotspot.sensitiveKinds]);
        if (score > 0) {
            addResult({
                kind: 'hotspot',
                score: score + Math.min(2, hotspot.score / 50),
                title: hotspot.file,
                file: hotspot.file,
                detail: `score ${hotspot.score}; fan-in ${hotspot.importFanIn}; reasons ${hotspot.reasons.join(', ')}`,
            });
        }
    }
    return results
        .sort((a, b) => {
        const aW = a.score * (SEARCH_KIND_WEIGHT[a.kind] ?? 1.0);
        const bW = b.score * (SEARCH_KIND_WEIGHT[b.kind] ?? 1.0);
        return bW - aW || a.title.localeCompare(b.title);
    })
        .slice(0, Math.max(1, Math.min(50, limit)));
}
//# sourceMappingURL=local-repo-brain.js.map