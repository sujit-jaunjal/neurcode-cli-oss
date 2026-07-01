"use strict";
/**
 * Neurcode Brain - Local Context, Memory, and Cache Management
 *
 * Goals:
 * - Enterprise-grade observability: users can see what "Brain" knows and why cache hits/misses happen
 * - Multi-tenant safety: everything is scoped by orgId + projectId
 * - Robust ops: export + clear for compliance and troubleshooting
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.brainCommand = brainCommand;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const brain_1 = require("@neurcode-ai/brain");
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const brain_cache_1 = require("../utils/brain-cache");
const local_repo_brain_1 = require("../utils/local-repo-brain");
const repo_brain_impact_1 = require("../utils/repo-brain-impact");
const repo_graph_impact_1 = require("../utils/repo-graph-impact");
const brain_scale_status_1 = require("../utils/brain-scale-status");
const config_1 = require("../config");
const project_root_1 = require("../utils/project-root");
const state_1 = require("../utils/state");
const neurcode_context_1 = require("../utils/neurcode-context");
const plan_cache_1 = require("../utils/plan-cache");
const messages_1 = require("../utils/messages");
const activation_telemetry_1 = require("../utils/activation-telemetry");
const brain_context_1 = require("../utils/brain-context");
const semantic_1 = require("../semantic");
const ask_cache_1 = require("../utils/ask-cache");
const proposed_change_analysis_1 = require("../utils/proposed-change-analysis");
const team_memory_path_hygiene_1 = require("../utils/team-memory-path-hygiene");
const brain_lifecycle_1 = require("../utils/brain-lifecycle");
const v0_governance_1 = require("../utils/v0-governance");
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
    };
}
function safeFileSize(path) {
    try {
        if (!(0, fs_1.existsSync)(path))
            return null;
        return (0, fs_1.statSync)(path).size;
    }
    catch {
        return null;
    }
}
function refreshActivatedProfileAfterBrain(repoRoot) {
    if (!(0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot))
        return;
    // Repository graph construction must not trigger a second whole-repository
    // profile scan after the graph is already durable. Brain facts are consumed
    // independently by runtime intelligence; preserve the activated profile until
    // an explicit/profile-staleness refresh recomposes it.
    const profile = (0, v0_governance_1.readGovernanceProfile)(repoRoot).profile;
    if (profile)
        (0, cli_runtime_1.updateActivatedRuntimeManifestProfileHash)(repoRoot, profile.profileHash);
}
function countOccurrences(haystack, needle) {
    if (!haystack || !needle)
        return 0;
    let count = 0;
    let idx = 0;
    while (true) {
        const next = haystack.indexOf(needle, idx);
        if (next === -1)
            break;
        count++;
        idx = next + needle.length;
    }
    return count;
}
function scanFiles(dir, baseDir, maxFiles = 600) {
    // Light-weight filesystem scan used only as a fallback when git isn't available.
    // Keep it deterministic-ish but fast: only capture relative paths.
    const { readdirSync, statSync } = require('fs');
    const { join, relative } = require('path');
    const files = [];
    const ignoreDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.turbo', '.cache', 'coverage']);
    const ignoreExts = new Set(['map', 'log', 'lock', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'eot']);
    function walk(current) {
        if (files.length >= maxFiles)
            return;
        let entries = [];
        try {
            entries = readdirSync(current);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (files.length >= maxFiles)
                break;
            if (entry.startsWith('.')) {
                // keep common dotfiles, but skip big hidden dirs
                if (ignoreDirs.has(entry))
                    continue;
            }
            const full = join(current, entry);
            const relativePath = normalizeFsPath(relative(baseDir, full));
            if (!(0, team_memory_path_hygiene_1.isTeamMemoryProjectPath)(relativePath))
                continue;
            let st;
            try {
                st = statSync(full);
            }
            catch {
                continue;
            }
            if (st.isDirectory()) {
                if (ignoreDirs.has(entry))
                    continue;
                walk(full);
                continue;
            }
            if (!st.isFile())
                continue;
            const ext = entry.split('.').pop()?.toLowerCase();
            if (ext && ignoreExts.has(ext))
                continue;
            files.push(relativePath);
        }
    }
    walk(dir);
    return files.slice(0, maxFiles);
}
function normalizeFsPath(filePath) {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}
function scopeGraphKey(scope) {
    if (!scope.orgId || !scope.projectId)
        return null;
    return `${scope.orgId}::${scope.projectId}`;
}
function inferModuleKey(filePath) {
    const normalized = normalizeFsPath(filePath);
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length >= 2)
        return `${parts[0]}/${parts[1]}`;
    return parts[0] || 'root';
}
function loadTeamMemoryScopeStore(cwd, scope) {
    const key = scopeGraphKey(scope);
    const path = (0, brain_context_1.getBrainContextPath)(cwd);
    if (!(0, fs_1.existsSync)(path))
        return null;
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.scopes || typeof parsed.scopes !== 'object')
            return null;
        if (key) {
            return parsed.scopes[key] || null;
        }
        // Repo fallback mode: merge all scopes so graph queries can still run
        // even when org/project initialization hasn't happened yet.
        const mergedFiles = {};
        const mergedEvents = [];
        for (const scopeStore of Object.values(parsed.scopes)) {
            for (const [rawPath, fileEntry] of Object.entries(scopeStore.files || {})) {
                const normalizedPath = normalizeFsPath(rawPath);
                const existing = mergedFiles[normalizedPath];
                const existingTs = Date.parse(existing?.lastSeenAt || existing?.updatedAt || '') || 0;
                const incomingTs = Date.parse(fileEntry?.lastSeenAt || fileEntry?.updatedAt || '') || 0;
                if (!existing || incomingTs >= existingTs) {
                    mergedFiles[normalizedPath] = { ...fileEntry, path: normalizedPath };
                }
            }
            if (Array.isArray(scopeStore.events)) {
                mergedEvents.push(...scopeStore.events);
            }
        }
        return { files: mergedFiles, events: mergedEvents };
    }
    catch {
        return null;
    }
}
function collectGitAuthorship(cwd, sinceDays) {
    const authorTouches = new Map();
    const fileTouches = new Map();
    const safeDays = Math.min(3650, Math.max(1, Math.floor(sinceDays)));
    const result = (0, child_process_1.spawnSync)('git', ['log', `--since=${safeDays}.days`, '--name-only', '--pretty=format:__AUTHOR__%an'], {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 50,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if ((result.status ?? 1) !== 0 || !result.stdout) {
        return { authorTouches, fileTouches };
    }
    let currentAuthor = '';
    const lines = result.stdout.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line)
            continue;
        if (line.startsWith('__AUTHOR__')) {
            currentAuthor = line.replace('__AUTHOR__', '').trim() || 'Unknown';
            continue;
        }
        if (!currentAuthor)
            continue;
        const path = normalizeFsPath(line);
        if (!path || path.startsWith('.git/') || path.startsWith('node_modules/') || !(0, team_memory_path_hygiene_1.isTeamMemoryProjectPath)(path))
            continue;
        authorTouches.set(currentAuthor, (authorTouches.get(currentAuthor) || 0) + 1);
        const byAuthor = fileTouches.get(path) || new Map();
        byAuthor.set(currentAuthor, (byAuthor.get(currentAuthor) || 0) + 1);
        fileTouches.set(path, byAuthor);
    }
    return { authorTouches, fileTouches };
}
function rankTopEntries(entries, score, limit) {
    return [...entries]
        .sort((a, b) => score(b) - score(a))
        .slice(0, Math.max(1, limit));
}
function sortIsoDesc(a, b) {
    const aTime = a ? Date.parse(a) : 0;
    const bTime = b ? Date.parse(b) : 0;
    return bTime - aTime;
}
function getBrainScope(projectIdOverride) {
    const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const orgId = (0, state_1.getOrgId)();
    const orgName = (0, state_1.getOrgName)();
    const stateProjectId = (0, state_1.getProjectId)();
    const configProjectId = (0, config_1.loadConfig)().projectId || null;
    const projectId = projectIdOverride || stateProjectId || configProjectId;
    return { cwd, orgId, orgName, projectId };
}
function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0)
        return 'unknown';
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function gitChangedPaths(cwd, args) {
    const result = (0, child_process_1.spawnSync)('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (result.status !== 0)
        return [];
    return String(result.stdout || '')
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter(Boolean);
}
function splitChangedPathList(value) {
    if (!value)
        return [];
    return value
        .split(/[\n,\s]+/)
        .map((path) => path.trim())
        .filter(Boolean);
}
function parseRenameList(value) {
    return splitChangedPathList(value)
        .map((entry) => {
        const delimiter = entry.includes('=>') ? '=>' : ':';
        const [from, to] = entry.split(delimiter, 2).map((item) => item.trim());
        return from && to ? { from, to } : null;
    })
        .filter((entry) => Boolean(entry));
}
function repositoryGraphError(error, json) {
    const locked = error instanceof brain_1.RepositoryGraphLockedError;
    const payload = {
        ok: false,
        code: locked ? 'repository_graph_locked' : 'repository_graph_failed',
        message: error instanceof Error ? error.message : String(error),
        exitCode: locked ? 3 : 1,
    };
    if (json) {
        console.log(JSON.stringify(payload, null, 2));
    }
    else {
        (0, messages_1.printError)('Repository Graph V2 operation failed', payload.message);
    }
    process.exitCode = payload.exitCode;
}
function printRepositoryGraphIndexResult(repoRoot, result, json) {
    const graphPath = result.graph.storage.format === 'atomic_json'
        ? (0, brain_1.legacyRepositoryGraphPath)(repoRoot)
        : (0, brain_1.repositoryGraphPath)(repoRoot);
    const payload = {
        ok: true,
        graphPath,
        schemaVersion: result.graph.schemaVersion,
        graphId: result.graph.graphId,
        generation: result.graph.generation,
        freshness: result.graph.freshness,
        coverage: result.graph.coverage,
        stats: result.stats,
        privacy: result.graph.privacy,
    };
    if (json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    console.log(chalk.bold('\n🧠 Repository Graph V2\n'));
    console.log(chalk.dim(`Mode:              ${result.stats.mode}`));
    console.log(chalk.dim(`Generation:        ${result.graph.generation}`));
    console.log(chalk.dim(`Freshness:         ${result.graph.freshness.state}`));
    console.log(chalk.dim(`Files indexed:     ${result.graph.coverage.filesIndexed}`));
    console.log(chalk.dim(`Files parsed:      ${result.stats.filesParsed}`));
    console.log(chalk.dim(`Files reused:      ${result.stats.filesReused}`));
    console.log(chalk.dim(`Unsupported:       ${result.graph.coverage.unsupportedPercent}%`));
    console.log(chalk.dim(`Nodes / edges:     ${result.graph.nodes.length} / ${result.graph.edges.length}`));
    console.log(chalk.dim(`Graph size:        ${formatBytes(result.stats.graphBytes)}`));
    console.log(chalk.dim(`Duration:          ${result.stats.durationMs}ms`));
    console.log(chalk.dim(`Peak RSS:          ${result.stats.peakMemoryMb} MB`));
    console.log(chalk.dim(`Artifact:          ${payload.graphPath}`));
    console.log(chalk.dim('Privacy:           source-free local structural facts; raw source is not retained.'));
}
function normalizeAdvisoryTarget(repoRoot, input) {
    const absolutePath = (0, path_1.isAbsolute)(input) ? (0, path_1.resolve)(input) : (0, path_1.resolve)(repoRoot, input);
    const relativePath = (0, path_1.relative)(repoRoot, absolutePath).replace(/\\/g, '/');
    if (!relativePath || relativePath === '..' || relativePath.startsWith('../')) {
        throw new Error(`Path is outside repository root: ${input}`);
    }
    return { relativePath, absolutePath };
}
function advisoryCategory(value) {
    const categories = [
        'behavior_similarity',
        'reuse_suggestion',
        'duplicate_module',
        'architecture_deviation',
        'cross_service_consequence',
        'reviewer_question',
        'missing_test',
        'ownership_review',
    ];
    if (!categories.includes(value)) {
        throw new Error(`Unsupported advisory category: ${value}`);
    }
    return value;
}
function renderBrainExportMarkdown(input) {
    const lines = [];
    lines.push('# Neurcode Brain Export');
    lines.push('');
    lines.push(`Generated: ${input.generatedAt}`);
    lines.push(`Repo Root: ${input.cwd}`);
    lines.push('');
    lines.push('## Scope');
    lines.push(`- Organization: ${input.scope.orgName || input.scope.orgId || '(not set)'}`);
    if (input.scope.orgId)
        lines.push(`- Org ID: ${input.scope.orgId}`);
    lines.push(`- Project ID: ${input.scope.projectId || '(not set)'}`);
    lines.push('');
    if (input.cacheStats) {
        lines.push('## Plan Cache');
        lines.push(`- Entries (repo): ${input.cacheStats.totalEntries}`);
        if (typeof input.cacheStats.scopedEntries === 'number') {
            lines.push(`- Entries (scope): ${input.cacheStats.scopedEntries}`);
        }
        lines.push('');
    }
    lines.push('## Static Context Sources');
    if (input.staticContext.sources.length === 0) {
        lines.push('- (none)');
    }
    else {
        input.staticContext.sources.forEach((s) => {
            lines.push(`- ${s.label}: ${s.path} (${formatBytes(s.bytes)}${s.truncated ? ', truncated' : ''})`);
        });
    }
    lines.push('');
    lines.push('## Static Context (Combined)');
    if (!input.staticContext.text.trim()) {
        lines.push('_No context files found._');
    }
    else {
        lines.push('```text');
        lines.push(input.staticContext.text.trim());
        lines.push('```');
    }
    lines.push('');
    lines.push('## Architecture Memory (.neurcode/architecture.json)');
    if (!input.architectureJson) {
        lines.push('_Not found._');
    }
    else {
        lines.push('```json');
        lines.push(JSON.stringify(input.architectureJson, null, 2));
        lines.push('```');
    }
    lines.push('');
    lines.push('## Org/Project Memory (Tail)');
    if (!input.memoryTail?.trim()) {
        lines.push('_No memory found for this scope._');
    }
    else {
        lines.push('```text');
        lines.push(input.memoryTail.trim());
        lines.push('```');
    }
    lines.push('');
    return lines.join('\n');
}
function brainCommand(program) {
    const brain = program.command('brain').description('Manage Neurcode Brain (local cache, context, and memory)');
    brain
        .command('status')
        .description('Show local Brain status (scope, cache, memory, context sources)')
        .option('--project-id <id>', 'Project ID override')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const scope = getBrainScope(options.projectId);
        const allCached = (0, plan_cache_1.listCachedPlans)(scope.cwd);
        const scopedCached = scope.orgId && scope.projectId
            ? allCached.filter((e) => e.input.orgId === scope.orgId && e.input.projectId === scope.projectId)
            : [];
        const allAskCached = (0, ask_cache_1.listCachedAsks)(scope.cwd);
        const scopedAskCached = scope.orgId && scope.projectId
            ? allAskCached.filter((e) => e.input.orgId === scope.orgId && e.input.projectId === scope.projectId)
            : [];
        const staticContext = (0, neurcode_context_1.loadStaticNeurcodeContext)(scope.cwd, scope.orgId && scope.projectId ? { orgId: scope.orgId, projectId: scope.projectId } : undefined);
        const memoryPath = scope.orgId && scope.projectId ? (0, neurcode_context_1.getOrgProjectMemoryPath)(scope.cwd, scope.orgId, scope.projectId) : null;
        const memoryExists = memoryPath ? (0, fs_1.existsSync)(memoryPath) : false;
        const memoryBytes = memoryPath ? safeFileSize(memoryPath) : null;
        let memoryEntries = null;
        if (memoryExists && memoryPath) {
            try {
                const raw = (0, fs_1.readFileSync)(memoryPath, 'utf-8');
                memoryEntries = countOccurrences(raw, '<!-- neurcode-memory-entry -->');
            }
            catch {
                memoryEntries = null;
            }
        }
        const architecturePath = (0, path_1.join)(scope.cwd, '.neurcode', 'architecture.json');
        const architectureBytes = safeFileSize(architecturePath);
        const brainDbPath = (0, plan_cache_1.getBrainDbPath)(scope.cwd);
        const fallbackCachePath = (0, plan_cache_1.getBrainFallbackCachePath)(scope.cwd);
        const brainPointerPath = (0, plan_cache_1.getBrainPointerPath)(scope.cwd);
        const askCachePath = (0, ask_cache_1.getAskCachePath)(scope.cwd);
        const brainDbBytes = (0, plan_cache_1.getBrainDbSizeBytes)(scope.cwd);
        const askCacheBytes = safeFileSize(askCachePath);
        const storageMode = (0, plan_cache_1.getBrainStorageMode)(scope.cwd);
        const backend = (0, plan_cache_1.getBrainStoreBackend)(scope.cwd);
        const activeStorePath = backend === 'sqlite' ? brainDbPath : fallbackCachePath;
        const activeStoreExists = (0, fs_1.existsSync)(activeStorePath);
        const activeStoreBytes = safeFileSize(activeStorePath);
        const contextStats = (0, brain_context_1.getBrainContextStats)(scope.cwd, {
            orgId: scope.orgId,
            projectId: scope.projectId,
        });
        const payload = {
            repoRoot: scope.cwd,
            scope: {
                orgId: scope.orgId,
                orgName: scope.orgName,
                projectId: scope.projectId,
            },
            planCache: {
                totalEntries: allCached.length,
                scopedEntries: scopedCached.length,
            },
            askCache: {
                path: askCachePath,
                exists: (0, fs_1.existsSync)(askCachePath),
                bytes: askCacheBytes,
                totalEntries: allAskCached.length,
                scopedEntries: scopedAskCached.length,
            },
            brainStore: {
                backend,
                activeStorePath,
                activeStoreExists,
                activeStoreBytes,
                dbPath: brainDbPath,
                dbExists: (0, fs_1.existsSync)(brainDbPath),
                dbBytes: brainDbBytes,
                fallbackPath: fallbackCachePath,
                fallbackExists: (0, fs_1.existsSync)(fallbackCachePath),
                pointerPath: brainPointerPath,
                pointerExists: (0, fs_1.existsSync)(brainPointerPath),
                noCodeStorage: storageMode.noCodeStorage,
                modeSource: storageMode.source,
            },
            contextIndex: contextStats,
            memory: {
                path: memoryPath,
                exists: memoryExists,
                bytes: memoryBytes,
                entries: memoryEntries,
            },
            staticContext: {
                hash: staticContext.hash,
                sources: staticContext.sources,
                bytes: Buffer.byteLength(staticContext.text || '', 'utf-8'),
            },
            architecture: {
                path: architecturePath,
                exists: (0, fs_1.existsSync)(architecturePath),
                bytes: architectureBytes,
            },
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        await (0, messages_1.printSuccessBanner)('Neurcode Brain Status');
        (0, messages_1.printSection)('Scope', '🧠');
        console.log(chalk.dim(`Repo Root: ${scope.cwd}`));
        console.log(chalk.dim(`Org:      ${scope.orgName || scope.orgId || '(not set)'}`));
        console.log(chalk.dim(`Project:  ${scope.projectId || '(not set)'}`));
        if (!scope.orgId || !scope.projectId) {
            (0, messages_1.printWarning)('Brain scope is not fully configured', 'Run: neurcode init  (to link this folder to an organization + project)');
        }
        (0, messages_1.printSection)('Brain Store', '🗄️');
        console.log(chalk.dim(`Backend:          ${backend}`));
        console.log(chalk.dim(`Active Store:     ${activeStorePath}`));
        console.log(chalk.dim(`Store Exists:     ${activeStoreExists ? 'yes' : 'no'}`));
        if (activeStoreBytes != null) {
            console.log(chalk.dim(`Store Size:       ${formatBytes(activeStoreBytes)}`));
        }
        console.log(chalk.dim(`DB Path:          ${brainDbPath}`));
        console.log(chalk.dim(`DB Exists:        ${(0, fs_1.existsSync)(brainDbPath) ? 'yes' : 'no'}`));
        if (brainDbBytes != null) {
            console.log(chalk.dim(`DB Size:          ${formatBytes(brainDbBytes)}`));
        }
        console.log(chalk.dim(`Fallback Path:    ${fallbackCachePath}`));
        console.log(chalk.dim(`Fallback Exists:  ${(0, fs_1.existsSync)(fallbackCachePath) ? 'yes' : 'no'}`));
        console.log(chalk.dim(`Pointer Path:     ${brainPointerPath}`));
        console.log(chalk.dim(`Pointer Exists:   ${(0, fs_1.existsSync)(brainPointerPath) ? 'yes' : 'no'}`));
        console.log(chalk.dim(`No-code-storage:  ${storageMode.noCodeStorage ? 'ON' : 'OFF'} (${storageMode.source})`));
        (0, messages_1.printSection)('Context Index', '🧩');
        console.log(chalk.dim(`Path:             ${contextStats.path}`));
        console.log(chalk.dim(`Exists:           ${contextStats.exists ? 'yes' : 'no'}`));
        console.log(chalk.dim(`Scopes:           ${contextStats.totalScopes}`));
        console.log(chalk.dim(`Scope Active:     ${contextStats.scopeFound ? 'yes' : 'no'}`));
        console.log(chalk.dim(`Indexed Files:    ${contextStats.fileEntries}`));
        console.log(chalk.dim(`Progress Events:  ${contextStats.eventEntries}`));
        if (contextStats.lastRefreshAt) {
            console.log(chalk.dim(`Last Refresh:     ${new Date(contextStats.lastRefreshAt).toLocaleString()}`));
        }
        if (contextStats.lastUpdatedAt) {
            console.log(chalk.dim(`Last Update:      ${new Date(contextStats.lastUpdatedAt).toLocaleString()}`));
        }
        (0, messages_1.printSection)('Plan Cache', '⚡');
        console.log(chalk.dim(`Entries (repo):   ${allCached.length}`));
        if (scope.orgId && scope.projectId) {
            console.log(chalk.dim(`Entries (scope):  ${scopedCached.length}`));
        }
        console.log(chalk.dim(`Ask Cache Path:   ${askCachePath}`));
        console.log(chalk.dim(`Ask Entries(repo): ${allAskCached.length}`));
        if (scope.orgId && scope.projectId) {
            console.log(chalk.dim(`Ask Entries(scope): ${scopedAskCached.length}`));
        }
        if (askCacheBytes != null) {
            console.log(chalk.dim(`Ask Cache Size:   ${formatBytes(askCacheBytes)}`));
        }
        (0, messages_1.printSection)('Memory', '📝');
        if (!memoryPath) {
            console.log(chalk.dim('No org/project scope detected, so no memory file is active.'));
        }
        else if (!memoryExists) {
            console.log(chalk.dim(`No memory found yet for this scope.`));
            console.log(chalk.dim(`Path: ${memoryPath}`));
        }
        else {
            console.log(chalk.dim(`Path:    ${memoryPath}`));
            if (memoryBytes != null)
                console.log(chalk.dim(`Size:    ${formatBytes(memoryBytes)}`));
            if (memoryEntries != null)
                console.log(chalk.dim(`Entries: ${memoryEntries}`));
        }
        (0, messages_1.printSection)('Static Context', '📎');
        if (staticContext.sources.length === 0) {
            console.log(chalk.dim('No context files found. Optional files: neurcode.md, .neurcode/context.md'));
        }
        else {
            staticContext.sources.forEach((s) => {
                console.log(chalk.dim(`- ${s.label}: ${s.path} (${formatBytes(s.bytes)}${s.truncated ? ', truncated' : ''})`));
            });
        }
        (0, messages_1.printSection)('Knowledge', '🏗️');
        if ((0, fs_1.existsSync)(architecturePath)) {
            console.log(chalk.dim(`Architecture memory: ${architecturePath} (${formatBytes(architectureBytes || 0)})`));
        }
        else {
            console.log(chalk.dim('Architecture memory not found yet (it will be created automatically on plan runs).'));
        }
    });
    brain
        .command('readiness')
        .description('Repository Brain readiness: languages, parser depth, storage, caps, enforcement posture, and next command')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const scope = getBrainScope();
        const graph = (0, brain_1.readRepositoryGraph)(scope.cwd);
        const metadata = (0, brain_1.readRepositoryGraphMetadata)(scope.cwd);
        const graphMeta = (0, repo_graph_impact_1.readGraphMetadataOnly)(scope.cwd);
        const freshness = graph ? await (0, brain_1.repositoryGraphStatus)(scope.cwd) : null;
        const scaleStatus = (0, brain_scale_status_1.buildBrainScaleStatus)(scope.cwd, { liveFreshness: freshness });
        const storeMode = process.env.NEURCODE_GRAPH_STORE?.trim() || 'portable (default)';
        const portableBackend = graphMeta.backend === 'portable';
        const languages = graph?.coverage.languages ?? [];
        const caps = metadata?.limits ?? graph?.limits ?? null;
        const omitted = metadata?.coverageAuthority?.omittedPathPrefixes?.slice(0, 12)
            ?? graph?.coverageAuthority?.omittedPathPrefixes?.slice(0, 12)
            ?? [];
        const nextCommands = graph
            ? ['neurcode brain impact --path <file>', 'neurcode brain repo-query --help']
            : ['neurcode brain repo-index', 'neurcode brain readiness --json'];
        const enforcementPosture = {
            claude: 'hard_pre_write_deny_when_hook_installed',
            copilot: 'hard_pre_write_deny_when_hook_installed',
            cursor: 'cooperative_advisory_mcp_checks',
            codex: 'cooperative_advisory_mcp_checks',
        };
        const payload = {
            repoRoot: scope.cwd,
            // Unified honest scale status (Scale V4 / D3a): the single source of
            // truth for store backend, coverage authority, caps, and timings.
            scaleStatus,
            brainState: graph ? (freshness?.state ?? 'unknown') : 'not_indexed',
            storage: {
                mode: storeMode,
                backend: graphMeta.backend,
                bytes: graphMeta.bytes,
                impactAuthority: graphMeta.impactAuthority,
                enterpriseScale: !portableBackend,
                incrementalPosture: portableBackend
                    ? 'portable_json_rewrites_full_graph_on_each_index_not_enterprise_scale'
                    : 'sqlite_row_incremental_when_native_probe_succeeds',
                recommendation: portableBackend
                    ? (graphMeta.bytes && graphMeta.bytes > 32 * 1024 * 1024
                        ? 'Set NEURCODE_GRAPH_STORE=auto or sqlite after authority proves native probe on this machine'
                        : 'Portable JSON is fine for small repos; use sqlite/auto before large-repo pilots')
                    : null,
            },
            languages: languages.map((item) => ({
                language: item.language,
                parserDepth: item.depth,
                filesAnalyzed: item.filesAnalyzed,
                parserId: item.parserId,
            })),
            // Iteration 7: honest, builder-derived per-language coverage matrix
            // (supported/partial/advisory/not_evaluated) replaces the prior
            // hardcoded capabilityMatrix stub. Single source: scaleStatus.languageMatrix.
            languageMatrix: scaleStatus.languageMatrix,
            caps: caps ? {
                maxFiles: caps.maxFiles,
                maxNodes: caps.maxNodes,
                maxEdges: caps.maxEdges,
                omittedPathPrefixes: omitted,
                coverageComplete: metadata?.coverageAuthority?.coverageComplete ?? graph?.coverageAuthority?.coverageComplete ?? null,
            } : null,
            enforcementPosture,
            privacy: { metadataOnly: true, sourceUploaded: false, sourceIncluded: false },
            nextRecommendedCommands: nextCommands,
            recoveryCommand: graph ? 'neurcode brain repo-refresh' : 'neurcode brain repo-index',
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        await (0, messages_1.printSuccessBanner)('Repository Brain Readiness');
        console.log(chalk.dim(`Repo: ${scope.cwd}`));
        console.log(chalk.white(`State: ${payload.brainState}`));
        console.log(chalk.white(`Storage: ${payload.storage.backend} (${graphMeta.bytes != null ? formatBytes(graphMeta.bytes) : 'n/a'})`));
        if (payload.storage.recommendation) {
            (0, messages_1.printInfo)('Scale recommendation', payload.storage.recommendation);
        }
        (0, messages_1.printSection)('Storage posture', '🗄️');
        if (portableBackend) {
            console.log(chalk.yellow('Portable JSON backend — not enterprise-scale incremental; full graph rewrite on index'));
        }
        else {
            console.log(chalk.dim(`SQLite backend — queryable segmented store`));
        }
        if (scaleStatus.storage.acceleratedFallbackToPortable) {
            console.log(chalk.red(`⚠ Accelerated store requested but native probe failed `
                + `(${scaleStatus.storage.backendReasonCode ?? 'native_unavailable'}) — running on portable JSON. `
                + `Re-index after enabling native SQLite.`));
        }
        if (scaleStatus.coverage.impactAuthority && scaleStatus.coverage.impactAuthority !== 'authoritative') {
            console.log(chalk.yellow(`Coverage authority: ${scaleStatus.coverage.impactAuthority} `
                + `(coverageComplete=${scaleStatus.coverage.coverageComplete}, `
                + `omittedFiles=${scaleStatus.coverage.omittedFiles ?? 0})`));
        }
        if (scaleStatus.caps.fileCapReached || scaleStatus.caps.nodeCapReached || scaleStatus.caps.edgeCapReached) {
            console.log(chalk.yellow(`Caps hit — files=${scaleStatus.caps.fileCapReached} `
                + `nodes=${scaleStatus.caps.nodeCapReached} edges=${scaleStatus.caps.edgeCapReached}`));
        }
        (0, messages_1.printSection)('Language coverage', '🌐');
        if (!graph) {
            console.log(chalk.dim('Not indexed — tiers are capability defaults; run neurcode brain repo-index for observed coverage.'));
        }
        for (const row of scaleStatus.languageMatrix.languages) {
            const d = row.dimensions;
            const where = row.observed ? `${row.filesAnalyzed} files` : 'not present';
            console.log(chalk.dim(`- ${row.language} [${row.parserDepth}, ${where}]: `
                + `parse=${d.parsing.tier} imports=${d.imports.tier} symbols=${d.symbols.tier} `
                + `test=${d.testImpact.tier} owner=${d.ownership.tier}`));
            if (row.observed && row.limitations.length > 0) {
                console.log(chalk.dim(`    ↳ ${row.limitations[0]}`));
            }
        }
        console.log(chalk.dim('Tiers: supported=deterministic · partial=bounded · advisory=heuristic · not_evaluated=no parser'));
        (0, messages_1.printSection)('Enforcement posture', '🛡️');
        console.log(chalk.dim('Cursor/Codex: cooperative MCP checks (not hard pre-write deny)'));
        console.log(chalk.dim('Claude/Copilot: hard deny when host hooks are installed'));
        (0, messages_1.printSection)('Next', '▶️');
        for (const cmd of nextCommands)
            console.log(chalk.cyan(`  ${cmd}`));
    });
    // -- brain index ------------------------------------------------------------
    brain
        .command('index')
        .description('Build a source-free local repository brain from paths, symbols, imports, owners, and hashes')
        .option('--max-files <n>', 'Maximum files to scan (default: 8000)', (v) => parseInt(v, 10))
        .option('--max-bytes-per-file <n>', 'Maximum bytes per file (default: 350000)', (v) => parseInt(v, 10))
        .option('--experimental-fingerprint-reuse', 'Include experimental signature-fingerprint reuse detection (noisy on large repos)')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        (0, activation_telemetry_1.trackActivationEvent)({
            eventType: 'brain_index_started',
            commandFamily: 'brain:index',
            reasonCode: 'brain_index.started',
        });
        const scope = getBrainScope();
        const canonical = await (0, brain_1.indexRepositoryGraph)({
            repoRoot: scope.cwd,
            limits: {
                ...(Number.isFinite(options.maxFiles) ? { maxFiles: options.maxFiles } : {}),
                ...(Number.isFinite(options.maxBytesPerFile) ? { maxBytesPerFile: options.maxBytesPerFile } : {}),
            },
        });
        const artifact = (0, local_repo_brain_1.buildLocalRepoBrain)(scope.cwd, {
            maxFiles: options.maxFiles,
            maxBytesPerFile: options.maxBytesPerFile,
            experimentalFingerprintReuse: options.experimentalFingerprintReuse,
        });
        const paths = (0, local_repo_brain_1.writeLocalRepoBrain)(scope.cwd, artifact);
        const payload = {
            repoRoot: scope.cwd,
            repositoryIntelligenceModel: {
                canonicalLifecycle: 'repository_graph_v2',
                surface: 'legacy_brain_compatibility_projection',
                compatibilityOnly: true,
            },
            canonicalGraph: {
                path: (0, brain_1.repositoryGraphPath)(scope.cwd),
                graphId: canonical.graph.graphId,
                schemaVersion: canonical.graph.schemaVersion,
                freshness: canonical.graph.freshness,
                coverage: canonical.graph.coverage,
                nodeCount: canonical.graph.nodes.length,
                edgeCount: canonical.graph.edges.length,
            },
            compatibilityProjection: {
                artifactHash: artifact.artifactHash,
                summary: artifact.summary,
            },
            jsonPath: paths.jsonPath,
            markdownPath: paths.markdownPath,
            artifactHash: artifact.artifactHash,
            privacy: artifact.privacy,
            summary: artifact.summary,
            topHotspots: artifact.hotspots.slice(0, 8),
            reuseFindings: artifact.reuseFindings.slice(0, 8),
        };
        if (options.json) {
            (0, activation_telemetry_1.trackActivationEvent)({
                eventType: 'brain_index_completed',
                commandFamily: 'brain:index',
                reasonCode: 'brain_index.completed',
            });
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        await (0, messages_1.printSuccessBanner)('Canonical Repository Intelligence Indexed');
        (0, messages_1.printSection)('Canonical lifecycle', '🧭');
        console.log(chalk.dim(`Repository Graph: ${payload.canonicalGraph.graphId}`));
        console.log(chalk.dim(`Posture:          ${canonical.graph.freshness.posture ?? canonical.graph.freshness.state}`));
        console.log(chalk.dim(`Analyzed/skipped: ${canonical.graph.coverage.filesAnalyzed}/${canonical.graph.coverage.filesSkipped}`));
        console.log(chalk.dim(`Recovery:         neurcode brain repo-recover`));
        (0, messages_1.printSection)('Artifact', '🧠');
        console.log(chalk.yellow('Legacy Brain is a compatibility projection; its counts are not canonical lifecycle health.'));
        console.log(chalk.dim(`Repo Root:     ${scope.cwd}`));
        console.log(chalk.dim(`JSON:          ${paths.jsonPath}`));
        console.log(chalk.dim(`Summary:       ${paths.markdownPath}`));
        console.log(chalk.dim(`Artifact Hash: ${artifact.artifactHash}`));
        (0, messages_1.printSection)('Summary', '📊');
        console.log(chalk.dim(`Files indexed:       ${artifact.summary.filesIndexed}`));
        console.log(chalk.dim(`Declarations indexed:${artifact.summary.symbolsIndexed}`));
        console.log(chalk.dim(`Import edges:        ${artifact.summary.importEdges}`));
        console.log(chalk.dim(`Modules:             ${artifact.summary.modules}`));
        console.log(chalk.dim(`Sensitive files:     ${artifact.summary.sensitiveFiles}`));
        if (artifact.summary.ownerBoundaryStatus === 'not_found') {
            console.log(chalk.dim(`Owner boundaries:    none (no CODEOWNERS found)`));
        }
        else {
            console.log(chalk.dim(`Owner boundaries:    ${artifact.summary.ownerBoundaries}`));
        }
        console.log(chalk.dim(`Reuse advisories:    ${artifact.summary.reuseFindings}`));
        console.log(chalk.dim(`Generated skipped:   ${artifact.summary.generatedFilesSkipped}`));
        (0, messages_1.printSection)('Privacy', '🔒');
        console.log(chalk.dim('No source code, raw diffs, raw prompts, or chat transcripts are stored.'));
        console.log(chalk.dim(`Stored fields: ${artifact.privacy.storedFields.join(', ')}`));
        if (artifact.reuseFindings.length > 0) {
            (0, messages_1.printSection)('Top Reuse Advisories (same-name exports)', '♻️');
            artifact.reuseFindings.slice(0, 6).forEach((finding, index) => {
                console.log(chalk.white(`  ${index + 1}. ${finding.symbolName || finding.kind}: ${finding.confidence} confidence`));
                console.log(chalk.dim(`     ${finding.files.slice(0, 4).join(', ')}`));
            });
        }
        else {
            (0, messages_1.printSection)('Reuse Advisories', '♻️');
            console.log(chalk.dim('No duplicate exported symbol names found across non-test files.'));
        }
        (0, messages_1.printInfo)('Next', 'Run: neurcode brain inspect "<area or symbol>"');
        (0, activation_telemetry_1.trackActivationEvent)({
            eventType: 'brain_index_completed',
            commandFamily: 'brain:index',
            reasonCode: 'brain_index.completed',
        });
    });
    // -- Repository Graph V2 ---------------------------------------------------
    brain
        .command('repo-index')
        .description('Create or incrementally refresh the persistent Repository Graph V2')
        .option('--changed <paths>', 'Changed paths separated by commas, spaces, or newlines')
        .option('--deleted <paths>', 'Deleted paths separated by commas, spaces, or newlines')
        .option('--rename <pairs>', 'Rename pairs as old:new or old=>new, separated by commas')
        .option('--max-files <n>', 'Maximum files to inspect', (value) => parseInt(value, 10))
        .option('--max-total-bytes <n>', 'Maximum total bytes to inspect', (value) => parseInt(value, 10))
        .option('--max-bytes-per-file <n>', 'Maximum bytes per file', (value) => parseInt(value, 10))
        .option('--json', 'Output stable machine-readable JSON')
        .action(async (options) => {
        (0, activation_telemetry_1.trackActivationEvent)({
            eventType: 'brain_index_started',
            commandFamily: 'brain:repo-index',
            reasonCode: 'brain_index.started',
        });
        const scope = getBrainScope();
        let jobId;
        try {
            const limits = {
                ...(Number.isFinite(options.maxFiles) ? { maxFiles: options.maxFiles } : {}),
                ...(Number.isFinite(options.maxTotalBytes) ? { maxTotalBytes: options.maxTotalBytes } : {}),
                ...(Number.isFinite(options.maxBytesPerFile) ? { maxBytesPerFile: options.maxBytesPerFile } : {}),
            };
            const lifecycle = await (0, brain_lifecycle_1.beginBrainIndex)(scope.cwd, {
                source: process.env.NEURCODE_BRAIN_INDEX_SOURCE === 'auto' ? 'auto' : 'manual',
                requestedLimits: limits,
                jobId: process.env.NEURCODE_BRAIN_JOB_ID,
            });
            jobId = lifecycle.jobId ?? undefined;
            const result = await (0, brain_1.indexRepositoryGraph)({
                repoRoot: scope.cwd,
                changedPaths: splitChangedPathList(options.changed),
                deletedPaths: splitChangedPathList(options.deleted),
                renamedPaths: parseRenameList(options.rename),
                limits,
                onProgress: jobId
                    ? (progress) => { (0, brain_lifecycle_1.recordBrainProgress)(scope.cwd, jobId, progress); }
                    : undefined,
            });
            (0, brain_lifecycle_1.markBrainIndexResult)(scope.cwd, result, jobId);
            refreshActivatedProfileAfterBrain(scope.cwd);
            printRepositoryGraphIndexResult(scope.cwd, result, options.json);
            (0, activation_telemetry_1.trackActivationEvent)({
                eventType: 'brain_index_completed',
                commandFamily: 'brain:repo-index',
                reasonCode: 'brain_index.completed',
            });
        }
        catch (error) {
            if (jobId) {
                (0, brain_lifecycle_1.markBrainFailed)(scope.cwd, error instanceof brain_1.RepositoryGraphLockedError ? 'index_locked' : 'index_failed', jobId);
            }
            (0, activation_telemetry_1.trackActivationEvent)({
                eventType: 'brain_index_completed',
                commandFamily: 'brain:repo-index',
                reasonCode: error instanceof brain_1.RepositoryGraphLockedError ? 'brain_index.locked' : 'brain_index.failed',
                success: false,
            });
            repositoryGraphError(error, options.json);
        }
    });
    brain
        .command('repo-refresh')
        .description('Refresh stale Repository Graph V2 files using content hashes')
        .option('--changed <paths>', 'Optional changed paths separated by commas, spaces, or newlines')
        .option('--deleted <paths>', 'Optional deleted paths separated by commas, spaces, or newlines')
        .option('--rename <pairs>', 'Optional rename pairs as old:new or old=>new')
        .option('--json', 'Output stable machine-readable JSON')
        .action(async (options) => {
        const scope = getBrainScope();
        let jobId;
        try {
            const lifecycle = await (0, brain_lifecycle_1.beginBrainIndex)(scope.cwd, {
                source: 'manual',
                requestedLimits: {},
            });
            jobId = lifecycle.jobId ?? undefined;
            const result = await (0, brain_1.indexRepositoryGraph)({
                repoRoot: scope.cwd,
                changedPaths: splitChangedPathList(options.changed),
                deletedPaths: splitChangedPathList(options.deleted),
                renamedPaths: parseRenameList(options.rename),
                onProgress: jobId
                    ? (progress) => { (0, brain_lifecycle_1.recordBrainProgress)(scope.cwd, jobId, progress); }
                    : undefined,
            });
            (0, brain_lifecycle_1.markBrainIndexResult)(scope.cwd, result, jobId);
            refreshActivatedProfileAfterBrain(scope.cwd);
            printRepositoryGraphIndexResult(scope.cwd, result, options.json);
        }
        catch (error) {
            if (jobId) {
                (0, brain_lifecycle_1.markBrainFailed)(scope.cwd, error instanceof brain_1.RepositoryGraphLockedError ? 'index_locked' : 'index_failed', jobId);
            }
            repositoryGraphError(error, options.json);
        }
    });
    brain
        .command('repo-status')
        .description('Show Repository Graph V2 freshness, coverage, and parser depth')
        .option('--json', 'Output stable machine-readable JSON')
        .action(async (options) => {
        const scope = getBrainScope();
        try {
            const freshness = await (0, brain_1.repositoryGraphStatus)(scope.cwd);
            const metadata = (0, brain_1.readRepositoryGraphMetadata)(scope.cwd);
            const scaleStatus = (0, brain_scale_status_1.buildBrainScaleStatus)(scope.cwd, { liveFreshness: freshness });
            const payload = {
                ok: freshness.state !== 'corrupt',
                repoRoot: scope.cwd,
                // Unified honest scale status (Scale V4 / D3a) — same builder as readiness.
                scaleStatus,
                graphPath: metadata?.storageFormat === 'atomic_json'
                    ? (0, brain_1.legacyRepositoryGraphPath)(scope.cwd)
                    : (0, brain_1.repositoryGraphPath)(scope.cwd),
                freshness,
                graph: metadata ? {
                    schemaVersion: metadata.schemaVersion,
                    graphId: metadata.graphId,
                    generation: metadata.generation,
                    updatedAt: metadata.updatedAt,
                    coverage: metadata.coverage,
                    nodeCount: metadata.nodeCount,
                    edgeCount: metadata.edgeCount,
                    graphBytes: metadata.graphBytes,
                    storageFormat: metadata.storageFormat,
                    coverageAuthority: metadata.coverageAuthority ?? null,
                    limits: metadata.limits,
                } : null,
            };
            if (options.json) {
                console.log(JSON.stringify(payload, null, 2));
                return;
            }
            console.log(chalk.bold('\n🧠 Repository Graph V2 Status\n'));
            console.log(chalk.dim(`State:             ${freshness.state}`));
            console.log(chalk.dim(`Indexed at:        ${freshness.indexedAt ?? 'never'}`));
            console.log(chalk.dim(`Stale files:       ${freshness.staleFileCount}`));
            console.log(chalk.dim(`Unsupported files: ${freshness.unsupportedFileCount}`));
            console.log(chalk.dim(`Reason codes:      ${freshness.reasonCodes.join(', ') || 'none'}`));
            if (metadata) {
                console.log(chalk.dim(`Generation:        ${metadata.generation}`));
                console.log(chalk.dim(`Nodes / edges:     ${metadata.nodeCount} / ${metadata.edgeCount}`));
                console.log(chalk.dim(`Graph bytes:       ${metadata.graphBytes}`));
                console.log(chalk.dim(`Unsupported:       ${metadata.coverage.unsupportedPercent}%`));
                for (const language of metadata.coverage.languages) {
                    console.log(chalk.dim(`  ${language.language}: ${language.depth}; ${language.filesAnalyzed}/${language.filesSeen} analyzed`));
                }
            }
            else {
                console.log(chalk.dim('Run `neurcode brain repo-index` to create the graph.'));
            }
        }
        catch (error) {
            repositoryGraphError(error, options.json);
        }
    });
    brain
        .command('lifecycle')
        .description('Show truthful Repo Brain lifecycle, progress, freshness, and recovery commands')
        .option('--json', 'Output stable source-free JSON')
        .action(async (options) => {
        const scope = getBrainScope();
        const lifecycle = await (0, brain_lifecycle_1.inspectBrainLifecycle)(scope.cwd);
        if (options.json) {
            console.log(JSON.stringify({ ok: lifecycle.state !== 'failed', lifecycle }, null, 2));
            return;
        }
        console.log(chalk.bold('\n🧠 Repo Brain Lifecycle\n'));
        console.log(chalk.dim(`State:       ${lifecycle.state}`));
        console.log(chalk.dim(`Job:         ${lifecycle.jobId ?? 'none'} · ${lifecycle.source ?? 'not running'} · pid ${lifecycle.pid ?? 'none'}`));
        console.log(chalk.dim(`Progress:    ${lifecycle.progress.filesIndexed}/${lifecycle.progress.totalFiles ?? '?'} files${lifecycle.progress.percent === null ? '' : ` (${lifecycle.progress.percent}%)`} · ${lifecycle.progress.bytesScanned} bytes · ${lifecycle.progress.nodes}/${lifecycle.progress.edges} nodes/edges`));
        console.log(chalk.dim(`Elapsed/RSS: ${lifecycle.elapsedMs ?? 'n/a'} ms · ${lifecycle.peakRssMb ?? 'unavailable'} MB (${lifecycle.peakRssMeasurement})`));
        console.log(chalk.dim(`Freshness:   ${lifecycle.freshness?.state ?? 'not evaluated'}`));
        console.log(chalk.dim(`Unsupported: ${lifecycle.unsupportedFacts.join(', ') || 'none disclosed'}`));
        console.log(chalk.dim(`Retry:       ${lifecycle.recoveryCommands.retry}`));
        console.log(chalk.dim(`Cancel:      ${lifecycle.recoveryCommands.cancel}`));
        console.log(chalk.dim(`Selective:   ${lifecycle.recoveryCommands.selectiveRebuild}`));
        console.log(chalk.dim(`Recover:     ${lifecycle.recoveryCommands.recover}`));
    });
    brain
        .command('cancel')
        .description('Cancel a scheduled or building Repo Brain index without deleting the last usable graph')
        .option('--json', 'Output stable source-free JSON')
        .action(async (options) => {
        const scope = getBrainScope();
        const lifecycle = await (0, brain_lifecycle_1.cancelBrainIndex)(scope.cwd);
        if (options.json)
            console.log(JSON.stringify({ ok: true, lifecycle }, null, 2));
        else
            console.log(chalk.yellow(`Repo Brain indexing cancelled. Retry with \`${lifecycle.recoveryCommands.retry}\`.`));
    });
    brain
        .command('retry')
        .description('Retry Repo Brain indexing with bounded default budgets')
        .option('--json', 'Output stable source-free JSON')
        .action(async (options) => {
        const scope = getBrainScope();
        const lifecycle = await (0, brain_lifecycle_1.scheduleBrainIndex)(scope.cwd, { force: true });
        if (options.json)
            console.log(JSON.stringify({ ok: true, lifecycle }, null, 2));
        else
            console.log(chalk.green(`Repo Brain indexing scheduled (pid ${lifecycle.pid ?? 'pending'}).`));
    });
    brain
        .command('repo-explain <query...>')
        .description('Explain a source-free path, symbol, package, service, or surface in Repository Graph V2')
        .option('--limit <n>', 'Maximum matching nodes (default: 25)', (value) => parseInt(value, 10))
        .option('--json', 'Output stable machine-readable JSON')
        .action((queryParts, options) => {
        const scope = getBrainScope();
        const graph = (0, brain_1.readRepositoryGraph)(scope.cwd);
        if (!graph) {
            repositoryGraphError(new Error('Repository Graph V2 is missing or corrupt. Run `neurcode brain repo-index`.'), options.json);
            return;
        }
        const query = queryParts.join(' ').trim();
        const matches = (0, brain_1.explainRepositoryGraph)(graph, query, options.limit);
        const matchIds = new Set(matches.map((node) => node.id));
        const edges = graph.edges.filter((edge) => matchIds.has(edge.fromId) || matchIds.has(edge.toId));
        const payload = { ok: true, query, matches, edges, freshness: graph.freshness, coverageAuthority: graph.coverageAuthority ?? null };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        console.log(chalk.bold(`\n🧠 Repository Graph V2: ${query}\n`));
        if (matches.length === 0) {
            console.log(chalk.dim('No source-free graph facts matched.'));
            return;
        }
        matches.forEach((node, index) => {
            console.log(chalk.white(`  ${index + 1}. [${node.kind}] ${node.name ?? node.key}`));
            if (node.path)
                console.log(chalk.dim(`     path: ${node.path}`));
            console.log(chalk.dim(`     parser: ${node.provenance.parserDepth}`));
        });
        console.log(chalk.dim(`Related edges: ${edges.length}`));
    });
    brain
        .command('repo-query')
        .description('Query deterministic Repository Graph V2 references, dependencies, imports, calls, tests, or boundaries')
        .option('--path <path>', 'Seed path or path fragment')
        .option('--symbol <name>', 'Seed symbol name or fragment')
        .option('--relationship <type>', 'Edge type such as references, depends_on, imports, calls, tests, or crosses_boundary')
        .option('--direction <direction>', 'in | out | both', 'both')
        .option('--limit <n>', 'Maximum nodes and edges (default: 100)', (value) => parseInt(value, 10))
        .option('--json', 'Output stable machine-readable JSON')
        .action((options) => {
        const scope = getBrainScope();
        const graph = (0, brain_1.readRepositoryGraph)(scope.cwd);
        if (!graph) {
            repositoryGraphError(new Error('Repository Graph V2 is missing or corrupt. Run `neurcode brain repo-index`.'), options.json);
            return;
        }
        const allowedRelationships = new Set([
            'defines', 'references', 'imports', 'exports', 'calls', 'owns',
            'belongs_to_package', 'belongs_to_service', 'tests', 'depends_on',
            'structurally_resembles', 'crosses_boundary',
        ]);
        const relationship = options.relationship;
        if (relationship && !allowedRelationships.has(relationship)) {
            repositoryGraphError(new Error(`Unsupported relationship: ${relationship}`), options.json);
            return;
        }
        const direction = options.direction === 'in' || options.direction === 'out' ? options.direction : 'both';
        const result = (0, brain_1.queryRepositoryGraph)(graph, {
            path: options.path,
            symbol: options.symbol,
            relationship,
            direction,
            limit: options.limit,
        });
        const payload = {
            ok: true,
            query: options,
            coverageAuthority: graph.coverageAuthority ?? null,
            ...result,
            freshness: graph.freshness,
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        console.log(chalk.bold('\n🧠 Repository Graph V2 Query\n'));
        console.log(chalk.dim(`Total matches: ${result.totalMatches} | Returned: ${result.returnedMatches} | Limit: ${result.limit} | Truncated: ${result.truncated}`));
        console.log(chalk.dim(`Seeds: ${result.seeds.length} | Nodes: ${result.nodes.length} | Edges: ${result.edges.length}`));
        result.edges.forEach((edge) => {
            const posture = edge.enforcementEligible === false
                ? 'advisory/non-enforcement'
                : 'enforcement-eligible';
            console.log(chalk.dim(`  ${edge.type}: ${edge.fromId} -> ${edge.toId} [${posture}]`));
        });
    });
    brain
        .command('repo-rebuild')
        .description('Rebuild Repository Graph V2 from local repository state')
        .option('--json', 'Output stable machine-readable JSON')
        .action(async (options) => {
        const scope = getBrainScope();
        try {
            const result = await (0, brain_1.indexRepositoryGraph)({ repoRoot: scope.cwd, forceRebuild: true });
            printRepositoryGraphIndexResult(scope.cwd, result, options.json);
        }
        catch (error) {
            repositoryGraphError(error, options.json);
        }
    });
    brain
        .command('repo-recover')
        .description('Recover Repository Graph V2 from its last atomic backup or rebuild when unavailable')
        .option('--json', 'Output stable machine-readable JSON')
        .action(async (options) => {
        const scope = getBrainScope();
        try {
            const result = await (0, brain_1.recoverRepositoryGraph)(scope.cwd);
            printRepositoryGraphIndexResult(scope.cwd, result, options.json);
        }
        catch (error) {
            repositoryGraphError(error, options.json);
        }
    });
    brain
        .command('advisory <path>')
        .description('Run local-only advisory semantic intelligence for a proposed or current file')
        .option('--content-file <path>', 'Local proposed content file; raw content is parsed locally and not retained')
        .option('--path-only', 'Run without proposed content and expose coverage limitations')
        .option('--include-suppressed', 'Include findings suppressed by local feedback')
        .option('--no-index', 'Do not create or refresh Repository Graph V2')
        .option('--json', 'Output stable source-free JSON')
        .action(async (path, options) => {
        const scope = getBrainScope();
        try {
            let graph = (0, brain_1.readRepositoryGraph)(scope.cwd);
            const status = await (0, brain_1.repositoryGraphStatus)(scope.cwd);
            if (options.index !== false && (!graph || status.state !== 'fresh')) {
                graph = (await (0, brain_1.indexRepositoryGraph)({ repoRoot: scope.cwd })).graph;
            }
            else if (graph) {
                graph = { ...graph, freshness: status };
            }
            if (!graph)
                throw new Error('Repository Graph V2 is missing. Run `neurcode brain repo-index`.');
            const target = normalizeAdvisoryTarget(scope.cwd, path);
            let proposedSource = null;
            let sourceKind = 'not_available';
            if (!options.pathOnly) {
                const contentPath = options.contentFile
                    ? ((0, path_1.isAbsolute)(options.contentFile) ? options.contentFile : (0, path_1.resolve)(scope.cwd, options.contentFile))
                    : target.absolutePath;
                if ((0, fs_1.existsSync)(contentPath)) {
                    proposedSource = (0, fs_1.readFileSync)(contentPath, 'utf8');
                    sourceKind = options.contentFile ? 'write_content' : 'post_write_disk_read';
                }
            }
            const analysis = (0, proposed_change_analysis_1.analyzeProposedChange)({
                repoRoot: scope.cwd,
                filePath: target.relativePath,
                proposedSource,
                sourceKind,
                adapterId: 'neurcode-cli',
                timing: sourceKind === 'post_write_disk_read' ? 'after_write' : 'before_write',
                sessionId: null,
                planRevision: null,
            });
            analysis.envelope.target.operation = (0, fs_1.existsSync)(target.absolutePath) ? 'update' : 'create';
            const result = await (0, brain_1.runSemanticAdvisory)({
                repoRoot: scope.cwd,
                graph,
                change: analysis.envelope,
            });
            const findings = options.includeSuppressed
                ? result.findings
                : result.findings.filter((finding) => !finding.suppressed);
            const payload = {
                ok: true,
                truth: 'advisory',
                blocking: false,
                cacheHit: result.cacheHit,
                cacheKey: result.cacheKey,
                graph: {
                    graphId: graph.graphId,
                    generation: graph.generation,
                    freshness: graph.freshness,
                },
                host: analysis.envelope.host,
                findings,
                suppressedCount: result.findings.filter((finding) => finding.suppressed).length,
                privacy: analysis.envelope.privacy,
            };
            if (options.json) {
                console.log(JSON.stringify(payload, null, 2));
                return;
            }
            console.log(chalk.bold('\n🧠 Advisory Semantic Intelligence V2\n'));
            console.log(chalk.dim('Truth: advisory · Blocking: never'));
            console.log(chalk.dim(`Graph: ${graph.graphId} generation ${graph.generation} (${graph.freshness.state})`));
            console.log(chalk.dim(`Cache: ${result.cacheHit ? 'hit' : 'miss'}`));
            if (findings.length === 0) {
                console.log(chalk.dim('No unsuppressed advisory findings.'));
                return;
            }
            findings.forEach((finding, index) => {
                console.log(chalk.white(`  ${index + 1}. ${finding.category} · ${(finding.confidence * 100).toFixed(0)}%`));
                console.log(chalk.dim(`     ${finding.rationaleCategories.join(', ')}`));
                console.log(chalk.dim(`     ${finding.related.map((item) => item.path || item.symbol || item.hash).filter(Boolean).join(', ')}`));
                console.log(chalk.dim(`     limitations: ${finding.limitations.join(' ')}`));
                console.log(chalk.dim(`     id: ${finding.findingId}`));
            });
        }
        catch (error) {
            repositoryGraphError(error, options.json);
        }
    });
    brain
        .command('advisory-suppress <key>')
        .description('Suppress a finding ID, category:<name>, path:<path>, or fingerprint:<hash> locally')
        .option('--remove', 'Remove the suppression instead')
        .option('--json', 'Output stable source-free JSON')
        .action((key, options) => {
        const scope = getBrainScope();
        try {
            const registry = new brain_1.SemanticAdvisoryRegistry(scope.cwd);
            const status = options.remove ? registry.unsuppress(key) : registry.suppress(key);
            if (options.json)
                console.log(JSON.stringify({ ok: true, status }, null, 2));
            else
                console.log(chalk.green(`\n✅ Advisory suppression ${options.remove ? 'removed' : 'saved'}: ${key}\n`));
        }
        catch (error) {
            repositoryGraphError(error, options.json);
        }
    });
    brain
        .command('advisory-feedback <finding-id>')
        .description('Record source-free advisory feedback: accepted, dismissed, duplicate, or useful')
        .requiredOption('--category <category>', 'Advisory category')
        .requiredOption('--outcome <outcome>', 'accepted | dismissed | duplicate | useful')
        .option('--json', 'Output stable source-free JSON')
        .action((findingId, options) => {
        const scope = getBrainScope();
        try {
            const outcomes = ['accepted', 'dismissed', 'duplicate', 'useful'];
            if (!outcomes.includes(options.outcome)) {
                throw new Error(`Unsupported advisory feedback outcome: ${options.outcome}`);
            }
            const registry = new brain_1.SemanticAdvisoryRegistry(scope.cwd);
            const status = registry.recordFeedback({
                findingId,
                category: advisoryCategory(options.category),
                outcome: options.outcome,
            });
            if (options.json)
                console.log(JSON.stringify({ ok: true, status }, null, 2));
            else
                console.log(chalk.green(`\n✅ Advisory feedback recorded: ${options.outcome}\n`));
        }
        catch (error) {
            repositoryGraphError(error, options.json);
        }
    });
    brain
        .command('advisory-status')
        .description('Show local advisory cache, suppressions, feedback, and privacy mode')
        .option('--json', 'Output stable source-free JSON')
        .action((options) => {
        const scope = getBrainScope();
        const status = new brain_1.SemanticAdvisoryRegistry(scope.cwd).status();
        if (options.json) {
            console.log(JSON.stringify({ ok: true, status }, null, 2));
            return;
        }
        console.log(chalk.bold('\n🧠 Advisory Semantic Intelligence Status\n'));
        console.log(chalk.dim(`Registry:      ${status.path}`));
        console.log(chalk.dim(`Cache entries: ${status.cacheEntries}`));
        console.log(chalk.dim(`Suppressions:  ${status.suppressions.length}`));
        console.log(chalk.dim(`Feedback IDs:  ${Object.keys(status.feedback).length}`));
        console.log(chalk.dim('Privacy:       local-only; no source, diff, prompt, or chat upload.'));
    });
    // -- brain inspect ----------------------------------------------------------
    brain
        .command('inspect [query...]')
        .description('Inspect the source-free local repository brain or search it by area/symbol')
        .option('--limit <n>', 'Maximum results to show (default: 12)', (v) => parseInt(v, 10))
        .option('--rebuild', 'Rebuild the local repo brain before inspecting')
        .option('--experimental-fingerprint-reuse', 'Include experimental signature-fingerprint reuse detection')
        .option('--json', 'Output as JSON')
        .action(async (queryParts, options) => {
        const scope = getBrainScope();
        const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(50, options.limit)) : 12;
        let artifact = options.rebuild ? null : (0, local_repo_brain_1.readLocalRepoBrain)(scope.cwd);
        let rebuilt = false;
        let canonicalGraph = (0, brain_1.readRepositoryGraph)(scope.cwd);
        if (!canonicalGraph || options.rebuild) {
            canonicalGraph = (await (0, brain_1.indexRepositoryGraph)({ repoRoot: scope.cwd, forceRebuild: options.rebuild === true })).graph;
        }
        const canonicalFreshness = await (0, brain_1.repositoryGraphStatus)(scope.cwd);
        if (!artifact) {
            artifact = (0, local_repo_brain_1.buildLocalRepoBrain)(scope.cwd, { experimentalFingerprintReuse: options.experimentalFingerprintReuse });
            (0, local_repo_brain_1.writeLocalRepoBrain)(scope.cwd, artifact);
            rebuilt = true;
        }
        const query = Array.isArray(queryParts) ? queryParts.join(' ').trim() : '';
        const results = query ? (0, local_repo_brain_1.searchLocalRepoBrain)(artifact, query, limit) : [];
        const payload = {
            repoRoot: scope.cwd,
            repositoryIntelligenceModel: {
                canonicalLifecycle: 'repository_graph_v2',
                surface: 'legacy_brain_compatibility_projection',
                compatibilityOnly: true,
            },
            canonicalGraph: {
                graphId: canonicalGraph.graphId,
                schemaVersion: canonicalGraph.schemaVersion,
                freshness: canonicalFreshness,
                coverage: canonicalGraph.coverage,
            },
            jsonPath: (0, local_repo_brain_1.localRepoBrainPath)(scope.cwd),
            markdownPath: (0, local_repo_brain_1.localRepoBrainMarkdownPath)(scope.cwd),
            rebuilt,
            query: query || null,
            artifactHash: artifact.artifactHash,
            privacy: artifact.privacy,
            summary: artifact.summary,
            results,
            topModules: artifact.modules.slice(0, limit),
            topHotspots: artifact.hotspots.slice(0, limit),
            reuseFindings: artifact.reuseFindings.slice(0, limit),
            limitations: artifact.limitations,
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        await (0, messages_1.printSuccessBanner)(query ? 'Local Repo Brain Search' : 'Local Repo Brain Inspect');
        console.log(chalk.dim(`Repo Root:     ${scope.cwd}`));
        console.log(chalk.dim(`Artifact:      ${(0, local_repo_brain_1.localRepoBrainPath)(scope.cwd)}`));
        console.log(chalk.dim(`Artifact Hash: ${artifact.artifactHash}`));
        console.log(chalk.yellow('Compatibility projection: use `brain repo-status` for canonical freshness and completeness.'));
        if (rebuilt) {
            (0, messages_1.printInfo)('Brain index created', 'No existing local repo brain was found, so Neurcode built one first.');
        }
        (0, messages_1.printSection)('Summary', '📊');
        console.log(chalk.dim(`Files: ${artifact.summary.filesIndexed} | Declarations: ${artifact.summary.symbolsIndexed} | Imports: ${artifact.summary.importEdges} | Sensitive files: ${artifact.summary.sensitiveFiles}`));
        if (query) {
            (0, messages_1.printSection)(`Results for "${query}"`, '🔎');
            if (results.length === 0) {
                (0, messages_1.printWarning)('No source-free matches', 'Try a module, file area, sensitive surface, or symbol name.');
            }
            else {
                results.forEach((result, index) => {
                    console.log(chalk.white(`  ${index + 1}. [${result.kind}] ${result.title}`));
                    if (result.file)
                        console.log(chalk.dim(`     file: ${result.file}`));
                    console.log(chalk.dim(`     ${result.detail}`));
                });
            }
            return;
        }
        (0, messages_1.printSection)('Top Hotspots', '🔥');
        if (artifact.hotspots.length === 0) {
            console.log(chalk.dim('No hotspots found yet.'));
        }
        else {
            artifact.hotspots.slice(0, limit).forEach((hotspot, index) => {
                console.log(chalk.white(`  ${index + 1}. ${hotspot.file}`));
                console.log(chalk.dim(`     score ${hotspot.score}; fan-in ${hotspot.importFanIn}; fan-out ${hotspot.importFanOut}; ${hotspot.reasons.join(', ')}`));
            });
        }
        (0, messages_1.printSection)('Reuse Advisories', '♻️');
        if (artifact.reuseFindings.length === 0) {
            console.log(chalk.dim('No reuse advisories found.'));
        }
        else {
            artifact.reuseFindings.slice(0, limit).forEach((finding, index) => {
                console.log(chalk.white(`  ${index + 1}. ${finding.kind}: ${finding.symbolName || 'fingerprint'}`));
                console.log(chalk.dim(`     ${finding.files.slice(0, 5).join(', ')} (${finding.confidence})`));
            });
        }
    });
    // -- brain impact -----------------------------------------------------------
    brain
        .command('impact [paths...]')
        .description('Show the source-free change-impact map for a file or changed set (owners, consumers, sensitive surfaces, reviewer questions)')
        .option('--path <file>', 'A single changed file path')
        .option('--changed <list>', 'Comma-, space-, or newline-separated list of changed file paths')
        .option('--staged', 'Use staged git changes (git diff --name-only --cached)')
        .option('--unstaged', 'Use unstaged tracked changes (git diff --name-only)')
        .option('--since <ref>', 'Use files changed since a git ref (git diff --name-only <ref>...HEAD)')
        .option('--include-untracked', 'Also include untracked git files')
        .option('--rebuild', 'Rebuild the local repo brain before computing impact')
        .option('--no-index', 'Do not build the brain if it is missing (degraded output)')
        .option('--summary', 'Print only the compact source-free impact summary')
        .option('--json', 'Output as JSON (full report + compact summary)')
        .action(async (positional, options) => {
        const scope = getBrainScope();
        const gitPaths = [
            ...(options.staged ? gitChangedPaths(scope.cwd, ['diff', '--name-only', '--cached']) : []),
            ...(options.unstaged ? gitChangedPaths(scope.cwd, ['diff', '--name-only']) : []),
            ...(options.since ? gitChangedPaths(scope.cwd, ['diff', '--name-only', `${String(options.since).trim()}...HEAD`]) : []),
            ...(options.includeUntracked ? gitChangedPaths(scope.cwd, ['ls-files', '--others', '--exclude-standard']) : []),
        ];
        const paths = Array.from(new Set([
            ...(Array.isArray(positional) ? positional : []),
            ...(options.path ? [options.path] : []),
            ...splitChangedPathList(options.changed),
            ...gitPaths,
        ]
            .map((p) => String(p || '').trim())
            .filter(Boolean)));
        if (paths.length === 0) {
            (0, messages_1.printError)('No changed paths provided', 'Usage: neurcode brain impact --path <file>  |  --changed a,b,c  |  --staged  |  --unstaged  |  --since main');
            process.exit(1);
        }
        if (options.rebuild) {
            await (0, brain_1.indexRepositoryGraph)({ repoRoot: scope.cwd, forceRebuild: true });
            const rebuilt = (0, local_repo_brain_1.buildLocalRepoBrain)(scope.cwd);
            (0, local_repo_brain_1.writeLocalRepoBrain)(scope.cwd, rebuilt);
        }
        else if (options.index !== false && !(0, brain_1.readRepositoryGraph)(scope.cwd)) {
            await (0, brain_1.indexRepositoryGraph)({ repoRoot: scope.cwd });
        }
        const report = (0, repo_brain_impact_1.buildRepoBrainImpactForRepo)(scope.cwd, paths, { autoBuild: options.index !== false });
        const graphProjection = (0, repo_graph_impact_1.computeGraphImpactProjection)({ repoRoot: scope.cwd, changedPaths: paths });
        const summary = (0, repo_brain_impact_1.summarizeImpact)(report, graphProjection);
        const canonicalGraph = (0, brain_1.readRepositoryGraph)(scope.cwd);
        const canonicalFreshness = canonicalGraph ? await (0, brain_1.repositoryGraphStatus)(scope.cwd) : null;
        if (options.json) {
            console.log(JSON.stringify({
                repoRoot: scope.cwd,
                repositoryIntelligenceModel: {
                    canonicalLifecycle: 'repository_graph_v2',
                    surface: 'legacy_impact_compatibility_projection',
                    compatibilityOnly: true,
                },
                canonicalGraph: canonicalGraph ? {
                    graphId: canonicalGraph.graphId,
                    schemaVersion: canonicalGraph.schemaVersion,
                    freshness: canonicalFreshness,
                    coverage: canonicalGraph.coverage,
                    coverageAuthority: canonicalGraph.coverageAuthority ?? null,
                } : null,
                graphProjection,
                report,
                summary,
            }, null, 2));
            return;
        }
        if (options.summary) {
            await (0, messages_1.printSuccessBanner)('Repo Brain — Impact Summary');
            console.log(chalk.dim(`Repo Root: ${scope.cwd}`));
            console.log(chalk.dim(`Brain: ${report.brain.status} | files indexed: ${report.brain.filesIndexed ?? 'n/a'}`));
            console.log(chalk.white(`Changed: ${summary.counts.changedFiles} | Consumers: ${summary.counts.directConsumers} | Sensitive: ${summary.counts.sensitiveSurfaces} | Owners: ${summary.owners.join(', ') || 'none'}`));
            console.log(chalk.white(`Impact radius: ${summary.impactRadius.riskLevel} | ${summary.impactRadius.reasons.slice(0, 2).join('; ')}`));
            console.log(chalk.white(`Route to: ${summary.reviewRouting.owners.join(', ') || 'no CODEOWNERS match'}`));
            console.log(chalk.white(`Review first: ${summary.reviewRouting.reviewFirst.join(', ') || 'no elevated-risk surface detected'}`));
            if (summary.impactRadius.advisory.likelyTests.length > 0) {
                console.log(chalk.white(`Likely tests: ${summary.impactRadius.advisory.likelyTests.slice(0, 5).join(', ')}`));
            }
            if (summary.reviewQuestions.length > 0) {
                console.log(chalk.bold('\nTop reviewer questions:'));
                summary.reviewQuestions.slice(0, 5).forEach((q, i) => console.log(chalk.dim(`  ${i + 1}. ${q}`)));
            }
            return;
        }
        if (report.brain.status === 'missing') {
            (0, messages_1.printWarning)('Brain not indexed', `Output is degraded. Run: ${report.brain.recoveryCommand}`);
        }
        else if (report.brain.status === 'built') {
            (0, messages_1.printInfo)('Brain index created', 'No existing local repo brain was found, so Neurcode built one first.');
        }
        console.log(chalk.dim(`Repo Root: ${scope.cwd}\n`));
        console.log(chalk.yellow('Impact is a compatibility projection; Repository Graph V2 owns canonical freshness/completeness.'));
        console.log((0, repo_brain_impact_1.renderRepoBrainImpactText)(report));
        (0, messages_1.printInfo)('Labels', 'Deterministic = compiled path/CODEOWNERS/import-graph facts. Advisory = heuristic reuse/proximity/reviewer guidance.');
    });
    brain
        .command('mode')
        .description('Show or set Brain storage mode')
        .option('--storage-mode <mode>', 'Set storage mode: full | no-code')
        .option('--enable-no-code-storage', 'Enable no-code-storage mode')
        .option('--disable-no-code-storage', 'Disable no-code-storage mode')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const scope = getBrainScope();
        let requestedMode = null;
        if (options.enableNoCodeStorage && options.disableNoCodeStorage) {
            (0, messages_1.printError)('Conflicting flags', 'Use only one of: --enable-no-code-storage or --disable-no-code-storage');
            process.exit(1);
        }
        if (options.enableNoCodeStorage)
            requestedMode = true;
        if (options.disableNoCodeStorage)
            requestedMode = false;
        if (typeof options.storageMode === 'string' && options.storageMode.trim()) {
            const normalized = options.storageMode.trim().toLowerCase();
            if (['no-code', 'no_code', 'no-code-storage', 'nocode', 'hashes'].includes(normalized)) {
                requestedMode = true;
            }
            else if (['full', 'default', 'standard'].includes(normalized)) {
                requestedMode = false;
            }
            else {
                (0, messages_1.printError)('Invalid --storage-mode value', 'Use: full or no-code');
                process.exit(1);
            }
        }
        if (requestedMode !== null) {
            (0, plan_cache_1.setNoCodeStorageMode)(scope.cwd, requestedMode);
        }
        const mode = (0, plan_cache_1.getBrainStorageMode)(scope.cwd);
        const payload = {
            repoRoot: scope.cwd,
            noCodeStorage: mode.noCodeStorage,
            source: mode.source,
            envOverride: process.env.NEURCODE_BRAIN_NO_CODE_STORAGE || null,
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        await (0, messages_1.printSuccessBanner)('Neurcode Brain Mode');
        console.log(chalk.dim(`Repo Root:        ${scope.cwd}`));
        console.log(chalk.dim(`No-code-storage:  ${mode.noCodeStorage ? 'ON' : 'OFF'} (${mode.source})`));
        if (process.env.NEURCODE_BRAIN_NO_CODE_STORAGE != null) {
            (0, messages_1.printInfo)('Environment override detected', 'NEURCODE_BRAIN_NO_CODE_STORAGE is currently overriding persisted mode.');
        }
        if (requestedMode !== null) {
            (0, messages_1.printSuccess)('Mode updated', `No-code-storage is now ${mode.noCodeStorage ? 'ON' : 'OFF'}`);
        }
        else {
            (0, messages_1.printInfo)('Usage', [
                'Set with: neurcode brain mode --enable-no-code-storage',
                'Or: neurcode brain mode --disable-no-code-storage',
                'Or: neurcode brain mode --storage-mode no-code|full',
            ].join('\n'));
        }
    });
    brain
        .command('doctor')
        .description('Diagnose Brain scope and explain plan cache hits/misses for an intent')
        .argument('[intent...]', 'Intent to diagnose (if omitted, only prints scope checks)')
        .option('--project-id <id>', 'Project ID override')
        .option('--ticket <id>', 'Ticket reference (e.g., PROJ-123)')
        .option('--issue <id>', 'GitHub issue number (affects cache key)')
        .option('--pr <id>', 'GitHub PR number (affects cache key)')
        .option('--json', 'Output as JSON')
        .action(async (intentParts, options) => {
        const intent = Array.isArray(intentParts) ? intentParts.join(' ').trim() : String(intentParts || '').trim();
        const scope = getBrainScope(options.projectId);
        const ticketRef = options.issue
            ? `github_issue:${options.issue}`
            : options.pr
                ? `github_pr:${options.pr}`
                : options.ticket
                    ? `ticket:${options.ticket}`
                    : undefined;
        const problems = [];
        if (!scope.orgId)
            problems.push('Missing orgId (run neurcode init)');
        if (!scope.projectId)
            problems.push('Missing projectId (run neurcode init)');
        const staticContext = (0, neurcode_context_1.loadStaticNeurcodeContext)(scope.cwd, scope.orgId && scope.projectId ? { orgId: scope.orgId, projectId: scope.projectId } : undefined);
        const gitFingerprint = (0, plan_cache_1.getGitRepoFingerprint)(scope.cwd);
        const fileTree = !gitFingerprint ? scanFiles(scope.cwd, scope.cwd, 400) : [];
        const fsFingerprint = !gitFingerprint ? (0, plan_cache_1.getFilesystemFingerprintFromTree)(fileTree, scope.cwd) : null;
        const repoFingerprint = gitFingerprint || fsFingerprint;
        const normalized = intent ? (0, plan_cache_1.normalizeIntent)(intent) : '';
        const backend = (0, plan_cache_1.getBrainStoreBackend)(scope.cwd);
        const promptHash = normalized
            ? (0, plan_cache_1.computePromptHash)({
                intent: normalized,
                ticketRef,
                contextHash: staticContext.hash,
            })
            : null;
        const policyVersionHash = (0, plan_cache_1.computePolicyVersionHash)(scope.cwd);
        const neurcodeVersion = (0, plan_cache_1.getNeurcodeVersion)();
        const canComputeKey = Boolean(intent && scope.orgId && scope.projectId && repoFingerprint);
        const keyInput = canComputeKey
            ? {
                schemaVersion: 2,
                orgId: scope.orgId,
                projectId: scope.projectId,
                promptHash: promptHash,
                policyVersionHash,
                neurcodeVersion,
                repo: repoFingerprint,
            }
            : null;
        const key = keyInput ? (0, plan_cache_1.computePlanCacheKey)(keyInput) : null;
        const cached = key ? (0, plan_cache_1.peekCachedPlan)(scope.cwd, key) : null;
        const similar = scope.orgId && scope.projectId && normalized
            ? (0, plan_cache_1.findSimilarCachedPlans)(scope.cwd, {
                orgId: scope.orgId,
                projectId: scope.projectId,
                repoIdentity: repoFingerprint?.repoIdentity,
            }, normalized, 3)
            : [];
        const payload = {
            repoRoot: scope.cwd,
            scope: { orgId: scope.orgId, orgName: scope.orgName, projectId: scope.projectId },
            problems,
            cacheKey: key,
            cacheHit: Boolean(cached),
            keyInput,
            backend,
            repoFingerprint,
            staticContext: { hash: staticContext.hash, sources: staticContext.sources },
            similar: similar.map((s) => ({
                createdAt: s.createdAt,
                intent: s.input.intent,
                planId: s.response.planId,
                summary: s.response.plan.summary,
            })),
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        await (0, messages_1.printSuccessBanner)('Neurcode Brain Doctor');
        (0, messages_1.printSection)('Scope', '🧭');
        console.log(chalk.dim(`Repo Root: ${scope.cwd}`));
        console.log(chalk.dim(`Org:      ${scope.orgName || scope.orgId || '(not set)'}`));
        console.log(chalk.dim(`Project:  ${scope.projectId || '(not set)'}`));
        if (problems.length > 0) {
            (0, messages_1.printWarning)('Scope issues detected', problems.join('\n   • '));
        }
        (0, messages_1.printSection)('Fingerprint', '🧬');
        console.log(chalk.dim(`Cache backend: ${backend}`));
        if (!repoFingerprint) {
            (0, messages_1.printWarning)('No repo fingerprint available', 'Not a git repo and filesystem scan failed.');
        }
        else if (repoFingerprint.kind === 'git') {
            console.log(chalk.dim(`Kind:       git`));
            console.log(chalk.dim(`Repo:       ${repoFingerprint.repoIdentity}`));
            console.log(chalk.dim(`HEAD:       ${repoFingerprint.headSha.substring(0, 12)}...`));
            console.log(chalk.dim(`Tree:       ${repoFingerprint.headTreeSha.substring(0, 12)}...`));
            console.log(chalk.dim(`WorkingHash: ${repoFingerprint.workingTreeHash.substring(0, 12)}...`));
        }
        else {
            console.log(chalk.dim(`Kind:        filesystem`));
            console.log(chalk.dim(`Repo:        ${repoFingerprint.repoIdentity}`));
            console.log(chalk.dim(`TreeHash:    ${repoFingerprint.fileTreeHash.substring(0, 12)}...`));
            console.log(chalk.dim(`Files seen:  ${fileTree.length}`));
        }
        (0, messages_1.printSection)('Context', '📎');
        if (staticContext.sources.length === 0) {
            console.log(chalk.dim('No context files found.'));
        }
        else {
            staticContext.sources.forEach((s) => {
                console.log(chalk.dim(`- ${s.label}: ${s.path}${s.truncated ? ' (truncated)' : ''}`));
            });
        }
        console.log(chalk.dim(`ContextHash: ${staticContext.hash.substring(0, 12)}...`));
        (0, messages_1.printSection)('Plan Cache', '⚡');
        if (!intent) {
            (0, messages_1.printInfo)('No intent provided', 'Run: neurcode brain doctor "<intent>"  to explain cache hit/miss');
            return;
        }
        if (!scope.orgId || !scope.projectId) {
            (0, messages_1.printError)('Cannot compute plan cache key', 'Missing orgId/projectId. Run: neurcode init');
            return;
        }
        if (!repoFingerprint) {
            (0, messages_1.printError)('Cannot compute plan cache key', 'No repo fingerprint available.');
            return;
        }
        console.log(chalk.dim(`Intent (normalized): ${normalized}`));
        if (ticketRef)
            console.log(chalk.dim(`TicketRef:          ${ticketRef}`));
        if (promptHash)
            console.log(chalk.dim(`PromptHash:         ${promptHash.substring(0, 12)}...`));
        console.log(chalk.dim(`PolicyHash:         ${policyVersionHash.substring(0, 12)}...`));
        console.log(chalk.dim(`NeurcodeVersion:    ${neurcodeVersion}`));
        console.log(chalk.dim(`CacheKey:           ${key?.substring(0, 16)}...`));
        if (cached) {
            (0, messages_1.printSuccess)('Cache hit', `Created: ${new Date(cached.createdAt).toLocaleString()} | Uses: ${cached.useCount || 1}`);
        }
        else {
            (0, messages_1.printWarning)('Cache miss', 'This intent/repo snapshot has no cached plan yet.');
        }
        if (similar.length > 0) {
            console.log('');
            console.log(chalk.bold.white('Similar cached plans (same org/project):'));
            similar.forEach((s, idx) => {
                const summary = (s.response.plan.summary || '').trim().slice(0, 140);
                console.log(chalk.dim(`  ${idx + 1}. intent="${s.input.intent}"`));
                if (summary)
                    console.log(chalk.dim(`     summary="${summary}${summary.length >= 140 ? '...' : ''}"`));
            });
        }
    });
    brain
        .command('export')
        .description('Export Brain context (static context + architecture + memory tail)')
        .option('--project-id <id>', 'Project ID override')
        .option('--format <format>', 'Output format: md | json | claude | cursor | copilot', 'md')
        .option('--out <path>', 'Write output to a file (defaults to stdout)')
        .option('--write', 'Write to the default file path for the chosen format (instead of stdout)')
        .option('--overwrite', 'Overwrite existing output file when using --out/--write')
        .action(async (options) => {
        const scope = getBrainScope(options.projectId);
        const staticContext = (0, neurcode_context_1.loadStaticNeurcodeContext)(scope.cwd, scope.orgId && scope.projectId ? { orgId: scope.orgId, projectId: scope.projectId } : undefined);
        let architectureJson = null;
        const architecturePath = (0, path_1.join)(scope.cwd, '.neurcode', 'architecture.json');
        if ((0, fs_1.existsSync)(architecturePath)) {
            try {
                architectureJson = JSON.parse((0, fs_1.readFileSync)(architecturePath, 'utf-8'));
            }
            catch {
                architectureJson = null;
            }
        }
        const memoryTail = scope.orgId && scope.projectId ? (0, neurcode_context_1.loadOrgProjectMemoryTail)(scope.cwd, scope.orgId, scope.projectId) : '';
        const allCached = (0, plan_cache_1.listCachedPlans)(scope.cwd);
        const scopedEntries = scope.orgId && scope.projectId
            ? allCached.filter((e) => e.input.orgId === scope.orgId && e.input.projectId === scope.projectId).length
            : undefined;
        const generatedAt = new Date().toISOString();
        const format = String(options.format || 'md').toLowerCase();
        const payload = {
            generatedAt,
            repoRoot: scope.cwd,
            scope: {
                orgId: scope.orgId,
                orgName: scope.orgName,
                projectId: scope.projectId,
            },
            planCache: {
                totalEntries: allCached.length,
                scopedEntries,
            },
            staticContext,
            architecture: architectureJson,
            memoryTail,
        };
        let output = '';
        if (format === 'json') {
            output = JSON.stringify(payload, null, 2) + '\n';
        }
        else if (format === 'claude' || format === 'cursor' || format === 'copilot') {
            // Tool-friendly markdown. Users can redirect it to CLAUDE.md / .cursorrules / .github/copilot-instructions.md
            output =
                renderBrainExportMarkdown({
                    generatedAt,
                    cwd: scope.cwd,
                    scope: payload.scope,
                    staticContext,
                    architectureJson,
                    memoryTail,
                    cacheStats: { totalEntries: allCached.length, scopedEntries },
                }) +
                    '\n' +
                    [
                        '## Tool Notes',
                        format === 'claude'
                            ? '- Save as: CLAUDE.md'
                            : format === 'cursor'
                                ? '- Save as: .cursorrules'
                                : '- Save as: .github/copilot-instructions.md',
                        '- Keep this file short. The best results come from clear invariants, boundaries, and conventions.',
                        '',
                    ].join('\n');
        }
        else {
            output =
                renderBrainExportMarkdown({
                    generatedAt,
                    cwd: scope.cwd,
                    scope: payload.scope,
                    staticContext,
                    architectureJson,
                    memoryTail,
                    cacheStats: { totalEntries: allCached.length, scopedEntries },
                }) + '\n';
        }
        const defaultOutPath = format === 'claude'
            ? 'CLAUDE.md'
            : format === 'cursor'
                ? '.cursorrules'
                : format === 'copilot'
                    ? (0, path_1.join)('.github', 'copilot-instructions.md')
                    : format === 'json'
                        ? 'neurcode-brain.json'
                        : 'neurcode-brain.md';
        const outArg = options.out;
        const writeFlag = Boolean(options.write);
        const overwrite = Boolean(options.overwrite);
        const outPathRaw = outArg || (writeFlag ? defaultOutPath : null);
        if (outPathRaw) {
            const outPath = (0, path_1.isAbsolute)(outPathRaw) ? outPathRaw : (0, path_1.join)(scope.cwd, outPathRaw);
            const dir = (0, path_1.dirname)(outPath);
            if (!(0, fs_1.existsSync)(dir))
                (0, fs_1.mkdirSync)(dir, { recursive: true });
            if ((0, fs_1.existsSync)(outPath) && !overwrite) {
                (0, messages_1.printError)('Export file already exists', outPath, [
                    'Pass --overwrite to replace it',
                    'Or choose a different path with --out <path>',
                ]);
                process.exit(1);
            }
            (0, fs_1.writeFileSync)(outPath, output, 'utf-8');
            (0, messages_1.printSuccess)('Brain export written', outPath);
            return;
        }
        process.stdout.write(output);
    });
    brain
        .command('graph [query...]')
        .description('Query Team Memory Graph (architecture/files/events/authorship)')
        .option('--project-id <id>', 'Project ID override')
        .option('--module <pattern>', 'Focus on a module/path segment (e.g., auth, billing, packages/cli)')
        .option('--days <n>', 'Lookback window for git authorship signals (default: 90)', (val) => parseInt(val, 10))
        .option('--limit <n>', 'Maximum items to show per section (default: 8)', (val) => parseInt(val, 10))
        .option('--json', 'Output as JSON')
        .action((queryArg, options) => {
        const scope = getBrainScope(options.projectId);
        const query = Array.isArray(queryArg) ? queryArg.join(' ').trim() : (queryArg || '').trim();
        const normalizedQuery = (0, plan_cache_1.normalizeIntent)(query);
        const moduleFilter = (options.module || '').trim();
        const limit = Number.isFinite(options.limit) ? Math.min(20, Math.max(1, options.limit)) : 8;
        const sinceDays = Number.isFinite(options.days) ? Math.min(3650, Math.max(1, options.days)) : 90;
        const stopWords = new Set([
            'what', 'which', 'where', 'when', 'show', 'list', 'from', 'with', 'that', 'this',
            'who', 'owner', 'owners', 'touched', 'touches', 'authored', 'recent', 'recently',
            'last', 'quarter', 'month', 'months', 'week', 'weeks', 'days', 'during', 'before', 'after',
        ]);
        const scopeStore = loadTeamMemoryScopeStore(scope.cwd, scope) || {};
        const scopedFilesRaw = Object.values(scopeStore.files || {}).map((entry) => ({
            path: normalizeFsPath(entry.path || ''),
            summary: entry.summary || '',
            symbols: Array.isArray(entry.symbols) ? entry.symbols : [],
            updatedAt: entry.updatedAt,
            lastSeenAt: entry.lastSeenAt,
        }))
            .filter((entry) => Boolean(entry.path) && (0, team_memory_path_hygiene_1.isTeamMemoryProjectPath)(entry.path));
        const scopedFiles = scopedFilesRaw.length > 0
            ? scopedFilesRaw
            : scanFiles(scope.cwd, scope.cwd, 300).map((path) => ({
                path: normalizeFsPath(path),
                summary: '',
                symbols: [],
                updatedAt: '',
                lastSeenAt: '',
            }));
        const candidateTerms = (0, plan_cache_1.normalizeIntent)(`${moduleFilter} ${query}`)
            .split(/\s+/)
            .filter((term) => term.length >= 4)
            .filter((term) => !stopWords.has(term));
        const moduleMatcher = moduleFilter ? (0, plan_cache_1.normalizeIntent)(moduleFilter) : '';
        const filteredFiles = scopedFiles.filter((entry) => {
            const pathNorm = (0, plan_cache_1.normalizeIntent)(entry.path);
            if (moduleMatcher && !pathNorm.includes(moduleMatcher))
                return false;
            if (candidateTerms.length === 0)
                return true;
            if (candidateTerms.some((term) => pathNorm.includes(term)))
                return true;
            const summaryNorm = (0, plan_cache_1.normalizeIntent)(entry.summary || '');
            if (candidateTerms.some((term) => summaryNorm.includes(term)))
                return true;
            const symbolsNorm = (entry.symbols || []).map((s) => (0, plan_cache_1.normalizeIntent)(s)).join(' ');
            return candidateTerms.some((term) => symbolsNorm.includes(term));
        });
        const focusFiles = filteredFiles.length > 0 ? filteredFiles : scopedFiles;
        const moduleCounts = new Map();
        for (const file of focusFiles) {
            const module = inferModuleKey(file.path);
            moduleCounts.set(module, (moduleCounts.get(module) || 0) + 1);
        }
        const topModules = rankTopEntries(moduleCounts.entries(), ([, count]) => count, limit)
            .map(([module, fileCount]) => ({ module, fileCount }));
        const { authorTouches, fileTouches } = collectGitAuthorship(scope.cwd, sinceDays);
        const focusPathSet = new Set(focusFiles.map((file) => file.path));
        const focusAuthorTouches = new Map();
        for (const [path, byAuthor] of fileTouches.entries()) {
            if (!focusPathSet.has(path))
                continue;
            for (const [author, count] of byAuthor.entries()) {
                focusAuthorTouches.set(author, (focusAuthorTouches.get(author) || 0) + count);
            }
        }
        const effectiveAuthorTouches = focusAuthorTouches.size > 0 ? focusAuthorTouches : authorTouches;
        const topContributors = rankTopEntries(effectiveAuthorTouches.entries(), ([, count]) => count, limit)
            .map(([author, touches]) => ({ author, touches }));
        const events = Array.isArray(scopeStore.events)
            ? scopeStore.events.filter((event) => !event.filePath || (0, team_memory_path_hygiene_1.isTeamMemoryProjectPath)(event.filePath))
            : [];
        const recentDecisions = [...events]
            .sort((a, b) => sortIsoDesc(a.timestamp, b.timestamp))
            .slice(0, Math.max(limit, 12))
            .map((event) => ({
            timestamp: event.timestamp || null,
            type: event.type || null,
            planId: event.planId || null,
            verdict: event.verdict || null,
            note: event.note || null,
            filePath: event.filePath || null,
        }));
        const scoredFiles = focusFiles.map((file) => {
            const pathNorm = (0, plan_cache_1.normalizeIntent)(file.path);
            const summaryNorm = (0, plan_cache_1.normalizeIntent)(file.summary || '');
            const symbolNorm = (file.symbols || []).map((s) => (0, plan_cache_1.normalizeIntent)(s)).join(' ');
            let score = 0;
            if (candidateTerms.length > 0) {
                for (const term of candidateTerms) {
                    if (pathNorm.includes(term))
                        score += 1.6;
                    if (summaryNorm.includes(term))
                        score += 1.1;
                    if (symbolNorm.includes(term))
                        score += 0.9;
                }
            }
            else {
                score += 0.5;
            }
            const recentBoost = Math.max(0, (Date.parse(file.lastSeenAt || file.updatedAt || '') || 0) / 1e13);
            score += recentBoost;
            return { ...file, score };
        });
        scoredFiles.sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            return sortIsoDesc(a.lastSeenAt || a.updatedAt, b.lastSeenAt || b.updatedAt);
        });
        const topFiles = scoredFiles.slice(0, limit).map((file) => {
            const contributors = fileTouches.get(file.path);
            const topOwners = contributors
                ? rankTopEntries(contributors.entries(), ([, count]) => count, 3).map(([author, touches]) => ({ author, touches }))
                : [];
            return {
                path: file.path,
                module: inferModuleKey(file.path),
                summary: file.summary || null,
                symbols: (file.symbols || []).slice(0, 10),
                lastSeenAt: file.lastSeenAt || null,
                updatedAt: file.updatedAt || null,
                topOwners,
            };
        });
        const asksWho = /\b(who|owner|owners|authored|touched)\b/.test(normalizedQuery);
        const asksWhy = /\b(why|purpose|exists|exist)\b/.test(normalizedQuery);
        let answer = '';
        if (asksWho) {
            const targetLabel = moduleFilter
                ? `module filter "${moduleFilter}"`
                : candidateTerms.length > 0
                    ? `files matching "${candidateTerms.slice(0, 3).join(', ')}"`
                    : 'this scope';
            if (topContributors.length > 0) {
                answer = `Top contributors for ${targetLabel} over the last ${sinceDays} day(s): ${topContributors
                    .slice(0, 5)
                    .map((item) => `${item.author} (${item.touches})`)
                    .join(', ')}.`;
            }
            else {
                answer = `No git authorship evidence found for ${targetLabel} in the last ${sinceDays} day(s).`;
            }
        }
        else if (asksWhy) {
            const rationale = topFiles
                .filter((file) => file.summary && file.summary.trim().length > 0)
                .slice(0, 3)
                .map((file) => `${file.path}: ${file.summary}`)
                .join(' ');
            answer = rationale || 'No explicit rationale summaries were found yet. Run `neurcode plan`/`neurcode ask`/`neurcode watch` to enrich memory.';
        }
        else {
            answer = `Team Memory Graph indexed ${scopedFiles.length} file context entries and ${events.length} recent decision event(s).`;
        }
        const payload = {
            generatedAt: new Date().toISOString(),
            scope: {
                orgId: scope.orgId,
                orgName: scope.orgName,
                projectId: scope.projectId,
                cwd: scope.cwd,
            },
            query: query || null,
            moduleFilter: moduleFilter || null,
            sinceDays,
            indexedFiles: scopedFiles.length,
            indexedEvents: events.length,
            answer,
            topModules,
            topContributors,
            recentDecisions,
            topFiles,
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        console.log(chalk.bold('\n🧠 Team Memory Graph\n'));
        if (!scope.orgId || !scope.projectId) {
            console.log(chalk.yellow('⚠️  Running in repo-fallback mode (org/project scope not initialized).'));
        }
        console.log(chalk.dim(`Scope: ${scope.orgName || scope.orgId || 'repo'} / ${scope.projectId || 'repo-fallback'}`));
        console.log(chalk.dim(`Indexed files: ${scopedFiles.length} | Decision events: ${events.length}`));
        if (query) {
            console.log(chalk.white(`\nQuery: ${query}`));
        }
        console.log(chalk.white(`Answer: ${answer}\n`));
        if (topModules.length > 0) {
            console.log(chalk.bold.white('Top Modules'));
            topModules.forEach((module, idx) => {
                console.log(chalk.dim(`  ${idx + 1}. ${module.module} (${module.fileCount} file context entries)`));
            });
            console.log('');
        }
        if (topContributors.length > 0) {
            console.log(chalk.bold.white(`Top Contributors (last ${sinceDays} day(s))`));
            topContributors.forEach((author, idx) => {
                console.log(chalk.dim(`  ${idx + 1}. ${author.author} (${author.touches} touches)`));
            });
            console.log('');
        }
        if (topFiles.length > 0) {
            console.log(chalk.bold.white('High-Signal Files'));
            topFiles.forEach((file, idx) => {
                const summary = file.summary ? ` - ${file.summary}` : '';
                console.log(chalk.dim(`  ${idx + 1}. ${file.path}${summary}`));
            });
        }
    });
    brain
        .command('clear')
        .description('Clear local Brain data (plan cache + memory) for the selected scope')
        .option('--scope <scope>', 'Scope: project | org | repo', 'project')
        .option('--project-id <id>', 'Project ID override (affects project scope)')
        .option('--yes', 'Skip confirmation prompt')
        .option('--dry-run', 'Show what would be deleted without deleting')
        .action(async (options) => {
        const scopeMode = String(options.scope || 'project').toLowerCase();
        const brainScope = getBrainScope(options.projectId);
        if (scopeMode === 'project' && (!brainScope.orgId || !brainScope.projectId)) {
            (0, messages_1.printError)('Cannot clear project-scoped Brain data', 'Missing orgId/projectId. Run: neurcode init');
            process.exit(1);
        }
        if (scopeMode === 'org' && !brainScope.orgId) {
            (0, messages_1.printError)('Cannot clear org-scoped Brain data', 'Missing orgId. Run: neurcode init');
            process.exit(1);
        }
        if (!['project', 'org', 'repo'].includes(scopeMode)) {
            (0, messages_1.printError)('Invalid --scope', `Expected one of: project, org, repo. Got: ${scopeMode}`);
            process.exit(1);
        }
        const scopeLabel = scopeMode === 'repo'
            ? 'this repo'
            : scopeMode === 'org'
                ? `org ${brainScope.orgName || brainScope.orgId}`
                : `org ${brainScope.orgName || brainScope.orgId} / project ${brainScope.projectId}`;
        const brainDbPath = (0, plan_cache_1.getBrainDbPath)(brainScope.cwd);
        const fallbackCachePath = (0, plan_cache_1.getBrainFallbackCachePath)(brainScope.cwd);
        const brainPointerPath = (0, plan_cache_1.getBrainPointerPath)(brainScope.cwd);
        const askCachePath = (0, ask_cache_1.getAskCachePath)(brainScope.cwd);
        const contextIndexPath = (0, brain_context_1.getBrainContextPath)(brainScope.cwd);
        const cacheBackend = (0, plan_cache_1.getBrainStoreBackend)(brainScope.cwd);
        const activeCachePath = cacheBackend === 'sqlite' ? brainDbPath : fallbackCachePath;
        const orgsDir = (0, path_1.join)(brainScope.cwd, '.neurcode', 'orgs');
        const orgDir = brainScope.orgId ? (0, path_1.join)(orgsDir, brainScope.orgId) : null;
        const orgProjectDir = brainScope.orgId && brainScope.projectId ? (0, neurcode_context_1.getOrgProjectDir)(brainScope.cwd, brainScope.orgId, brainScope.projectId) : null;
        const plannedDeletes = [];
        // Plan cache deletions
        plannedDeletes.push({ kind: `brain-cache-entries (${cacheBackend})`, path: activeCachePath });
        plannedDeletes.push({ kind: `ask-cache-entries (${scopeMode})`, path: askCachePath });
        plannedDeletes.push({ kind: `context-index-entries (${scopeMode})`, path: contextIndexPath });
        if (scopeMode === 'repo') {
            if ((0, fs_1.existsSync)(brainDbPath)) {
                plannedDeletes.push({ kind: 'brain-db-file', path: brainDbPath });
            }
            if ((0, fs_1.existsSync)(fallbackCachePath)) {
                plannedDeletes.push({ kind: 'brain-fallback-file', path: fallbackCachePath });
            }
            if ((0, fs_1.existsSync)(contextIndexPath)) {
                plannedDeletes.push({ kind: 'context-index-file', path: contextIndexPath });
            }
            if ((0, fs_1.existsSync)(askCachePath)) {
                plannedDeletes.push({ kind: 'ask-cache-file', path: askCachePath });
            }
            plannedDeletes.push({ kind: 'brain-pointer', path: brainPointerPath });
        }
        // Memory/context directories
        if (scopeMode === 'repo') {
            plannedDeletes.push({ kind: 'org-memory', path: orgsDir });
        }
        else if (scopeMode === 'org' && orgDir) {
            plannedDeletes.push({ kind: 'org-memory', path: orgDir });
        }
        else if (scopeMode === 'project' && orgProjectDir) {
            plannedDeletes.push({ kind: 'project-memory', path: orgProjectDir });
        }
        if (!options.yes && process.stdout.isTTY && !process.env.CI) {
            await (0, messages_1.printSuccessBanner)('Neurcode Brain Clear');
            (0, messages_1.printWarning)('Destructive action', `This will delete Brain data for ${scopeLabel}.`);
            console.log(chalk.bold.white('\nThis will affect:'));
            plannedDeletes.forEach((d) => console.log(chalk.dim(`  - ${d.kind}: ${d.path}`)));
            const { createInterface } = await Promise.resolve().then(() => __importStar(require('readline/promises')));
            const { stdin, stdout } = await Promise.resolve().then(() => __importStar(require('process')));
            const rl = createInterface({ input: stdin, output: stdout });
            const ans = await rl.question(chalk.bold('\nContinue? (y/n): '));
            rl.close();
            if (!['y', 'yes'].includes(ans.trim().toLowerCase())) {
                (0, messages_1.printInfo)('Aborted', 'No changes were made.');
                return;
            }
        }
        if (options.dryRun) {
            await (0, messages_1.printSuccessBanner)('Dry Run');
            plannedDeletes.forEach((d) => console.log(chalk.dim(`Would delete ${d.kind}: ${d.path}`)));
            return;
        }
        // 1) Delete plan cache entries based on scope
        if (scopeMode === 'repo') {
            (0, plan_cache_1.deleteCachedPlans)(brainScope.cwd, () => true);
            (0, ask_cache_1.deleteCachedAsks)(brainScope.cwd, () => true);
        }
        else if (scopeMode === 'org' && brainScope.orgId) {
            (0, plan_cache_1.deleteCachedPlans)(brainScope.cwd, (e) => e.input.orgId === brainScope.orgId);
            (0, ask_cache_1.deleteCachedAsks)(brainScope.cwd, (e) => e.input.orgId === brainScope.orgId);
        }
        else if (scopeMode === 'project' && brainScope.orgId && brainScope.projectId) {
            (0, plan_cache_1.deleteCachedPlans)(brainScope.cwd, (e) => e.input.orgId === brainScope.orgId && e.input.projectId === brainScope.projectId);
            (0, ask_cache_1.deleteCachedAsks)(brainScope.cwd, (e) => e.input.orgId === brainScope.orgId && e.input.projectId === brainScope.projectId);
        }
        (0, brain_context_1.clearBrainContext)(brainScope.cwd, scopeMode, {
            orgId: brainScope.orgId,
            projectId: brainScope.projectId,
        });
        if (scopeMode === 'repo') {
            try {
                (0, plan_cache_1.closeBrainStore)(brainScope.cwd);
                if ((0, fs_1.existsSync)(brainDbPath)) {
                    (0, fs_1.rmSync)(brainDbPath, { force: true });
                }
                if ((0, fs_1.existsSync)(fallbackCachePath)) {
                    (0, fs_1.rmSync)(fallbackCachePath, { force: true });
                }
                if ((0, fs_1.existsSync)(contextIndexPath)) {
                    (0, fs_1.rmSync)(contextIndexPath, { force: true });
                }
                if ((0, fs_1.existsSync)(askCachePath)) {
                    (0, fs_1.rmSync)(askCachePath, { force: true });
                }
                if ((0, fs_1.existsSync)(brainPointerPath)) {
                    (0, fs_1.rmSync)(brainPointerPath, { force: true });
                }
            }
            catch {
                // ignore
            }
        }
        // 2) Delete memory directories (local-only)
        try {
            const pathToRemove = scopeMode === 'repo' ? orgsDir : scopeMode === 'org' ? orgDir : orgProjectDir;
            if (pathToRemove && (0, fs_1.existsSync)(pathToRemove)) {
                (0, fs_1.rmSync)(pathToRemove, { recursive: true, force: true });
            }
        }
        catch {
            // ignore
        }
        (0, messages_1.printSuccess)('Brain cleared', `Scope: ${scopeLabel}`);
        // Also clear semantic index
        (0, semantic_1.clearSemanticIndex)(brainScope.cwd);
    });
    // ── brain build ──────────────────────────────────────────────────────────────
    brain
        .command('build')
        .description('Build the semantic search index from the current brain context')
        .option('--project-id <id>', 'Project ID override')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const scope = getBrainScope(options.projectId);
        const stats = (0, semantic_1.getSemanticIndexStats)(scope.cwd, {
            orgId: scope.orgId,
            projectId: scope.projectId,
        });
        const count = (0, semantic_1.buildSemanticIndex)(scope.cwd, {
            orgId: scope.orgId,
            projectId: scope.projectId,
        });
        const newStats = (0, semantic_1.getSemanticIndexStats)(scope.cwd, {
            orgId: scope.orgId,
            projectId: scope.projectId,
        });
        const payload = {
            repoRoot: scope.cwd,
            documentsIndexed: count,
            previousDocuments: stats.documentCount,
            builtAt: newStats.builtAt,
            sizeBytes: newStats.sizeBytes,
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        await (0, messages_1.printSuccessBanner)('Neurcode Brain Build');
        (0, messages_1.printSection)('Semantic Index', '🔍');
        console.log(chalk.dim(`Repo Root:       ${scope.cwd}`));
        console.log(chalk.dim(`Documents built: ${count}`));
        if (newStats.builtAt) {
            console.log(chalk.dim(`Built at:        ${new Date(newStats.builtAt).toLocaleString()}`));
        }
        if (newStats.sizeBytes !== null) {
            console.log(chalk.dim(`Index size:      ${formatBytes(newStats.sizeBytes)}`));
        }
        if (count === 0) {
            (0, messages_1.printWarning)('No documents indexed', 'Run `neurcode brain status` to check if brain context has been populated.\n' +
                'The semantic index is built from existing brain-context entries.\n' +
                'Try running neurcode in watch mode or using `neurcode apply` first.');
        }
        else {
            (0, messages_1.printSuccess)('Semantic index built', `${count} documents indexed`);
        }
    });
    // ── brain semantic-search ────────────────────────────────────────────────────
    brain
        .command('semantic-search <query...>')
        .description('Search the codebase semantically using TF-IDF vector similarity')
        .option('--project-id <id>', 'Project ID override')
        .option('--limit <n>', 'Max results to return (default: 10)', (v) => parseInt(v, 10))
        .option('--min-score <n>', 'Minimum similarity score 0-1 (default: 0.01)', (v) => parseFloat(v))
        .option('--json', 'Output as JSON')
        .option('--explain', 'Show how the query was tokenized')
        .action(async (queryParts, options) => {
        const scope = getBrainScope(options.projectId);
        const query = queryParts.join(' ').trim();
        if (!query) {
            (0, messages_1.printError)('Missing query', 'Usage: neurcode brain semantic-search "<query>"');
            process.exit(1);
        }
        const limit = Number.isFinite(options.limit) ? Math.min(50, Math.max(1, options.limit)) : 10;
        const minScore = Number.isFinite(options.minScore) ? Math.max(0, options.minScore) : 0.01;
        const indexStats = (0, semantic_1.getSemanticIndexStats)(scope.cwd, {
            orgId: scope.orgId,
            projectId: scope.projectId,
        });
        if (!indexStats.exists || indexStats.documentCount === 0) {
            (0, messages_1.printWarning)('Semantic index not built', 'Run: neurcode brain build  — to build the semantic index first');
            if (options.json)
                console.log(JSON.stringify({ results: [], indexExists: false }));
            return;
        }
        const results = (0, semantic_1.semanticSearch)(scope.cwd, { orgId: scope.orgId, projectId: scope.projectId }, query, { limit, minScore });
        const tokenInfo = options.explain ? (0, semantic_1.explainQuery)(query) : null;
        if (options.json) {
            console.log(JSON.stringify({
                query,
                results,
                totalIndexed: indexStats.documentCount,
                tokenInfo,
            }, null, 2));
            return;
        }
        await (0, messages_1.printSuccessBanner)('Semantic Search');
        console.log(chalk.dim(`Query: ${query}`));
        console.log(chalk.dim(`Index: ${indexStats.documentCount} documents | score threshold: ${minScore}\n`));
        if (options.explain && tokenInfo) {
            console.log(chalk.bold.white('Query tokens:'));
            console.log(chalk.dim(`  [${tokenInfo.tokens.join(', ')}]  (${tokenInfo.termCount} terms)\n`));
        }
        if (results.length === 0) {
            (0, messages_1.printWarning)('No results', 'Try broadening the query or lowering --min-score');
            return;
        }
        console.log(chalk.bold.white(`Top ${results.length} results:\n`));
        results.forEach((r, idx) => {
            const bar = '█'.repeat(Math.round(r.score * 20)).padEnd(20, '░');
            const scoreStr = r.score.toFixed(4);
            console.log(chalk.white(`  ${String(idx + 1).padStart(2)}. [${bar}] ${scoreStr}  ${r.filePath}`));
            if (r.summary) {
                console.log(chalk.dim(`       ${r.summary.slice(0, 120)}`));
            }
            if (r.symbols.length > 0) {
                console.log(chalk.dim(`       symbols: ${r.symbols.slice(0, 6).join(', ')}`));
            }
        });
    });
    // ── brain cache-status ───────────────────────────────────────────────────────
    brain
        .command('cache-status')
        .description('Show persistent brain cache status (content hashes, staleness, CI fingerprint)')
        .option('--project-id <id>', 'Project ID override')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const scope = getBrainScope(options.projectId);
        const status = (0, brain_cache_1.getBrainCacheStatus)(scope.cwd);
        if (options.json) {
            console.log(JSON.stringify(status, null, 2));
            return;
        }
        await (0, messages_1.printSuccessBanner)('Brain Cache Status');
        if (!status.exists) {
            (0, messages_1.printWarning)('No cache found', 'Run `neurcode brain cache-build` to build the persistent brain cache.\n' +
                'This accelerates semantic indexing on subsequent runs and CI builds.');
            return;
        }
        const m = status.manifest;
        (0, messages_1.printSection)('Cache Manifest', '📦');
        console.log(chalk.dim(`Built:               ${m.builtAt}`));
        console.log(chalk.dim(`Total files:         ${m.totalFiles}`));
        console.log(chalk.dim(`Indexed files:       ${m.indexedFiles}`));
        console.log(chalk.dim(`Fresh files:         ${status.freshFiles}`));
        console.log(chalk.dim(`Stale files:         ${status.staleFiles.length}`));
        console.log(chalk.dim(`Missing files:       ${status.missingFiles.length}`));
        console.log(chalk.dim(`New (untracked):     ${status.newFiles.length}`));
        console.log(chalk.dim(`Stale:               ${status.stalePercent}%`));
        console.log(chalk.dim(`Cache size:          ${formatBytes(status.sizeBytes)}`));
        console.log(chalk.dim(`Content fingerprint: ${m.contentFingerprint}`));
        console.log(chalk.dim(`(Use fingerprint as CI cache key for layer-by-layer cache restoration)`));
        if (status.needsRebuild) {
            (0, messages_1.printWarning)('Cache rebuild recommended', `${status.staleFiles.length} stale + ${status.newFiles.length} new files detected.\n` +
                'Run `neurcode brain cache-build` to refresh.');
        }
        else {
            (0, messages_1.printSuccess)('Cache is fresh', `${status.freshFiles}/${status.totalFiles} files up-to-date`);
        }
    });
    // ── brain cache-build ────────────────────────────────────────────────────────
    brain
        .command('cache-build')
        .description('Build or refresh the persistent brain cache manifest. ' +
        'Content-hash indexes all source files for fast incremental re-indexing. ' +
        'Use --force to rebuild from scratch.')
        .option('--project-id <id>', 'Project ID override')
        .option('--force', 'Force full rebuild ignoring existing cache')
        .option('--max-files <n>', 'Maximum files to index (default: 5000)', (v) => parseInt(v, 10))
        .option('--export-artifact <path>', 'Export CI artifact after building (for CI cache upload)')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const scope = getBrainScope(options.projectId);
        if (!options.json) {
            console.log(chalk.cyan('\n⚙  Building brain cache...'));
            console.log(chalk.dim(`   Repo: ${scope.cwd}`));
            if (options.force)
                console.log(chalk.dim('   Mode: full rebuild (--force)'));
            console.log('');
        }
        let lastPrinted = -1;
        const result = (0, brain_cache_1.buildBrainCache)({
            projectRoot: scope.cwd,
            maxFiles: options.maxFiles ?? 5000,
            force: options.force === true,
            onProgress: (indexed, total) => {
                if (!options.json && Math.floor(indexed / 100) !== lastPrinted) {
                    lastPrinted = Math.floor(indexed / 100);
                    process.stdout.write(`\r   Scanning files: ${indexed}/${total}...`);
                }
            },
        });
        if (!options.json)
            process.stdout.write('\n');
        if (options.exportArtifact) {
            const exported = (0, brain_cache_1.exportBrainCacheArtifact)(scope.cwd, options.exportArtifact);
            if (!options.json) {
                if (exported) {
                    console.log(chalk.dim(`\n   CI artifact exported: ${options.exportArtifact}`));
                }
                else {
                    console.log(chalk.yellow(`\n   ⚠  Failed to export CI artifact: ${options.exportArtifact}`));
                }
            }
        }
        const payload = {
            repoRoot: scope.cwd,
            totalFiles: result.manifest.totalFiles,
            indexedFiles: result.manifest.indexedFiles,
            builtFiles: result.builtFiles,
            skippedFiles: result.skippedFiles,
            updatedFiles: result.updatedFiles,
            elapsedMs: result.elapsedMs,
            builtAt: result.manifest.builtAt,
            contentFingerprint: result.manifest.contentFingerprint,
            manifestPath: (0, path_1.join)(scope.cwd, '.neurcode', 'brain', 'cache', 'manifest.json'),
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        await (0, messages_1.printSuccessBanner)('Brain Cache Built');
        (0, messages_1.printSection)('Results', '📦');
        console.log(chalk.dim(`Total files:         ${payload.totalFiles}`));
        console.log(chalk.dim(`Built (new/changed): ${payload.builtFiles}`));
        console.log(chalk.dim(`Skipped (unchanged): ${payload.skippedFiles}`));
        console.log(chalk.dim(`Updated (rehashed):  ${payload.updatedFiles}`));
        console.log(chalk.dim(`Elapsed:             ${payload.elapsedMs}ms`));
        console.log(chalk.dim(`Content fingerprint: ${payload.contentFingerprint}`));
        console.log(chalk.dim(`Manifest:            ${payload.manifestPath}`));
        console.log('');
        (0, messages_1.printSuccess)('Cache built', `${payload.totalFiles} files tracked`);
        console.log(chalk.dim('\nTip: Add .neurcode/brain/cache/ to your CI cache configuration.'));
        console.log(chalk.dim('     Use the content fingerprint as the cache key for layer invalidation.'));
        console.log('');
    });
    // ── brain cache-restore ──────────────────────────────────────────────────────
    brain
        .command('cache-restore')
        .description('Restore brain cache from a CI artifact file. ' +
        'Use this in CI after downloading the cached .neurcode/brain/cache/ artifact.')
        .requiredOption('--artifact <path>', 'Path to the CI cache artifact (manifest JSON exported by --export-artifact)')
        .option('--project-id <id>', 'Project ID override')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const scope = getBrainScope(options.projectId);
        const result = (0, brain_cache_1.restoreBrainCache)({
            projectRoot: scope.cwd,
            artifactPath: options.artifact,
        });
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
            return;
        }
        if (!result.success) {
            (0, messages_1.printError)('Cache restore failed', result.message);
            process.exit(1);
        }
        const m = result.manifest;
        await (0, messages_1.printSuccessBanner)('Brain Cache Restored');
        console.log(chalk.dim(result.message));
        console.log('');
        console.log(chalk.dim(`Files in cache:     ${m.totalFiles}`));
        console.log(chalk.dim(`Built at:           ${m.builtAt}`));
        console.log(chalk.dim(`Content fingerprint:${m.contentFingerprint}`));
        if (result.staleAfterRestore > 0) {
            (0, messages_1.printWarning)(`${result.staleAfterRestore} stale files after restore`, 'Some files have changed since the cache was built. ' +
                'Run `neurcode brain cache-build` to update. ' +
                'Governance correctness is not affected — only indexing speed.');
        }
        else {
            (0, messages_1.printSuccess)('Cache is current', 'All sampled files match cache hashes.');
        }
        console.log('');
    });
}
//# sourceMappingURL=brain.js.map