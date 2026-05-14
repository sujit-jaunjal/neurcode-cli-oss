"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRepositoryIntelligenceGraph = buildRepositoryIntelligenceGraph;
const fs_1 = require("fs");
const path_1 = require("path");
const context_engine_1 = require("../context-engine");
const cross_repo_graph_1 = require("../workspace/cross-repo-graph");
const workspace_runtime_1 = require("./workspace-runtime");
const intelligence_runtime_common_1 = require("./intelligence-runtime-common");
const semantic_contract_intelligence_1 = require("./semantic-contract-intelligence");
const EXCLUDED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.turbo',
    'coverage',
    '.cache',
    '.neurcode',
    'out',
]);
function shouldSkipDir(entry) {
    if (EXCLUDED_DIRS.has(entry)) {
        return true;
    }
    if (entry.startsWith('.') && entry !== '.github') {
        return true;
    }
    return false;
}
const MAX_BOUNDARY_FILES = 60;
const MAX_FOCUS_FILE_NODES = 24;
const MODULE_ROOT_HINTS = new Set(['src', 'app', 'apps', 'services', 'packages', 'libs', 'lib']);
const SERVICE_KEYWORDS = ['service', 'api', 'worker', 'auth', 'billing', 'payment', 'queue', 'events', 'web', 'ui'];
function toNodeId(prefix, value) {
    return `${prefix}:${value}`;
}
function deriveModulePath(filePath) {
    const normalized = (0, intelligence_runtime_common_1.normalizeRepoPath)(filePath);
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 1) {
        return parts[0] || normalized;
    }
    if (MODULE_ROOT_HINTS.has(parts[0]) && parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
    }
    return parts[0];
}
function deriveServiceKind(modulePath) {
    const normalized = modulePath.toLowerCase();
    if (normalized.includes('infra') || normalized.includes('deploy') || normalized.includes('terraform')) {
        return 'infra';
    }
    if (normalized.includes('ui') || normalized.includes('web') || normalized.includes('frontend')) {
        return 'ui';
    }
    if (normalized.includes('worker') || normalized.includes('queue') || normalized.includes('events')) {
        return 'worker';
    }
    if (normalized.includes('shared') || normalized.includes('common') || normalized.includes('lib')) {
        return 'shared';
    }
    if (normalized.includes('api') || normalized.includes('route') || normalized.includes('controller')) {
        return 'api';
    }
    return 'service';
}
function isServiceLike(modulePath) {
    const normalized = modulePath.toLowerCase();
    return SERVICE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
function walkBoundaryFiles(rootPath, dirPath, out) {
    let entries = [];
    try {
        entries = (0, fs_1.readdirSync)(dirPath);
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (shouldSkipDir(entry)) {
            continue;
        }
        const fullPath = (0, path_1.join)(dirPath, entry);
        let stats;
        try {
            stats = (0, fs_1.statSync)(fullPath);
        }
        catch {
            continue;
        }
        if (stats.isDirectory()) {
            walkBoundaryFiles(rootPath, fullPath, out);
            continue;
        }
        const relativePath = (0, intelligence_runtime_common_1.normalizeRepoPath)(fullPath.slice(rootPath.length).replace(/^\//, ''));
        const boundary = (0, intelligence_runtime_common_1.classifyBoundaryPath)(relativePath);
        if (boundary.sensitive || boundary.infra || boundary.ci || boundary.dependencyManifest) {
            out.push(relativePath);
            if (out.length >= MAX_BOUNDARY_FILES) {
                return;
            }
        }
    }
}
function collectBoundaryFiles(projectRoot) {
    const out = [];
    walkBoundaryFiles(projectRoot, projectRoot, out);
    return (0, intelligence_runtime_common_1.dedupeSortedPaths)(out).slice(0, MAX_BOUNDARY_FILES);
}
function buildRepositoryIntelligenceGraph(input) {
    const scan = (0, context_engine_1.scanProject)(input.projectRoot);
    const dependencyGraph = (0, context_engine_1.buildDependencyGraph)(scan);
    const now = (0, intelligence_runtime_common_1.nowIso)();
    const branchName = (0, intelligence_runtime_common_1.getGitBranchName)(input.projectRoot);
    const headSha = (0, intelligence_runtime_common_1.getGitHeadSha)(input.projectRoot);
    const allBoundaryFiles = collectBoundaryFiles(input.projectRoot);
    const sensitivePaths = allBoundaryFiles.filter((item) => (0, intelligence_runtime_common_1.classifyBoundaryPath)(item).sensitive);
    const infraPaths = allBoundaryFiles.filter((item) => (0, intelligence_runtime_common_1.classifyBoundaryPath)(item).infra);
    const ciPaths = allBoundaryFiles.filter((item) => (0, intelligence_runtime_common_1.classifyBoundaryPath)(item).ci);
    const dependencyManifests = allBoundaryFiles.filter((item) => (0, intelligence_runtime_common_1.classifyBoundaryPath)(item).dependencyManifest);
    const focusFiles = (0, intelligence_runtime_common_1.dedupeSortedPaths)([
        ...(input.focusFiles || []),
        ...((input.contextSuggestions || []).map((item) => item.file)),
        ...dependencyManifests,
        ...sensitivePaths.slice(0, 8),
    ]).slice(0, MAX_FOCUS_FILE_NODES);
    const moduleCounts = new Map();
    for (const file of scan.files) {
        const modulePath = deriveModulePath(file);
        moduleCounts.set(modulePath, (moduleCounts.get(modulePath) || 0) + 1);
    }
    const modulePaths = Array.from(moduleCounts.keys()).sort((a, b) => a.localeCompare(b));
    const servicePaths = modulePaths.filter((modulePath) => isServiceLike(modulePath));
    const nodes = [];
    const edges = [];
    const repoName = (0, path_1.basename)(input.projectRoot);
    const repoId = toNodeId('repo', repoName);
    nodes.push({
        id: repoId,
        type: 'repository',
        label: repoName,
        path: input.projectRoot,
        category: 'root',
    });
    for (const modulePath of modulePaths) {
        const moduleId = toNodeId('module', modulePath);
        nodes.push({
            id: moduleId,
            type: isServiceLike(modulePath) ? 'service' : 'module',
            label: modulePath,
            path: modulePath,
            category: deriveServiceKind(modulePath),
            metadata: {
                fileCount: moduleCounts.get(modulePath) || 0,
            },
        });
        edges.push({
            from: repoId,
            to: moduleId,
            type: 'contains',
            confidence: 'high',
            evidence: modulePath,
        });
    }
    for (const filePath of focusFiles) {
        const fileId = toNodeId('file', filePath);
        nodes.push({
            id: fileId,
            type: 'file',
            label: filePath,
            path: filePath,
            category: 'focus',
            metadata: {
                module: deriveModulePath(filePath),
            },
        });
        edges.push({
            from: toNodeId('module', deriveModulePath(filePath)),
            to: fileId,
            type: 'contains',
            confidence: 'high',
            evidence: filePath,
        });
    }
    for (const manifestPath of dependencyManifests) {
        const manifestId = toNodeId('manifest', manifestPath);
        nodes.push({
            id: manifestId,
            type: 'manifest',
            label: manifestPath,
            path: manifestPath,
            category: 'dependency-manifest',
        });
        edges.push({
            from: repoId,
            to: manifestId,
            type: 'contains',
            confidence: 'high',
            evidence: manifestPath,
        });
    }
    const boundaryNodePaths = (0, intelligence_runtime_common_1.dedupeSortedPaths)([...sensitivePaths, ...infraPaths, ...ciPaths]).slice(0, 24);
    for (const boundaryPath of boundaryNodePaths) {
        const boundaryId = toNodeId('boundary', boundaryPath);
        const flags = (0, intelligence_runtime_common_1.classifyBoundaryPath)(boundaryPath);
        const category = flags.ci
            ? 'ci'
            : flags.infra
                ? 'infra'
                : flags.dependencyManifest
                    ? 'dependency-manifest'
                    : 'sensitive';
        nodes.push({
            id: boundaryId,
            type: 'boundary',
            label: boundaryPath,
            path: boundaryPath,
            category,
        });
        edges.push({
            from: repoId,
            to: boundaryId,
            type: 'crosses-boundary',
            confidence: flags.sensitive ? 'high' : 'medium',
            evidence: boundaryPath,
        });
    }
    let crossModuleEdges = 0;
    const seenImportEdges = new Set();
    for (const [fromFile, imports] of Object.entries(dependencyGraph.imports)) {
        const fromModule = deriveModulePath(fromFile);
        const fromId = toNodeId('module', fromModule);
        const distinctTargets = new Set();
        for (const targetFile of imports) {
            const targetModule = deriveModulePath(targetFile);
            if (targetModule === fromModule) {
                continue;
            }
            distinctTargets.add(targetModule);
        }
        for (const targetModule of distinctTargets) {
            const edgeKey = `${fromId}->${targetModule}`;
            if (seenImportEdges.has(edgeKey)) {
                continue;
            }
            seenImportEdges.add(edgeKey);
            crossModuleEdges += 1;
            edges.push({
                from: fromId,
                to: toNodeId('module', targetModule),
                type: 'imports',
                confidence: 'high',
                evidence: (0, intelligence_runtime_common_1.normalizeRepoPath)(fromFile),
            });
        }
    }
    const activeWorkspace = (0, workspace_runtime_1.getActiveWorkspace)(input.projectRoot);
    let crossRepoEdgeCount = 0;
    if (activeWorkspace) {
        const currentRepo = activeWorkspace.repositories.find((repo) => {
            const normalizedRoot = (0, intelligence_runtime_common_1.normalizeRepoPath)(repo.rootPath || '.');
            return repo.enabled && (normalizedRoot === '.' || (0, path_1.basename)(repo.rootPath) === repoName);
        });
        if (currentRepo) {
            const crossRepoGraph = (0, cross_repo_graph_1.buildCrossRepoGraph)({ repos: activeWorkspace.repositories });
            const relatedEdges = crossRepoGraph.edges
                .filter((edge) => edge.fromRepo === currentRepo.name || edge.toRepo === currentRepo.name)
                .sort((a, b) => a.fromRepo.localeCompare(b.fromRepo) || a.toRepo.localeCompare(b.toRepo));
            crossRepoEdgeCount = relatedEdges.length;
            for (const edge of relatedEdges.slice(0, 48)) {
                const externalNodeId = toNodeId('external-repo', edge.fromRepo === currentRepo.name ? edge.toRepo : edge.fromRepo);
                if (!nodes.some((node) => node.id === externalNodeId)) {
                    nodes.push({
                        id: externalNodeId,
                        type: 'external-repo',
                        label: edge.fromRepo === currentRepo.name ? edge.toRepo : edge.fromRepo,
                        category: edge.via,
                    });
                }
                edges.push({
                    from: edge.fromRepo === currentRepo.name ? repoId : externalNodeId,
                    to: edge.fromRepo === currentRepo.name ? externalNodeId : repoId,
                    type: 'cross-repo',
                    confidence: edge.confidence,
                    evidence: edge.evidence[0] || edge.impactSummary,
                });
            }
        }
    }
    const graphWithoutFingerprint = {
        schemaVersion: intelligence_runtime_common_1.LOCAL_INTELLIGENCE_SCHEMA_VERSION,
        generatedAt: now,
        repository: {
            name: repoName,
            rootPath: input.projectRoot,
            branchName,
            headSha,
            workspaceId: activeWorkspace?.id || null,
        },
        summary: {
            scannedSourceFiles: scan.files.length,
            moduleCount: modulePaths.length,
            serviceCount: servicePaths.length,
            importEdges: Object.values(dependencyGraph.imports).reduce((sum, entries) => sum + entries.length, 0),
            crossModuleEdges,
            sensitiveBoundaryCount: sensitivePaths.length,
            manifestCount: dependencyManifests.length,
            crossRepoEdgeCount,
            ownershipBoundaryCount: 0,
            semanticContractCount: 0,
            invariantCount: 0,
            runtimeBehaviorCount: 0,
            runtimeInteractionCount: 0,
            deploymentBoundaryCount: 0,
        },
        nodes: nodes
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((node) => ({
            ...node,
            metadata: node.metadata ? Object.fromEntries(Object.entries(node.metadata).sort(([left], [right]) => left.localeCompare(right))) : node.metadata,
        })),
        edges: edges.sort((left, right) => left.from.localeCompare(right.from)
            || left.to.localeCompare(right.to)
            || left.type.localeCompare(right.type)),
        boundaries: {
            sensitivePaths: (0, intelligence_runtime_common_1.dedupeSortedPaths)(sensitivePaths),
            infraPaths: (0, intelligence_runtime_common_1.dedupeSortedPaths)(infraPaths),
            ciPaths: (0, intelligence_runtime_common_1.dedupeSortedPaths)(ciPaths),
            dependencyManifests: (0, intelligence_runtime_common_1.dedupeSortedPaths)(dependencyManifests),
        },
        semantic: {
            ownershipBoundaries: [],
            contracts: [],
            invariants: [],
            criticalDomains: [],
            runtime: {
                behaviorProfiles: [],
                interactions: [],
                deploymentBoundaries: [],
                criticalFlows: [],
                blindSpots: [],
            },
        },
        blindSpots: (0, intelligence_runtime_common_1.dedupeSorted)([
            crossRepoEdgeCount > 0 ? 'Runtime service discovery outside declared workspace topology may expand blast radius.' : '',
            'Configuration-driven feature flags and external SaaS webhooks remain advisory-only blind spots.',
        ]),
    };
    const semantic = (0, semantic_contract_intelligence_1.buildRepositorySemanticModel)({
        projectRoot: input.projectRoot,
        repository: graphWithoutFingerprint.repository,
        nodes: graphWithoutFingerprint.nodes,
        edges: graphWithoutFingerprint.edges,
        boundaries: graphWithoutFingerprint.boundaries,
        sourceFiles: scan.files,
    });
    graphWithoutFingerprint.semantic = semantic;
    graphWithoutFingerprint.summary.ownershipBoundaryCount = semantic.ownershipBoundaries.length;
    graphWithoutFingerprint.summary.semanticContractCount = semantic.contracts.length;
    graphWithoutFingerprint.summary.invariantCount = semantic.invariants.length;
    graphWithoutFingerprint.summary.runtimeBehaviorCount = semantic.runtime.behaviorProfiles.length;
    graphWithoutFingerprint.summary.runtimeInteractionCount = semantic.runtime.interactions.length;
    graphWithoutFingerprint.summary.deploymentBoundaryCount = semantic.runtime.deploymentBoundaries.length;
    return {
        ...graphWithoutFingerprint,
        graphId: `graph-${(0, intelligence_runtime_common_1.fingerprintValue)(graphWithoutFingerprint).slice(0, 16)}`,
        fingerprint: (0, intelligence_runtime_common_1.fingerprintValue)(graphWithoutFingerprint),
    };
}
//# sourceMappingURL=repository-intelligence.js.map