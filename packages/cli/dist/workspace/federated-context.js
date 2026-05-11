"use strict";
/**
 * Federated Context Builder
 *
 * Answers the question: "When a developer changes files in repo-A, what is the
 * complete blast radius across ALL repos in the workspace?"
 *
 * This is the enterprise multi-repo answer that single-repo context engines cannot
 * provide. The federated context:
 *
 *   1. Builds the PRIMARY context from the repo where changes are occurring
 *      (full depth — constraints, advisory, uncertainty)
 *
 *   2. Resolves SECONDARY context for every repo transitively affected
 *      via cross-repo edges (lighter weight — impacted files + why)
 *
 *   3. Returns BLIND SPOTS — coupling that cannot be detected structurally
 *      (config coupling, runtime service discovery, infra-level routing)
 *
 * The output is deterministic: same changed files + same workspace topology
 * + same cross-repo graph → identical FederatedContextPackage.
 *
 * Design constraint: this layer is ADDITIVE. It never replaces the primary
 * single-repo context engine. It extends it with cross-repo intelligence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFederatedContext = buildFederatedContext;
exports.formatFederatedContextSummary = formatFederatedContextSummary;
const cross_repo_graph_1 = require("./cross-repo-graph");
/** Hard ceilings for cross-repo expansion — deterministic caps, never silent. */
const MAX_FEDERATED_DOWNSTREAM_REPOS = 24;
const MAX_FEDERATED_UPSTREAM_REPOS = 24;
const MAX_FEDERATED_TOTAL_EDGES = 400;
/**
 * Build the federated context package for a multi-repo workspace.
 *
 * This is the core function that answers: "What is the blast radius
 * of this change across the entire service mesh?"
 */
