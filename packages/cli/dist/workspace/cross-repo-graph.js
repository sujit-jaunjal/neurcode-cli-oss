"use strict";
/**
 * Cross-Repo Dependency Graph
 *
 * Detects coupling between repositories that is INVISIBLE to single-repo graph analysis.
 * This is the key gap for microservice architectures where:
 *   - Service A calls Service B over HTTP/gRPC
 *   - Service C publishes Kafka events that Service D consumes
 *   - All services share a contract package (@company/shared-types)
 *   - Environment variables encode service discovery (AUTH_SERVICE_URL)
 *
 * Each detected edge has:
 *   - A `via` classification (how the coupling manifests)
 *   - A `confidence` level (high = structural proof, low = pattern heuristic)
 *   - `evidence` lines that prove the coupling exists
 *
 * The graph is deterministic: same inputs → identical edges, same ordering.
 * All regex patterns are pre-compiled and stateless.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCrossRepoGraph = buildCrossRepoGraph;
exports.getDownstreamRepos = getDownstreamRepos;
exports.getUpstreamRepos = getUpstreamRepos;
exports.getEdgesForFile = getEdgesForFile;
exports.getEdgesPointingToFile = getEdgesPointingToFile;
const fs_1 = require("fs");
const glob_1 = require("glob");
const path_1 = require("path");
// ── Detection Patterns ───────────────────────────────────────────────────────
//
// Each pattern set targets a specific coupling mechanism.
// Patterns are conservative: we prefer false-negatives over false-positives
// because an incorrect cross-repo edge is worse than a missed one.
/** HTTP client calls: axios, fetch, got, node-fetch, ky */
const HTTP_CLIENT_PATTERNS = [
    /(?:axios|http|got|ky)\s*\.\s*(?:get|post|put|patch|delete)\s*\(\s*[`'"](https?:\/\/[^`'"]+)[`'"]/gi,
    /(?:baseURL|baseUrl|BASE_URL)\s*[:=]\s*[`'"]([^`'"]+)[`'"]/gi,
    /new\s+(?:HttpService|HttpClient|ApiClient|RestClient)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi,
    /fetch\s*\(\s*[`'"](https?:\/\/[^`'"]+)[`'"]/gi,
];
/** gRPC client patterns */
const GRPC_CLIENT_PATTERNS = [
    /new\s+(\w+(?:Service|Client))\s*\(\s*[`'"]([^`'"]+:\d+)[`'"]/gi,
    /(?:@GrpcClient|@Client)\s*\(\s*\{[^}]*service\s*:\s*['"](\w+)['"]/gi,
    /loadPackageDefinition.*?\.(\w+)\s*\.\s*(\w+Service)/gs,
];
/** Event publish patterns: Kafka, RabbitMQ, SQS, BullMQ, EventEmitter */
const EVENT_PUBLISH_PATTERNS = [
    /(?:producer|publisher|client)\s*\.\s*send\s*\(\s*[`'"]([^`'"]+)[`'"]/gi,
    /(?:emit|publish)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi,
    /@EventPattern\s*\(\s*[`'"]([^`'"]+)[`'"]/gi, // NestJS emit
    /(?:channel|exchange|topic|queue)\s*[:=]\s*[`'"]([^`'"]+)[`'"]/gi,
    /\.sendToQueue\s*\(\s*[`'"]([^`'"]+)[`'"]/gi,
    /SNS\.publish.*?TopicArn[^`'"]*[`'"]([^`'"]+)[`'"]/gi,
];
/** Event subscribe/consume patterns */
const EVENT_SUBSCRIBE_PATTERNS = [
    /@MessagePattern\s*\(\s*[`'"]([^`'"]+)[`'"]/gi,
    /\.subscribe\s*\(\s*[`'"]([^`'"]+)[`'"]/gi,
    /consumer\.run.*?eachMessage/gs,
    /(?:on|addListener)\s*\(\s*[`'"]([^`'".]+\.[^`'"]+)[`'"]/gi, // namespaced events only
    /queue\.process\s*\(\s*[`'"]([^`'"]+)[`'"]/gi,
];
/** Shared contracts: @company/*, internal scoped packages */
const SHARED_CONTRACT_PATTERNS = [
    /from\s+['"](@[a-z0-9-]+\/(?:shared|contracts?|types?|proto|common|api)[^'"]*)['"]/gi,
    /require\s*\(\s*['"](@[a-z0-9-]+\/(?:shared|contracts?|types?|proto|common|api)[^'"]*)['"]\s*\)/gi,
];
/** Service discovery via environment variables */
const ENV_SERVICE_URL_PATTERNS = [
    /process\.env\.([A-Z][A-Z0-9_]*(?:SERVICE|SVC|API|HOST|URL|ENDPOINT)[A-Z0-9_]*)/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]*(?:SERVICE|SVC|API|HOST|URL|ENDPOINT)[A-Z0-9_]*)['"]\]/g,
];
/** OpenAPI/Swagger generated clients */
const OPENAPI_CLIENT_PATTERNS = [
    /from\s+['"](?:\.\.?\/)*(?:generated?|gen|client|api-client|openapi)[^'"]*['"]/gi,
    /from\s+['"](@[a-z0-9-]+\/(?:api-client|client|generated)[^'"]*)['"]/gi,
];
// ── Service Name Resolution ──────────────────────────────────────────────────
/**
 * Given a service name extracted from code (e.g. "auth-service", "AUTH_SERVICE_URL"),
 * tries to match it against known repos in the workspace.
 *
 * Returns the matched repo name, or null if no match found.
 */
function resolveServiceToRepo(serviceName, repos, currentRepoName) {
    if (!serviceName)
        return null;
    const normalized = serviceName
        .toLowerCase()
        .replace(/_url$|_host$|_endpoint$|_api$|_svc$|_service$/, '')
        .replace(/_/g, '-');
    for (const repo of repos) {
        if (repo.name === currentRepoName)
            continue; // skip self
        const repoNorm = repo.name.toLowerCase();
        // Direct match
        if (repoNorm === normalized)
            return repo.name;
        // Substring match (e.g., "auth" matches "auth-service")
        if (repoNorm.includes(normalized) || normalized.includes(repoNorm))
            return repo.name;
        // Service array match
        for (const svc of repo.services) {
            const svcNorm = svc.toLowerCase();
            if (svcNorm === normalized || svcNorm.includes(normalized))
                return repo.name;
        }
    }
    return null;
}
function scanFileForCrossRepoSignals(content) {
    const fragments = [];
    function runPatterns(patterns, via, groupIndex = 1) {
        for (const pattern of patterns) {
            const re = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = re.exec(content)) !== null) {
                const targetHint = (match[groupIndex] ?? '').trim();
                if (!targetHint || targetHint.length < 2)
                    continue;
                // Get the line containing this match for evidence
                const matchStart = match.index;
                const lineStart = content.lastIndexOf('\n', matchStart) + 1;
                const lineEnd = content.indexOf('\n', matchStart);
                const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
                fragments.push({ via, targetHint, evidence: line });
            }
        }
    }
    runPatterns(HTTP_CLIENT_PATTERNS, 'http-client', 1);
    runPatterns(GRPC_CLIENT_PATTERNS, 'grpc-client', 1);
    runPatterns(EVENT_PUBLISH_PATTERNS, 'event-publish', 1);
    runPatterns(EVENT_SUBSCRIBE_PATTERNS, 'event-subscribe', 1);
    runPatterns(SHARED_CONTRACT_PATTERNS, 'shared-contract', 1);
    runPatterns(ENV_SERVICE_URL_PATTERNS, 'env-service-url', 1);
    runPatterns(OPENAPI_CLIENT_PATTERNS, 'openapi-client', 1);
    return fragments;
}
// ── HTTP URL → service name extractor ────────────────────────────────────────
function extractServiceNameFromUrl(url) {
    // Remove protocol: http://auth-service:3000/users → auth-service
    const withoutProto = url.replace(/^https?:\/\//, '');
    // Take host part only
    const host = withoutProto.split('/')[0] ?? '';
    // Remove port
    const hostname = host.split(':')[0] ?? '';
    // Remove env var placeholders like ${AUTH_SERVICE}
    const clean = hostname.replace(/\$\{[^}]+\}/, '').replace(/\$[A-Z_]+/, '');
    return clean;
}
// ── Contract File Locator ─────────────────────────────────────────────────────
/**
 * Given a shared contract package name, tries to find the actual file in
 * target repos that defines this contract.
 */
function findContractFileInRepo(packageName, repoBrainMap) {
    if (!repoBrainMap)
        return null;
    // Extract the package basename (e.g., "@company/shared-types" → "shared-types")
    const packageBase = packageName.split('/').pop() ?? '';
    const contractKeywords = packageBase.replace(/-/g, '').toLowerCase();
    for (const filePath of Object.keys(repoBrainMap.files)) {
        const fileNorm = filePath.toLowerCase().replace(/[-./]/g, '');
        if (fileNorm.includes(contractKeywords)) {
            return filePath;
        }
    }
    return null;
}
/**
 * Build the cross-repo dependency graph for a workspace.
 *
 * This function:
 * 1. Scans source files in each repo for cross-service coupling signals
 * 2. Resolves each signal to a target repo using the workspace topology
 * 3. Returns typed, evidence-backed edges with confidence scores
 *
 * Deterministic: same workspace config + same file contents → same graph.
 */
function buildCrossRepoGraph(input) {
    const { repos, brainMaps = {}, options = {} } = input;
    const maxFilesPerRepo = options.maxFilesPerRepo ?? 2000;
    const edges = [];
    let totalFilesScanned = 0;
    for (const repo of repos) {
        if (!repo.enabled)
            continue;
        const repoRoot = repo.rootPath;
        if (!(0, fs_1.existsSync)(repoRoot))
            continue;
        const brainMap = brainMaps[repo.name] ?? null;
        // Collect files to scan: prefer brain map file list (already parsed),
        // fall back to glob scan
        let filesToScan;
        if (brainMap && Object.keys(brainMap.files).length > 0) {
            filesToScan = Object.keys(brainMap.files)
                .map((f) => (0, path_1.join)(repoRoot, f))
                .filter((f) => (0, fs_1.existsSync)(f))
                .slice(0, maxFilesPerRepo);
        }
        else {
            filesToScan = (0, glob_1.globSync)('**/*.{ts,tsx,js,jsx,mjs,py}', {
                cwd: repoRoot,
                ignore: [
                    '**/node_modules/**',
                    '**/dist/**',
                    '**/build/**',
                    '**/*.d.ts',
                    '**/coverage/**',
                ],
                absolute: true,
                follow: options.followSymlinks ?? false,
            }).slice(0, maxFilesPerRepo);
        }
        totalFilesScanned += filesToScan.length;
        for (const absFilePath of filesToScan) {
            let content;
            try {
                content = (0, fs_1.readFileSync)(absFilePath, 'utf-8');
            }
            catch {
                continue;
            }
            const relFilePath = (0, path_1.relative)(repoRoot, absFilePath).replace(/\\/g, '/');
            const fragments = scanFileForCrossRepoSignals(content);
            for (const fragment of fragments) {
                let targetHint = fragment.targetHint;
                let toRepo = null;
                let toFile = null;
                let confidence = 'low';
                switch (fragment.via) {
                    case 'http-client': {
                        const serviceName = extractServiceNameFromUrl(targetHint);
                        toRepo = resolveServiceToRepo(serviceName, repos, repo.name);
                        confidence = toRepo ? 'medium' : 'low';
                        break;
                    }
                    case 'grpc-client': {
                        toRepo = resolveServiceToRepo(targetHint, repos, repo.name);
                        confidence = toRepo ? 'medium' : 'low';
                        break;
                    }
                    case 'shared-contract': {
                        // Try to find which repo owns this package
                        for (const candidateRepo of repos) {
                            if (candidateRepo.name === repo.name)
                                continue;
                            const candidateBrain = brainMaps[candidateRepo.name] ?? null;
                            const contractFile = findContractFileInRepo(targetHint, candidateBrain);
                            if (contractFile) {
                                toRepo = candidateRepo.name;
                                toFile = contractFile;
                                confidence = 'high'; // We found the actual file
                                break;
                            }
                        }
                        // Even without a resolved repo, shared contract imports are high-signal
                        if (!toRepo) {
                            // Mark as external package dependency — unknown repo
                            toRepo = `external:${targetHint.split('/')[0] ?? 'unknown'}`;
                            confidence = 'medium';
                        }
                        break;
                    }
                    case 'env-service-url': {
                        // ENV var like AUTH_SERVICE_URL → try "auth-service" or "auth"
                        toRepo = resolveServiceToRepo(targetHint, repos, repo.name);
                        confidence = toRepo ? 'medium' : 'low';
                        break;
                    }
                    case 'event-publish':
                    case 'event-subscribe': {
                        // Topic names like "user.created", "payment.completed"
                        // Extract the domain prefix (e.g., "user" from "user.created")
                        const topicDomain = targetHint.split('.')[0] ?? targetHint;
                        toRepo = resolveServiceToRepo(topicDomain, repos, repo.name);
                        // Event coupling is medium confidence even when resolved —
                        // we can't prove the other service subscribes without inspecting it
                        confidence = toRepo ? 'medium' : 'low';
                        break;
                    }
                    case 'openapi-client': {
                        // OpenAPI clients are usually generated from another service's API
                        // Try to match path components to known repos
                        const pathParts = targetHint.split('/').filter(Boolean);
                        for (const part of pathParts) {
                            toRepo = resolveServiceToRepo(part, repos, repo.name);
                            if (toRepo) {
                                confidence = 'high'; // Generated client = definitive contract
                                break;
                            }
                        }
                        break;
                    }
                }
                // Only emit an edge if we have a resolved target repo
                if (!toRepo)
                    continue;
                const impactSummary = buildImpactSummary(fragment.via, repo.name, toRepo, targetHint);
                edges.push({
                    fromRepo: repo.name,
                    fromFile: relFilePath,
                    toRepo,
                    toFile,
                    via: fragment.via,
                    confidence,
                    evidence: [fragment.evidence],
                    impactSummary,
                });
            }
        }
    }
    // Deduplicate: merge edges with same fromRepo+fromFile+toRepo+via into one
    // (keeps all evidence lines)
    const deduped = deduplicateEdges(edges);
    // Sort deterministically
    deduped.sort((a, b) => {
        const key = (e) => `${e.fromRepo}:${e.fromFile}:${e.toRepo}:${e.via}`;
        return key(a).localeCompare(key(b));
    });
    const stats = computeStats(deduped, totalFilesScanned);
    return {
        generatedAt: new Date().toISOString(),
        repos: repos.map((r) => r.name),
        edges: deduped,
        stats,
    };
}
// ── Utilities ────────────────────────────────────────────────────────────────
function deduplicateEdges(edges) {
    const seen = new Map();
    for (const edge of edges) {
        const key = `${edge.fromRepo}|${edge.fromFile}|${edge.toRepo}|${edge.via}`;
        const existing = seen.get(key);
        if (!existing) {
            seen.set(key, { ...edge, evidence: [...edge.evidence] });
        }
        else {
            // Merge evidence, prefer higher confidence
            for (const ev of edge.evidence) {
                if (!existing.evidence.includes(ev)) {
                    existing.evidence.push(ev);
                }
            }
            if (edge.confidence === 'high' ||
                (edge.confidence === 'medium' && existing.confidence === 'low')) {
                existing.confidence = edge.confidence;
            }
            if (edge.toFile && !existing.toFile) {
                existing.toFile = edge.toFile;
            }
        }
    }
    return [...seen.values()];
}
function buildImpactSummary(via, fromRepo, toRepo, hint) {
    switch (via) {
        case 'http-client':
            return `${fromRepo} makes HTTP calls to ${toRepo} — API contract changes in ${toRepo} break ${fromRepo}`;
        case 'grpc-client':
            return `${fromRepo} uses gRPC stub from ${toRepo} — proto schema changes are breaking`;
        case 'event-publish':
            return `${fromRepo} publishes "${hint}" events consumed by ${toRepo} — event schema changes are breaking`;
        case 'event-subscribe':
            return `${fromRepo} consumes events from ${toRepo} — upstream schema changes in ${toRepo} propagate here`;
        case 'shared-contract':
            return `${fromRepo} imports shared types from ${toRepo} — any breaking type change cascades to ${fromRepo}`;
        case 'env-service-url':
            return `${fromRepo} resolves ${toRepo} at runtime via env var — deployment config must be coordinated`;
        case 'openapi-client':
            return `${fromRepo} uses generated OpenAPI client for ${toRepo} — API surface changes require client regeneration`;
        case 'db-shared-schema':
            return `${fromRepo} directly queries ${toRepo}'s database — schema migrations in ${toRepo} are immediately breaking`;
    }
}
function computeStats(edges, filesScanned) {
    const byVia = {
        'http-client': 0,
        'grpc-client': 0,
        'event-publish': 0,
        'event-subscribe': 0,
        'shared-contract': 0,
        'env-service-url': 0,
        'openapi-client': 0,
        'db-shared-schema': 0,
    };
    const byConfidence = {
        high: 0,
        medium: 0,
        low: 0,
    };
    for (const edge of edges) {
        byVia[edge.via] = (byVia[edge.via] ?? 0) + 1;
        byConfidence[edge.confidence] = (byConfidence[edge.confidence] ?? 0) + 1;
    }
    return {
        filesScanned,
        edgesDetected: edges.length,
        byVia,
        byConfidence,
    };
}
// ── Subgraph Query Helpers ───────────────────────────────────────────────────
/**
 * Get all repos that are directly affected when a change occurs in `repoName`.
 * Returns repos that import from / depend on `repoName`.
 */
function getDownstreamRepos(graph, repoName) {
    const downstream = new Set();
    for (const edge of graph.edges) {
        // toRepo depends on fromRepo → if fromRepo changes, toRepo is affected
        // Actually: fromRepo calls toRepo, so toRepo's changes affect fromRepo
        // Let's be precise:
        //   fromRepo → toRepo means fromRepo DEPENDS ON toRepo
        //   if toRepo changes, fromRepo might break
        // So "downstream of toRepo" = all fromRepos that call toRepo
        if (edge.toRepo === repoName && !edge.toRepo.startsWith('external:')) {
            downstream.add(edge.fromRepo);
        }
    }
    return [...downstream].sort();
}
/**
 * Get all repos that `repoName` directly depends on (calls/imports).
 */
function getUpstreamRepos(graph, repoName) {
    const upstream = new Set();
    for (const edge of graph.edges) {
        if (edge.fromRepo === repoName && !edge.toRepo.startsWith('external:')) {
            upstream.add(edge.toRepo);
        }
    }
    return [...upstream].sort();
}
/**
 * Get all edges involving a specific file change in a specific repo.
 * Used to find "what cross-repo coupling does this file touch?"
 */
function getEdgesForFile(graph, repoName, filePath) {
    return graph.edges.filter((e) => e.fromRepo === repoName && e.fromFile === filePath);
}
/**
 * Get all edges that point TO a specific file in a repo.
 * Used to find "who depends on this file?"
 */
function getEdgesPointingToFile(graph, repoName, filePath) {
    return graph.edges.filter((e) => e.toRepo === repoName && e.toFile === filePath);
}
//# sourceMappingURL=cross-repo-graph.js.map