export declare const PROGRESSIVE_AUTHORITY_SCHEMA_VERSION: "neurcode.progressive-authority.v1.3";
export declare const SEMANTIC_SLICE_SCHEMA_VERSION: "neurcode.semantic-slice.v1.3";
export type ProgressiveAuthorityState = 'not_started' | 'discovering' | 'structural_indexing' | 'structural_ready' | 'governance_ready' | 'semantic_slice_pending' | 'semantic_slice_ready' | 'background_enrichment' | 'fully_enriched' | 'stale' | 'partial' | 'failed' | 'unavailable';
export type ProgressiveAuthorityCeiling = 'unavailable' | 'credential_and_explicit_path' | 'complete_structural' | 'plan_semantic_slice' | 'repository_semantic';
export type ProgressiveAuthorityRequirement = 'credential_or_explicit_path' | 'complete_structural' | 'semantic_slice' | 'repository_semantic';
export interface ProgressiveAuthorityEvidence {
    schemaVersion: typeof PROGRESSIVE_AUTHORITY_SCHEMA_VERSION;
    state: ProgressiveAuthorityState;
    repositoryFingerprint: string | null;
    graphSchemaVersion: string | null;
    cacheSchemaVersion: number | null;
    graphGeneration: number | null;
    indexedFiles: number;
    eligibleFiles: number;
    structuralCoverage: number;
    semanticCoverage: number;
    relevantPlanCoverage: number | null;
    semanticSliceId: string | null;
    planFingerprint: string | null;
    unsupportedAreas: string[];
    stalenessReason: string | null;
    authorityCeiling: ProgressiveAuthorityCeiling;
    measuredTimingMs: {
        discovery: number | null;
        structuralIndexing: number | null;
        semanticSlice: number | null;
        backgroundEnrichment: number | null;
    };
    measuredAggregateMemoryMb: {
        governanceReadyPeak: number | null;
        semanticSlicePeak: number | null;
        backgroundEnrichmentPeak: number | null;
        measurement: 'sampled_process_tree_rss' | 'sampled_process_rss' | 'unavailable';
    };
    provenance: {
        structuralProvider: string | null;
        semanticProvider: string | null;
        typescriptVersion: string | null;
        sqliteVersion: string | null;
        sourceFree: true;
        clientAsserted: false;
    };
    generatedAt: string;
    reasonCodes: string[];
}
export interface SemanticSliceCoverage {
    schemaVersion: typeof SEMANTIC_SLICE_SCHEMA_VERSION;
    sliceId: string;
    planFingerprint: string;
    repositoryFingerprint: string;
    graphGeneration: number;
    status: 'pending' | 'ready' | 'partial' | 'stale' | 'failed' | 'cancelled';
    scope: 'bounded_plan' | 'repository_wide';
    seedPaths: string[];
    coveredPaths: string[];
    uncoveredPaths: string[];
    relevantPlanCoverage: number;
    repositorySemanticCoverage: number;
    relationshipCount: number;
    configurationFingerprints: string[];
    dependencyFingerprint: string;
    parserId: 'typescript-program-checker';
    parserVersion: string;
    authority: 'deterministic_within_slice' | 'advisory_or_unknown';
    reasonCodes: string[];
    generatedAt: string;
    sourceFree: true;
}
export interface ProgressiveAuthorityDerivationInput {
    repositoryDiscovered?: boolean;
    discoveryInProgress?: boolean;
    structuralIndexing?: boolean;
    structuralComplete?: boolean;
    governanceReady?: boolean;
    semanticSliceRequested?: boolean;
    semanticSliceComplete?: boolean;
    backgroundEnrichment?: boolean;
    fullyEnriched?: boolean;
    stale?: boolean;
    partial?: boolean;
    failed?: boolean;
    unavailable?: boolean;
}
export declare function deriveProgressiveAuthorityState(input: ProgressiveAuthorityDerivationInput): ProgressiveAuthorityState;
export declare function authorityCeilingForState(state: ProgressiveAuthorityState): ProgressiveAuthorityCeiling;
export declare function unavailableProgressiveAuthorityEvidence(reasonCode?: string, generatedAt?: string): ProgressiveAuthorityEvidence;
/**
 * Fail-closed compatibility boundary. Older/malformed payloads never inherit
 * structural or semantic authority merely because they used the word "ready".
 */
export declare function normalizeProgressiveAuthorityEvidence(value: unknown): ProgressiveAuthorityEvidence;
export declare function evaluateProgressiveAuthorityRequirement(input: {
    evidence: ProgressiveAuthorityEvidence;
    requirement: ProgressiveAuthorityRequirement;
}): {
    granted: boolean;
    deterministic: boolean;
    reasonCodes: string[];
};
//# sourceMappingURL=progressive-authority.d.ts.map