function buildFederatedContext(input) {
    const { workspaceName, repos, primaryRepoName, changedFiles, brainMaps = {}, } = input;
    const truncationReasons = [];
    const changedFilesSorted = [...changedFiles].sort((a, b) => a.localeCompare(b));
    // Step 1: Build the cross-repo graph (or use pre-built)
    const crossRepoGraph = (0, cross_repo_graph_1.buildCrossRepoGraph)({ repos, brainMaps });
    // Step 2: Find all edges FROM changed files in the primary repo
    //         These edges tell us: "this file couples to another repo"
    const allEdgesFromChanges = [];
    for (const changedFile of changedFilesSorted) {
        const edges = (0, cross_repo_graph_1.getEdgesForFile)(crossRepoGraph, primaryRepoName, changedFile);
        allEdgesFromChanges.push(...edges);
    }
    // Step 3: Identify all edges pointing TO the primary repo's changed files
    //         These tell us: "another repo imports THIS file we just changed"
    const inboundEdgesFromChanges = [];
    for (const changedFile of changedFilesSorted) {
        const edges = (0, cross_repo_graph_1.getEdgesPointingToFile)(crossRepoGraph, primaryRepoName, changedFile);
        inboundEdgesFromChanges.push(...edges);
    }
    const combinedEdges = [...allEdgesFromChanges, ...inboundEdgesFromChanges];
    if (combinedEdges.length > MAX_FEDERATED_TOTAL_EDGES) {
        truncationReasons.push(`total cross-repo edges capped at ${MAX_FEDERATED_TOTAL_EDGES} (had ${combinedEdges.length})`);
    }
    // Step 4: Resolve downstream repos — repos that DEPEND ON the primary repo
    //         When the primary repo's API/contract changes, these are at risk
    const downstreamRepoNames = (0, cross_repo_graph_1.getDownstreamRepos)(crossRepoGraph, primaryRepoName);
    const affectedDownstreamRepos = downstreamRepoNames
        .map((repoName) => {
        const repoConfig = repos.find((r) => r.name === repoName);
        if (!repoConfig)
            return null;
        const relevantEdges = inboundEdgesFromChanges
            .filter((e) => e.fromRepo === repoName)
            .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence));
        // Find file-level affected files in this downstream repo
        const affectedFiles = resolveAffectedFilesInRepo(repoConfig, relevantEdges, brainMaps[repoName] ?? null);
        const riskLevel = deriveRiskLevel(relevantEdges);
        const requiresCoordinatedDeploy = relevantEdges.some((e) => e.confidence === 'high' &&
            ['shared-contract', 'grpc-client', 'openapi-client'].includes(e.via));
        return {
            repoName,
            repoRoot: repoConfig.rootPath,
            affectedFiles,
            couplingEdges: relevantEdges,
            riskLevel,
            requiresCoordinatedDeploy,
        };
    })
        .filter((r) => r !== null);
    // Step 5: Resolve upstream repos — repos that the primary repo calls
    //         When changed files touch those call sites, upstream context matters
    const upstreamRepoNames = (0, cross_repo_graph_1.getUpstreamRepos)(crossRepoGraph, primaryRepoName);
    const relevantUpstreamRepos = upstreamRepoNames
        .filter((repoName) => !repoName.startsWith('external:'))
        .map((repoName) => {
        const repoConfig = repos.find((r) => r.name === repoName);
        if (!repoConfig)
            return null;
        const relevantEdges = allEdgesFromChanges
            .filter((e) => e.toRepo === repoName)
            .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence));
        if (relevantEdges.length === 0)
            return null; // upstream but no edge from changed files
        const affectedFiles = resolveAffectedFilesInRepo(repoConfig, relevantEdges, brainMaps[repoName] ?? null);
        const riskLevel = deriveRiskLevel(relevantEdges);
        const requiresCoordinatedDeploy = relevantEdges.some((e) => e.confidence === 'high' &&
            ['shared-contract', 'grpc-client', 'openapi-client'].includes(e.via));
        return {
            repoName,
            repoRoot: repoConfig.rootPath,
            affectedFiles,
            couplingEdges: relevantEdges,
            riskLevel,
            requiresCoordinatedDeploy,
        };
    })
        .filter((r) => r !== null);
    // Step 6: Compute federated blindspots
    const federatedBlindSpots = computeFederatedBlindSpots(repos, primaryRepoName, changedFilesSorted, crossRepoGraph);
    let downstreamExport = affectedDownstreamRepos;
    if (downstreamExport.length > MAX_FEDERATED_DOWNSTREAM_REPOS) {
        truncationReasons.push(`downstream repos capped at ${MAX_FEDERATED_DOWNSTREAM_REPOS} (had ${downstreamExport.length})`);
        downstreamExport = downstreamExport
            .slice()
            .sort((a, b) => a.repoName.localeCompare(b.repoName))
            .slice(0, MAX_FEDERATED_DOWNSTREAM_REPOS);
    }
    let upstreamExport = relevantUpstreamRepos;
    if (upstreamExport.length > MAX_FEDERATED_UPSTREAM_REPOS) {
        truncationReasons.push(`upstream repos capped at ${MAX_FEDERATED_UPSTREAM_REPOS} (had ${upstreamExport.length})`);
        upstreamExport = upstreamExport
            .slice()
            .sort((a, b) => a.repoName.localeCompare(b.repoName))
            .slice(0, MAX_FEDERATED_UPSTREAM_REPOS);
    }
    const edgeTotal = Math.min(combinedEdges.length, MAX_FEDERATED_TOTAL_EDGES);
    const coordinatedExport = [
        ...downstreamExport.filter((r) => r.requiresCoordinatedDeploy).map((r) => r.repoName),
        ...upstreamExport.filter((r) => r.requiresCoordinatedDeploy).map((r) => r.repoName),
    ];
    const summary = {
        totalCrossRepoEdgesFromChangedFiles: edgeTotal,
        downstreamRepoCount: downstreamExport.length,
        upstreamRepoCount: upstreamExport.length,
        highConfidenceEdgeCount: combinedEdges
            .filter((e) => e.confidence === 'high')
            .slice(0, MAX_FEDERATED_TOTAL_EDGES)
            .length,
        requiresCoordinatedDeploy: coordinatedExport.length > 0,
        coordinatedDeployRepos: [...new Set(coordinatedExport)].sort(),
    };
    const federationBoundary = {
        maxCrossRepoDepth: 1,
        maxDownstreamReposIncluded: MAX_FEDERATED_DOWNSTREAM_REPOS,
        maxUpstreamReposIncluded: MAX_FEDERATED_UPSTREAM_REPOS,
        maxTotalEdges: MAX_FEDERATED_TOTAL_EDGES,
        traversalOrdering: 'deterministic-alpha',
        truncated: truncationReasons.length > 0,
        truncationReasons,
    };
    return {
        generatedAt: new Date().toISOString(),
        workspaceName,
        primaryRepo: primaryRepoName,
        changedFiles: changedFilesSorted,
        crossRepoGraph,
        affectedDownstreamRepos: downstreamExport,
        relevantUpstreamRepos: upstreamExport,
        federatedBlindSpots,
        summary,
        federationBoundary,
    };
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function confidenceRank(c) {
    return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}
