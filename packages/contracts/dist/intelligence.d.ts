export declare const ENGINEERING_INTELLIGENCE_SCHEMA_VERSION: 1;
export type RepositoryIntelligenceNodeType = 'repository' | 'module' | 'service' | 'file' | 'manifest' | 'boundary' | 'external-repo';
export type RepositoryIntelligenceEdgeType = 'contains' | 'imports' | 'depends-on' | 'crosses-boundary' | 'cross-repo';
export type RepositoryIntelligenceConfidence = 'high' | 'medium' | 'low';
export interface RepositoryIntelligenceNode {
    id: string;
    type: RepositoryIntelligenceNodeType;
    label: string;
    path?: string | null;
    category?: string | null;
    metadata?: Record<string, unknown>;
}
export interface RepositoryIntelligenceEdge {
    from: string;
    to: string;
    type: RepositoryIntelligenceEdgeType;
    confidence?: RepositoryIntelligenceConfidence;
    evidence?: string | null;
}
export type SemanticOwnershipKind = 'auth' | 'payment' | 'notification' | 'api' | 'ui' | 'worker' | 'shared' | 'data' | 'infra' | 'ci' | 'deployment' | 'service' | 'repository';
export interface RepositoryOwnershipBoundary {
    id: string;
    name: string;
    path: string;
    kind: SemanticOwnershipKind;
    domain: string;
    stewardship: {
        primaryOwner: string;
        codeOwners: string[];
    };
    responsibilities: string[];
    forbiddenResponsibilities: string[];
    criticality: 'standard' | 'sensitive' | 'critical';
    confidence: RepositoryIntelligenceConfidence;
}
export type RepositorySemanticContractKind = 'service-contract' | 'layering' | 'dependency-direction' | 'ownership' | 'runtime-boundary' | 'deployment-boundary';
export interface RepositorySemanticContract {
    id: string;
    name: string;
    kind: RepositorySemanticContractKind;
    boundaryId: string | null;
    boundaryName: string | null;
    subjectPath: string;
    expectedResponsibilities: string[];
    forbiddenResponsibilities: string[];
    allowedDependencyKinds: string[];
    forbiddenDependencyKinds: string[];
    rationale: string;
    evidence: string[];
    confidence: RepositoryIntelligenceConfidence;
}
export type RepositoryArchitecturalInvariantCategory = 'layering' | 'ownership' | 'runtime' | 'dependency' | 'deployment' | 'service-responsibility';
export interface RepositoryArchitecturalInvariant {
    id: string;
    name: string;
    category: RepositoryArchitecturalInvariantCategory;
    scope: 'repository' | 'service' | 'module';
    subjectPath: string;
    boundaryId: string | null;
    boundaryName: string | null;
    expectation: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    rationale: string;
    relatedContractIds: string[];
    evidence: string[];
    confidence: RepositoryIntelligenceConfidence;
}
export type RepositoryRuntimeBehaviorKind = 'api-provider' | 'api-consumer' | 'event-producer' | 'event-consumer' | 'state-owner' | 'state-mutator' | 'workflow-orchestrator' | 'external-side-effect' | 'deployment-aware' | 'runtime-config-consumer';
export interface RepositoryRuntimeBehaviorProfile {
    boundaryId: string;
    boundaryName: string;
    domain: string;
    behaviorKinds: RepositoryRuntimeBehaviorKind[];
    sideEffectKinds: string[];
    externalDependencies: string[];
    stateSurfaces: string[];
    rolloutUnits: string[];
    runtimeEnvironments: string[];
    criticalFlows: string[];
    confidence: RepositoryIntelligenceConfidence;
}
export type RepositoryRuntimeInteractionKind = 'api-call' | 'event-flow' | 'state-access' | 'state-mutation' | 'deployment-dependency' | 'operational-coupling';
export interface RepositoryRuntimeInteraction {
    id: string;
    kind: RepositoryRuntimeInteractionKind;
    fromBoundaryId: string;
    fromBoundaryName: string;
    toBoundaryId: string | null;
    toBoundaryName: string | null;
    subject: string;
    rationale: string;
    confidence: RepositoryIntelligenceConfidence;
}
export interface RepositoryDeploymentBoundary {
    id: string;
    name: string;
    path: string;
    type: 'kubernetes' | 'helm' | 'terraform' | 'docker' | 'ci' | 'manifest';
    rolloutUnits: string[];
    runtimeEnvironments: string[];
    dependentBoundaryIds: string[];
    dependentBoundaryNames: string[];
    confidence: RepositoryIntelligenceConfidence;
}
export interface RepositoryRuntimeSemanticModel {
    behaviorProfiles: RepositoryRuntimeBehaviorProfile[];
    interactions: RepositoryRuntimeInteraction[];
    deploymentBoundaries: RepositoryDeploymentBoundary[];
    criticalFlows: string[];
    blindSpots: string[];
}
export interface RepositorySemanticModel {
    ownershipBoundaries: RepositoryOwnershipBoundary[];
    contracts: RepositorySemanticContract[];
    invariants: RepositoryArchitecturalInvariant[];
    criticalDomains: string[];
    runtime: RepositoryRuntimeSemanticModel;
}
export interface RepositoryIntelligenceGraph {
    schemaVersion: typeof ENGINEERING_INTELLIGENCE_SCHEMA_VERSION;
    graphId: string;
    generatedAt: string;
    repository: {
        name: string;
        rootPath: string;
        branchName: string | null;
        headSha: string | null;
        workspaceId: string | null;
    };
    summary: {
        scannedSourceFiles: number;
        moduleCount: number;
        serviceCount: number;
        importEdges: number;
        crossModuleEdges: number;
        sensitiveBoundaryCount: number;
        manifestCount: number;
        crossRepoEdgeCount: number;
        ownershipBoundaryCount: number;
        semanticContractCount: number;
        invariantCount: number;
        runtimeBehaviorCount: number;
        runtimeInteractionCount: number;
        deploymentBoundaryCount: number;
    };
    nodes: RepositoryIntelligenceNode[];
    edges: RepositoryIntelligenceEdge[];
    boundaries: {
        sensitivePaths: string[];
        infraPaths: string[];
        ciPaths: string[];
        dependencyManifests: string[];
    };
    semantic: RepositorySemanticModel;
    blindSpots: string[];
    fingerprint: string;
}
export interface IntentPackBoundaryExpectation {
    type: 'sensitive' | 'infra' | 'ci' | 'dependency-manifest' | 'service' | 'module';
    path: string;
    policy: 'allowed' | 'review-required' | 'forbidden';
    reason: string;
}
export interface IntentPackCheckpoint {
    id: string;
    label: string;
    rationale: string;
}
export interface IntentPack {
    schemaVersion: typeof ENGINEERING_INTELLIGENCE_SCHEMA_VERSION;
    intentPackId: string;
    createdAt: string;
    updatedAt: string;
    intent: {
        raw: string;
        normalized: string;
    };
    governanceContext: {
        repoName: string;
        projectRoot: string;
        branchName: string | null;
        headSha: string | null;
        orgId: string | null;
        projectId: string | null;
    };
    approvedScope: {
        files: string[];
        modules: string[];
        services: string[];
    };
    forbiddenBoundaries: IntentPackBoundaryExpectation[];
    expectedDependencies: string[];
    expectedInfrastructure: string[];
    expectedBlastRadius: {
        level: 'low' | 'medium' | 'high';
        rationale: string;
        expectedFiles: string[];
    };
    checkpoints: IntentPackCheckpoint[];
    rolloutExpectations: string[];
    governanceExpectations: string[];
    constraints: string[];
    detectedSignals: string[];
    semanticExpectations: {
        ownershipBoundaries: string[];
        contractIds: string[];
        invariantIds: string[];
        expectedResponsibilities: string[];
        expectedBehaviorKinds: string[];
        expectedRuntimeFlows: string[];
        expectedRolloutUnits: string[];
    };
    contextHints: {
        suggestedFiles: string[];
        confidence: number;
    };
    repositoryGraphId: string | null;
    fingerprint: string;
}
export type ContextPackSource = 'context-engine' | 'brain-context' | 'static-context' | 'repository-intelligence' | 'workspace-federation';
export interface ContextPackFileSelection {
    path: string;
    confidence: number;
    source: ContextPackSource;
    reasons: string[];
    summary?: string | null;
    symbols?: string[];
}
export interface ContextPackServiceBoundary {
    name: string;
    path: string;
    kind: 'service' | 'module' | 'infra' | 'api' | 'ui' | 'worker' | 'shared';
}
export interface ContextPack {
    schemaVersion: typeof ENGINEERING_INTELLIGENCE_SCHEMA_VERSION;
    contextPackId: string;
    createdAt: string;
    intentPackId: string;
    repositoryGraphId: string;
    compiler: {
        mode: 'deterministic-bounded';
        sources: ContextPackSource[];
        precisionBudget: {
            maxSuggestedFiles: number;
            maxBrainMatches: number;
            maxStaticContextBytes: number;
        };
    };
    selectedFiles: ContextPackFileSelection[];
    relatedModules: string[];
    serviceBoundaries: ContextPackServiceBoundary[];
    dependencyManifests: string[];
    infraBoundaries: string[];
    staticContext: {
        hash: string | null;
        sourceCount: number;
    };
    brainContext: {
        scopeFound: boolean;
        fileEntries: number;
        eventEntries: number;
        matchedEntries: number;
    };
    advisory: {
        blindSpots: string[];
        rationale: string[];
    };
    fingerprint: string;
}
export interface SessionContinuitySnapshot {
    sessionId: string;
    createdAt: string;
    branchName: string | null;
    headSha: string | null;
    intentPackId: string;
    contextPackId: string;
    repositoryGraphId: string;
    invariantMemoryId?: string | null;
    intentSummary: string;
}
export interface SessionContinuityRuntime {
    schemaVersion: typeof ENGINEERING_INTELLIGENCE_SCHEMA_VERSION;
    sessionId: string;
    status: 'active' | 'archived';
    createdAt: string;
    updatedAt: string;
    repoRoot: string;
    branchName: string | null;
    headSha: string | null;
    orgId: string | null;
    projectId: string | null;
    intentPackId: string;
    contextPackId: string;
    repositoryGraphId: string;
    invariantMemoryId: string | null;
    planPath: string | null;
    artifactPaths: {
        intentPack: string;
        contextPack: string;
        repositoryGraph: string;
        invariantMemory: string | null;
        plan: string | null;
    };
    brainContext: {
        path: string;
        scopeFound: boolean;
        fileEntries: number;
        eventEntries: number;
        lastUpdatedAt?: string;
        lastRefreshAt?: string;
    };
    continuity: {
        previousSessionId: string | null;
        lineage: string[];
        warnings: string[];
    };
    fingerprint: string;
}
export interface SessionContinuityIndex {
    schemaVersion: typeof ENGINEERING_INTELLIGENCE_SCHEMA_VERSION;
    activeSessionId: string | null;
    sessions: SessionContinuitySnapshot[];
    updatedAt: string;
}
export type DriftIntelligenceSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type DriftIntelligenceCategory = 'scope-expansion' | 'cross-service' | 'dependency-spread' | 'infra-leakage' | 'sensitive-boundary' | 'blast-radius' | 'rollout-risk' | 'runtime-coupling' | 'architectural-leakage' | 'layer-violation' | 'contract-misuse' | 'ownership-inversion' | 'responsibility-drift' | 'invariant-violation' | 'behavioral-drift' | 'deployment-coupling' | 'state-ownership-risk';
export type DriftEvidenceTier = 'direct-diff' | 'direct-file' | 'bounded-inference' | 'topology-only';
export type DriftActionability = 'directly-actionable' | 'review-required' | 'informational';
export type GovernancePriority = 'p0-rollout-blocker' | 'p1-architecture-blocker' | 'p2-review-required' | 'p3-advisory';
export type GovernanceGate = 'advisory' | 'review-blocker' | 'rollout-blocker' | 'architecture-blocker' | 'policy-blocker';
export type GovernanceDecisionState = 'acknowledged' | 'review-required' | 'accepted-risk' | 'rollout-approved' | 'rollout-blocked' | 'advisory-dismissed' | 'temporary-exception';
export type RolloutTrustPosture = 'rollout-safe' | 'review-required' | 'architecture-risk' | 'deployment-sensitive' | 'boundary-violating' | 'topology-advisory';
export type FindingRelationshipType = 'derived-from' | 'parent-of' | 'topology-derived' | 'deployment-derived';
export interface GovernanceFindingRelationship {
    type: FindingRelationshipType;
    targetFindingId: string;
    rationale: string;
}
export interface GovernanceDecisionLineageEntry {
    decisionId: string;
    state: GovernanceDecisionState;
    findingId: string | null;
    category: DriftIntelligenceCategory | null;
    reason: string;
    actor: string;
    decidedAt: string;
    expiresAt: string | null;
    temporary: boolean;
    expired: boolean;
    previousGate: GovernanceGate | null;
    resultingGate: GovernanceGate | null;
    previousRolloutTrust: RolloutTrustPosture | null;
    resultingRolloutTrust: RolloutTrustPosture | null;
    sourcePath: string | null;
    lineageHash: string;
}
export interface GovernanceDecisionSummary {
    sourcePath: string | null;
    decisionsApplied: number;
    activeOverrides: number;
    expiredOverrides: number;
    findingsChanged: number;
    lineage: GovernanceDecisionLineageEntry[];
}
export interface DriftFindingLineEvidence {
    file: string;
    line: number;
    text: string;
}
export interface DriftFindingEvidence {
    tier: DriftEvidenceTier;
    changedFiles: string[];
    changedLines: DriftFindingLineEvidence[];
    dependencyEdges: string[];
    boundary: string | null;
    explanation: string;
}
export interface DriftRemediationGuidance {
    actionability: DriftActionability;
    evidenceTier: DriftEvidenceTier;
    minimalCorrection: string;
    boundaryToPreserve: string;
    verifyAfterRemediation: string;
    uncertainty: string[];
}
export interface DriftIntelligenceFinding {
    id: string;
    category: DriftIntelligenceCategory;
    severity: DriftIntelligenceSeverity;
    file?: string | null;
    module?: string | null;
    service?: string | null;
    message: string;
    rationale: string;
    expected?: string | null;
    actual?: string | null;
    evidenceTier?: DriftEvidenceTier;
    actionability?: DriftActionability;
    priority?: GovernancePriority;
    governanceGate?: GovernanceGate;
    rolloutTrust?: RolloutTrustPosture;
    relationships?: GovernanceFindingRelationship[];
    governanceDecision?: GovernanceDecisionLineageEntry;
    evidence?: DriftFindingEvidence;
    remediationGuidance?: DriftRemediationGuidance;
}
export interface GovernancePriorityCounts {
    p0RolloutBlockers: number;
    p1ArchitectureBlockers: number;
    p2ReviewRequired: number;
    p3Advisory: number;
}
export interface GovernancePostureSummary {
    rolloutTrust: RolloutTrustPosture;
    governanceGate: GovernanceGate;
    summary: string;
    reasons: string[];
    priorityCounts: GovernancePriorityCounts;
    remediationOrder: string[];
}
export type DriftNarrativeCategory = 'service-boundary-escape' | 'dependency-expansion' | 'forbidden-boundary-breach' | 'semantic-coupling' | 'blast-radius-expansion' | 'localized-scope-drift' | 'ownership-boundary-breach' | 'architectural-invariant-erosion' | 'runtime-behavior-shift' | 'deployment-semantics-breach' | 'state-ownership-erosion';
export interface DriftIntelligenceNarrative {
    id: string;
    category: DriftNarrativeCategory;
    severity: DriftIntelligenceSeverity;
    confidence: 'low' | 'medium' | 'high';
    primaryCategory: DriftIntelligenceCategory;
    rootCause: string;
    summary: string;
    operationalRisk: string;
    remediationBoundary: string;
    causalChain: string[];
    affectedFiles: string[];
    affectedModules: string[];
    affectedServices: string[];
    evidenceFindingIds: string[];
}
export interface DriftRiskSynthesis {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    summary: string;
    primaryNarratives: string[];
    contributingCategories: DriftIntelligenceCategory[];
    rawFindingCount: number;
    compressedNarrativeCount: number;
    authExposure: boolean;
    infraExposure: boolean;
    deploymentExposure: boolean;
    dependencyExposure: boolean;
    transitiveImpactCount: number;
    runtimeFlowExposure: boolean;
    externalSideEffectExposure: boolean;
    stateOwnershipExposure: boolean;
    affectedRolloutUnits: string[];
    cascadingRisk: 'low' | 'medium' | 'high' | 'critical';
    rolloutTrust: RolloutTrustPosture;
    governanceGate: GovernanceGate;
    postureSummary: string;
    priorityCounts: GovernancePriorityCounts;
    remediationOrder: string[];
}
export interface DriftIntelligenceReport {
    schemaVersion: typeof ENGINEERING_INTELLIGENCE_SCHEMA_VERSION;
    source: 'intent-runtime' | 'fallback-plan';
    flagged: boolean;
    confidence: 'low' | 'medium' | 'high';
    changedFiles: string[];
    changedModules: string[];
    changedServices: string[];
    impactedModules: string[];
    impactedServices: string[];
    impactedRuntimeFlows: string[];
    affectedRolloutUnits: string[];
    unexpectedFiles: string[];
    unexpectedModules: string[];
    unexpectedServices: string[];
    rolloutRisk: 'low' | 'medium' | 'high';
    findings: DriftIntelligenceFinding[];
    narratives: DriftIntelligenceNarrative[];
    riskSynthesis: DriftRiskSynthesis;
    governancePosture: GovernancePostureSummary;
    governanceDecisions: GovernanceDecisionSummary;
    explanation: string[];
}
export interface HistoricalDriftPattern {
    id: string;
    category: string;
    count: number;
    lastObservedAt: string;
    latestSummary: string;
    latestSeverity: DriftIntelligenceSeverity | null;
}
export interface EngineeringInvariantMemory {
    schemaVersion: typeof ENGINEERING_INTELLIGENCE_SCHEMA_VERSION;
    invariantMemoryId: string;
    generatedAt: string;
    updatedAt: string;
    sessionId: string;
    intentPackId: string;
    repositoryGraphId: string;
    branchName: string | null;
    headSha: string | null;
    ownershipBoundaries: RepositoryOwnershipBoundary[];
    contracts: RepositorySemanticContract[];
    invariants: RepositoryArchitecturalInvariant[];
    runtimeBehaviorProfiles: RepositoryRuntimeBehaviorProfile[];
    runtimeInteractions: RepositoryRuntimeInteraction[];
    deploymentBoundaries: RepositoryDeploymentBoundary[];
    acceptedBoundaries: {
        approvedModules: string[];
        approvedServices: string[];
        forbiddenBoundaries: string[];
    };
    lineage: {
        previousSessionId: string | null;
        sessionLineage: string[];
        previousInvariantMemoryId: string | null;
    };
    historicalDriftPatterns: HistoricalDriftPattern[];
    recentObservationHashes: string[];
    fingerprint: string;
}
//# sourceMappingURL=intelligence.d.ts.map