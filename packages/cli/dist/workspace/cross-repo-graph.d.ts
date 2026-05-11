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
import type { BrainRepositoryMap } from '@neurcode-ai/core';
import type { WorkspaceRepository } from '../utils/workspace-runtime';
export type CrossRepoEdgeVia = 'http-client' | 'grpc-client' | 'event-publish' | 'event-subscribe' | 'shared-contract' | 'env-service-url' | 'openapi-client' | 'db-shared-schema';
export type CrossRepoEdgeConfidence = 'high' | 'medium' | 'low';
export interface CrossRepoEdge {
    /** Source: repo + file that creates the coupling */
    fromRepo: string;
    fromFile: string;
    /** Target: resolved repo name (from workspace topology) */
    toRepo: string;
    /**
     * toFile is set when we can pin the coupling to a specific file in the target repo
     * (e.g., a shared contract file). Null when we only know the target service.
     */
    toFile: string | null;
    /** Mechanism of the coupling */
    via: CrossRepoEdgeVia;
    /** How confident we are this is a real cross-repo dependency */
    confidence: CrossRepoEdgeConfidence;
    /**
     * The actual code lines that prove this edge exists.
     * Always populated — no evidence → no edge.
     */
    evidence: string[];
    /**
     * Human-readable explanation of what this coupling means for blast radius.
     * Used in context packages and advisory reports.
     */
    impactSummary: string;
}
export interface CrossRepoBuildOptions {
    /**
     * Maximum number of files to scan per repo.
     * Prevents runaway on massive monorepos. Default: 2000.
     */
    maxFilesPerRepo?: number;
    /**
     * Whether to follow symlinks during glob scan. Default: false.
     */
    followSymlinks?: boolean;
}
export interface CrossRepoGraph {
    generatedAt: string;
    repos: string[];
    edges: CrossRepoEdge[];
    stats: {
        filesScanned: number;
        edgesDetected: number;
        byVia: Record<CrossRepoEdgeVia, number>;
        byConfidence: Record<CrossRepoEdgeConfidence, number>;
    };
}
export interface CrossRepoGraphBuilderInput {
    /** All repos in the workspace topology */
    repos: WorkspaceRepository[];
    /**
     * Pre-loaded brain maps keyed by repo name.
     * Optional — if absent for a repo, we fall back to direct file scanning.
     */
    brainMaps?: Record<string, BrainRepositoryMap>;
    options?: CrossRepoBuildOptions;
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
export declare function buildCrossRepoGraph(input: CrossRepoGraphBuilderInput): CrossRepoGraph;
/**
 * Get all repos that are directly affected when a change occurs in `repoName`.
 * Returns repos that import from / depend on `repoName`.
 */
export declare function getDownstreamRepos(graph: CrossRepoGraph, repoName: string): string[];
/**
 * Get all repos that `repoName` directly depends on (calls/imports).
 */
export declare function getUpstreamRepos(graph: CrossRepoGraph, repoName: string): string[];
/**
 * Get all edges involving a specific file change in a specific repo.
 * Used to find "what cross-repo coupling does this file touch?"
 */
export declare function getEdgesForFile(graph: CrossRepoGraph, repoName: string, filePath: string): CrossRepoEdge[];
/**
 * Get all edges that point TO a specific file in a repo.
 * Used to find "who depends on this file?"
 */
export declare function getEdgesPointingToFile(graph: CrossRepoGraph, repoName: string, filePath: string): CrossRepoEdge[];
//# sourceMappingURL=cross-repo-graph.d.ts.map