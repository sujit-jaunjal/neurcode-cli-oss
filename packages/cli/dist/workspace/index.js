"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatFederatedContextSummary = exports.buildFederatedContext = exports.getUpstreamRepos = exports.getEdgesPointingToFile = exports.getEdgesForFile = exports.getDownstreamRepos = exports.buildCrossRepoGraph = void 0;
var cross_repo_graph_1 = require("./cross-repo-graph");
Object.defineProperty(exports, "buildCrossRepoGraph", { enumerable: true, get: function () { return cross_repo_graph_1.buildCrossRepoGraph; } });
Object.defineProperty(exports, "getDownstreamRepos", { enumerable: true, get: function () { return cross_repo_graph_1.getDownstreamRepos; } });
Object.defineProperty(exports, "getEdgesForFile", { enumerable: true, get: function () { return cross_repo_graph_1.getEdgesForFile; } });
Object.defineProperty(exports, "getEdgesPointingToFile", { enumerable: true, get: function () { return cross_repo_graph_1.getEdgesPointingToFile; } });
Object.defineProperty(exports, "getUpstreamRepos", { enumerable: true, get: function () { return cross_repo_graph_1.getUpstreamRepos; } });
var federated_context_1 = require("./federated-context");
Object.defineProperty(exports, "buildFederatedContext", { enumerable: true, get: function () { return federated_context_1.buildFederatedContext; } });
Object.defineProperty(exports, "formatFederatedContextSummary", { enumerable: true, get: function () { return federated_context_1.formatFederatedContextSummary; } });
//# sourceMappingURL=index.js.map