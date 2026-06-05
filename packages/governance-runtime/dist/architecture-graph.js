"use strict";
/**
 * Repository Architecture Graph — V2.
 *
 * Turns the path/owner profile into an architecture-aware model that can reason
 * about module boundaries, ownership, dependency direction, and sensitive
 * surfaces during agentic development.
 *
 * Source-free guarantees:
 *   - Import *specifiers* (module strings) may be read locally to infer edges,
 *     but raw source, diffs, and file contents are NEVER stored on the graph.
 *     The graph holds only module ids, owners, surface tags, and module→module
 *     dependency edges — architecture metadata, not code.
 *   - Deterministic: same inputs → same `architectureHash`.
 *
 * The extractor + resolver are pure functions so the CLI can read local files,
 * derive specifiers, build edges, and discard the content immediately.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARCHITECTURE_GRAPH_SCHEMA_VERSION = void 0;
exports.moduleIdForPath = moduleIdForPath;
exports.extractImportSpecifiers = extractImportSpecifiers;
exports.resolveImportSpecifier = resolveImportSpecifier;
exports.buildArchitectureGraph = buildArchitectureGraph;
exports.findModuleForPath = findModuleForPath;
exports.dependentsOf = dependentsOf;
exports.dependenciesOf = dependenciesOf;
exports.modulesInPlay = modulesInPlay;
exports.deriveGraphObligationSeeds = deriveGraphObligationSeeds;
exports.isModuleTestSatisfiable = isModuleTestSatisfiable;
const micromatch_1 = __importDefault(require("micromatch"));
const node_crypto_1 = require("node:crypto");
const profile_1 = require("./profile");
exports.ARCHITECTURE_GRAPH_SCHEMA_VERSION = 2;
// ── Language + path helpers ───────────────────────────────────────────────────
const TS_JS_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts']);
const PY_EXT = new Set(['py', 'pyi']);
const SOURCE_EXT = new Set([
    ...TS_JS_EXT,
    ...PY_EXT,
    'go',
    'rs',
    'java',
    'kt',
    'rb',
    'php',
    'cs',
    // `.sql` is included so migration/database directories form modules even when
    // they hold only SQL files (no imports are extracted from them).
    'sql',
]);
function extOf(filePath) {
    const m = filePath.match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : '';
}
function languageForExt(ext) {
    if (ext === 'ts' || ext === 'tsx' || ext === 'mts' || ext === 'cts')
        return 'TypeScript';
    if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs')
        return 'JavaScript';
    if (ext === 'py' || ext === 'pyi')
        return 'Python';
    if (ext === 'go')
        return 'Go';
    if (ext === 'rs')
        return 'Rust';
    if (ext === 'java')
        return 'Java';
    if (ext === 'kt')
        return 'Kotlin';
    if (ext === 'rb')
        return 'Ruby';
    if (ext === 'php')
        return 'PHP';
    if (ext === 'cs')
        return 'C#';
    if (ext === 'sql')
        return 'SQL';
    return 'unknown';
}
function isSourcePath(filePath) {
    return SOURCE_EXT.has(extOf(filePath));
}
function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
}
/**
 * Collapse a file path to a module id using the first `depth` directory
 * segments. Root-level files map to the synthetic module ".".
 *
 * When a repository contains an embedded service/app fixture, preserve the
 * prefix up to a recognizable app root (`src`, `packages`, `services`, etc.)
 * and then apply depth from there. Without this, paths such as
 * `fixtures/demo-svc/src/billing/charge.py` collapse to `fixtures/demo-svc`,
 * mixing billing/auth/migration ownership into one misleading module.
 */
