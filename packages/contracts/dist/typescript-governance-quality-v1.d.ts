export declare const REPOSITORY_CONTEXT_PACKAGE_SCHEMA_VERSION: "neurcode.repository-context-package.v1";
export declare const GOVERNANCE_QUALITY_SCHEMA_VERSION: "neurcode.governance-quality.v1";
export declare const GOVERNANCE_RECONSTRUCTION_SCHEMA_VERSION: "neurcode.governance-reconstruction.v1";
export type TypeScriptExcellenceLanguage = 'typescript' | 'javascript';
export type PartialQualityLanguage = 'python';
export type RepositoryContextStatus = 'ready' | 'bounded_discovery_required' | 'not_evaluated';
export type RepositoryContextRelationship = 'imports' | 'references' | 'calls' | 'tests' | 'owns' | 'belongs_to_package' | 'belongs_to_service' | 'crosses_boundary' | 'generated_from';
export type RepositoryContextAuthority = 'deterministic_exact' | 'deterministic_structural' | 'bounded_inference' | 'advisory_heuristic' | 'not_evaluated' | 'unsupported';
export interface RepositoryContextFile {
    path: string;
    language: string | null;
    module: string | null;
    package: string | null;
    service: string | null;
    generated: boolean;
    sensitiveKinds: string[];
    owners: string[];
    score: number;
    reasonCodes: string[];
    roles: Array<'seed' | 'dependency' | 'consumer' | 'test' | 'owner_boundary' | 'sensitive_boundary' | 'support'>;
}
export interface RepositoryContextSymbol {
    id: string;
    name: string;
    kind: string;
    filePath: string;
    exported: boolean;
    parserId: string | null;
    parserVersion: string | null;
    parserDepth: string;
}
export interface RepositoryContextRelationshipFact {
    id: string;
    type: RepositoryContextRelationship;
    fromPath: string;
    toPath: string;
    fromSymbol: string | null;
    toSymbol: string | null;
    authority: RepositoryContextAuthority;
    enforcementEligible: boolean;
    parserProvenance: string;
    reasonCodes: string[];
}
/**
 * Source-free planning input derived only from the canonical Repository Graph
 * V2. It intentionally contains identifiers, paths, hashes and structural
 * facts, but never source, diffs, prompts, chat, or file bodies.
 */
