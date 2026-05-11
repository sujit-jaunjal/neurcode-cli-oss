/**
 * Neurcode Workspace Intelligence Layer
 *
 * Provides cross-repo context building for multi-service architectures.
 *
 * Architecture overview:
 *
 *   WorkspaceDefinition (workspace-runtime.ts)
 *     └─ repos: WorkspaceRepository[]      ← topology declaration
 *
 *   CrossRepoGraph (cross-repo-graph.ts)
 *     └─ edges: CrossRepoEdge[]            ← detected coupling (code-level)
 *        via: http-client | grpc-client | event-publish | event-subscribe
 *             | shared-contract | env-service-url | openapi-client | db-shared-schema
 *        confidence: high | medium | low
 *
 *   FederatedContextPackage (federated-context.ts)
 *     └─ affectedDownstreamRepos[]         ← repos that call the changed files
 *     └─ relevantUpstreamRepos[]           ← repos being called by changed code
 *     └─ federatedBlindSpots[]             ← coupling invisible to code scanning
 *     └─ summary.requiresCoordinatedDeploy ← true = must deploy together
 *
 * Usage:
 *   import { buildFederatedContext } from '@neurcode-ai/cli/workspace';
 *
 *   const context = buildFederatedContext({
 *     workspaceName: 'platform',
 *     repos: workspaceDefinition.repositories,
 *     primaryRepoName: 'auth-service',
 *     changedFiles: ['src/auth/jwt.service.ts'],
 *     brainMaps: { 'auth-service': authBrain, 'billing-service': billingBrain },
 *   });
 *
 *   console.log(formatFederatedContextSummary(context));
 */
export { buildCrossRepoGraph, getDownstreamRepos, getEdgesForFile, getEdgesPointingToFile, getUpstreamRepos, type CrossRepoBuildOptions, type CrossRepoEdge, type CrossRepoEdgeConfidence, type CrossRepoEdgeVia, type CrossRepoGraph, } from './cross-repo-graph';
export { buildFederatedContext, formatFederatedContextSummary, type AffectedRepoContext, type FederatedBlindSpot, type FederatedContextBuildInput, type FederatedContextPackage, type FederatedExpansionBoundary, } from './federated-context';
//# sourceMappingURL=index.d.ts.map