function moduleIdForPath(filePath, depth = 2) {
    const norm = normalizePath(filePath);
    const segments = norm.split('/').filter(Boolean);
    if (segments.length <= 1)
        return '.';
    const dirSegments = segments.slice(0, -1);
    const effectiveDepth = Math.max(1, depth);
    const topLevelWorkspaceRoot = ['packages', 'services', 'apps', 'web', 'actions'].includes(dirSegments[0] ?? '');
    const embeddedRootIndex = topLevelWorkspaceRoot
        ? -1
        : dirSegments.findIndex((segment, index) => {
            if (index === 0)
                return false;
            return ['src', 'packages', 'services', 'apps', 'web', 'actions', 'migrations'].includes(segment);
        });
    if (embeddedRootIndex > 0) {
        const rootSegment = dirSegments[embeddedRootIndex];
        const rootDepth = rootSegment === 'migrations' ? 1 : effectiveDepth;
        return dirSegments.slice(0, embeddedRootIndex + rootDepth).join('/');
    }
    return dirSegments.slice(0, effectiveDepth).join('/');
}
function moduleGlob(moduleId) {
    return moduleId === '.' ? '*' : `${moduleId}/**`;
}
function uniqueSorted(values) {
    return Array.from(new Set(values)).sort();
}
// ── Import specifier extraction (pure, source-free output) ────────────────────
const TS_IMPORT_RE = /\b(?:import|export)\s+(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const TS_BARE_IMPORT_RE = /\bimport\s+['"]([^'"]+)['"]/g;
const TS_REQUIRE_RE = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
const TS_DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const PY_IMPORT_RE = /^[ \t]*import\s+([a-zA-Z0-9_.]+)/gm;
const PY_FROM_RE = /^[ \t]*from\s+(\.*[a-zA-Z0-9_.]*)\s+import\b/gm;
/**
 * Extract import specifiers (module strings) from a single file's content.
 *
 * Returns only the quoted/dotted module specifiers — never source text. The
 * caller reads file content locally and discards it after calling this.
 */
function extractImportSpecifiers(filePath, content) {
    if (!content)
        return [];
    const ext = extOf(filePath);
    const found = new Set();
    const collect = (re, input) => {
        const pattern = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
        let match;
        while ((match = pattern.exec(input)) !== null) {
            const spec = match[1]?.trim();
            if (spec)
                found.add(spec);
        }
    };
    if (TS_JS_EXT.has(ext)) {
        collect(TS_IMPORT_RE, content);
        collect(TS_BARE_IMPORT_RE, content);
        collect(TS_REQUIRE_RE, content);
        collect(TS_DYNAMIC_IMPORT_RE, content);
    }
    else if (PY_EXT.has(ext)) {
        collect(PY_IMPORT_RE, content);
        collect(PY_FROM_RE, content);
    }
    return Array.from(found);
}
// ── Import resolution (specifier → repo-relative module file) ──────────────────
const TS_RESOLVE_SUFFIXES = [
    '',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.mts',
    '.cts',
    '/index.ts',
    '/index.tsx',
    '/index.js',
    '/index.jsx',
    '/index.mjs',
];
const PY_RESOLVE_SUFFIXES = ['.py', '.pyi', '/__init__.py', '/__init__.pyi'];
function joinPath(base, rel) {
    const stack = base ? base.split('/') : [];
    for (const part of rel.split('/')) {
        if (part === '' || part === '.')
            continue;
        if (part === '..')
            stack.pop();
        else
            stack.push(part);
    }
    return stack.join('/');
}
function dirOf(filePath) {
    const norm = normalizePath(filePath);
    const idx = norm.lastIndexOf('/');
    return idx === -1 ? '' : norm.slice(0, idx);
}
/**
 * Resolve an import specifier to a repo-relative source file, if it points to a
 * known in-repo module. External packages (e.g. "fastapi", "react") resolve to
 * null and are intentionally excluded from the internal dependency graph.
 */
function resolveImportSpecifier(fromFile, specifier, knownPaths) {
    const ext = extOf(fromFile);
    const spec = specifier.trim();
    if (!spec)
        return null;
    // ── TypeScript / JavaScript ──────────────────────────────────────────────
    if (TS_JS_EXT.has(ext)) {
        if (!spec.startsWith('.'))
            return null; // bare/package import → external
        const base = joinPath(dirOf(fromFile), spec.replace(/\/$/, ''));
        for (const suffix of TS_RESOLVE_SUFFIXES) {
            const candidate = `${base}${suffix}`;
            if (knownPaths.has(candidate))
                return candidate;
        }
        return null;
    }
    // ── Python ────────────────────────────────────────────────────────────────
    if (PY_EXT.has(ext)) {
        if (spec.startsWith('.')) {
            // Relative import: leading dots indicate package levels.
            const dots = spec.match(/^\.+/)?.[0].length ?? 0;
            const rest = spec.slice(dots).replace(/\./g, '/');
            let base = dirOf(fromFile);
            for (let i = 1; i < dots; i += 1)
                base = joinPath(base, '..');
            const target = rest ? joinPath(base, rest) : base;
            for (const suffix of PY_RESOLVE_SUFFIXES) {
                const candidate = `${target}${suffix}`;
                if (knownPaths.has(candidate))
                    return candidate;
            }
            // `from . import x` → the package's __init__
            if (!rest) {
                for (const suffix of PY_RESOLVE_SUFFIXES) {
                    const candidate = `${base}${suffix}`;
                    if (knownPaths.has(candidate))
                        return candidate;
                }
            }
            return null;
        }
        // Absolute dotted import: try to map onto a repo file (else external).
        const asPath = spec.replace(/\./g, '/');
        for (const suffix of PY_RESOLVE_SUFFIXES) {
            const candidate = `${asPath}${suffix}`;
            if (knownPaths.has(candidate))
                return candidate;
        }
        return null;
    }
    return null;
}
// ── Surface detection ──────────────────────────────────────────────────────
const SENSITIVE_TAG_TO_SURFACE = {
    auth: 'auth',
    crypto: 'crypto',
    secrets: 'secrets',
    payments: 'payments',
    migrations: 'migration',
    security: 'security',
    custom: null,
};
const PUBLIC_API_SEGMENTS = new Set([
    'api',
    'apis',
    'routes',
    'router',
    'routers',
    'controller',
    'controllers',
    'handler',
    'handlers',
    'endpoints',
    'graphql',
    'resolvers',
    'rest',
]);
const DATABASE_SEGMENTS = new Set([
    'db',
    'database',
    'models',
    'model',
    'schema',
    'schemas',
    'entities',
    'entity',
    'repositories',
    'repository',
    'dao',
    'orm',
]);
const MIGRATION_RE = /(^|\/)(migrations?|alembic|flyway|liquibase)(\/|$)/i;
function surfacesForModule(moduleId, files, sensitiveTags) {
    const surfaces = new Set();
    for (const tag of sensitiveTags) {
        const surface = SENSITIVE_TAG_TO_SURFACE[tag];
        if (surface)
            surfaces.add(surface);
    }
    const segments = moduleId.split('/').filter(Boolean);
    for (const seg of segments) {
        if (PUBLIC_API_SEGMENTS.has(seg))
            surfaces.add('public-api');
        if (DATABASE_SEGMENTS.has(seg))
            surfaces.add('database');
    }
    for (const file of files) {
        if (MIGRATION_RE.test(file))
            surfaces.add('migration');
        if (/\.sql$/i.test(file))
            surfaces.add('database');
        // Next.js / framework API route convention: pages/api or app/api.
        if (/(^|\/)(pages|app)\/api(\/|$)/i.test(file))
            surfaces.add('public-api');
        if (/(^|\/)openapi|swagger|\.proto$/i.test(file))
            surfaces.add('public-api');
    }
    return uniqueSorted(surfaces);
}
function dominantLanguage(languages) {
    let best = 'unknown';
    let bestCount = -1;
    for (const [lang, count] of languages) {
        if (count > bestCount || (count === bestCount && lang < best)) {
            best = lang;
            bestCount = count;
        }
    }
    return best;
}
function ownersForModuleFiles(files, ownershipBoundaries) {
    const counts = new Map();
    for (const file of files) {
        const owners = (0, profile_1.ownersForPath)(file, ownershipBoundaries);
        if (owners.length === 0)
            continue;
        const sortedOwners = uniqueSorted(owners);
        const key = sortedOwners.join('\u0000');
        const existing = counts.get(key);
        if (existing) {
            existing.count += 1;
            if (file < existing.firstPath)
                existing.firstPath = file;
        }
        else {
            counts.set(key, { owners: sortedOwners, count: 1, firstPath: file });
        }
    }
    const ranked = Array.from(counts.values()).sort((a, b) => {
        if (b.count !== a.count)
            return b.count - a.count;
        return a.firstPath.localeCompare(b.firstPath);
    });
    return ranked[0]?.owners ?? [];
}
function sensitiveTagsForModule(moduleId, sensitiveBoundaries) {
    const tags = new Set();
    for (const boundary of sensitiveBoundaries) {
        const prefix = boundary.glob.replace('/**', '').replace('/*', '');
        if (moduleId === prefix || moduleId.startsWith(prefix + '/') || prefix.startsWith(moduleId + '/')) {
            tags.add(boundary.tag);
        }
    }
    return uniqueSorted(tags);
}
function moduleApprovalRequired(moduleId, approvalRequiredGlobs) {
    return approvalRequiredGlobs.some((glob) => {
        const prefix = glob.replace('/**', '').replace('/*', '');
        return moduleId === prefix || moduleId.startsWith(prefix + '/') || prefix.startsWith(moduleId + '/');
    });
}
/**
 * Build the deterministic repository architecture graph. Pure and source-free:
 * the only edge inputs are import *specifiers*, and only module→module edges
 * are retained.
 */
function buildArchitectureGraph(input) {
    const moduleDepth = Math.max(1, input.moduleDepth ?? 2);
    const ownershipBoundaries = input.ownershipBoundaries ?? [];
    const sensitiveBoundaries = input.sensitiveBoundaries ?? [];
    const approvalRequiredGlobs = input.approvalRequiredGlobs ?? [];
    const now = input.now || new Date().toISOString();
    const sourcePaths = input.paths.map(normalizePath).filter(isSourcePath);
    const knownPaths = new Set(sourcePaths);
    // 1. Accumulate modules from source paths.
    const accumulators = new Map();
    for (const filePath of sourcePaths) {
        const id = moduleIdForPath(filePath, moduleDepth);
        let acc = accumulators.get(id);
        if (!acc) {
            acc = { id, files: [], languages: new Map() };
            accumulators.set(id, acc);
        }
        acc.files.push(filePath);
        const lang = languageForExt(extOf(filePath));
        acc.languages.set(lang, (acc.languages.get(lang) ?? 0) + 1);
    }
    const modules = Array.from(accumulators.values())
        .map((acc) => {
        const sensitiveTags = sensitiveTagsForModule(acc.id, sensitiveBoundaries);
        const owners = ownersForModuleFiles(acc.files, ownershipBoundaries);
        return {
            id: acc.id,
            glob: moduleGlob(acc.id),
            fileCount: acc.files.length,
            owners,
            sensitiveTags,
            surfaces: surfacesForModule(acc.id, acc.files, sensitiveTags),
            approvalRequired: moduleApprovalRequired(acc.id, approvalRequiredGlobs),
            language: dominantLanguage(acc.languages),
        };
    })
        .sort((a, b) => a.id.localeCompare(b.id));
    const moduleIds = new Set(modules.map((m) => m.id));
    // 2. Resolve import specifiers into module→module edges.
    const edgeWeights = new Map();
    let analyzedFiles = 0;
    let resolvedImports = 0;
    for (const record of input.imports ?? []) {
        const fromFile = normalizePath(record.filePath);
        if (!knownPaths.has(fromFile))
            continue;
        analyzedFiles += 1;
        const fromModule = moduleIdForPath(fromFile, moduleDepth);
        for (const specifier of record.specifiers) {
            const targetFile = resolveImportSpecifier(fromFile, specifier, knownPaths);
            if (!targetFile)
                continue;
            const toModule = moduleIdForPath(targetFile, moduleDepth);
            if (!moduleIds.has(fromModule) || !moduleIds.has(toModule))
                continue;
            if (fromModule === toModule)
                continue; // ignore intra-module imports
            resolvedImports += 1;
            const key = `${fromModule} ${toModule}`;
            edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
        }
    }
    const edges = Array.from(edgeWeights.entries())
        .map(([key, weight]) => {
        const [from, to] = key.split(' ');
        return { from, to, weight };
    })
        .sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)));
    const languages = uniqueSorted(modules.map((m) => m.language).filter((l) => l !== 'unknown'));
    const stats = {
        moduleCount: modules.length,
        edgeCount: edges.length,
        analyzedFiles,
        resolvedImports,
        languages,
    };
    const canonical = JSON.stringify({
        moduleDepth,
        modules: modules.map((m) => ({
            id: m.id,
            owners: [...m.owners].sort(),
            sensitiveTags: m.sensitiveTags,
            surfaces: m.surfaces,
            approvalRequired: m.approvalRequired,
        })),
        edges: edges.map((e) => `${e.from}->${e.to}:${e.weight}`),
    });
    const architectureHash = (0, node_crypto_1.createHash)('sha256').update(canonical).digest('hex').slice(0, 24);
    return {
        schemaVersion: exports.ARCHITECTURE_GRAPH_SCHEMA_VERSION,
        generatedAt: now,
        moduleDepth,
        modules,
        edges,
        stats,
        architectureHash,
    };
}
// ── Graph queries ─────────────────────────────────────────────────────────────
function findModuleForPath(graph, filePath) {
    const norm = normalizePath(filePath);
    const id = moduleIdForPath(norm, graph.moduleDepth);
    const direct = graph.modules.find((m) => m.id === id);
    if (direct)
        return direct;
    // Fall back to the deepest module whose glob contains the path.
    const containing = graph.modules
        .filter((m) => norm === m.id || norm.startsWith(m.id + '/'))
        .sort((a, b) => b.id.length - a.id.length);
    return containing[0] ?? null;
}
/** Modules that import the given module (its downstream consumers). */
function dependentsOf(graph, moduleId) {
    return uniqueSorted(graph.edges.filter((e) => e.to === moduleId).map((e) => e.from));
}
/** Modules the given module imports (its upstream providers / dependencies). */
function dependenciesOf(graph, moduleId) {
    return uniqueSorted(graph.edges.filter((e) => e.from === moduleId).map((e) => e.to));
}
const COMPAT_PLAN_PATTERN = '(backward[- ]?compat|backwards[- ]?compat|breaking change|contract|interface stays|preserve (?:the )?(?:public )?(?:interface|api|contract)|do not break|no breaking)';
const SECURITY_PLAN_PATTERN = '(security review|security owner|security team|threat model|secure by|authn|authz|access control)';
const MIGRATION_PLAN_PATTERN = '(rollback|reversible|down migration|backfill safety|restore strategy|migration review|expand[- ]and[- ]contract)';
function moduleMatchesCandidate(module, candidate) {
    const norm = normalizePath(candidate);
    if (!norm)
        return false;
    const prefix = norm.replace('/**', '').replace('/*', '');
    if (module.id === prefix)
        return true;
    if (prefix.startsWith(module.id + '/'))
        return true; // candidate file under module
    if (module.id.startsWith(prefix + '/'))
        return true; // candidate glob over module
    // Glob form (e.g. "src/api/**") matching a file under the module.
    if (norm.includes('*') && micromatch_1.default.isMatch(module.id, prefix, { dot: true }))
        return true;
    return false;
}
/** Modules considered "in play" for a set of candidate paths/globs. */
function modulesInPlay(graph, candidatePaths) {
    const candidates = candidatePaths.map(normalizePath).filter(Boolean);
    if (candidates.length === 0)
        return [];
    return graph.modules.filter((module) => candidates.some((candidate) => moduleMatchesCandidate(module, candidate)));
}
function ownerLabel(owners) {
    if (owners.length === 0)
        return 'the owning team';
    return owners.join(', ');
}
/**
 * Derive graph obligation seeds for the modules currently in play. Deterministic
 * and ordered by id.
 */