export interface RepositoryContextPackage {
    schemaVersion: typeof REPOSITORY_CONTEXT_PACKAGE_SCHEMA_VERSION;
    packageId: string;
    createdAt: string;
    status: RepositoryContextStatus;
    repository: {
        repositoryId: string;
        graphId: string;
        graphSchemaVersion: string;
        graphGeneration: number;
        graphHash: string;
        freshness: string;
        coverageComplete: boolean;
        impactAuthority: string;
    };
    retrieval: {
        algorithm: 'deterministic_graph_retrieval_v1';
        intentFingerprint: string;
        maxFiles: number;
        selectedFiles: number;
        candidateFiles: number;
        truncated: boolean;
        reasonCodes: string[];
    };
    files: RepositoryContextFile[];
    symbols: RepositoryContextSymbol[];
    relationships: RepositoryContextRelationshipFact[];
    coverageGaps: Array<{
        scope: 'repository' | 'path' | 'language' | 'package' | 'service';
        key: string;
        facts: string[];
        reasonCodes: string[];
    }>;
    provenance: {
        provider: 'local_graph_v2';
        modelProvider: null;
        model: null;
        promptFingerprint: null;
        contextFingerprint: string;
    };
    privacy: {
        sourceUploaded: false;
        sourceStored: false;
        diffUploaded: false;
        promptUploaded: false;
        rawContentRetained: false;
    };
}
export type PlanScopeClassification = 'planned' | 'graph_required' | 'legitimate_support' | 'unplanned' | 'not_evaluated';
export interface PlanScopeClassificationRecord {
    path: string;
    classification: PlanScopeClassification;
    authority: RepositoryContextAuthority;
    reasonCodes: string[];
    relatedPlannedPaths: string[];
    /** Graph inference explains scope but never grants write authorization. */
    writeAuthorized: boolean;
}
export interface GovernanceConfusionMatrix {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
}
export interface GovernanceQualityRates {
    precision: number | null;
    recall: number | null;
    specificity: number | null;
    falsePositiveRate: number | null;
    notEvaluatedRate: number | null;
    zeroData: boolean;
}
export interface GovernanceQualityMetrics {
    schemaVersion: typeof GOVERNANCE_QUALITY_SCHEMA_VERSION;
    runId: string;
    organizationId: string;
    repositoryId: string | null;
    corpusVersion: string;
    generatedAt: string;
    planPaths: GovernanceConfusionMatrix;
    deterministicFindings: GovernanceConfusionMatrix;
    rates: {
        plan: GovernanceQualityRates;
        deterministicFindings: GovernanceQualityRates;
    };
    falseDeterministicAllows: number;
    coverageAdjustedRecall: number | null;
    ruleFamilies: Record<string, GovernanceConfusionMatrix>;
    replay: {
        exactReconstruction: number;
        artifactCompleteNotReconstructed: number;
        artifactIncomplete: number;
        reconstructionMismatch: number;
        notEvaluated: number;
    };
    samples: {
        total: number;
        evaluated: number;
        notEvaluated: number;
        syntheticFixtures: number;
        controlledMutations: number;
        historicalPublicChanges: number;
        liveHostRuns: number;
    };
    performance: {
        latencyP50Ms: number | null;
        latencyP95Ms: number | null;
        peakMemoryMb: number | null;
    };
}
export type GovernanceHostProvider = 'codex' | 'cursor' | 'claude_code';
export type GovernanceHostExecutionStatus = 'real' | 'unavailable' | 'cooperative' | 'supervised' | 'shimmed';
export interface GovernanceQualityHostRun {
    schemaVersion: typeof GOVERNANCE_QUALITY_SCHEMA_VERSION;
    runId: string;
    provider: GovernanceHostProvider;
    status: GovernanceHostExecutionStatus;
    includeInRealHostMetrics: boolean;
    commandFingerprint: string | null;
    handshakeSucceeded: boolean;
    planCaptured: boolean;
    preWriteCheckInvoked: boolean;
    bypassDetected: boolean;
    denialDelivered: boolean;
    exactPathContainmentPassed: boolean | null;
    finishEvidenceComplete: boolean;
    latencyMs: number;
    failureReason: string | null;
}
export type ReconstructionStatus = 'exact_reconstruction' | 'artifact_complete_not_reconstructed' | 'artifact_incomplete' | 'reconstruction_mismatch' | 'not_evaluated';
export interface GovernanceReconstructionResult {
    schemaVersion: typeof GOVERNANCE_RECONSTRUCTION_SCHEMA_VERSION;
    status: ReconstructionStatus;
    artifactComplete: boolean;
    reconstructionAttempted: boolean;
    hashes: {
        engineVersion: string | null;
        graphHash: string | null;
        policyHash: string | null;
        planContextHash: string | null;
        inputDiffHash: string | null;
        reconstructedFindingsHash: string | null;
        decisionChecksum: string | null;
    };
    expectedDecisionChecksum: string | null;
    reasonCodes: string[];
}
export declare function calculateGovernanceQualityRates(matrix: GovernanceConfusionMatrix, notEvaluated?: number): GovernanceQualityRates;
export declare function hostRunCountsAsRealEvidence(run: Pick<GovernanceQualityHostRun, 'status' | 'includeInRealHostMetrics'>): boolean;
export declare function evaluateGovernanceReconstruction(input: {
    reconstructionAttempted: boolean;
    expected: GovernanceReconstructionResult['hashes'];
    actual?: GovernanceReconstructionResult['hashes'];
}): GovernanceReconstructionResult;
//# sourceMappingURL=typescript-governance-quality-v1.d.ts.map