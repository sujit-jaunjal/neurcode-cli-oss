"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROFILE_STALENESS_CACHE_TTL_MS = exports.CLAUDE_GOVERNANCE_HOOKS = exports.MANIFEST_CANDIDATES = exports.CODEOWNERS_CANDIDATES = void 0;
exports.resolveRepoRoot = resolveRepoRoot;
exports.gitLsFiles = gitLsFiles;
exports.readGeneratedProvenanceEvidence = readGeneratedProvenanceEvidence;
exports.governanceConfigPath = governanceConfigPath;
exports.readRuntimeGovernanceConfig = readRuntimeGovernanceConfig;
exports.readModuleImports = readModuleImports;
exports.buildCurrentGovernanceProfile = buildCurrentGovernanceProfile;
exports.profilePath = profilePath;
exports.readGovernanceProfile = readGovernanceProfile;
exports.writeGovernanceProfile = writeGovernanceProfile;
exports.buildProfileFreshnessSignal = buildProfileFreshnessSignal;
exports.profileFreshnessActionForSession = profileFreshnessActionForSession;
exports.getLastProfileCacheHit = getLastProfileCacheHit;
exports.clearProfileStalenessCache = clearProfileStalenessCache;
exports.getProfileStaleness = getProfileStaleness;
exports.ensureFreshGovernanceProfile = ensureFreshGovernanceProfile;
exports.setRepoSymbolDuplicateMode = setRepoSymbolDuplicateMode;
exports.parseHookEntrypoint = parseHookEntrypoint;
exports.installClaudeGovernanceHooks = installClaudeGovernanceHooks;
exports.copilotHooksPath = copilotHooksPath;
exports.installCopilotGovernanceHooks = installCopilotGovernanceHooks;
exports.installClaudeMcpConfig = installClaudeMcpConfig;
exports.inspectClaudeActivation = inspectClaudeActivation;
exports.inspectCopilotActivation = inspectCopilotActivation;
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const brain_1 = require("@neurcode-ai/brain");
const glob_match_1 = require("../governance/intent/glob-match");
exports.CODEOWNERS_CANDIDATES = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];
exports.MANIFEST_CANDIDATES = [
    'package.json',
    'pnpm-workspace.yaml',
    'lerna.json',
    'nx.json',
    'turbo.json',
    'rush.json',
    'workspace.json',
    'pyproject.toml',
    'setup.py',
    'setup.cfg',
    'go.mod',
    'Cargo.toml',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'Gemfile',
    'composer.json',
    'Package.swift',
];
const CLAUDE_MCP_ENTRY = Object.freeze({
    command: 'npx',
    args: ['-y', '@neurcode-ai/mcp-server@0.3.1'],
});
const CLAUDE_PRE_TOOL_MATCHER = 'Bash|Edit|Write|MultiEdit';
const COPILOT_HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'Stop'];
exports.CLAUDE_GOVERNANCE_HOOKS = {
    UserPromptSubmit: [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'neurcode session-hook start',
                },
            ],
        },
    ],
    PreToolUse: [
        {
            matcher: CLAUDE_PRE_TOOL_MATCHER,
            hooks: [
                {
                    type: 'command',
                    command: 'neurcode session-hook check --trusted-adapter claude-code-hooks --trusted-timing before_write',
                },
            ],
        },
    ],
    Stop: [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'neurcode session-hook finish',
                },
            ],
        },
    ],
};
const CLAUDE_EVENT_SESSION_HOOK = {
    UserPromptSubmit: 'start',
    PreToolUse: 'check',
    Stop: 'finish',
};
const COPILOT_EVENT_SESSION_HOOK = {
    UserPromptSubmit: 'start',
    PreToolUse: 'check',
    Stop: 'finish',
};
function shellQuote(value) {
    return JSON.stringify(value);
}
function resolveCliEntrypoint() {
    const candidates = [
        (0, path_1.resolve)(__dirname, '..', 'index.js'),
        (0, path_1.resolve)(__dirname, '..', '..', 'dist', 'index.js'),
    ];
    return candidates.find((candidate) => (0, fs_1.existsSync)(candidate)) ?? null;
}
function sessionHookCommand(subcommand, adapter) {
    const entrypoint = resolveCliEntrypoint();
    // The host hook declares its own trusted adapter and timing explicitly. There
    // is no implicit hard pre-write default: only an installed host hook claims
    // the host-enforced posture, and it does so on the command line.
    const suffix = subcommand === 'check' && adapter
        ? ` --trusted-adapter ${adapter} --trusted-timing before_write`
        : '';
    if (entrypoint)
        return `node ${shellQuote(entrypoint)} session-hook ${subcommand}${suffix}`;
    return `neurcode session-hook ${subcommand}${suffix}`;
}
function claudeGovernanceHooks() {
    return {
        UserPromptSubmit: [
            {
                hooks: [
                    {
                        type: 'command',
                        command: sessionHookCommand('start'),
                    },
                ],
            },
        ],
        PreToolUse: [
            {
                matcher: CLAUDE_PRE_TOOL_MATCHER,
                hooks: [
                    {
                        type: 'command',
                        command: sessionHookCommand('check', 'claude-code-hooks'),
                    },
                ],
            },
        ],
        Stop: [
            {
                hooks: [
                    {
                        type: 'command',
                        command: sessionHookCommand('finish'),
                    },
                ],
            },
        ],
    };
}
function copilotGovernanceHooks() {
    return {
        UserPromptSubmit: [
            {
                type: 'command',
                command: sessionHookCommand('start'),
                bash: sessionHookCommand('start'),
                timeoutSec: 30,
            },
        ],
        PreToolUse: [
            {
                type: 'command',
                command: sessionHookCommand('check', 'copilot-hooks'),
                bash: sessionHookCommand('check', 'copilot-hooks'),
                timeoutSec: 30,
            },
        ],
        Stop: [
            {
                type: 'command',
                command: sessionHookCommand('finish'),
                bash: sessionHookCommand('finish'),
                timeoutSec: 30,
            },
        ],
    };
}
function resolveRepoRoot(cwd = process.cwd()) {
    const target = (0, path_1.resolve)(cwd);
    try {
        return (0, child_process_1.execSync)('git rev-parse --show-toplevel', {
            cwd: target,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    }
    catch {
        return target;
    }
}
function gitLsFiles(cwd) {
    try {
        const out = (0, child_process_1.execSync)('git ls-files', {
            cwd,
            maxBuffer: 50 * 1024 * 1024,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return out.split('\n').map((line) => line.trim()).filter(Boolean);
    }
    catch {
        return [];
    }
}
function readFirstExisting(cwd, candidates) {
    for (const rel of candidates) {
        const path = (0, path_1.join)(cwd, rel);
        if (!(0, fs_1.existsSync)(path))
            continue;
        try {
            return { path, content: (0, fs_1.readFileSync)(path, 'utf8') };
        }
        catch {
            return { path, content: null };
        }
    }
    return { path: null, content: null };
}
function readManifestBundle(cwd, paths) {
    const manifestNames = new Set(exports.MANIFEST_CANDIDATES);
    return paths
        .filter((pathValue) => manifestNames.has((0, path_1.basename)(pathValue)))
        .sort()
        .map((pathValue) => {
        try {
            return { path: pathValue, content: (0, fs_1.readFileSync)((0, path_1.join)(cwd, pathValue), 'utf8') };
        }
        catch {
            return { path: pathValue, content: null };
        }
    });
}
const GENERATED_HEADER_RE = /(?:@generated\b|\b(?:generated (?:file|code)|do not edit|automatically generated)\b)/i;
const GENERATOR_CONFIG_RE = /(?:^|\/)(?:openapi-generator[^/]*|buf\.gen|orval\.config|graphql-codegen)[^/]*\.(?:json|ya?ml|[cm]?[jt]s)$/i;
function normalizeGeneratedPath(value) {
    return value.trim().replace(/^['"]|['"],?$/g, '').replace(/\\/g, '/').replace(/^\.\//, '');
}
function nearestGenerationCommand(outputPath, manifests) {
    const candidates = manifests
        .filter((manifest) => (0, path_1.basename)(manifest.path) === 'package.json' && manifest.content)
        .map((manifest) => {
        try {
            const parsed = JSON.parse(manifest.content);
            const script = Object.keys(parsed.scripts ?? {})
                .filter((name) => /(?:^|:)(?:generate|codegen|gen)(?::|$)/i.test(name))
                .sort()[0];
            const root = (0, path_1.dirname)(manifest.path) === '.' ? '' : (0, path_1.dirname)(manifest.path).replace(/\\/g, '/');
            return script && (!root || outputPath === root || outputPath.startsWith(`${root}/`))
                ? { root, command: `pnpm${root ? ` --dir ${root}` : ''} run ${script}` }
                : null;
        }
        catch {
            return null;
        }
    })
        .filter((candidate) => Boolean(candidate))
        .sort((left, right) => right.root.length - left.root.length);
    return candidates[0]?.command ?? null;
}
function resolveGeneratedSource(outputPath, candidate, tracked) {
    if (!candidate)
        return null;
    const normalized = normalizeGeneratedPath(candidate);
    if (tracked.has(normalized))
        return normalized;
    const relativeCandidate = normalizeGeneratedPath((0, path_1.join)((0, path_1.dirname)(outputPath), normalized));
    return tracked.has(relativeCandidate) ? relativeCandidate : null;
}
function readGeneratedProvenanceEvidence(repoRoot, paths, manifests) {
    const tracked = new Set(paths);
    const evidence = new Map();
    const record = (item) => {
        const outputPath = normalizeGeneratedPath(item.outputPath);
        if (!tracked.has(outputPath))
            return;
        const command = item.command ?? nearestGenerationCommand(outputPath, manifests);
        evidence.set(`${outputPath}:${item.evidenceType}:${item.sourcePath ?? ''}`, {
            ...item,
            outputPath,
            command,
        });
    };
    const attributesPath = (0, path_1.join)(repoRoot, '.gitattributes');
    if (tracked.has('.gitattributes') && (0, fs_1.existsSync)(attributesPath)) {
        try {
            for (const rawLine of (0, fs_1.readFileSync)(attributesPath, 'utf8').split('\n')) {
                const line = rawLine.trim();
                if (!line || line.startsWith('#') || !/\blinguist-generated(?:=true)?\b/i.test(line))
                    continue;
                const pattern = normalizeGeneratedPath(line.split(/\s+/)[0] ?? '');
                for (const pathValue of paths) {
                    if (pathValue !== '.gitattributes' && (0, glob_match_1.matchesGlob)(pattern, pathValue)) {
                        record({ outputPath: pathValue, evidenceType: 'gitattributes' });
                    }
                }
            }
        }
        catch {
            // Unreadable attributes are non-authoritative; other provenance still applies.
        }
    }
    for (const outputPath of paths.slice(0, MAX_GRAPH_FILES)) {
        if (outputPath.endsWith('.sha256')) {
            const target = outputPath.slice(0, -'.sha256'.length);
            if (tracked.has(target))
                record({ outputPath: target, evidenceType: 'checksum' });
            continue;
        }
        const absolute = (0, path_1.join)(repoRoot, outputPath);
        let head = '';
        try {
            if (!(0, fs_1.existsSync)(absolute))
                continue;
            head = (0, fs_1.readFileSync)(absolute, 'utf8').slice(0, 12_000);
        }
        catch {
            continue;
        }
        if (GENERATED_HEADER_RE.test(head)) {
            const sourceMatch = head.match(/(?:generated from|source(?: of truth)?)[\s:=]+['"]?([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/i);
            record({
                outputPath,
                sourcePath: resolveGeneratedSource(outputPath, sourceMatch?.[1], tracked),
                evidenceType: 'generated-header',
            });
        }
        if (GENERATOR_CONFIG_RE.test(outputPath)) {
            const outputMatch = head.match(/(?:output|outDir|outputDir|outputDirectory)[\s:="'{]+([A-Za-z0-9_./-]+)/i);
            if (!outputMatch?.[1])
                continue;
            const outputRoot = normalizeGeneratedPath((0, path_1.join)((0, path_1.dirname)(outputPath), outputMatch[1]));
            const sourceMatch = head.match(/(?:inputSpec|schema|source)[\s:="'{]+([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/i);
            for (const candidate of paths.filter((pathValue) => pathValue === outputRoot || pathValue.startsWith(`${outputRoot}/`))) {
                record({
                    outputPath: candidate,
                    sourcePath: resolveGeneratedSource(outputPath, sourceMatch?.[1], tracked),
                    evidenceType: 'generator-config',
                });
            }
        }
    }
    return Array.from(evidence.values()).sort((left, right) => left.outputPath.localeCompare(right.outputPath) || left.evidenceType.localeCompare(right.evidenceType));
}
function readTopologyBrainFacts(repoRoot) {
    const graph = (0, brain_1.readRepositoryGraph)(repoRoot);
    if (!graph)
        return null;
    const facts = [];
    for (const node of graph.nodes) {
        if (!node.path)
            continue;
        if (node.kind === 'symbol' || node.kind === 'package' || node.kind === 'test') {
            facts.push({
                kind: node.kind,
                path: node.path,
                name: node.name,
            });
        }
    }
    for (const edge of graph.edges) {
        const from = graph.nodes.find((node) => node.id === edge.fromId);
        const to = graph.nodes.find((node) => node.id === edge.toId);
        if (!from?.path || !to?.path)
            continue;
        const kind = edge.type === 'imports'
            ? 'import'
            : edge.type === 'tests'
                ? 'test'
                : 'reference';
        facts.push({
            kind,
            path: from.path,
            relatedPath: to.path,
        });
    }
    return {
        freshness: graph.freshness.state,
        facts: facts.slice(0, 20_000),
    };
}
function prefixCodeownersContent(content, baseDir) {
    const prefix = baseDir.replace(/\\/g, '/').replace(/\/$/, '');
    if (!prefix || prefix === '.')
        return content;
    return content.split('\n').map((rawLine) => {
        const commentIndex = rawLine.indexOf('#');
        const body = commentIndex >= 0 ? rawLine.slice(0, commentIndex) : rawLine;
        const comment = commentIndex >= 0 ? rawLine.slice(commentIndex) : '';
        const trimmed = body.trim();
        if (!trimmed)
            return rawLine;
        const parts = trimmed.split(/\s+/);
        const pattern = parts[0];
        const owners = parts.slice(1);
        if (!pattern || owners.length === 0)
            return rawLine;
        const normalizedPattern = pattern.startsWith('/') ? pattern.slice(1) : pattern;
        return `${prefix}/${normalizedPattern} ${owners.join(' ')}${comment ? ` ${comment}` : ''}`;
    }).join('\n');
}
function readCodeownersBundle(cwd, paths) {
    const chunks = [];
    let firstPath = null;
    const seen = new Set();
    for (const candidate of exports.CODEOWNERS_CANDIDATES) {
        seen.add(candidate);
        const found = readFirstExisting(cwd, [candidate]);
        if (found.content !== null) {
            firstPath ??= found.path;
            chunks.push(found.content);
        }
    }
    for (const rel of paths) {
        const normalized = rel.replace(/\\/g, '/');
        if (seen.has(normalized))
            continue;
        if (!/(^|\/)CODEOWNERS$/i.test(normalized))
            continue;
        seen.add(normalized);
        try {
            const content = (0, fs_1.readFileSync)((0, path_1.join)(cwd, normalized), 'utf8');
            firstPath ??= (0, path_1.join)(cwd, normalized);
            chunks.push(prefixCodeownersContent(content, (0, path_1.dirname)(normalized)));
        }
        catch {
            // Ignore unreadable nested CODEOWNERS files. Sensitive boundary detection
            // still provides a conservative approval gate.
        }
    }
    return {
        path: firstPath,
        content: chunks.length > 0 ? chunks.join('\n') : null,
    };
}
const EMPTY_GOVERNANCE_CONFIG = {
    approvalRequiredGlobs: [],
    sensitiveGlobs: [],
    safeSupportGlobs: [],
    ignoredGlobs: [],
    planCoherence: 'warn',
    localMode: 'advisory',
    repoSymbolDuplicateMode: 'warn',
    architectureObligations: { mode: 'warn', ruleModes: {} },
};
function normalizeStringArray(value, field, errors) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        errors.push(`${field} must be an array of strings`);
        return [];
    }
    const out = [];
    for (const item of value) {
        if (typeof item !== 'string') {
            errors.push(`${field} entries must be strings`);
            continue;
        }
        const normalized = item.trim().replace(/^\.\//, '').replace(/\/+$/, '');
        if (normalized)
            out.push(normalized);
    }
    return Array.from(new Set(out)).sort();
}
function normalizePlanCoherence(value, errors) {
    if (value === undefined || value === null || value === '')
        return 'warn';
    if (value === 'off' || value === 'warn' || value === 'block')
        return value;
    errors.push('planCoherence must be one of: off, warn, block');
    return 'warn';
}
function normalizeLocalMode(value, errors) {
    if (value === undefined || value === null || value === '')
        return 'advisory';
    if (value === 'strict' || value === 'advisory' || value === 'paused')
        return value;
    errors.push('localMode must be one of: strict, advisory, paused');
    return 'advisory';
}
function normalizeRepoSymbolDuplicateMode(value, errors) {
    if (value === undefined || value === null || value === '')
        return 'warn';
    if (value === 'off' || value === 'warn' || value === 'block')
        return value;
    errors.push('repoSymbolDuplicateMode must be one of: off, warn, block');
    return 'warn';
}
function governanceConfigPath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', 'governance.json');
}
function readRuntimeGovernanceConfig(repoRoot) {
    const path = governanceConfigPath(repoRoot);
    if (!(0, fs_1.existsSync)(path)) {
        return {
            path,
            exists: false,
            config: { ...EMPTY_GOVERNANCE_CONFIG },
        };
    }
    let parsed;
    try {
        parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
    }
    catch (error) {
        return {
            path,
            exists: true,
            config: { ...EMPTY_GOVERNANCE_CONFIG },
            error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    const errors = [];
    const config = {
        approvalRequiredGlobs: normalizeStringArray(parsed.approvalRequiredGlobs, 'approvalRequiredGlobs', errors),
        sensitiveGlobs: normalizeStringArray(parsed.sensitiveGlobs, 'sensitiveGlobs', errors),
        safeSupportGlobs: normalizeStringArray(parsed.safeSupportGlobs, 'safeSupportGlobs', errors),
        ignoredGlobs: normalizeStringArray(parsed.ignoredGlobs, 'ignoredGlobs', errors),
        planCoherence: normalizePlanCoherence(parsed.planCoherence, errors),
        localMode: normalizeLocalMode(parsed.localMode, errors),
        repoSymbolDuplicateMode: normalizeRepoSymbolDuplicateMode(parsed.repoSymbolDuplicateMode, errors),
        architectureObligations: (0, governance_runtime_1.normalizeArchitectureObligationPolicy)(parsed.architectureObligations),
    };
    return {
        path,
        exists: true,
        config,
        error: errors.length > 0 ? errors.join('; ') : undefined,
    };
}
function persistRepoSymbolDuplicateMode(repoRoot, mode) {
    if (!['off', 'warn', 'block'].includes(mode)) {
        throw new Error('repoSymbolDuplicateMode must be one of: off, warn, block');
    }
    const path = governanceConfigPath(repoRoot);
    let parsed = {};
    if ((0, fs_1.existsSync)(path)) {
        try {
            parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
        }
        catch (error) {
            throw new Error(`Cannot update ${path}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
        }
    }
    parsed.repoSymbolDuplicateMode = mode;
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
    const temporaryPath = `${path}.tmp.${process.pid}`;
    (0, fs_1.writeFileSync)(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    (0, fs_1.renameSync)(temporaryPath, path);
    clearProfileStalenessCache(repoRoot);
    return path;
}
function migrateLegacyProfileDuplicateMode(repoRoot) {
    const config = readRuntimeGovernanceConfig(repoRoot);
    if (config.exists)
        return;
    const legacy = readGovernanceProfile(repoRoot).profile?.runtimeConfig?.repoSymbolDuplicateMode;
    if (legacy === 'off' || legacy === 'block') {
        persistRepoSymbolDuplicateMode(repoRoot, legacy);
    }
}
// Architecture-graph import extraction is deterministic local analysis. To keep
// `neurcode profile` / session start fast on large repos we cap the number of
// files scanned and only read each file's head (imports live at the top). Only
// import *specifiers* are kept; raw source is read, scanned, and discarded.
const GRAPH_SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py|pyi)$/i;
const MAX_GRAPH_FILES = 6000;
const MAX_GRAPH_FILE_BYTES = 2 * 1024 * 1024;
const MAX_GRAPH_HEAD_LINES = 400;
/**
 * Read per-file import specifiers from the local working tree. Source-free
 * output: returns only module specifier strings (e.g. "../billing/charge"),
 * never file contents. Bounded + deterministic.
 */
function readModuleImports(repoRoot, paths) {
    const sourcePaths = paths
        .filter((p) => GRAPH_SOURCE_EXT.test(p))
        .sort()
        .slice(0, MAX_GRAPH_FILES);
    const records = [];
    for (const rel of sourcePaths) {
        const abs = (0, path_1.join)(repoRoot, rel);
        let content;
        try {
            if (!(0, fs_1.existsSync)(abs))
                continue;
            const raw = (0, fs_1.readFileSync)(abs, 'utf8');
            if (raw.length > MAX_GRAPH_FILE_BYTES)
                continue;
            content = raw.split('\n').slice(0, MAX_GRAPH_HEAD_LINES).join('\n');
        }
        catch {
            continue; // unreadable / binary — skip
        }
        const specifiers = typeof governance_runtime_1.extractImportSpecifiers === 'function'
            ? (0, governance_runtime_1.extractImportSpecifiers)(rel, content)
            : [];
        if (specifiers.length > 0)
            records.push({ filePath: rel, specifiers });
    }
    return records;
}
exports.PROFILE_STALENESS_CACHE_TTL_MS = 5 * 60 * 1000;
function buildCurrentGovernanceProfile(repoRoot, options = {}) {
    const root = resolveRepoRoot(repoRoot);
    const stateFingerprint = profileCacheStateFingerprint(root);
    if (options.bypassCache !== true && process.env.NEURCODE_PROFILE_CACHE !== '0') {
        const fileCached = readProfileBuildFileCache(root, stateFingerprint);
        if (fileCached) {
            lastProfileCacheHit = true;
            return fileCached;
        }
    }
    lastProfileCacheHit = false;
    const paths = gitLsFiles(root);
    const codeowners = readCodeownersBundle(root, paths);
    const manifest = readFirstExisting(root, exports.MANIFEST_CANDIDATES);
    const manifests = readManifestBundle(root, paths);
    const governance = readRuntimeGovernanceConfig(root);
    const imports = readModuleImports(root, paths);
    const brain = readTopologyBrainFacts(root);
    const generatedEvidence = readGeneratedProvenanceEvidence(root, paths, manifests);
    const profile = (0, governance_runtime_1.buildRepoGovernanceProfile)({
        paths,
        codeownersContent: codeowners.content,
        manifestContent: manifest.content,
        manifests,
        repoName: (0, path_1.basename)(root),
        source: 'local',
        runtimeConfig: governance.config,
        imports,
        brain,
        generatedEvidence,
    });
    if (options.bypassCache !== true && process.env.NEURCODE_PROFILE_CACHE !== '0') {
        writeProfileBuildFileCache(root, profile, stateFingerprint);
    }
    return profile;
}
function profileBuildCachePath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', 'cache', 'profile-build.json');
}
function readProfileBuildFileCache(repoRoot, stateFingerprint) {
    const path = profileBuildCachePath(repoRoot);
    if (!(0, fs_1.existsSync)(path))
        return null;
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
        if (!parsed.profile || !parsed.expiresAt || stateFingerprint === null || parsed.stateFingerprint === null)
            return null;
        if (Date.now() > Date.parse(parsed.expiresAt))
            return null;
        if (parsed.stateFingerprint !== stateFingerprint)
            return null;
        return parsed.profile;
    }
    catch {
        return null;
    }
}
function writeProfileBuildFileCache(repoRoot, profile, stateFingerprint) {
    const path = profileBuildCachePath(repoRoot);
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
    (0, fs_1.writeFileSync)(path, JSON.stringify({
        expiresAt: new Date(Date.now() + exports.PROFILE_STALENESS_CACHE_TTL_MS).toISOString(),
        profileHash: profile.profileHash,
        stateFingerprint,
        profile,
    }, null, 2) + '\n', 'utf8');
}
function clearProfileBuildFileCache(repoRoot) {
    const path = profileBuildCachePath(resolveRepoRoot(repoRoot));
    if ((0, fs_1.existsSync)(path)) {
        try {
            (0, fs_1.rmSync)(path, { force: true });
        }
        catch {
            // best-effort
        }
    }
}
function profilePath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', 'profile.json');
}
function readGovernanceProfile(repoRoot) {
    const path = profilePath(repoRoot);
    if (!(0, fs_1.existsSync)(path))
        return { profile: null, path };
    try {
        return { profile: JSON.parse((0, fs_1.readFileSync)(path, 'utf8')), path };
    }
    catch (error) {
        return {
            profile: null,
            path,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
function writeGovernanceProfile(repoRoot, profile) {
    const path = profilePath(repoRoot);
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
    (0, fs_1.writeFileSync)(path, JSON.stringify(profile, null, 2) + '\n', 'utf8');
    return path;
}
function topologyHash(profile) {
    const maybe = profile;
    return typeof maybe?.topology?.hash === 'string' ? maybe.topology.hash : null;
}
function buildProfileFreshnessSignal(result, action = 'none', options = {}) {
    const currentTopologyHash = topologyHash(result.currentProfile) || result.currentProfile.profileHash;
    const refreshed = 'refreshed' in result ? result.refreshed : false;
    const effectiveCachedProfile = refreshed && 'profile' in result ? result.profile : result.cachedProfile;
    const cachedTopology = topologyHash(effectiveCachedProfile);
    const sessionProfileHash = options.sessionProfileHash || undefined;
    const sessionCompatibility = !sessionProfileHash
        ? 'not_applicable'
        : sessionProfileHash === result.currentProfile.profileHash
            ? 'compatible'
            : 'incompatible';
    return {
        status: refreshed ? 'fresh' : result.status,
        refreshed,
        action: refreshed && action === 'none' ? 'auto_refreshed' : action,
        sessionCompatibility,
        checkedAt: new Date().toISOString(),
        profilePath: result.profilePath,
        reasons: [...result.reasons],
        cachedProfileHash: effectiveCachedProfile?.profileHash,
        cachedTopologyHash: cachedTopology || undefined,
        ...(sessionProfileHash ? { sessionProfileHash } : {}),
        currentProfileHash: result.currentProfile.profileHash,
        currentTopologyHash,
        trackedFileCount: result.currentProfile.topology.trackedFileCount,
        ...(options.recoveryReason ? { recoveryReason: options.recoveryReason } : {}),
        ...(options.recoveryCommand ? { recoveryCommand: options.recoveryCommand } : {}),
        ...(options.unresolvedHumanDecisions !== undefined
            ? { unresolvedHumanDecisions: options.unresolvedHumanDecisions }
            : {}),
    };
}
function profileFreshnessActionForSession(result, sessionProfileHash) {
    const currentProfileHash = result.currentProfile.profileHash;
    if (!sessionProfileHash || sessionProfileHash === currentProfileHash) {
        return 'none';
    }
    return 'session_restart_required';
}
const profileStalenessCache = new Map();
let lastProfileCacheHit = false;
function profileCacheStateFingerprint(root) {
    try {
        let head = 'unborn';
        try {
            head = (0, child_process_1.execSync)('git rev-parse HEAD', {
                cwd: root,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim();
        }
        catch {
            // `git status` remains authoritative before the first commit. Keep an
            // explicit sentinel so staged topology changes still invalidate caches.
        }
        const status = (0, child_process_1.execSync)('git status --short --untracked-files=normal', {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            maxBuffer: 4 * 1024 * 1024,
        });
        const stagedDiff = (0, child_process_1.execSync)('git diff --cached --no-ext-diff --binary', {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            maxBuffer: 8 * 1024 * 1024,
        });
        const worktreeDiff = (0, child_process_1.execSync)('git diff --no-ext-diff --binary', {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            maxBuffer: 8 * 1024 * 1024,
        });
        return (0, crypto_1.createHash)('sha256')
            .update(`${head}\n${status}\n${stagedDiff}\n${worktreeDiff}`)
            .digest('hex')
            .slice(0, 24);
    }
    catch {
        return null;
    }
}
function getLastProfileCacheHit() {
    return lastProfileCacheHit;
}
function clearProfileStalenessCache(repoRoot) {
    if (repoRoot) {
        const root = resolveRepoRoot(repoRoot);
        profileStalenessCache.delete(root);
        clearProfileBuildFileCache(root);
    }
    else {
        profileStalenessCache.clear();
    }
}
function getProfileStaleness(repoRoot, options = {}) {
    const root = resolveRepoRoot(repoRoot);
    const now = Date.now();
    const stateFingerprint = profileCacheStateFingerprint(root);
    lastProfileCacheHit = false;
    if (options.bypassCache !== true && process.env.NEURCODE_PROFILE_CACHE !== '0') {
        const cached = profileStalenessCache.get(root);
        if (cached &&
            cached.expiresAt > now &&
            stateFingerprint !== null &&
            cached.stateFingerprint !== null &&
            cached.stateFingerprint === stateFingerprint) {
            lastProfileCacheHit = true;
            return { ...cached.result, profileCacheHit: true };
        }
    }
    const currentProfile = buildCurrentGovernanceProfile(root, {
        bypassCache: options.bypassCache === true,
    });
    const cached = readGovernanceProfile(repoRoot);
    const reasons = [];
    if (cached.error) {
        return {
            status: 'unreadable',
            profilePath: cached.path,
            cachedProfile: null,
            currentProfile,
            reasons: [`profile could not be parsed: ${cached.error}`],
            profileCacheHit: lastProfileCacheHit,
        };
    }
    if (!cached.profile) {
        return {
            status: 'missing',
            profilePath: cached.path,
            cachedProfile: null,
            currentProfile,
            reasons: ['profile is missing'],
            profileCacheHit: lastProfileCacheHit,
        };
    }
    const cachedTopology = topologyHash(cached.profile);
    const currentTopology = topologyHash(currentProfile);
    if (!cachedTopology || !currentTopology) {
        reasons.push('profile lacks topology fingerprint');
    }
    else if (cachedTopology !== currentTopology) {
        reasons.push('repo topology changed since profile generation');
    }
    if (cached.profile.profileHash !== currentProfile.profileHash) {
        reasons.push('profile hash differs from current repo metadata');
    }
    const result = {
        status: reasons.length > 0 ? 'stale' : 'fresh',
        profilePath: cached.path,
        cachedProfile: cached.profile,
        currentProfile,
        reasons,
        profileCacheHit: lastProfileCacheHit,
    };
    profileStalenessCache.set(root, {
        expiresAt: now + exports.PROFILE_STALENESS_CACHE_TTL_MS,
        stateFingerprint,
        result,
    });
    return result;
}
function ensureFreshGovernanceProfile(repoRoot, options = {}) {
    // Older releases encouraged direct profile edits. Preserve an explicit
    // off/block value by migrating it to the durable governance config before
    // any forced regeneration replaces the derived profile.
    migrateLegacyProfileDuplicateMode(repoRoot);
    if (options.force === true) {
        clearProfileStalenessCache(repoRoot);
    }
    const staleness = getProfileStaleness(repoRoot, {
        bypassCache: options.force === true || options.bypassCache === true,
    });
    const shouldRefresh = options.force === true || staleness.status !== 'fresh';
    const profile = shouldRefresh
        ? staleness.currentProfile
        : staleness.cachedProfile ?? staleness.currentProfile;
    if (shouldRefresh) {
        writeGovernanceProfile(repoRoot, profile);
        profileStalenessCache.delete(resolveRepoRoot(repoRoot));
    }
    return {
        ...staleness,
        profile,
        refreshed: shouldRefresh,
    };
}
function setRepoSymbolDuplicateMode(repoRoot, mode) {
    const configPath = persistRepoSymbolDuplicateMode(repoRoot, mode);
    const profile = ensureFreshGovernanceProfile(repoRoot, { force: true, bypassCache: true }).profile;
    return {
        mode: profile.runtimeConfig.repoSymbolDuplicateMode ?? 'warn',
        source: 'governance_config',
        configPath,
        profilePath: profilePath(repoRoot),
        profileHash: profile.profileHash,
    };
}
function ensureDirOf(path) {
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
}
function parseJsonFile(path) {
    if (!(0, fs_1.existsSync)(path))
        return { data: {} };
    const raw = (0, fs_1.readFileSync)(path, 'utf8').trim();
    if (!raw)
        return { data: {} };
    try {
        return { data: JSON.parse(raw) };
    }
    catch (error) {
        return {
            data: {},
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
function isPlainRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function expectedClaudeMcpEntry() {
    return {
        command: CLAUDE_MCP_ENTRY.command,
        args: [...CLAUDE_MCP_ENTRY.args],
    };
}
function normalizeClaudeMcpEntry(value) {
    if (!isPlainRecord(value))
        return null;
    const command = typeof value.command === 'string' ? value.command : undefined;
    const args = Array.isArray(value.args) && value.args.every((arg) => typeof arg === 'string')
        ? [...value.args]
        : undefined;
    return { command, args };
}
function claudeMcpEntryStaleReasons(value) {
    const entry = normalizeClaudeMcpEntry(value);
    const expected = expectedClaudeMcpEntry();
    if (!entry)
        return ['mcpServers.neurcode must be an object'];
    const reasons = [];
    if (entry.command !== expected.command) {
        reasons.push(`expected command "${expected.command}", found "${entry.command || 'missing'}"`);
    }
    if (!entry.args) {
        reasons.push(`expected args ${JSON.stringify(expected.args)}, found missing/non-string args`);
    }
    else if (entry.args.length !== expected.args.length ||
        entry.args.some((arg, index) => arg !== expected.args[index])) {
        reasons.push(`expected args ${JSON.stringify(expected.args)}, found ${JSON.stringify(entry.args)}`);
    }
    return reasons;
}
function claudeMcpEntryIsCurrent(value) {
    return claudeMcpEntryStaleReasons(value).length === 0;
}
function hookCommands(entry) {
    if (!entry || typeof entry !== 'object')
        return [];
    const directCommand = entry['command'];
    const directBash = entry['bash'];
    const direct = [
        typeof directCommand === 'string' ? directCommand : null,
        typeof directBash === 'string' ? directBash : null,
    ].filter((value) => Boolean(value));
    if (direct.length > 0)
        return direct;
    const hooks = entry['hooks'];
    if (!Array.isArray(hooks))
        return [];
    return hooks.flatMap((hook) => {
        if (!hook || typeof hook !== 'object')
            return [];
        const command = hook['command'];
        return typeof command === 'string' ? [command] : [];
    });
}
/**
 * Parse the node entrypoint path out of a pinned hook command.
 * Pinned form: `node "<entrypoint>" session-hook <sub>` (entrypoint may be quoted or bare).
 * Returns null for the legacy bare `neurcode session-hook <sub>` form (no entrypoint to verify).
 */
function parseHookEntrypoint(command) {
    const quoted = command.match(/^node\s+"([^"]+)"\s+session-hook\b/);
    if (quoted)
        return quoted[1];
    const bare = command.match(/^node\s+(\S+)\s+session-hook\b/);
    if (bare)
        return bare[1];
    return null;
}
/** First installed Neurcode session-hook command found for an event (current or stale). */
function installedSessionHookCommand(entries) {
    for (const entry of entries) {
        const match = hookCommands(entry).find(commandHasNeurcodeSessionHook);
        if (match)
            return match;
    }
    return null;
}
function commandHasNeurcodeSessionHook(command) {
    return /\bsession-hook\s+(start|check|finish|approve)\b/.test(command);
}
function entryHasAnyNeurcodeSessionHook(entry) {
    return hookCommands(entry).some(commandHasNeurcodeSessionHook);
}
function expectedSessionHookCommand(event) {
    const subcommand = CLAUDE_EVENT_SESSION_HOOK[event];
    return sessionHookCommand(subcommand, subcommand === 'check' ? 'claude-code-hooks' : undefined);
}
function expectedCopilotSessionHookCommand(event) {
    const subcommand = COPILOT_EVENT_SESSION_HOOK[event];
    return sessionHookCommand(subcommand, subcommand === 'check' ? 'copilot-hooks' : undefined);
}
function entryHasCurrentNeurcodeSessionHook(entry, event) {
    const expected = expectedSessionHookCommand(event);
    if (!hookCommands(entry).some((command) => command === expected))
        return false;
    if (event !== 'PreToolUse')
        return true;
    const matcher = typeof entry['matcher'] === 'string'
        ? String(entry['matcher'])
        : '';
    return ['Bash', 'Edit', 'Write', 'MultiEdit'].every((tool) => matcher.split('|').map((part) => part.trim()).includes(tool));
}
function entryHasCurrentCopilotSessionHook(entry, event) {
    const expected = expectedCopilotSessionHookCommand(event);
    return hookCommands(entry).some((command) => command === expected);
}
function staleNeurcodeHookCommands(entries, event) {
    const expected = expectedSessionHookCommand(event);
    const stale = [];
    for (const entry of entries) {
        for (const command of hookCommands(entry).filter(commandHasNeurcodeSessionHook)) {
            if (command !== expected) {
                stale.push(command);
            }
            else if (event === 'PreToolUse' && !entryHasCurrentNeurcodeSessionHook(entry, event)) {
                stale.push(`${command} (matcher missing Bash)`);
            }
        }
    }
    return stale;
}
function staleCopilotHookCommands(entries, event) {
    const expected = expectedCopilotSessionHookCommand(event);
    const stale = [];
    for (const entry of entries) {
        for (const command of hookCommands(entry).filter(commandHasNeurcodeSessionHook)) {
            if (command !== expected)
                stale.push(command);
        }
    }
    return stale;
}
function installClaudeGovernanceHooks(repoRoot, options = {}) {
    const settingsPath = (0, path_1.join)(repoRoot, '.claude', 'settings.json');
    const parsed = parseJsonFile(settingsPath);
    if (parsed.error) {
        throw new Error(`Refusing to update ${settingsPath}: invalid JSON (${parsed.error})`);
    }
    const existing = parsed.data;
    const hooks = (existing.hooks && typeof existing.hooks === 'object' && !Array.isArray(existing.hooks)
        ? existing.hooks
        : {});
    const added = [];
    const preserved = [];
    const repaired = [];
    for (const [event, entries] of Object.entries(claudeGovernanceHooks())) {
        const hookEvent = event;
        const current = Array.isArray(hooks[event]) ? hooks[event] : [];
        const alreadyCurrent = current.some((entry) => entryHasCurrentNeurcodeSessionHook(entry, hookEvent));
        if (alreadyCurrent && !options.force) {
            preserved.push(`hooks.${event}`);
            continue;
        }
        const hadPriorNeurcodeHook = current.some((entry) => entryHasAnyNeurcodeSessionHook(entry));
        const filtered = current.filter((entry) => !entryHasAnyNeurcodeSessionHook(entry));
        hooks[event] = [...filtered, ...entries];
        if (hadPriorNeurcodeHook)
            repaired.push(`hooks.${event}`);
        else
            added.push(`hooks.${event}`);
    }
    if (!options.dryRun) {
        ensureDirOf(settingsPath);
        (0, fs_1.writeFileSync)(settingsPath, JSON.stringify({ ...existing, hooks }, null, 2) + '\n', 'utf8');
    }
    return {
        settingsPath,
        added,
        preserved,
        repaired,
        restartRequired: added.length + repaired.length > 0,
    };
}
function copilotHooksPath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.github', 'hooks', 'neurcode.json');
}
function installCopilotGovernanceHooks(repoRoot, options = {}) {
    const hooksPath = copilotHooksPath(repoRoot);
    const parsed = parseJsonFile(hooksPath);
    if (parsed.error) {
        throw new Error(`Refusing to update ${hooksPath}: invalid JSON (${parsed.error})`);
    }
    const existing = parsed.data;
    const hooks = (existing.hooks && typeof existing.hooks === 'object' && !Array.isArray(existing.hooks)
        ? existing.hooks
        : {});
    const added = [];
    const preserved = [];
    const repaired = [];
    for (const [event, entries] of Object.entries(copilotGovernanceHooks())) {
        const hookEvent = event;
        const current = Array.isArray(hooks[event]) ? hooks[event] : [];
        const alreadyCurrent = current.some((entry) => entryHasCurrentCopilotSessionHook(entry, hookEvent));
        if (alreadyCurrent && !options.force) {
            preserved.push(`hooks.${event}`);
            continue;
        }
        const hadPriorNeurcodeHook = current.some((entry) => entryHasAnyNeurcodeSessionHook(entry));
        const filtered = current.filter((entry) => !entryHasAnyNeurcodeSessionHook(entry));
        hooks[event] = [...filtered, ...entries];
        if (hadPriorNeurcodeHook)
            repaired.push(`hooks.${event}`);
        else
            added.push(`hooks.${event}`);
    }
    if (!options.dryRun) {
        ensureDirOf(hooksPath);
        (0, fs_1.writeFileSync)(hooksPath, JSON.stringify({ version: 1, ...existing, hooks }, null, 2) + '\n', 'utf8');
    }
    return {
        hooksPath,
        added,
        preserved,
        repaired,
        restartRequired: added.length + repaired.length > 0,
    };
}
function installClaudeMcpConfig(options = {}) {
    const configPath = (0, path_1.join)(options.homeDir || (0, os_1.homedir)(), '.claude.json');
    const parsed = parseJsonFile(configPath);
    if (parsed.error) {
        throw new Error(`Refusing to update ${configPath}: invalid JSON (${parsed.error})`);
    }
    const existing = parsed.data;
    const servers = (existing.mcpServers && typeof existing.mcpServers === 'object' && !Array.isArray(existing.mcpServers)
        ? existing.mcpServers
        : {});
    const added = [];
    const preserved = [];
    const repaired = [];
    for (const key of Object.keys(servers)) {
        if (key !== 'neurcode')
            preserved.push(`mcpServers.${key}`);
    }
    const hasNeurcode = Object.prototype.hasOwnProperty.call(servers, 'neurcode');
    const current = hasNeurcode && claudeMcpEntryIsCurrent(servers.neurcode);
    if (hasNeurcode && current && !options.force) {
        preserved.push('mcpServers.neurcode');
    }
    else {
        servers.neurcode = expectedClaudeMcpEntry();
        if (hasNeurcode)
            repaired.push('mcpServers.neurcode');
        else
            added.push('mcpServers.neurcode');
    }
    if (!options.dryRun) {
        ensureDirOf(configPath);
        (0, fs_1.writeFileSync)(configPath, JSON.stringify({ ...existing, mcpServers: servers }, null, 2) + '\n', 'utf8');
    }
    return {
        configPath,
        added,
        preserved,
        repaired,
        restartRequired: added.length + repaired.length > 0,
    };
}
function inspectClaudeActivation(repoRoot, options = {}) {
    const settingsPath = (0, path_1.join)(repoRoot, '.claude', 'settings.json');
    const eventStatus = {
        UserPromptSubmit: false,
        PreToolUse: false,
        Stop: false,
    };
    const expectedCommands = {
        UserPromptSubmit: expectedSessionHookCommand('UserPromptSubmit'),
        PreToolUse: expectedSessionHookCommand('PreToolUse'),
        Stop: expectedSessionHookCommand('Stop'),
    };
    const staleCommands = [];
    let hookError;
    let installedCommand = null;
    const settings = parseJsonFile(settingsPath);
    if (settings.error) {
        hookError = settings.error;
    }
    else {
        const hooks = (settings.data.hooks && typeof settings.data.hooks === 'object' && !Array.isArray(settings.data.hooks)
            ? settings.data.hooks
            : {});
        for (const event of Object.keys(eventStatus)) {
            const current = Array.isArray(hooks[event]) ? hooks[event] : [];
            eventStatus[event] = current.some((entry) => entryHasCurrentNeurcodeSessionHook(entry, event));
            staleCommands.push(...staleNeurcodeHookCommands(current, event));
        }
        // PreToolUse (the write-blocking hook) is the representative installed command.
        const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
        installedCommand = installedSessionHookCommand(preToolUse);
    }
    const entrypoint = installedCommand ? parseHookEntrypoint(installedCommand) : null;
    const entrypointExists = entrypoint ? (0, fs_1.existsSync)(entrypoint) : null;
    const entrypointPortable = entrypoint ? !(0, path_1.isAbsolute)(entrypoint) : null;
    const configPath = (0, path_1.join)(options.homeDir || (0, os_1.homedir)(), '.claude.json');
    const mcp = parseJsonFile(configPath);
    let mcpConfigured = false;
    let mcpPresent = false;
    let mcpStale = false;
    let mcpEntry = null;
    let mcpStaleReasons = [];
    if (!mcp.error) {
        const servers = (mcp.data.mcpServers && typeof mcp.data.mcpServers === 'object' && !Array.isArray(mcp.data.mcpServers)
            ? mcp.data.mcpServers
            : {});
        mcpPresent = Object.prototype.hasOwnProperty.call(servers, 'neurcode');
        if (mcpPresent) {
            mcpEntry = normalizeClaudeMcpEntry(servers.neurcode);
            mcpStaleReasons = claudeMcpEntryStaleReasons(servers.neurcode);
            mcpStale = mcpStaleReasons.length > 0;
            mcpConfigured = !mcpStale;
        }
    }
    return {
        hooks: {
            installed: Object.values(eventStatus).every(Boolean) && staleCommands.length === 0,
            settingsPath,
            events: eventStatus,
            expectedCommands,
            stale: staleCommands.length > 0,
            staleCommands: Array.from(new Set(staleCommands)).sort(),
            installedCommand,
            entrypoint,
            entrypointExists,
            entrypointPortable,
            error: hookError,
        },
        mcp: {
            configured: mcpConfigured,
            present: mcpPresent,
            stale: mcpStale,
            configPath,
            entry: mcpEntry,
            expectedEntry: expectedClaudeMcpEntry(),
            staleReasons: mcpStaleReasons,
            error: mcp.error,
        },
    };
}
function inspectCopilotActivation(repoRoot) {
    const hooksPath = copilotHooksPath(repoRoot);
    const eventStatus = {
        UserPromptSubmit: false,
        PreToolUse: false,
        Stop: false,
    };
    const expectedCommands = {
        UserPromptSubmit: expectedCopilotSessionHookCommand('UserPromptSubmit'),
        PreToolUse: expectedCopilotSessionHookCommand('PreToolUse'),
        Stop: expectedCopilotSessionHookCommand('Stop'),
    };
    const staleCommands = [];
    let hookError;
    let installedCommand = null;
    const settings = parseJsonFile(hooksPath);
    if (settings.error) {
        hookError = settings.error;
    }
    else {
        const hooks = (settings.data.hooks && typeof settings.data.hooks === 'object' && !Array.isArray(settings.data.hooks)
            ? settings.data.hooks
            : {});
        for (const event of COPILOT_HOOK_EVENTS) {
            const current = Array.isArray(hooks[event]) ? hooks[event] : [];
            eventStatus[event] = current.some((entry) => entryHasCurrentCopilotSessionHook(entry, event));
            staleCommands.push(...staleCopilotHookCommands(current, event));
        }
        const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
        installedCommand = installedSessionHookCommand(preToolUse);
    }
    const entrypoint = installedCommand ? parseHookEntrypoint(installedCommand) : null;
    const entrypointExists = entrypoint ? (0, fs_1.existsSync)(entrypoint) : null;
    const entrypointPortable = entrypoint ? !(0, path_1.isAbsolute)(entrypoint) : null;
    return {
        hooks: {
            installed: Object.values(eventStatus).every(Boolean) && staleCommands.length === 0,
            hooksPath,
            events: eventStatus,
            expectedCommands,
            stale: staleCommands.length > 0,
            staleCommands: Array.from(new Set(staleCommands)).sort(),
            installedCommand,
            entrypoint,
            entrypointExists,
            entrypointPortable,
            error: hookError,
        },
    };
}
//# sourceMappingURL=v0-governance.js.map