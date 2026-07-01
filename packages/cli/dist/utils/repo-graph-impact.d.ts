/**
 * Repository Graph V2 impact projection — source-free consumers, tests, and authority.
 *
 * Queries the indexed V2 graph (SQLite or portable) without requiring V1 brain rebuild.
 * Merges with legacy V1 impact for owners, sensitive surfaces, and advisories.
 */
import type { RepositoryGraphSnapshot } from '@neurcode-ai/contracts';
import { type ImpactConsumer, type ImpactFileRole, type ImpactLabel } from './repo-brain-impact';
export declare const REPO_GRAPH_IMPACT_SCHEMA_VERSION: "neurcode.repo-graph-impact.v1";
export interface GraphImpactAuthorityCount {
    deterministic_structural: number;
    deterministic_exact: number;
    bounded_inference: number;
    advisory_heuristic: number;
    not_evaluated: number;
    unsupported: number;
}
export interface GraphImpactConsumer extends ImpactConsumer {
    authorityClass: string;
    label: ImpactLabel;
    transitive: boolean;
}
export interface GraphImpactTestHint {
    path: string;
    role: ImpactFileRole;
    label: ImpactLabel;
    authorityClass: string;
    reasonCodes: string[];
    directImport: boolean;
}
export interface GraphImpactProjection {
    schemaVersion: typeof REPO_GRAPH_IMPACT_SCHEMA_VERSION;
    surface: 'repository_graph_v2';
    graphPresent: boolean;
    storageBackend: string;
    storageBytes: number | null;
    impactAuthority: string | null;
    coverageComplete: boolean;
    omittedPathPrefixes: string[];
    changedPaths: string[];
    directConsumers: GraphImpactConsumer[];
    transitiveConsumers: GraphImpactConsumer[];
    likelyTests: GraphImpactTestHint[];
    advisoryTests: GraphImpactTestHint[];
    authorityCounts: GraphImpactAuthorityCount;
    limitations: string[];
    notEvaluatedReasons: string[];
}
export declare function computeGraphImpactProjection(input: {
    repoRoot: string;
    changedPaths: string[];
    graph?: RepositoryGraphSnapshot | null;
}): GraphImpactProjection;
export declare function readGraphMetadataOnly(repoRoot: string): {
    backend: string;
    bytes: number | null;
    freshness: string | null;
    impactAuthority: string | null;
};
//# sourceMappingURL=repo-graph-impact.d.ts.map