function deriveRiskLevel(edges) {
    if (edges.some((e) => e.confidence === 'high'))
        return 'high';
    if (edges.some((e) => e.confidence === 'medium'))
        return 'medium';
    return 'low';
}
/**
 * Given edges pointing to/from a repo and its brain map,
 * identify specific files in that repo that are likely affected.
 */
function resolveAffectedFilesInRepo(repoConfig, edges, brainMap) {
    const result = [];
    const seen = new Set();
    for (const edge of edges) {
        // If the edge pins a specific file in this repo, include it
        if (edge.toFile && !seen.has(edge.toFile)) {
            seen.add(edge.toFile);
            result.push({
                file: edge.toFile,
                reason: edge.impactSummary,
            });
        }
        // For shared-contract edges, find the defining file in brain map
        if (edge.via === 'shared-contract' && brainMap) {
            const contractKeyword = edge.evidence[0]
                ?.match(/['"]([^'"]+)['"]/)?.[1]
                ?.split('/')
                .pop()
                ?.replace(/-/g, '') ?? '';
            if (contractKeyword) {
                for (const filePath of Object.keys(brainMap.files)) {
                    const norm = filePath.toLowerCase().replace(/[-./]/g, '');
                    if (norm.includes(contractKeyword.toLowerCase()) && !seen.has(filePath)) {
                        seen.add(filePath);
                        result.push({
                            file: filePath,
                            reason: `Shared contract type definition affected by upstream change`,
                        });
                    }
                }
            }
        }
    }
    return result;
}
/**
 * Compute structural blindspots in federated context.
 *
 * These are coupling patterns that exist at infrastructure/config level
 * and cannot be detected by scanning source code.
 */
