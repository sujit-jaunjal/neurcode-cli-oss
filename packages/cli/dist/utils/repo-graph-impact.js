"use strict";
/**
 * Repository Graph V2 impact projection — source-free consumers, tests, and authority.
 *
 * Queries the indexed V2 graph (SQLite or portable) without requiring V1 brain rebuild.
 * Merges with legacy V1 impact for owners, sensitive surfaces, and advisories.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPO_GRAPH_IMPACT_SCHEMA_VERSION = void 0;
exports.computeGraphImpactProjection = computeGraphImpactProjection;
exports.readGraphMetadataOnly = readGraphMetadataOnly;
const node_fs_1 = require("node:fs");
const brain_1 = require("@neurcode-ai/brain");
const repo_brain_impact_1 = require("./repo-brain-impact");
exports.REPO_GRAPH_IMPACT_SCHEMA_VERSION = 'neurcode.repo-graph-impact.v1';
const MAX_CONSUMERS = 64;
const MAX_TESTS = 24;
const MAX_TRANSITIVE_DEPTH = 3;
function edgeResolvedPath(edge) {
    const resolved = edge.attributes?.resolvedPath;
    return typeof resolved === 'string' ? resolved : null;
}
function edgeSourcePath(edge) {
    const sourcePath = edge.attributes?.sourcePath;
    return typeof sourcePath === 'string' ? sourcePath : null;
}
function isTestPath(path) {
    return (0, repo_brain_impact_1.classifyImpactFileRole)(path) === 'test';
}
function authorityClassForEdge(edge) {
    return edge.relationshipAuthorityClass ?? 'not_evaluated';
}
function impactLabelForAuthority(authorityClass) {
    if (authorityClass === 'deterministic_exact' || authorityClass === 'deterministic_structural') {
        return 'deterministic';
    }
    return 'advisory';
}
function buildImportAdjacency(graph) {
    const adjacency = new Map();
    for (const edge of graph.edges) {
        if (edge.type !== 'imports')
            continue;
        const sourcePath = edgeSourcePath(edge);
        const resolvedPath = edgeResolvedPath(edge);
        if (!sourcePath || !resolvedPath)
            continue;
        const list = adjacency.get(resolvedPath) ?? new Set();
        list.add(sourcePath);
        adjacency.set(resolvedPath, list);
    }
    return adjacency;
}
function collectTransitiveConsumers(seeds, adjacency, changedSet) {
    const depths = new Map();
    const queue = [];
    for (const seed of seeds) {
        const direct = adjacency.get(seed);
        if (!direct)
            continue;
        for (const consumer of direct) {
            if (changedSet.has(consumer))
                continue;
            if (!depths.has(consumer)) {
                depths.set(consumer, 1);
                queue.push({ path: consumer, depth: 1 });
            }
        }
    }
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || current.depth >= MAX_TRANSITIVE_DEPTH)
            continue;
        const next = adjacency.get(current.path);
        if (!next)
            continue;
        for (const consumer of next) {
            if (changedSet.has(consumer))
                continue;
            const depth = current.depth + 1;
            const existing = depths.get(consumer);
            if (existing !== undefined && existing <= depth)
                continue;
            depths.set(consumer, depth);
            queue.push({ path: consumer, depth });
        }
    }
    return depths;
}
function countAuthorities(edges) {
    const counts = {
        deterministic_exact: 0,
        deterministic_structural: 0,
        bounded_inference: 0,
        advisory_heuristic: 0,
        not_evaluated: 0,
        unsupported: 0,
    };
    for (const edge of edges) {
        const key = authorityClassForEdge(edge);
        if (key in counts)
            counts[key] += 1;
    }
    return counts;
}
function computeGraphImpactProjection(input) {
    const changedPaths = [...new Set(input.changedPaths.map((p) => p.replace(/\\/g, '/')))].sort();
    const changedSet = new Set(changedPaths);
    const storeSelection = (0, brain_1.resolveReadStoreSelection)(input.repoRoot);
    const metadata = (0, brain_1.readRepositoryGraphMetadata)(input.repoRoot);
    const graphPath = storeSelection.backend === 'sqlite'
        ? (0, brain_1.repositoryGraphPath)(input.repoRoot)
        : (0, brain_1.legacyRepositoryGraphPath)(input.repoRoot);
    const storageBytes = (0, node_fs_1.existsSync)(graphPath) ? (0, node_fs_1.statSync)(graphPath).size : null;
    let graph = input.graph ?? null;
    let relevantEdges = [];
    let impactQueryPath = 'provided_graph';
    if (!graph && storeSelection.store instanceof brain_1.SqliteRepositoryGraphStore) {
        const sqlite = storeSelection.store;
        const head = sqlite.readIndexingHead(input.repoRoot);
        if (head) {
            impactQueryPath = 'sqlite_bounded';
            graph = {
                ...head.metadata,
                generation: head.generation,
                nodes: [],
                edges: [],
                fileHashes: head.fileHashes,
                fileStates: head.fileStates,
                storage: {
                    ...head.metadata.storage,
                    format: 'sqlite_wal',
                    schemaVersion: head.storageSchemaVersion,
                },
            };
            relevantEdges = sqlite.queryImportEdgesForResolvedPaths(input.repoRoot, changedPaths);
        }
    }
    if (!graph) {
        graph = storeSelection.store.read(input.repoRoot);
        impactQueryPath = graph ? 'full_read' : 'full_read';
    }
    if (!graph) {
        return {
            schemaVersion: exports.REPO_GRAPH_IMPACT_SCHEMA_VERSION,
            surface: 'repository_graph_v2',
            graphPresent: false,
            storageBackend: storeSelection.backend,
            storageBytes,
            impactAuthority: null,
            coverageComplete: false,
            omittedPathPrefixes: [],
            changedPaths,
            directConsumers: [],
            transitiveConsumers: [],
            likelyTests: [],
            advisoryTests: [],
            authorityCounts: {
                deterministic_exact: 0,
                deterministic_structural: 0,
                bounded_inference: 0,
                advisory_heuristic: 0,
                not_evaluated: 0,
                unsupported: 0,
            },
            limitations: ['Repository Graph V2 is missing; run neurcode brain repo-index.'],
            notEvaluatedReasons: ['graph_missing'],
        };
    }
    if (relevantEdges.length === 0 && impactQueryPath !== 'sqlite_bounded') {
        relevantEdges = graph.edges.filter((edge) => {
            if (edge.type !== 'imports')
                return false;
            const resolvedPath = edgeResolvedPath(edge);
            return resolvedPath ? changedSet.has(resolvedPath) : false;
        });
    }
    const directConsumerMap = new Map();
    for (const edge of relevantEdges) {
        const sourcePath = edgeSourcePath(edge);
        const resolvedPath = edgeResolvedPath(edge);
        if (!sourcePath || !resolvedPath || changedSet.has(sourcePath))
            continue;
        const authorityClass = authorityClassForEdge(edge);
        const entry = directConsumerMap.get(sourcePath) ?? {
            edgeCount: 0,
            imports: new Set(),
            authorityClass,
        };
        entry.edgeCount += 1;
        entry.imports.add(resolvedPath);
        directConsumerMap.set(sourcePath, entry);
    }
    const directConsumers = [...directConsumerMap.entries()]
        .map(([path, entry]) => ({
        path,
        role: (0, repo_brain_impact_1.classifyImpactFileRole)(path),
        edgeCount: entry.edgeCount,
        imports: [...entry.imports].sort().slice(0, 4),
        authorityClass: entry.authorityClass,
        label: impactLabelForAuthority(entry.authorityClass),
        transitive: false,
    }))
        .sort((a, b) => b.edgeCount - a.edgeCount || a.path.localeCompare(b.path))
        .slice(0, MAX_CONSUMERS);
    let transitiveDepths;
    if (impactQueryPath === 'sqlite_bounded' && storeSelection.store instanceof brain_1.SqliteRepositoryGraphStore) {
        transitiveDepths = new Map();
        let frontier = [...changedSet];
        for (let depth = 1; depth <= MAX_TRANSITIVE_DEPTH; depth += 1) {
            const nextFrontier = [];
            for (const seed of frontier) {
                const edges = storeSelection.store.queryImportEdgesForResolvedPaths(input.repoRoot, [seed]);
                for (const edge of edges) {
                    const sourcePath = edgeSourcePath(edge);
                    if (!sourcePath || changedSet.has(sourcePath))
                        continue;
                    if (!transitiveDepths.has(sourcePath)) {
                        transitiveDepths.set(sourcePath, depth);
                        nextFrontier.push(sourcePath);
                    }
                }
            }
            frontier = nextFrontier;
            if (frontier.length === 0)
                break;
        }
    }
    else {
        const adjacency = buildImportAdjacency(graph);
        transitiveDepths = collectTransitiveConsumers(changedSet, adjacency, changedSet);
    }
    for (const direct of directConsumers)
        transitiveDepths.delete(direct.path);
    const transitiveConsumers = [...transitiveDepths.entries()]
        .map(([path, depth]) => ({
        path,
        role: (0, repo_brain_impact_1.classifyImpactFileRole)(path),
        edgeCount: depth,
        imports: [],
        authorityClass: 'bounded_inference',
        label: 'advisory',
        transitive: true,
    }))
        .sort((a, b) => b.edgeCount - a.edgeCount || a.path.localeCompare(b.path))
        .slice(0, MAX_CONSUMERS);
    const likelyTests = [];
    const advisoryTests = [];
    for (const consumer of directConsumers) {
        if (!isTestPath(consumer.path))
            continue;
        const isPythonTest = consumer.path.toLowerCase().endsWith('.py');
        const hint = {
            path: consumer.path,
            role: consumer.role,
            label: isPythonTest ? 'advisory' : consumer.label,
            authorityClass: isPythonTest ? 'advisory_heuristic' : consumer.authorityClass,
            reasonCodes: isPythonTest
                ? ['python_import_test_adjacency']
                : consumer.label === 'deterministic'
                    ? ['structural_import_to_test']
                    : ['import_test_heuristic'],
            directImport: true,
        };
        if (isPythonTest)
            advisoryTests.push(hint);
        else if (hint.label === 'deterministic')
            likelyTests.push(hint);
        else
            advisoryTests.push(hint);
    }
    for (const [path] of transitiveDepths) {
        if (!isTestPath(path))
            continue;
        if (likelyTests.some((t) => t.path === path) || advisoryTests.some((t) => t.path === path))
            continue;
        advisoryTests.push({
            path,
            role: 'test',
            label: 'advisory',
            authorityClass: 'advisory_heuristic',
            reasonCodes: ['transitive_test_proximity'],
            directImport: false,
        });
    }
    const coverageAuthority = graph.coverageAuthority;
    const limitations = [
        'Graph impact uses structural import edges only; dynamic imports and runtime wiring are not evaluated.',
        'Transitive consumers are capped and labeled advisory.',
        'Python call/reference edges are not emitted; test hints are import-based.',
        ...(impactQueryPath === 'sqlite_bounded'
            ? ['Impact projection loaded import edges from SQLite without full graph materialization.']
            : []),
    ];
    return {
        schemaVersion: exports.REPO_GRAPH_IMPACT_SCHEMA_VERSION,
        surface: 'repository_graph_v2',
        graphPresent: true,
        storageBackend: storeSelection.backend,
        storageBytes,
        // Fail-closed: a graph without coverage-authority metadata (older graph or
        // backfill gap) must never be presented as complete/authoritative.
        impactAuthority: coverageAuthority?.impactAuthority ?? 'not_evaluated_due_to_coverage',
        coverageComplete: coverageAuthority?.coverageComplete ?? false,
        omittedPathPrefixes: coverageAuthority?.omittedPathPrefixes?.slice(0, 12) ?? [],
        changedPaths,
        directConsumers,
        transitiveConsumers,
        likelyTests: likelyTests.slice(0, MAX_TESTS),
        advisoryTests: advisoryTests.slice(0, MAX_TESTS),
        authorityCounts: countAuthorities(relevantEdges),
        limitations,
        notEvaluatedReasons: !coverageAuthority
            ? ['coverage_authority_missing']
            : coverageAuthority.coverageComplete === false
                ? ['partial_graph_coverage']
                : [],
    };
}
function readGraphMetadataOnly(repoRoot) {
    const selection = (0, brain_1.resolveReadStoreSelection)(repoRoot);
    const meta = (0, brain_1.readRepositoryGraphMetadata)(repoRoot);
    const graphPath = selection.backend === 'sqlite'
        ? (0, brain_1.repositoryGraphPath)(repoRoot)
        : (0, brain_1.legacyRepositoryGraphPath)(repoRoot);
    const fileBytes = (0, node_fs_1.existsSync)(graphPath) ? (0, node_fs_1.statSync)(graphPath).size : null;
    return {
        backend: selection.backend,
        bytes: meta?.graphBytes ?? fileBytes,
        freshness: meta?.freshness?.state ?? null,
        impactAuthority: meta?.coverageAuthority?.impactAuthority ?? null,
    };
}
//# sourceMappingURL=repo-graph-impact.js.map