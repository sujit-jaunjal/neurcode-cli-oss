export declare const REPOSITORY_GRAPH_SCHEMA_VERSION: "neurcode.repository-graph.v2.1";
export declare const PROPOSED_CHANGE_ENVELOPE_SCHEMA_VERSION: "neurcode.proposed-change.v2";
export declare const COMPILED_STRUCTURAL_POLICY_SCHEMA_VERSION: "neurcode.compiled-structural-policy.v2";
export declare const POLICY_EVALUATION_SCHEMA_VERSION: "neurcode.policy-evaluation.v2";
export declare const SEMANTIC_ADVISORY_SCHEMA_VERSION: "neurcode.semantic-advisory.v2";
export declare const REPO_INTELLIGENCE_EVIDENCE_SCHEMA_VERSION: "neurcode.repo-intelligence-evidence.v2";
export declare const REPO_INTELLIGENCE_OPERATIONS_SCHEMA_VERSION: "neurcode.repo-intelligence-operations.v1";
export declare const LANGUAGE_COVERAGE_MATRIX_SCHEMA_VERSION: "neurcode.language-coverage-matrix.v1";
export type IntelligenceTruthClassification = 'deterministic' | 'backend_signed' | 'advisory' | 'not_evaluated';
export type PolicyVerdict = 'allow' | 'warn' | 'block' | 'not_evaluated';
export type PolicyMode = 'off' | 'warn' | 'block';
export type HostEnforcementCapability = 'hard_prewrite' | 'cooperative_prewrite' | 'supervised_write' | 'post_write' | 'ci_only' | 'not_supported';
export type RepositoryLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'java' | 'ruby' | 'rust' | 'markdown' | 'yaml' | 'json' | 'shell' | 'sql' | 'other';
export type ParserDepth = 'ast' | 'syntax_tree' | 'regex_degraded' | 'metadata_only' | 'unsupported';
export interface LanguageAnalysisCoverage {
    language: RepositoryLanguage;
    parserId: string;
    parserVersion: string;
    depth: ParserDepth;
    filesSeen: number;
    filesAnalyzed: number;
    filesUnsupported: number;
    facts: Array<'symbols' | 'references' | 'imports' | 'exports' | 'calls'>;
    limitations: string[];
}
/**
 * Canonical relationship-authority class. Structurally identical to
 * governance-runtime's `RelationshipAuthorityClass`; declared here because
 * contracts is the lowest layer and cannot import governance-runtime. The
 * language-coverage builder derives capability tiers from this class.
 */
export type RepositoryRelationshipAuthorityClass = 'deterministic_exact' | 'deterministic_structural' | 'bounded_inference' | 'advisory_heuristic' | 'not_evaluated' | 'unsupported';
/**
 * Per-language capability tier (Iteration 7 — Language Coverage Matrix).
 *
 * This is deliberately distinct from {@link IntelligenceTruthClassification}:
 * that classifies how strongly a *single claim* is known; this classifies how
 * well a *language dimension* is handled a priori. Fail-closed contract: an
 * absent or unproven parser is `not_evaluated`, never `supported`.
 *
 * - `supported`  — deterministic structural facts (e.g. resolved imports, symbols).
 * - `partial`    — bounded inference; useful but not a guarantee (e.g. test adjacency).
 * - `advisory`   — heuristic signal worth a human look; never a hard block.
 * - `not_evaluated` — no parser/evidence; the dimension is not assessed.
 */
