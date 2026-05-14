"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateIntentContractDiagnostics = evaluateIntentContractDiagnostics;
const fs_1 = require("fs");
const path_1 = require("path");
const intelligence_runtime_common_1 = require("./intelligence-runtime-common");
const INTENT_PACK_TOP_LEVEL_KEYS = new Set([
    'schemaVersion',
    'intentPackId',
    'createdAt',
    'updatedAt',
    'intent',
    'governanceContext',
    'approvedScope',
    'forbiddenBoundaries',
    'expectedDependencies',
    'expectedInfrastructure',
    'expectedBlastRadius',
    'checkpoints',
    'rolloutExpectations',
    'governanceExpectations',
    'constraints',
    'detectedSignals',
    'semanticExpectations',
    'contextHints',
    'repositoryGraphId',
    'fingerprint',
]);
const APPROVED_SCOPE_KEYS = new Set(['files', 'modules', 'services']);
const BOUNDARY_KEYS = new Set(['type', 'path', 'policy', 'reason']);
const KNOWN_WORKSPACE_DIRS = ['apps', 'packages', 'services', 'libs', 'lib'];
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function hasGlobSyntax(value) {
    return /[*?[\]{}]/.test(value);
}
function globStablePrefix(value) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(value);
    const match = normalized.match(/[*?[\]{}]/);
    if (!match || match.index === undefined) {
        return normalized;
    }
    const beforeGlob = normalized.slice(0, match.index);
    return beforeGlob.replace(/[^/]*$/, '').replace(/\/$/, '');
}
function pathCovers(scopeValue, pathValue) {
    const scope = (0, intelligence_runtime_common_1.normalizeRepoPath)(scopeValue);
    const path = (0, intelligence_runtime_common_1.normalizeRepoPath)(pathValue);
    if (!scope || !path)
        return false;
    if (scope === path)
        return true;
    if (hasGlobSyntax(scope)) {
        const prefix = globStablePrefix(scope);
        return Boolean(prefix) && (path === prefix || path.startsWith(`${prefix}/`));
    }
    if (hasGlobSyntax(path)) {
        const prefix = globStablePrefix(path);
        return Boolean(prefix) && (scope === prefix || scope.startsWith(`${prefix}/`));
    }
    return path.startsWith(`${scope}/`) || scope.startsWith(`${path}/`);
}
function pushCapped(out, message, cap = 24) {
    if (out.length >= cap)
        return;
    if (!out.includes(message)) {
        out.push(message);
    }
}
function findUnsupportedIntentFields(intentPack, out) {
    const rawIntent = intentPack;
    if (!isRecord(rawIntent))
        return;
    for (const key of Object.keys(rawIntent).sort((a, b) => a.localeCompare(b))) {
        if (!INTENT_PACK_TOP_LEVEL_KEYS.has(key)) {
            pushCapped(out, `Intent pack contains unsupported top-level field "${key}"; deterministic governance ignores unsupported contract fields.`);
        }
    }
    const approvedScope = rawIntent.approvedScope;
    if (isRecord(approvedScope)) {
        for (const key of Object.keys(approvedScope).sort((a, b) => a.localeCompare(b))) {
            if (!APPROVED_SCOPE_KEYS.has(key)) {
                pushCapped(out, `Intent approvedScope contains unsupported field "${key}"; use files, modules, or services so scope drift remains deterministic.`);
            }
        }
    }
    const forbiddenBoundaries = rawIntent.forbiddenBoundaries;
    if (Array.isArray(forbiddenBoundaries)) {
        forbiddenBoundaries.slice(0, 24).forEach((boundary, index) => {
            if (!isRecord(boundary))
                return;
            for (const key of Object.keys(boundary).sort((a, b) => a.localeCompare(b))) {
                if (!BOUNDARY_KEYS.has(key)) {
                    pushCapped(out, `Forbidden boundary ${index + 1} contains unsupported field "${key}"; boundary governance ignores unsupported fields.`);
                }
            }
        });
    }
}
function findExistingPaths(projectRoot, candidates, out) {
    const missing = candidates
        .filter((candidate) => !hasGlobSyntax(candidate))
        .filter((candidate) => !(0, fs_1.existsSync)((0, path_1.join)(projectRoot, (0, intelligence_runtime_common_1.normalizeRepoPath)(candidate))))
        .slice(0, 6);
    if (missing.length > 0) {
        pushCapped(out, `Approved intent scope references path(s) not present in the workspace: ${missing.join(', ')}. This can create false drift findings in real repos.`);
    }
}
function findRepositoryNodePaths(graph) {
    return new Set(graph.nodes
        .map((node) => node.path || node.label)
        .filter((value) => Boolean(value))
        .map(intelligence_runtime_common_1.normalizeRepoPath));
}
function findScopeMappingWarnings(intentPack, contextPack, graph, out) {
    const nodePaths = findRepositoryNodePaths(graph);
    const serviceBoundaryValues = new Set(contextPack.serviceBoundaries.flatMap((boundary) => [boundary.name, boundary.path]).map(intelligence_runtime_common_1.normalizeRepoPath));
    const unmappedModules = intentPack.approvedScope.modules
        .map(intelligence_runtime_common_1.normalizeRepoPath)
        .filter((modulePath) => !hasGlobSyntax(modulePath))
        .filter((modulePath) => !nodePaths.has(modulePath))
        .slice(0, 6);
    if (unmappedModules.length > 0) {
        pushCapped(out, `Approved module(s) are not represented in the repository graph: ${unmappedModules.join(', ')}. Verify may over-classify adjacent edits as drift.`);
    }
    const unmappedServices = intentPack.approvedScope.services
        .map(intelligence_runtime_common_1.normalizeRepoPath)
        .filter((servicePath) => !hasGlobSyntax(servicePath))
        .filter((servicePath) => !serviceBoundaryValues.has(servicePath))
        .slice(0, 6);
    if (unmappedServices.length > 0) {
        pushCapped(out, `Approved service(s) do not map to context-pack service boundaries: ${unmappedServices.join(', ')}. Declare module/package boundaries explicitly for monorepos.`);
    }
    if (graph.summary.moduleCount > contextPack.serviceBoundaries.length && contextPack.serviceBoundaries.length >= 12) {
        pushCapped(out, `Context pack captured ${contextPack.serviceBoundaries.length} service/module boundary candidate(s) from ${graph.summary.moduleCount} module(s). Large monorepos may need narrower declared package scope to avoid boundary truncation.`);
    }
}
function findOverlappingGlobWarnings(intentPack, out) {
    const scopedEntries = [
        ...intentPack.approvedScope.files.map((value) => `file:${value}`),
        ...intentPack.approvedScope.modules.map((value) => `module:${value}`),
        ...intentPack.approvedScope.services.map((value) => `service:${value}`),
    ];
    const globEntries = scopedEntries.filter((entry) => hasGlobSyntax(entry.split(':').slice(1).join(':')));
    for (let i = 0; i < globEntries.length; i += 1) {
        for (let j = i + 1; j < globEntries.length; j += 1) {
            const left = globEntries[i].split(':').slice(1).join(':');
            const right = globEntries[j].split(':').slice(1).join(':');
            if (pathCovers(left, right) || pathCovers(right, left)) {
                pushCapped(out, `Approved scope glob "${left}" overlaps "${right}". Overlapping globs make false-positive triage harder; prefer one canonical boundary.`);
            }
        }
    }
}
function boundaryTypeMatchesPath(boundary) {
    const flags = (0, intelligence_runtime_common_1.classifyBoundaryPath)(boundary.path);
    if (boundary.type === 'infra')
        return flags.infra;
    if (boundary.type === 'ci')
        return flags.ci;
    if (boundary.type === 'dependency-manifest')
        return flags.dependencyManifest;
    if (boundary.type === 'sensitive')
        return flags.sensitive;
    return true;
}
function findBoundaryWarnings(intentPack, out) {
    const approvedValues = [
        ...intentPack.approvedScope.files,
        ...intentPack.approvedScope.modules,
        ...intentPack.approvedScope.services,
    ].map(intelligence_runtime_common_1.normalizeRepoPath);
    for (const boundary of intentPack.forbiddenBoundaries.slice(0, 40)) {
        const boundaryPath = (0, intelligence_runtime_common_1.normalizeRepoPath)(boundary.path);
        if (boundary.policy === 'allowed' && ['infra', 'ci', 'sensitive', 'dependency-manifest'].includes(boundary.type)) {
            pushCapped(out, `Boundary "${boundary.path}" is marked allowed even though it is classified as ${boundary.type}; confirm this trust-boundary exception is intentional.`);
        }
        if (!hasGlobSyntax(boundaryPath) && !boundaryTypeMatchesPath(boundary)) {
            pushCapped(out, `Boundary "${boundary.path}" is declared as ${boundary.type}, but its path shape does not match that boundary type. This can produce misleading drift explanations.`);
        }
        if (boundary.policy === 'forbidden'
            && approvedValues.some((approved) => pathCovers(approved, boundaryPath) || pathCovers(boundaryPath, approved))) {
            pushCapped(out, `Approved scope overlaps forbidden boundary "${boundary.path}". Resolve this before relying on intent governance in CI.`);
        }
    }
}
function readJsonObject(pathValue) {
    if (!(0, fs_1.existsSync)(pathValue))
        return null;
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(pathValue, 'utf-8'));
        return isRecord(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function hasWorkspaceConfig(projectRoot) {
    const rootPackageJson = readJsonObject((0, path_1.join)(projectRoot, 'package.json'));
    if (rootPackageJson && Object.prototype.hasOwnProperty.call(rootPackageJson, 'workspaces')) {
        return true;
    }
    return (0, fs_1.existsSync)((0, path_1.join)(projectRoot, 'pnpm-workspace.yaml'));
}
function collectPackageRoots(projectRoot) {
    const roots = [];
    for (const workspaceDir of KNOWN_WORKSPACE_DIRS) {
        const dir = (0, path_1.join)(projectRoot, workspaceDir);
        if (!(0, fs_1.existsSync)(dir))
            continue;
        let entries = [];
        try {
            entries = (0, fs_1.readdirSync)(dir);
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = (0, path_1.join)(dir, entry);
            try {
                if (!(0, fs_1.statSync)(fullPath).isDirectory())
                    continue;
            }
            catch {
                continue;
            }
            const candidateRoot = (0, intelligence_runtime_common_1.normalizeRepoPath)(`${workspaceDir}/${entry}`);
            if ((0, fs_1.existsSync)((0, path_1.join)(fullPath, 'package.json'))
                || (0, fs_1.existsSync)((0, path_1.join)(fullPath, 'pyproject.toml'))
                || (0, fs_1.existsSync)((0, path_1.join)(fullPath, 'go.mod'))) {
                roots.push(candidateRoot);
            }
        }
    }
    return (0, intelligence_runtime_common_1.dedupeSorted)(roots);
}
function findPackageRootForPath(packageRoots, filePath) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(filePath);
    let best = null;
    let bestLength = -1;
    for (const root of packageRoots) {
        if (normalized === root || normalized.startsWith(`${root}/`)) {
            if (root.length > bestLength) {
                best = root;
                bestLength = root.length;
            }
        }
    }
    return best;
}
function findMonorepoWarnings(projectRoot, intentPack, graph, out) {
    const packageRoots = collectPackageRoots(projectRoot);
    const isMonorepoLike = hasWorkspaceConfig(projectRoot) || packageRoots.length >= 3 || graph.summary.moduleCount >= 24;
    if (!isMonorepoLike)
        return;
    const approvedPackageRoots = (0, intelligence_runtime_common_1.dedupeSorted)(intentPack.approvedScope.files
        .map((filePath) => findPackageRootForPath(packageRoots, filePath))
        .filter((value) => Boolean(value)));
    if (approvedPackageRoots.length > 1 && intentPack.approvedScope.services.length === 0) {
        pushCapped(out, `Approved files span multiple package roots (${approvedPackageRoots.join(', ')}) but no service boundary is declared. Add package/service intent scope to reduce monorepo false positives.`);
    }
    if (graph.summary.moduleCount >= 24 && intentPack.approvedScope.modules.length <= 1) {
        pushCapped(out, `Repository looks monorepo-scale (${graph.summary.moduleCount} module(s)), but intent approved only ${intentPack.approvedScope.modules.length} module(s). Validate package-layer mapping before using this contract as a CI gate.`);
    }
}
function tsconfigHasPathAliases(projectRoot) {
    const candidates = ['tsconfig.json', 'jsconfig.json'];
    for (const candidate of candidates) {
        const parsed = readJsonObject((0, path_1.join)(projectRoot, candidate));
        const compilerOptions = isRecord(parsed?.compilerOptions) ? parsed.compilerOptions : null;
        if (isRecord(compilerOptions?.paths) && Object.keys(compilerOptions.paths).length > 0) {
            return true;
        }
    }
    for (const workspaceDir of KNOWN_WORKSPACE_DIRS) {
        const dir = (0, path_1.join)(projectRoot, workspaceDir);
        if (!(0, fs_1.existsSync)(dir))
            continue;
        let entries = [];
        try {
            entries = (0, fs_1.readdirSync)(dir);
        }
        catch {
            continue;
        }
        for (const entry of entries.slice(0, 24)) {
            const parsed = readJsonObject((0, path_1.join)(dir, entry, 'tsconfig.json'));
            const compilerOptions = isRecord(parsed?.compilerOptions) ? parsed.compilerOptions : null;
            if (isRecord(compilerOptions?.paths) && Object.keys(compilerOptions.paths).length > 0) {
                return true;
            }
        }
    }
    return false;
}
function findPathAliasWarnings(projectRoot, graph, out) {
    if (!tsconfigHasPathAliases(projectRoot))
        return;
    if (graph.summary.scannedSourceFiles >= 20 && graph.summary.importEdges === 0) {
        pushCapped(out, 'TypeScript path aliases were detected, but repository intelligence found no import edges. Alias resolution may be under-reporting blast radius and drift.');
    }
}
function evaluateIntentContractDiagnostics(input) {
    const warnings = [];
    const { projectRoot, intentPack, contextPack, repositoryGraph } = input;
    findUnsupportedIntentFields(intentPack, warnings);
    findExistingPaths(projectRoot, intentPack.approvedScope.files, warnings);
    findScopeMappingWarnings(intentPack, contextPack, repositoryGraph, warnings);
    findOverlappingGlobWarnings(intentPack, warnings);
    findBoundaryWarnings(intentPack, warnings);
    findMonorepoWarnings(projectRoot, intentPack, repositoryGraph, warnings);
    findPathAliasWarnings(projectRoot, repositoryGraph, warnings);
    if (intentPack.repositoryGraphId && intentPack.repositoryGraphId !== repositoryGraph.graphId) {
        pushCapped(warnings, `Intent pack was built against ${intentPack.repositoryGraphId}, but active repository graph is ${repositoryGraph.graphId}; replayable drift explanations may be stale.`);
    }
    if (contextPack.intentPackId !== intentPack.intentPackId) {
        pushCapped(warnings, `Context pack ${contextPack.contextPackId} belongs to ${contextPack.intentPackId}, not active intent ${intentPack.intentPackId}.`);
    }
    return (0, intelligence_runtime_common_1.dedupeSorted)(warnings.map((warning) => warning.replace(/\s+/g, ' ').replace((0, path_1.basename)(projectRoot), (0, path_1.basename)(projectRoot)).trim()));
}
//# sourceMappingURL=intent-contract-diagnostics.js.map