function computeFederatedBlindSpots(repos, primaryRepoName, changedFiles, graph) {
    const spots = [];
    const allRepoNames = repos.filter((r) => r.name !== primaryRepoName).map((r) => r.name);
    // Blindspot 1: Infrastructure-level service routing
    // API gateways, service meshes (Istio/Envoy), and load balancers route
    // traffic based on config files that are not in source code
    const hasApiRouteChanges = changedFiles.some((f) => /route|controller|handler|endpoint/i.test(f));
    if (hasApiRouteChanges) {
        spots.push({
            description: 'API route changes may affect service mesh routing rules (Istio VirtualServices, ' +
                'Kong routes, nginx upstreams) that are defined in infrastructure repos not scanned here.',
            potentialRepos: allRepoNames,
            structuralGap: 'infra-routing-config',
        });
    }
    // Blindspot 2: Runtime service discovery
    // Services registered in consul/etcd/k8s service registry are resolved at runtime.
    // Code scanning cannot see this registration.
    const detectedEnvServiceUrls = graph.edges.filter((e) => e.fromRepo === primaryRepoName && e.via === 'env-service-url');
    if (detectedEnvServiceUrls.length > 0) {
        spots.push({
            description: 'Service URLs resolved via environment variables at runtime — the actual target ' +
                'service depends on deployment configuration (Kubernetes ConfigMaps, Vault, ' +
                'cloud parameter stores) not visible to static analysis.',
            potentialRepos: allRepoNames,
            structuralGap: 'runtime-service-discovery',
        });
    }
    // Blindspot 3: Sidecar proxy / service mesh config
    const hasAuthChanges = changedFiles.some((f) => /auth|jwt|token|session|rbac|permission/i.test(f));
    if (hasAuthChanges) {
        spots.push({
            description: 'Authentication changes may affect sidecar proxy config (Envoy JWT filters, ' +
                'Istio AuthorizationPolicies) applied at the mesh level across ALL services ' +
                'without code-level imports.',
            potentialRepos: allRepoNames,
            structuralGap: 'sidecar-proxy-config',
        });
    }
    // Blindspot 4: Feature flag routing
    // Feature flags can route traffic to different service versions at runtime
    const hasFeatureFlagChanges = changedFiles.some((f) => /feature|flag|experiment|variant|rollout|toggle/i.test(f));
    if (hasFeatureFlagChanges) {
        spots.push({
            description: 'Feature flag changes may affect runtime traffic routing across services ' +
                '(LaunchDarkly, Unleash, custom flag evaluators). The set of affected services ' +
                'depends on flag evaluation trees not visible in source code.',
            potentialRepos: allRepoNames,
            structuralGap: 'feature-flag-routing',
        });
    }
    // Blindspot 5: Shared DB state (services sharing a database)
    const hasDbChanges = changedFiles.some((f) => /migration|schema|entity|model|repository|prisma/i.test(f));
    if (hasDbChanges) {
        const dbEdgeRepos = graph.edges
            .filter((e) => e.fromRepo === primaryRepoName && e.via === 'db-shared-schema')
            .map((e) => e.toRepo);
        spots.push({
            description: 'Database schema/migration changes may affect other services that share the ' +
                'same database. Without explicit db-shared-schema edges detected in code, ' +
                'the full set of affected services cannot be determined statically.',
            potentialRepos: dbEdgeRepos.length > 0 ? dbEdgeRepos : allRepoNames,
            structuralGap: 'db-shared-state',
        });
    }
    // Blindspot 6: Compiled proto drift
    const hasProtoChanges = changedFiles.some((f) => /\.proto$|proto\//i.test(f));
    if (hasProtoChanges) {
        spots.push({
            description: 'Proto schema changes require regenerating clients in ALL consuming services. ' +
                'Services that import generated stubs from a registry (npm, artifact store) ' +
                'may not have a code-level import that traces back to this proto file.',
            potentialRepos: allRepoNames,
            structuralGap: 'compiled-proto-drift',
        });
    }
    return spots;
}
// ── Formatting Helpers (for CLI / dashboard rendering) ────────────────────────
function formatFederatedContextSummary(pkg) {
    const lines = [];
    lines.push(`Federated Context: ${pkg.workspaceName}`);
    lines.push(`Primary repo: ${pkg.primaryRepo}`);
    lines.push(`Changed files: ${pkg.changedFiles.length}`);
    lines.push('');
    if (pkg.summary.requiresCoordinatedDeploy) {
        lines.push(`⚠️  Coordinated deploy required: ${pkg.summary.coordinatedDeployRepos.join(', ')}`);
        lines.push('');
    }
    if (pkg.affectedDownstreamRepos.length > 0) {
        lines.push(`Downstream repos affected (${pkg.affectedDownstreamRepos.length}):`);
        for (const repo of pkg.affectedDownstreamRepos) {
            const risk = repo.riskLevel === 'high' ? '🔴' : repo.riskLevel === 'medium' ? '🟡' : '🟢';
            const coordFlag = repo.requiresCoordinatedDeploy ? ' [coordinated-deploy]' : '';
            lines.push(`  ${risk} ${repo.repoName}${coordFlag}`);
            for (const edge of repo.couplingEdges.slice(0, 2)) {
                lines.push(`     via ${edge.via} (${edge.confidence}) — ${edge.impactSummary}`);
            }
        }
        lines.push('');
    }
    if (pkg.relevantUpstreamRepos.length > 0) {
        lines.push(`Upstream repos in scope (${pkg.relevantUpstreamRepos.length}):`);
        for (const repo of pkg.relevantUpstreamRepos) {
            const risk = repo.riskLevel === 'high' ? '🔴' : repo.riskLevel === 'medium' ? '🟡' : '🟢';
            lines.push(`  ${risk} ${repo.repoName}`);
        }
        lines.push('');
    }
    if (pkg.federatedBlindSpots.length > 0) {
        lines.push(`Structural blindspots (${pkg.federatedBlindSpots.length}):`);
        for (const spot of pkg.federatedBlindSpots) {
            lines.push(`  ⚡ [${spot.structuralGap}] ${spot.description.slice(0, 120)}...`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=federated-context.js.map