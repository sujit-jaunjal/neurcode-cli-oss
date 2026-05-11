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
import type { BrainRepositoryMap } from '@neurcode-ai/core';
import type { WorkspaceRepository } from '../utils/workspace-runtime';
import { type CrossRepoEdge, type CrossRepoGraph } from './cross-repo-graph';
export interface FederatedExpansionBoundary {
    maxCrossRepoDepth: 1;
    maxDownstreamReposIncluded: number;
    maxUpstreamReposIncluded: number;
    maxTotalEdges: number;
    traversalOrdering: 'deterministic-alpha';
    truncated: boolean;
    truncationReasons: string[];
}
export interface AffectedRepoContext {
    /** Name of the repo affected by the change in the primary repo */
    repoName: string;
    /** Absolute path to this repo's root */
    repoRoot: string;
    /**
     * Files in this repo that are structurally coupled to the changed files.
     * May be empty if the coupling is at service-boundary level (HTTP/gRPC)
     * rather than file level (shared contracts).
     */
    affectedFiles: Array<{
        file: string;
        reason: string;
    }>;
    /**
     * Cross-repo edges that create this repo's affected status.
     * Sorted by confidence (high first).
     */
    couplingEdges: CrossRepoEdge[];
    /**
     * Risk level for this repo given the primary change.
     * Derived from: edge confidence + number of affected files + edge type.
     */
    riskLevel: 'high' | 'medium' | 'low';
    /**
     * Whether this repo needs a coordinated deploy with the primary repo.
     * True when any high-confidence edge exists (contract change, shared type, gRPC).
     */
    requiresCoordinatedDeploy: boolean;
}
export interface FederatedBlindSpot {
    /** What cannot be seen */
    description: string;
    /** What repos might be affected that we cannot prove */
    potentialRepos: string[];
    /**
     * The structural gap that causes this blindspot.
     * Matches the GraphBlindSpot taxonomy.
     */
    structuralGap: 'runtime-service-discovery' | 'infra-routing-config' | 'sidecar-proxy-config' | 'feature-flag-routing' | 'db-shared-state' | 'third-party-webhook' | 'cdn-cache-invalidation' | 'compiled-proto-drift';
}
export interface FederatedContextPackage {
    generatedAt: string;
    /** Workspace name for display */
    workspaceName: string;
    /** The repo where the change originates */
    primaryRepo: string;
    /** Changed files in the primary repo */
    changedFiles: string[];
    /**
     * Cross-repo graph used to compute this package.
     * Included for auditability — same graph produces same result.
     */
    crossRepoGraph: CrossRepoGraph;
    /**
     * Repos directly affected by changes in the primary repo.
     * These are the repos that CALL or IMPORT FROM the primary repo
     * and whose downstream behavior may change.
     */
    affectedDownstreamRepos: AffectedRepoContext[];
    /**
     * Repos that the primary repo depends on and that may be relevant context.
     * Included when changed files touch code that calls these services.
     */
    relevantUpstreamRepos: AffectedRepoContext[];
    /**
     * Structural blindspots — coupling we cannot detect from code alone.
     * These are advisory-only: the consumer must decide whether to act.
     */
    federatedBlindSpots: FederatedBlindSpot[];
    /**
     * Summary metrics for quick assessment.
     */
    summary: {
        totalCrossRepoEdgesFromChangedFiles: number;
        downstreamRepoCount: number;
        upstreamRepoCount: number;
        highConfidenceEdgeCount: number;
        requiresCoordinatedDeploy: boolean;
        coordinatedDeployRepos: string[];
    };
    /** Provenance for bounded federation — required for replay and reviewer trust. */
    federationBoundary: FederatedExpansionBoundary;
}
export interface FederatedContextBuildInput {
    /** Workspace name */
    workspaceName: string;
    /** All repos in the workspace topology */
    repos: WorkspaceRepository[];
    /** The repo name where development is currently happening */
    primaryRepoName: string;
    /** Files changed in the primary repo (relative paths) */
    changedFiles: string[];
    /**
     * Pre-loaded brain maps keyed by repo name.
     * Optional — improves file-level resolution accuracy.
     */
    brainMaps?: Record<string, BrainRepositoryMap>;
}
/**
 * Build the federated context package for a multi-repo workspace.
 *
 * This is the core function that answers: "What is the blast radius
 * of this change across the entire service mesh?"
 */
export declare function buildFederatedContext(input: FederatedContextBuildInput): FederatedContextPackage;
export declare function formatFederatedContextSummary(pkg: FederatedContextPackage): string;
//# sourceMappingURL=federated-context.d.ts.map