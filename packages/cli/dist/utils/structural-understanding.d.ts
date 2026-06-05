import type { DiffFile } from '@neurcode-ai/diff-parser';
import { type GovernanceSession, type RepoGovernanceProfile } from '@neurcode-ai/governance-runtime';
export declare const STRUCTURAL_UNDERSTANDING_SCHEMA_VERSION: "neurcode.structural-understanding.v1";
export declare const CONSEQUENCE_UNDERSTANDING_SCHEMA_VERSION: "neurcode.consequence-understanding.v1";
export type StructuralUnderstandingProvenance = 'git-diff' | 'typescript-compiler' | 'session-plan' | 'codeowners-profile' | 'deterministic-ranking' | 'generated-artifact-heuristic' | 'effect-registry' | 'typescript-checker' | 'inheritance-projection';
export type StructuralSuppressedArtifactReason = 'neurcodeignore' | 'dist_directory' | 'build_directory' | 'out_directory' | 'minified_javascript' | 'bundled_javascript' | 'webpack_bootstrap' | 'webpack_modules' | 'source_map_marker' | 'generated_marker';
export interface StructuralChangedSymbol {
    name: string;
    kind: string;
    file: string;
    action: 'add' | 'modify' | 'delete';
    lineStart: number | null;
    lineEnd: number | null;
    provenance: 'typescript-compiler';
}
export interface StructuralReference {
    targetSymbol: string;
    targetKind: string;
    targetFile: string;
    referencingFile: string;
    referencingSymbol: string | null;
    referencingKind: string | null;
    line: number;
    isTestFile: boolean;
    inChangedFile: boolean;
    provenance: 'typescript-compiler';
}
export interface StructuralImportEdge {
    sourceFile: string;
    sourceLine: number;
    importTarget: string;
    importKind: string;
    language: string;
    provenance: 'git-diff';
}
export interface StructuralSuppressedArtifact {
    path: string;
    reasonCode: StructuralSuppressedArtifactReason;
    provenance: 'generated-artifact-heuristic';
}
export interface StructuralPlanAlignment {
    plannedFiles: string[];
    plannedGlobs: string[];
    plannedFilesTouched: string[];
    unplannedFilesTouched: string[];
    changedSymbolsMentionedInPlan: string[];
    provenance: 'session-plan';
}
export interface StructuralBoundaryImpact {
    file: string;
    owners: string[];
    approvalRequired: boolean;
    approvalRequiredGlobs: string[];
    provenance: 'codeowners-profile';
}
export type StructuralDigestReasonCode = 'cross_package_reference' | 'outside_changed_file' | 'outside_changed_package' | 'non_test_reference' | 'test_reference' | 'owned_path' | 'approval_required_path' | 'sensitive_surface' | 'not_in_changed_files' | 'plan_unmentioned_file' | 'same_file_reference' | 'registration_or_config_surface' | 'import_or_declaration_reference';
export interface StructuralDigestReference {
    rank: number;
    score: number;
    targetFile: string;
    targetSymbol: string;
    targetKind: string;
    referencingFile: string;
    referencingSymbol: string | null;
    referencingKind: string | null;
    line: number;
    isTestFile: boolean;
    owners: string[];
    approvalRequired: boolean;
    reasonCodes: StructuralDigestReasonCode[];
    provenance: 'deterministic-ranking';
}
export interface StructuralDigestSymbol {
    rank: number;
    score: number;
    file: string;
    name: string;
    kind: string;
    referenceCount: number;
    nonTestReferenceCount: number;
    testReferenceCount: number;
    crossPackageReferenceCount: number;
    reasonCodes: StructuralDigestReasonCode[];
    provenance: 'deterministic-ranking';
}
export interface StructuralDigestConsequence {
    rank: number;
    score: number;
    targetFile: string;
    targetSymbol: string;
    targetKind: string;
    referencingFile: string;
    referenceCount: number;
    nonTestReferenceCount: number;
    testReferenceCount: number;
    representativeLines: number[];
    representativeSymbols: string[];
    owners: string[];
    approvalRequired: boolean;
    reasonCodes: StructuralDigestReasonCode[];
    provenance: 'deterministic-ranking';
}
export interface StructuralDigest {
    schemaVersion: 'neurcode.structural-digest.v1';
    generatedAt: string;
    provenance: 'deterministic-ranking';
    modelUsed: false;
    topSymbols: StructuralDigestSymbol[];
    topConsequences: StructuralDigestConsequence[];
    topReferences: StructuralDigestReference[];
    hidden: {
        references: number;
        testReferences: number;
        lowSignalReferences: number;
        sameFileReferences: number;
    };
    summary: {
        changedSymbolCount: number;
        referenceCount: number;
        topConsequenceCount: number;
        topReferenceCount: number;
        crossPackageReferenceCount: number;
        nonTestReferenceCount: number;
        testReferenceCount: number;
    };
    limitations: string[];
}
export type ConsequenceEffectCategory = 'filesystem-write' | 'session-evidence-write' | 'network-send' | 'database-write' | 'environment-mutation' | 'global-state-mutation';
export type ConsequenceDirection = 'added' | 'removed';
export type ConsequenceContractChangeKind = 'export_added' | 'export_removed' | 'param_added' | 'param_removed' | 'param_type_changed' | 'return_type_changed' | 'kind_changed' | 'member_added' | 'member_removed';
export interface ConsequenceEffectDelta {
    symbol: string;
    file: string;
    kind: string;
    line: number | null;
    effectCategory: ConsequenceEffectCategory;
    direction: ConsequenceDirection;
    calleeName: string;
    count: number;
    consumers: ConsequenceConsumerReference[];
    externalConsumers: ConsequenceConsumerReference[];
    provenance: 'effect-registry';
}
export interface ConsequenceContractChange {
    change: ConsequenceContractChangeKind;
    memberName: string | null;
    line: number | null;
}
export interface ConsequenceConsumerReference {
    file: string;
    symbol: string | null;
    kind: string | null;
    line: number;
    isTestFile: boolean;
    inChangedFile: boolean;
    provenance: 'typescript-compiler';
}
export interface ConsequenceConsumerSummary {
    productionConsumerCount: number;
    testConsumerCount: number;
    externalProductionConsumerCount: number;
    sensitiveConsumerCount: number;
    approvalRequiredConsumerCount: number;
    runtimeGovernanceConsumerCount: number;
    productionFiles: string[];
    testFiles: string[];
    sensitiveFiles: string[];
    approvalRequiredFiles: string[];
    runtimeGovernanceFiles: string[];
    highFanout: boolean;
    architectureRelevant: boolean;
    provenance: 'typescript-compiler+governance-profile+path-classifier';
}
export interface ConsequenceContractDelta {
    symbol: string;
    file: string;
    kind: string;
    line: number | null;
    changes: ConsequenceContractChange[];
    consumers: ConsequenceConsumerReference[];
    externalConsumers: ConsequenceConsumerReference[];
    provenance: 'typescript-checker';
}
export interface ConsequenceInheritorProjection {
    baseSymbol: string;
    baseFile: string;
    inheritorSymbol: string;
    inheritorFile: string;
    relationship: 'extends' | 'implements' | 'type-extends';
    isTestFile: boolean;
    provenance: 'inheritance-projection';
}
export interface ConsequenceTopFinding {
    rank: number;
    score: number;
    findingType: 'effect-delta' | 'contract-delta' | 'inheritor-projection';
    file: string;
    symbol: string;
    summary: string;
    consumerCount: number;
    nonTestConsumerCount: number;
    testConsumerCount: number;
    externalConsumerCount: number;
    externalConsumerFiles: string[];
    consumerSummary: ConsequenceConsumerSummary;
    reasonCodes: Array<'effect_added' | 'effect_removed' | 'filesystem_write' | 'session_evidence_write' | 'network_send' | 'contract_changed' | 'breaking_contract_shape' | 'has_consumers' | 'non_test_consumers' | 'external_consumers' | 'changed_file_only' | 'test_only_consumers' | 'test_file_effect' | 'inheritor_affected' | 'sensitive_consumers' | 'approval_required_consumers' | 'runtime_governance_consumers' | 'high_fanout' | 'architecture_relevant'>;
    provenance: 'deterministic-ranking';
}
export interface ConsequenceImpactGroup {
    rank: number;
    score: number;
    file: string;
    symbol: string;
    summary: string;
    findingTypes: ConsequenceTopFinding['findingType'][];
    findingRanks: number[];
    findingCount: number;
    productionConsumerCount: number;
    testConsumerCount: number;
    externalProductionConsumerCount: number;
    sensitiveConsumerCount: number;
    approvalRequiredConsumerCount: number;
    runtimeGovernanceConsumerCount: number;
    productionFiles: string[];
    testFiles: string[];
    sensitiveFiles: string[];
    approvalRequiredFiles: string[];
    runtimeGovernanceFiles: string[];
    highFanout: boolean;
    architectureRelevant: boolean;
    reasonCodes: ConsequenceTopFinding['reasonCodes'];
    provenance: 'deterministic-impact-grouping';
}
export interface ConsequenceUnderstandingArtifact {
    schemaVersion: typeof CONSEQUENCE_UNDERSTANDING_SCHEMA_VERSION;
    generatedAt: string;
    artifactHash: string;
    analyzed: boolean;
    reason: string | null;
    confidence: 'deterministic-static' | 'not-analyzed';
    modelUsed: false;
    effectDeltas: ConsequenceEffectDelta[];
    contractDeltas: ConsequenceContractDelta[];
    inheritorProjections: ConsequenceInheritorProjection[];
    topFindings: ConsequenceTopFinding[];
    topImpacts: ConsequenceImpactGroup[];
    summary: {
        effectDeltaCount: number;
        contractDeltaCount: number;
        inheritorProjectionCount: number;
        topFindingCount: number;
        topImpactCount: number;
        escapingConsequenceCount: number;
        highestExternalConsumerCount: number;
        headline: string;
    };
    limitations: string[];
    factProvenance: {
        effectDeltas: 'effect-registry';
        contractDeltas: 'typescript-checker';
        inheritorProjections: 'inheritance-projection';
        topFindings: 'deterministic-ranking';
        topImpacts: 'deterministic-impact-grouping';
    };
}
export interface StructuralUnderstandingArtifact {
    schemaVersion: typeof STRUCTURAL_UNDERSTANDING_SCHEMA_VERSION;
    generatedAt: string;
    artifactHash: string;
    repoRootHash: string;
    privacy: {
        sourceUploaded: false;
        sourceStored: false;
        diffStored: false;
        modelUsed: false;
        factsOnly: true;
        outputContains: string[];
        outputOmits: string[];
    };
    analysis: {
        language: 'typescript';
        analyzed: boolean;
        reason: string | null;
        confidence: 'deterministic-static' | 'not-analyzed';
        filesAnalyzed: number;
        changedFileCount: number;
        changedSymbolCount: number;
        referenceCount: number;
        testReferenceCount: number;
        crossPackage?: {
            changedPackages: string[];
            consumerPackagesScanned: string[];
            directImporterFilesAdded: number;
            resolvedToSource: boolean;
        };
    };
    changedFiles: Array<{
        path: string;
        changeType: DiffFile['changeType'];
        addedLines: number;
        removedLines: number;
        provenance: 'git-diff';
    }>;
    changedSymbols: StructuralChangedSymbol[];
    references: StructuralReference[];
    importEdgesChanged: StructuralImportEdge[];
    suppressedArtifacts: StructuralSuppressedArtifact[];
    testReferences: StructuralReference[];
    digest: StructuralDigest;
    consequenceUnderstanding: ConsequenceUnderstandingArtifact;
    planAlignment: StructuralPlanAlignment | null;
    boundaryImpact: StructuralBoundaryImpact[];
    limitations: string[];
    factProvenance: Record<string, StructuralUnderstandingProvenance>;
}
export interface BuildStructuralUnderstandingOptions {
    generatedAt?: string;
    maxProgramFiles?: number;
    timeBudgetMs?: number;
}
export declare function structuralUnderstandingPath(projectRoot: string, sessionId: string): string;
export declare function buildStructuralUnderstanding(projectRoot: string, diffFiles: DiffFile[], options?: BuildStructuralUnderstandingOptions & {
    session?: GovernanceSession | null;
    profile?: RepoGovernanceProfile | null;
}): StructuralUnderstandingArtifact;
export declare function writeStructuralUnderstanding(projectRoot: string, sessionId: string, artifact: StructuralUnderstandingArtifact): string;
export declare function readStructuralUnderstanding(projectRoot: string, sessionId: string): StructuralUnderstandingArtifact | null;
//# sourceMappingURL=structural-understanding.d.ts.map