export type LanguageSupportTier = 'supported' | 'partial' | 'advisory' | 'not_evaluated';
export type LanguageCoverageDimension = 'parsing' | 'imports' | 'symbols' | 'testImpact' | 'ownership';
export interface LanguageCoverageDimensionCell {
    tier: LanguageSupportTier;
    /**
     * Relationship-authority class this tier derives from. `null` for dimensions
     * that are not edge-based: `parsing` is parser-depth derived and `ownership`
     * is CODEOWNERS/path derived, independent of any language parser.
     */
    authorityClass: RepositoryRelationshipAuthorityClass | null;
    /** Source-free reason codes explaining the tier. */
    reasonCodes: string[];
}
export interface LanguageCoverageRow {
    language: RepositoryLanguage;
    /** Highest parser depth available: observed depth when indexed, else catalog floor. */
    parserDepth: ParserDepth;
    /** True when at least one file of this language is present in the indexed graph. */
    observed: boolean;
    filesSeen: number;
    filesAnalyzed: number;
    dimensions: Record<LanguageCoverageDimension, LanguageCoverageDimensionCell>;
    /** Honest, static limitation statements. Source-free: no paths, symbols, or bodies. */
    limitations: string[];
}
export interface LanguageCoverageMatrix {
    schemaVersion: typeof LANGUAGE_COVERAGE_MATRIX_SCHEMA_VERSION;
    /**
     * Whether the indexed graph is coverage-complete. Tiers describe per-language
     * capability on covered paths; overall graph completeness is governed
     * separately by `scaleStatus.coverage.impactAuthority`.
     */
    coverageComplete: boolean;
    /** One row per roadmap language plus any other observed language, sorted by name. */
    languages: LanguageCoverageRow[];
}
export interface SourceFreeSymbolFact {
    id: string;
    name: string;
    kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'method' | 'module' | 'unknown';
    language: RepositoryLanguage;
    filePath: string;
    line: number | null;
    exported: boolean;
    local: boolean;
    arity: number | null;
    signatureHash: string | null;
    structuralFingerprint: string | null;
    parserDepth: ParserDepth;
}
export interface SourceFreeImportFact {
    id: string;
    fromFile: string;
    target: string;
    resolvedFile: string | null;
    resolution?: 'resolved_repository' | 'external_package' | 'unresolved' | 'ambiguous' | 'dynamic';
    resolutionReason?: string | null;
    sourcePackage?: string | null;
    targetPackage?: string | null;
    sourceService?: string | null;
    targetService?: string | null;
    importedNames: string[];
    kind: 'static' | 'dynamic' | 'require' | 'python_import' | 'unknown';
    line: number | null;
    parserDepth: ParserDepth;
}
export interface SourceFreeExportFact {
    id: string;
    filePath: string;
    symbolName: string;
    target: string | null;
    kind: 'named' | 'default' | 're_export' | 'python_public' | 'unknown';
    line: number | null;
    parserDepth: ParserDepth;
}
export interface SourceFreeStructuralRelationship {
    id: string;
    type: 'defines' | 'references' | 'imports' | 'exports' | 'calls' | 'owns' | 'belongs_to_package' | 'belongs_to_service' | 'tests' | 'depends_on' | 'structurally_resembles' | 'crosses_boundary';
    fromId: string;
    toId: string;
    confidence: 'exact' | 'high' | 'medium' | 'low';
    /** Backward-compatible hard-evidence flag. False for semantic resemblance. */
    deterministic: boolean;
    /** The same normalized facts and algorithm reproduce the same relationship. */
    computationRepeatable?: boolean;
    /** Semantic certainty is distinct from repeatability of the computation. */
    semanticCertainty?: 'exact' | 'high' | 'medium' | 'low' | 'unknown';
    /** Advisory evidence cannot independently authorize blocking enforcement. */
    evidenceTier?: 'deterministic' | 'advisory' | 'degraded';
    /** Whether this relationship may be used as hard-block evidence. */
    enforcementEligible?: boolean;
    /** Canonical relationship authority class from governance-runtime. */
    relationshipAuthorityClass?: 'deterministic_exact' | 'deterministic_structural' | 'bounded_inference' | 'advisory_heuristic' | 'not_evaluated' | 'unsupported';
    /** Stable source-free reason codes for authority classification. */
    authorityReasonCodes?: string[];
    provenance: string;
}
export interface SourceFreeReferenceFact {
    id: string;
    filePath: string;
    name: string;
    line: number | null;
    kind: 'call_target' | 'identifier' | 'property' | 'unknown';
    resolvedSymbolId: string | null;
    resolvedFile: string | null;
    resolution: 'local_symbol' | 'imported_symbol' | 'repository_symbol' | 'ambiguous' | 'unresolved';
    resolutionReason: string | null;
    parserDepth: ParserDepth;
}
export interface SourceFreeCallFact {
    id: string;
    filePath: string;
    calledName: string;
    line: number | null;
    callerSymbolId: string | null;
    callKind: 'direct' | 'property' | 'constructor' | 'unknown';
    resolvedSymbolId: string | null;
    resolvedFile: string | null;
    resolution: 'local_symbol' | 'imported_symbol' | 'repository_symbol' | 'ambiguous' | 'unresolved';
    resolutionReason: string | null;
    parserDepth: ParserDepth;
}
export interface SourceFreeBoundaryFact {
    id: string;
    filePath: string;
    packageKey: string | null;
    serviceKey: string | null;
    parserDepth: ParserDepth;
}
export type ProposedFactFamily = 'path' | 'symbol' | 'import' | 'reference' | 'call' | 'package' | 'service' | 'ownership' | 'test' | 'surface';
export type ProposedFactStatus = 'complete' | 'partial' | 'unavailable';
export interface ProposedFactAvailability {
    fact: ProposedFactFamily;
    status: ProposedFactStatus;
    reasons: string[];
}
export interface ProposedPolicyFactAvailability {
    family: StructuralPolicyFamily;
    status: ProposedFactStatus;
    requiredFacts: ProposedFactFamily[];
    missingFacts: ProposedFactFamily[];
    reasons: string[];
}
export interface ProposedChangeEnvelope {
    schemaVersion: typeof PROPOSED_CHANGE_ENVELOPE_SCHEMA_VERSION;
    repository: {
        repoId: string;
        rootHash: string;
        remoteHash: string | null;
        headSha: string | null;
    };
    target: {
        path: string;
        previousPath: string | null;
        operation: 'create' | 'update' | 'delete' | 'rename';
        language: RepositoryLanguage;
    };
    content: {
        present: boolean;
        availabilityReason: 'host_supplied' | 'path_only_contract' | 'post_write_disk_read' | 'delete_operation' | 'unsupported_host';
        contentHash: string | null;
        rawRetained: false;
    };
    facts: {
        symbols: SourceFreeSymbolFact[];
        imports: SourceFreeImportFact[];
        exports: SourceFreeExportFact[];
        relationships: SourceFreeStructuralRelationship[];
        references?: SourceFreeReferenceFact[];
        calls?: SourceFreeCallFact[];
        boundaries?: SourceFreeBoundaryFact[];
        parserDepth: ParserDepth;
        extractionErrors: string[];
        limitations?: string[];
        completeness?: {
            facts: ProposedFactAvailability[];
            policies: ProposedPolicyFactAvailability[];
        };
    };
    host: {
        adapterId: string;
        capability: HostEnforcementCapability;
        timing: 'before_write' | 'during_write' | 'after_write' | 'ci';
        decisionBinding: 'host_enforced' | 'cooperative' | 'observed';
    };
    session: {
        sessionId: string | null;
        planRevision: number | null;
    };
    privacy: SourceFreePrivacyContract;
}
export type RepositoryGraphNodeKind = 'repository' | 'file' | 'language' | 'symbol' | 'definition' | 'reference' | 'import' | 'export' | 'package' | 'module' | 'service' | 'ownership_zone' | 'sensitive_surface' | 'test' | 'config' | 'workflow' | 'migration' | 'dependency' | 'structural_fingerprint';
export interface RepositoryGraphNode {
    id: string;
    kind: RepositoryGraphNodeKind;
    key: string;
    path: string | null;
    name: string | null;
    language: RepositoryLanguage | null;
    contentHash: string | null;
    attributes: Record<string, string | number | boolean | null | string[]>;
    provenance: {
        parserId: string | null;
        parserVersion: string | null;
        parserDepth: ParserDepth;
        indexedAt: string;
    };
}
export interface RepositoryGraphEdge extends SourceFreeStructuralRelationship {
    attributes: Record<string, string | number | boolean | null | string[]>;
}
export interface RepositoryGraphFreshness {
    state: 'fresh' | 'stale' | 'partial' | 'missing' | 'corrupt' | 'locked';
    /** Truthful lifecycle posture. `complete` is never used for unsupported, skipped, degraded, or failed analysis. */
    posture?: 'complete' | 'partial' | 'stale' | 'missing' | 'failed';
    indexedAt: string | null;
    gitHead: string | null;
    workingTreeHash: string | null;
    staleFileCount: number;
    unsupportedFileCount: number;
    reasonCodes: string[];
}
export interface RepositoryGraphLimits {
    maxFiles: number;
    maxTotalBytes: number;
    maxBytesPerFile: number;
    maxNodes: number;
    maxEdges: number;
    /** Maximum parser/traversal nesting accepted for one source file. */
    maxAstDepth?: number;
    /** Maximum AST nodes visited while analyzing one source file. */
    maxAstNodes?: number;
    /** Cooperative wall-clock budget for one source file in milliseconds. */
    maxAnalysisMs?: number;
}
export type RepositoryFileAnalysisStatus = 'analyzed' | 'skipped' | 'unsupported' | 'degraded' | 'failed';
export type RepositoryGraphFactFamily = 'path' | 'symbol' | 'import' | 'reference' | 'call' | 'package' | 'service' | 'ownership' | 'test' | 'surface';
export interface RepositoryGraphPathCompleteness {
    language: RepositoryLanguage;
    packageKey: string | null;
    serviceKey: string | null;
    status: 'complete' | 'partial' | 'unavailable';
    facts: RepositoryGraphFactFamily[];
    reasons: string[];
}
export interface RepositoryGraphScopeCompleteness {
    status: 'complete' | 'partial' | 'unavailable';
    facts: RepositoryGraphFactFamily[];
    reasons: string[];
    filesSeen: number;
    filesComplete: number;
}
export interface RepositoryGraphCompleteness {
    paths: Record<string, RepositoryGraphPathCompleteness>;
    languages: Partial<Record<RepositoryLanguage, RepositoryGraphScopeCompleteness>>;
    packages: Record<string, RepositoryGraphScopeCompleteness>;
    services: Record<string, RepositoryGraphScopeCompleteness>;
    omittedPathCount: number;
    reasons: string[];
}
export interface RepositoryGraphFileState {
    contentHash: string | null;
    sizeBytes: number;
    mtimeMs: number;
    language: RepositoryLanguage;
    generated: boolean;
    vendor: boolean;
    binary: boolean;
    ignored: boolean;
    unsupported: boolean;
    reason: string | null;
    /** Stable, source-free outcome of the most recent analysis attempt. */
    analysisStatus?: RepositoryFileAnalysisStatus;
    /** Stable reason code; never parser text, source text, or an exception message. */
    analysisReasonCode?: string | null;
}
export interface RepositoryGraphSnapshot {
    schemaVersion: typeof REPOSITORY_GRAPH_SCHEMA_VERSION;
    graphId: string;
    repositoryId: string;
    generation: number;
    createdAt: string;
    updatedAt: string;
    storage: {
        format: 'atomic_json' | 'sqlite_wal';
        schemaVersion?: number;
        transactionId: string;
        recoveredFromCorruption: boolean;
        migratedFrom?: 'atomic_json' | null;
    };
    freshness: RepositoryGraphFreshness;
    limits: RepositoryGraphLimits;
    coverage: {
        languages: LanguageAnalysisCoverage[];
        filesSeen: number;
        filesIndexed: number;
        filesIgnored: number;
        filesGenerated: number;
        filesVendor: number;
        filesBinary: number;
        filesUnsupported: number;
        filesAnalyzed?: number;
        filesSkipped?: number;
        filesDegraded?: number;
        filesFailed?: number;
        unsupportedPercent: number;
    };
    nodes: RepositoryGraphNode[];
    edges: RepositoryGraphEdge[];
    fileHashes: Record<string, string>;
    fileStates?: Record<string, RepositoryGraphFileState>;
    completeness?: RepositoryGraphCompleteness;
    coverageAuthority?: RepositoryGraphCoverageAuthority;
    privacy: SourceFreePrivacyContract;
}
export type RepositoryGraphImpactAuthority = 'authoritative' | 'partial' | 'attention_required' | 'not_evaluated_due_to_coverage';
export interface RepositoryGraphCoverageAuthority {
    trackedFiles: number;
    eligibleFiles: number;
    discoveredFiles: number;
    indexedFiles: number;
    omittedFiles: number;
    omittedPackages: string[];
    omittedPathPrefixes: string[];
    nodeCapReached: boolean;
    edgeCapReached: boolean;
    fileCapReached: boolean;
    unsupportedLanguageCounts: Record<string, number>;
    degradedLanguageCounts: Record<string, number>;
    coverageComplete: boolean;
    impactAuthority: RepositoryGraphImpactAuthority;
    reasonCodes: string[];
}
export interface RepositoryIndexRequest {
    repoRoot: string;
    changedPaths?: string[];
    deletedPaths?: string[];
    renamedPaths?: Array<{
        from: string;
        to: string;
    }>;
    forceRebuild?: boolean;
    limits?: Partial<RepositoryGraphLimits>;
    /**
     * Keep the persisted graph authoritative without materializing every fact in
     * this response. Defaults to true for backward compatibility. Large-repo CLI
     * paths set this false and query the SQLite store as needed.
     */
    materializeGraph?: boolean;
    /** Local-only source-free progress callback. Never persisted in the graph. */
    onProgress?: (progress: RepositoryIndexProgress) => void;
}
export interface RepositoryIndexProgress {
    phase: 'locked' | 'discovering' | 'analyzing' | 'persisting' | 'completed';
    filesScanned: number;
    filesIndexed: number;
    totalFiles: number | null;
    bytesScanned: number;
    nodes: number;
    edges: number;
    elapsedMs: number;
    peakMemoryMb: number;
}
export interface RepositoryIndexResult {
    graph: RepositoryGraphSnapshot;
    stats: {
        mode: 'initial' | 'incremental' | 'rebuild' | 'recovery';
        durationMs: number;
        filesScanned: number;
        filesParsed: number;
        filesReused: number;
        filesDeleted: number;
        filesRenamed: number;
        peakMemoryMb: number;
        graphBytes: number;
        /** Persisted counts remain authoritative when materializeGraph is false. */
        nodeCount?: number;
        edgeCount?: number;
        /** Source-free phase timings for reproducible performance diagnosis. */
        indexPhases?: Record<string, number>;
        storagePath?: 'full_snapshot' | 'streaming_sqlite' | 'bounded_sqlite_incremental';
        filesAnalyzed?: number;
        filesSkipped?: number;
        filesUnsupported?: number;
        filesDegraded?: number;
        filesFailed?: number;
    };
}
export interface RepositoryIndexer {
    index(request: RepositoryIndexRequest): Promise<RepositoryIndexResult>;
    status(repoRoot: string): Promise<RepositoryGraphFreshness>;
    recover(repoRoot: string): Promise<RepositoryIndexResult>;
}
export interface LanguageAnalyzer {
    readonly language: RepositoryLanguage;
    readonly parserId: string;
    readonly parserVersion: string;
    readonly depth: ParserDepth;
    supports(path: string): boolean;
    analyze(input: {
        filePath: string;
        sourceText: string;
        contentHash: string;
    }): {
        symbols: SourceFreeSymbolFact[];
        imports: SourceFreeImportFact[];
        exports: SourceFreeExportFact[];
        relationships: SourceFreeStructuralRelationship[];
        errors: string[];
    };
}
export interface RepositoryGraphStore {
    read(repoRoot: string): RepositoryGraphSnapshot | null;
    write(repoRoot: string, graph: RepositoryGraphSnapshot): void;
    withLock<T>(repoRoot: string, operation: () => T): T;
    recover(repoRoot: string): RepositoryGraphSnapshot | null;
}
export type StructuralPolicyFamily = 'symbol_uniqueness' | 'import_boundary' | 'layering' | 'ownership_approval' | 'service_dependency' | 'required_test' | 'sensitive_surface_approval' | 'review_required_surface' | 'generated_file_restriction' | 'scope_constraint';
export type PolicySourceKind = 'organization' | 'repository' | 'directory' | 'session';
export interface CompiledStructuralPolicyRule {
    schemaVersion: typeof COMPILED_STRUCTURAL_POLICY_SCHEMA_VERSION;
    ruleId: string;
    family: StructuralPolicyFamily;
    mode: PolicyMode;
    source: {
        kind: PolicySourceKind;
        sourceId: string;
        precedence: number;
        phraseHash: string | null;
        phraseSummary: string | null;
    };
    normalized: Record<string, string | number | boolean | null | string[]>;
    requiredFacts: Array<'path' | 'symbol' | 'import' | 'call' | 'ownership' | 'test' | 'surface'>;
    remediation: string;
}
export interface PolicyCompilationResult {
    compiled: CompiledStructuralPolicyRule[];
    advisory: Array<{
        sourceId: string;
        reason: string;
        phraseHash: string | null;
    }>;
    notEvaluated: Array<{
        sourceId: string;
        reason: string;
        phraseHash: string | null;
    }>;
    rejected: Array<{
        sourceId: string;
        reason: string;
        phraseHash: string | null;
    }>;
}
export interface StructuralPolicyCompiler {
    compile(input: {
        organizationRules?: unknown[];
        repositoryRules?: unknown[];
        naturalLanguageStatements?: string[];
    }): PolicyCompilationResult;
}
export interface PolicyEvaluationFinding {
    findingId: string;
    ruleId: string;
    family: StructuralPolicyFamily;
    verdict: Exclude<PolicyVerdict, 'allow'>;
    truth: IntelligenceTruthClassification;
    matchedFacts: Array<{
        factType: string;
        factId: string;
        path: string | null;
        symbol: string | null;
    }>;
    explanation: string;
    remediation: string;
}
export interface StructuralPolicyEvaluation {
    schemaVersion: typeof POLICY_EVALUATION_SCHEMA_VERSION;
    verdict: PolicyVerdict;
    truth: 'deterministic' | 'not_evaluated';
    evaluatedRuleIds: string[];
    notEvaluatedRuleIds: string[];
    findings: PolicyEvaluationFinding[];
    graphFreshness: RepositoryGraphFreshness;
}
export interface StructuralPolicyEvaluator {
    evaluate(input: {
        graph: RepositoryGraphSnapshot | null;
        change: ProposedChangeEnvelope;
        rules: CompiledStructuralPolicyRule[];
        approvals?: Array<{
            path: string;
            owners: string[];
            approvedBy: string;
        }>;
    }): StructuralPolicyEvaluation;
}
export interface SemanticAdvisoryFinding {
    schemaVersion: typeof SEMANTIC_ADVISORY_SCHEMA_VERSION;
    findingId: string;
    providerId: string;
    category: 'behavior_similarity' | 'reuse_suggestion' | 'duplicate_module' | 'architecture_deviation' | 'cross_service_consequence' | 'reviewer_question' | 'missing_test' | 'ownership_review';
    truth: 'advisory';
    confidence: number;
    rationaleCategories: string[];
    related: Array<{
        path: string | null;
        symbol: string | null;
        hash: string | null;
    }>;
    limitations: string[];
    suppressed: boolean;
    cacheKey: string;
}
export interface SemanticAdvisoryProvider {
    readonly providerId: string;
    readonly privacyMode: 'local_only' | 'opt_in_remote_source_free';
    analyze(input: {
        graph: RepositoryGraphSnapshot;
        change: ProposedChangeEnvelope;
        suppressions: string[];
    }): Promise<SemanticAdvisoryFinding[]>;
}
export interface SourceFreePrivacyContract {
    sourceUploaded: false;
    sourceStored: false;
    diffUploaded: false;
    promptUploaded: false;
    chatUploaded: false;
    rawContentRetained: false;
}
export interface RepoIntelligenceEvidence {
    schemaVersion: typeof REPO_INTELLIGENCE_EVIDENCE_SCHEMA_VERSION;
    evidenceId: string;
    generatedAt: string;
    classification: IntelligenceTruthClassification;
    verdict: PolicyVerdict;
    enforcement: ProposedChangeEnvelope['host'];
    graph: {
        graphId: string | null;
        schemaVersion: string | null;
        /** The sole repository-wide source index. Other graph artifacts are projections or session-scoped. */
        canonicalModel?: 'repository_graph_v2';
        storageSchemaVersion?: number | null;
        freshness: RepositoryGraphFreshness;
        /** A completed transactional index, including an honestly partial result. */
        lastSuccessfulIndexAt?: string | null;
        /** Last observable attempt. Failed attempts before a graph exists are not persisted in V2. */
        lastAttemptedIndexAt?: string | null;
        unsupportedPercent: number | null;
        coverage?: {
            filesSeen: number;
            filesIndexed: number;
            filesAnalyzed: number;
            filesSkipped: number;
            filesUnsupported: number;
            filesDegraded: number;
            filesFailed: number;
        } | null;
        deterministicEvidenceEligible?: boolean;
        deterministicEnforcementEligible?: boolean;
        enforcementIneligibilityReasons?: string[];
        recoveryCommand?: 'neurcode brain repo-index' | 'neurcode brain repo-recover';
        runtimeCompatibility?: {
            contractId: string;
            runtimeContractVersion: string;
            manifestVersion: string;
            component: 'cli';
        };
        summary?: {
            languages: Array<{
                language: RepositoryLanguage;
                depth: ParserDepth;
                filesSeen: number;
                filesAnalyzed: number;
                filesUnsupported: number;
            }>;
            packages: string[];
            services: string[];
            ownershipZoneCount: number;
            sensitiveSurfaceCount: number;
        };
        coverageAuthority?: RepositoryGraphCoverageAuthority | null;
        relationshipAuthority?: {
            impactAuthority: RepositoryGraphCoverageAuthority['impactAuthority'];
            reasonCodes: string[];
        };
    };
    policy: {
        evaluatedRuleIds: string[];
        notEvaluatedRuleIds: string[];
        findings: PolicyEvaluationFinding[];
    };
    advisory: SemanticAdvisoryFinding[];
    signature: {
        trust: 'self_attested' | 'backend_signed_unverified' | 'backend_signed_verified' | 'backend_signed_invalid';
        receiptId: string | null;
        recordHash: string | null;
    };
    privacy: SourceFreePrivacyContract;
}
export interface RepoIntelligenceEvidenceProjection {
    repoKey: string;
    repoName: string;
    sessionId: string;
    targetPath: string | null;
    eventType: string;
    eventAt: string | null;
    evidence: RepoIntelligenceEvidence;
}
export interface RepoIntelligenceEvidencePage {
    schemaVersion: 'neurcode.repo-intelligence-evidence-page.v1';
    records: RepoIntelligenceEvidenceProjection[];
    pageInfo: {
        limit: number;
        offset: number;
        returned: number;
        hasMore: boolean;
        invalidRowsSkipped: number;
    };
    filters: {
        repoKey: string | null;
        classification: IntelligenceTruthClassification | null;
        hostCapability: HostEnforcementCapability | null;
        freshness: RepositoryGraphFreshness['state'] | null;
    };
    privacy: SourceFreePrivacyContract & {
        projectionOnly: true;
        retentionInheritedFromRuntimeEvidence: true;
    };
}
export interface RepoIntelligenceOperationsMetrics {
    schemaVersion: typeof REPO_INTELLIGENCE_OPERATIONS_SCHEMA_VERSION;
    generatedAt: string;
    windowHours: number;
    status: 'idle' | 'healthy' | 'watching' | 'degraded';
    reasons: string[];
    evaluations: {
        total: number;
        valid: number;
        invalidPersisted: number;
        classifications: Record<IntelligenceTruthClassification, number>;
        verdicts: Record<PolicyVerdict, number>;
        advisoryFindings: number;
        evaluatedRules: number;
        notEvaluatedRules: number;
        lastEvaluationAt: string | null;
    };
    hosts: Record<HostEnforcementCapability, number>;
    graphs: {
        freshness: Record<RepositoryGraphFreshness['state'], number>;
        averageUnsupportedPercent: number | null;
        maximumUnsupportedPercent: number | null;
        lastIndexedAt: string | null;
        lastAttemptedIndexAt?: string | null;
        deterministicEnforcementEligible?: number;
        deterministicEnforcementIneligible?: number;
        recoveredFromCorruption: number;
    };
    gaps: {
        topNotEvaluatedRuleIds: Array<{
            ruleId: string;
            count: number;
        }>;
        topReasonCodes: Array<{
            reasonCode: string;
            count: number;
        }>;
    };
    latency: {
        evaluationMs: {
            available: false;
            reason: string;
        };
        indexRefreshMs: {
            available: false;
            reason: string;
        };
    };
    privacy: SourceFreePrivacyContract & {
        organizationScoped: true;
        highCardinalityLabelsExcluded: true;
    };
}
export declare function assertSourceFreeRepoIntelligence(value: unknown, path?: string): void;
export declare function isRepoIntelligenceEvidence(value: unknown): value is RepoIntelligenceEvidence;
export declare function sourceFreePrivacyContract(): SourceFreePrivacyContract;
//# sourceMappingURL=repo-intelligence-v2.d.ts.map