function deriveGraphObligationSeeds(args) {
    const { graph } = args;
    const inPlay = modulesInPlay(graph, args.candidatePaths);
    const seeds = [];
    for (const module of inPlay) {
        const owners = ownerLabel(module.owners);
        // Payments: billing/payments-owned code requires explicit approval.
        if (module.surfaces.includes('payments')) {
            seeds.push({
                id: `architecture:payments-approval:${module.id}`,
                category: 'payments',
                title: `Approve billing-owned edit in ${module.id}`,
                description: `This edit touches billing-owned code. Approval required from ${owners}.`,
                severity: 'critical',
                module: module.id,
                requiredPath: module.glob,
                triggeredBy: [`edit targets payments surface ${module.id}`],
                requiredEvidence: [`Obtain an approval covering ${module.id} from ${owners}.`],
                surface: 'payments',
                satisfy: { approval: true },
            });
        }
        // Auth / security / secrets / crypto: security-owner awareness.
        const securitySurface = ['auth', 'security', 'secrets', 'crypto'].find((s) => module.surfaces.includes(s));
        if (securitySurface) {
            seeds.push({
                id: `architecture:security-awareness:${module.id}`,
                category: 'security',
                title: `Security-owner awareness for ${module.id}`,
                description: `This edit touches ${securitySurface}-sensitive code in ${module.id}. Security owner (${owners}) awareness required.`,
                severity: 'critical',
                module: module.id,
                requiredPath: module.glob,
                triggeredBy: [`edit targets ${securitySurface} surface ${module.id}`],
                requiredEvidence: [
                    `Approve ${module.id} or record a security-review commitment in the accepted plan.`,
                ],
                surface: securitySurface,
                satisfy: { approval: true, planPattern: SECURITY_PLAN_PATTERN },
            });
        }
        // Migration / database migration: migration review.
        if (module.surfaces.includes('migration')) {
            seeds.push({
                id: `architecture:migration-review:${module.id}`,
                category: 'data-model',
                title: `Migration review for ${module.id}`,
                description: `This edit touches database migration files in ${module.id}. Migration review required.`,
                severity: 'critical',
                module: module.id,
                requiredPath: module.glob,
                triggeredBy: [`edit targets migration surface ${module.id}`],
                requiredEvidence: [
                    `Approve ${module.id} or state a rollback / migration-review commitment in the accepted plan.`,
                ],
                surface: 'migration',
                satisfy: { approval: true, planPattern: MIGRATION_PLAN_PATTERN },
            });
        }
        // Public API: contract compatibility.
        if (module.surfaces.includes('public-api')) {
            seeds.push({
                id: `architecture:api-contract:${module.id}`,
                category: 'api-contract',
                title: `Confirm API contract compatibility for ${module.id}`,
                description: `This edit touches public API routes in ${module.id}. Confirm contract compatibility before shipping.`,
                severity: 'warn',
                module: module.id,
                requiredPath: module.glob,
                triggeredBy: [`edit targets public-api surface ${module.id}`],
                requiredEvidence: [
                    `State a backward-compatibility commitment in the accepted plan, or cover the route with a test.`,
                ],
                surface: 'public-api',
                satisfy: { approval: false, planPattern: COMPAT_PLAN_PATTERN, moduleTest: true },
            });
        }
        // Downstream impact: editing a module with consumers may break their contract.
        const dependents = dependentsOf(graph, module.id);
        const contractBearing = module.surfaces.includes('public-api') ||
            /(^|\/)(lib|core|shared|common|contracts?|api|utils?|types?|models?)(\/|$)/i.test(module.id);
        if (dependents.length > 0 && (contractBearing || dependents.length >= 3)) {
            const shown = dependents.slice(0, 3).join(', ');
            const more = dependents.length > 3 ? ` (+${dependents.length - 3} more)` : '';
            seeds.push({
                id: `architecture:downstream-impact:${module.id}`,
                category: 'dependency',
                title: `Review downstream impact of ${module.id}`,
                description: `This edit may affect downstream module${dependents.length === 1 ? '' : 's'} ${shown}${more}. Review obligation pending.`,
                severity: 'warn',
                module: module.id,
                requiredPath: module.glob,
                triggeredBy: [`${dependents.length} module(s) depend on ${module.id}`],
                requiredEvidence: [
                    `State that ${module.id}'s public contract is preserved in the accepted plan, or add a covering test.`,
                ],
                surface: 'dependency',
                satisfy: { approval: false, planPattern: COMPAT_PLAN_PATTERN, moduleTest: true },
            });
        }
    }
    return seeds.sort((a, b) => a.id.localeCompare(b.id));
}
/** True when a graph obligation can be satisfied by editing the module's tests. */
function isModuleTestSatisfiable(obligationId) {
    return (obligationId.startsWith('architecture:api-contract:') ||
        obligationId.startsWith('architecture:downstream-impact:'));
}
//# sourceMappingURL=architecture-graph.js.map