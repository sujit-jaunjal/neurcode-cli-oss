import type { ParserDepth, RepositoryLanguage } from '@neurcode-ai/contracts';
export type RelationshipAuthorityClass = 'deterministic_exact' | 'deterministic_structural' | 'bounded_inference' | 'advisory_heuristic' | 'not_evaluated' | 'unsupported';
export interface RelationshipAuthorityInput {
    language: RepositoryLanguage | string;
    parserId: string;
    parserDepth: ParserDepth | string;
    resolutionMode?: 'local_symbol' | 'imported_symbol' | 'repository_symbol' | 'ambiguous' | 'unresolved' | string;
    graphCoverageComplete?: boolean;
    pathInCoverage?: boolean;
    ambiguity?: boolean;
    directEvidence?: boolean;
    /** Exact claim path and target are inside the current, non-stale semantic slice. */
    semanticSliceCoverage?: boolean;
    relationshipKind?: 'import' | 'export' | 'declaration' | 'reference' | 'call' | 'test' | 'tested_by' | 'consumer' | string;
    inferredFromNaming?: boolean;
}
export interface RelationshipAuthorityResult {
    class: RelationshipAuthorityClass;
    enforcementEligible: boolean;
    reasonCodes: string[];
    recommendedManualDiscovery?: string | null;
}
export declare function classifyRelationshipAuthority(input: RelationshipAuthorityInput): RelationshipAuthorityResult;
export declare function mapRelationshipAuthorityToEvidenceTier(authority: RelationshipAuthorityClass): 'deterministic' | 'advisory' | 'not_evaluated';
//# sourceMappingURL=relationship-authority.d.ts.map