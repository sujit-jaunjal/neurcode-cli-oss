export declare const REPOSITORY_TOPOLOGY_SCHEMA_VERSION: "neurcode.repository-topology.v1";
export type TopologyFactKind = 'repository-root' | 'workspace-root' | 'package-root' | 'language' | 'source-root' | 'test-root' | 'documentation' | 'configuration' | 'infrastructure' | 'migration' | 'generated-output' | 'api-contract' | 'schema' | 'owner-boundary' | 'protected-boundary' | 'ignored-output';
export type TopologyEvidenceType = 'tracked-path' | 'manifest' | 'workspace-manifest' | 'codeowners' | 'repository-config' | 'file-classifier' | 'test-adjacency' | 'generated-provenance' | 'brain-graph';
export type TopologyAuthority = 'deterministic' | 'advisory';
export type TopologyConfidence = 'high' | 'medium' | 'low';
export interface RepositoryManifestEvidence {
    path: string;
    content: string | null;
}
export interface GeneratedProvenanceEvidence {
    outputPath: string;
    sourcePath?: string | null;
    command?: string | null;
    evidenceType: 'generated-header' | 'gitattributes' | 'manifest' | 'checksum' | 'build-script' | 'generator-config';
}
export interface TopologyBrainFact {
    kind: 'symbol' | 'reference' | 'import' | 'package' | 'test' | 'surface';
    path: string;
    name?: string | null;
    relatedPath?: string | null;
    parserId?: string | null;
    parserVersion?: string | null;
    parserDepth?: string;
    authority?: 'deterministic_exact' | 'deterministic_structural' | 'bounded_inference' | 'advisory_heuristic' | 'not_evaluated' | 'unsupported';
    enforcementEligible?: boolean;
    reasonCodes?: string[];
}
export interface RepositoryTopologyFact {
    id: string;
    kind: TopologyFactKind;
    path: string;
    glob: string;
    language?: string;
    packageRoot?: string;
    owners?: string[];
    details?: {
        sourceOfTruth?: string;
        regenerationCommand?: string;
        directEdit?: 'warn' | 'block';
        checksumExpected?: boolean;
        reviewerRequired?: boolean;
    };
    evidence: {
        type: TopologyEvidenceType;
        authority: TopologyAuthority;
        confidence: TopologyConfidence;
        sourceHash: string;
        freshness: 'current';
        reason: string;
    };
}
export interface RepositoryTopologyRelationship {
    id: string;
    kind: 'source-to-test' | 'generated-from' | 'package-contains' | 'brain-related';
    from: string;
    to: string;
    evidenceType: TopologyEvidenceType;
    confidence: TopologyConfidence;
    sourceHash: string;
    sourceLanguage?: string;
    parserId?: string;
    parserDepth?: string;
    inferredFromNaming?: boolean;
    directEvidence?: boolean;
    relationshipProvenance?: string;
}
export interface RepositoryTopologyArtifact {
    schemaVersion: typeof REPOSITORY_TOPOLOGY_SCHEMA_VERSION;
    artifactHash: string;
    trackedFileCount: number;
    trackedPathHash: string;
    compiledAt: string;
    facts: RepositoryTopologyFact[];
    relationships: RepositoryTopologyRelationship[];
    manifests: Array<{
        path: string;
        root: string;
        contentHash: string | null;
    }>;
    brain: {
        participated: boolean;
        freshness: string | null;
        factCount: number;
        facts: TopologyBrainFact[];
        reason: string;
    };
    limitations: string[];
    privacy: {
        sourceIncluded: false;
        sourceUploaded: false;
        promptIncluded: false;
        pathsIncluded: true;
    };
    /** Present when this is a session-bounded projection of an immutable profile topology. */
    projection?: {
        bounded: true;
        sourceArtifactHash: string;
        selectedFacts: number;
        totalFacts: number | null;
        selectedRelationships: number;
        totalRelationships: number | null;
        reason: 'session_relevant_projection' | 'profile_generation_reference';
    };
}
export interface CompileRepositoryTopologyInput {
    paths: string[];
    manifests?: RepositoryManifestEvidence[];
    codeownersContent?: string | null;
    protectedGlobs?: string[];
    generatedEvidence?: GeneratedProvenanceEvidence[];
    brain?: {
        freshness: string | null;
        facts: TopologyBrainFact[];
    } | null;
    compiledAt?: string;
}
export declare function compileRepositoryTopology(input: CompileRepositoryTopologyInput): RepositoryTopologyArtifact;
export declare function topologyFacts(topology: RepositoryTopologyArtifact | null | undefined, kinds: TopologyFactKind[], options?: {
    deterministicOnly?: boolean;
}): RepositoryTopologyFact[];
/**
 * Materialize only session-relevant topology facts. The complete authority stays
 * in the immutable Brain/profile generation identified by sourceArtifactHash.
 * Projection limits never change repository coverage denominators.
 */
export declare function projectRepositoryTopologyForSession(topology: RepositoryTopologyArtifact | null | undefined, relevantGlobs: string[], limits?: {
    facts?: number;
    relationships?: number;
    brainFacts?: number;
}): RepositoryTopologyArtifact | undefined;
export declare function topologyHasPath(topology: RepositoryTopologyArtifact | null | undefined, pathOrGlob: string): boolean;
export declare function topologySupportGlobs(topology: RepositoryTopologyArtifact | null | undefined, packageRoots?: string[], kinds?: TopologyFactKind[]): string[];
export declare function topologyPackageRootsForPaths(topology: RepositoryTopologyArtifact | null | undefined, paths: string[]): string[];
export declare function topologyGlobsForIntent(topology: RepositoryTopologyArtifact | null | undefined, input: {
    terms: string[];
    explicitPaths?: string[];
    includeSupport?: boolean;
}): Array<{
    glob: string;
    factId: string;
    confidence: TopologyConfidence;
    authority: TopologyAuthority;
    reason: string;
}>;
//# sourceMappingURL=repository-topology.d.ts.map