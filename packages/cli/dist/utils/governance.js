"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateGovernance = evaluateGovernance;
const analysis_1 = require("@neurcode-ai/analysis");
const brain_1 = require("@neurcode-ai/brain");
const core_1 = require("@neurcode-ai/core");
const policy_1 = require("@neurcode-ai/policy");
const active_engineering_context_1 = require("./active-engineering-context");
const drift_intelligence_1 = require("./drift-intelligence");
const intelligence_runtime_common_1 = require("./intelligence-runtime-common");
const semantic_contract_intelligence_1 = require("./semantic-contract-intelligence");
function evaluateGovernance(input) {
    const runtimeContext = input.activeEngineeringContext ?? (0, active_engineering_context_1.loadActiveEngineeringContext)(input.projectRoot);
    const runtimeSemanticExpectations = runtimeContext?.intentPack.semanticExpectations || {
        ownershipBoundaries: [],
        contractIds: [],
        invariantIds: [],
        expectedResponsibilities: [],
        expectedBehaviorKinds: [],
        expectedRuntimeFlows: [],
        expectedRolloutUnits: [],
    };
    const runtimeExpectedFiles = runtimeContext?.intentPack.approvedScope.files ?? [];
    const runtimeContextCandidates = runtimeContext?.contextPack.selectedFiles.map((item) => item.path) ?? [];
    const runtimeDependencies = runtimeContext?.intentPack.expectedDependencies ?? [];
    const normalizedExpectedFiles = (0, intelligence_runtime_common_1.dedupeSortedPaths)([
        ...(runtimeExpectedFiles.length > 0 ? runtimeExpectedFiles : input.expectedFiles),
    ]);
    const effectiveTask = runtimeContext?.intentPack.intent.normalized || input.task;
    const effectiveDependencies = (0, intelligence_runtime_common_1.dedupeSorted)([
        ...(input.expectedDependencies || []),
        ...runtimeDependencies,
    ]);
    const planSpec = (0, analysis_1.buildPlanSpec)(effectiveTask, normalizedExpectedFiles, effectiveDependencies);
    const changedFiles = input.diffFiles
        .map((file) => (0, core_1.normalizeRepoPath)(file.path))
        .filter(Boolean);
    const localPolicy = (0, policy_1.loadContextPolicy)(input.projectRoot);
    const orgPolicy = input.orgGovernance?.contextPolicy;
    const effectiveContextPolicy = orgPolicy
        ? (0, policy_1.mergeContextPolicies)(localPolicy, orgPolicy)
        : localPolicy;
    const policySources = {
        localPolicy: true,
        orgPolicy: Boolean(orgPolicy),
        mode: orgPolicy ? 'merged' : 'local',
    };
    const contextPolicy = (0, policy_1.evaluateContextPolicyForChanges)(changedFiles, effectiveContextPolicy, runtimeContextCandidates.length > 0
        ? runtimeContextCandidates
        : input.contextCandidates || []);
    const brainMap = (0, brain_1.buildBrainRepositoryMap)(input.projectRoot, {
        changedFiles,
        persist: true,
    });
    const analysis = (0, analysis_1.summarizeGovernance)(effectiveTask, input.diffFiles, brainMap, planSpec);
    const driftIntelligence = (0, drift_intelligence_1.buildDriftIntelligence)(analysis.changeSet, runtimeContext);
    const updatedInvariantMemory = runtimeContext
        ? (0, semantic_contract_intelligence_1.recordDriftInInvariantMemory)(input.projectRoot, runtimeContext.sessionRuntime, runtimeContext.invariantMemory, driftIntelligence)
        : null;
    const blastRadius = (0, drift_intelligence_1.buildContextAwareBlastRadius)(analysis.changeSet, runtimeContext, analysis.blastRadius, driftIntelligence);
    const suspiciousUnexpectedFiles = (0, intelligence_runtime_common_1.dedupeSortedPaths)([
        ...analysis.suspiciousChange.unexpectedFiles,
        ...driftIntelligence.unexpectedFiles,
    ]);
    const suspiciousConfidence = driftIntelligence.confidence === 'high'
        ? 'high'
        : analysis.suspiciousChange.confidence === 'high'
            ? 'high'
            : driftIntelligence.confidence === 'medium' || analysis.suspiciousChange.confidence === 'medium'
                ? 'medium'
                : 'low';
    const suspiciousChange = {
        ...analysis.suspiciousChange,
        unexpectedFiles: suspiciousUnexpectedFiles,
        actualFiles: analysis.suspiciousChange.actualFiles + Math.max(0, driftIntelligence.changedFiles.length - analysis.suspiciousChange.actualFiles),
        flagged: analysis.suspiciousChange.flagged || driftIntelligence.flagged,
        confidence: suspiciousConfidence,
        reason: driftIntelligence.narratives.length > 0
            ? driftIntelligence.narratives.slice(0, 2).map((item) => item.summary).join(' ')
            : driftIntelligence.findings.length > 0
                ? driftIntelligence.findings.slice(0, 2).map((item) => item.message).join(' ')
                : driftIntelligence.riskSynthesis.summary
                    ? driftIntelligence.riskSynthesis.summary
                    : analysis.suspiciousChange.reason,
        driftIntelligence,
    };
    const governanceDecision = (0, analysis_1.evaluateGovernanceDecision)(analysis.changeJustification, blastRadius, suspiciousChange, contextPolicy);
    const writtenChangeLog = (0, analysis_1.writeAiChangeLogWithIntegrity)(input.projectRoot, analysis.changeJustification, {
        signingKey: input.signingKey,
        keyId: input.signingKeyId,
        signer: input.signer,
    });
    let aiChangeLogIntegrity = writtenChangeLog.integrity;
    let governanceDecisionFinal = governanceDecision;
    const requireSignedAiLogs = input.requireSignedAiLogs === true;
    if (requireSignedAiLogs) {
        aiChangeLogIntegrity = (0, analysis_1.verifyAiChangeLogIntegrity)(input.projectRoot, {
            requiredSigned: true,
            signingKey: input.signingKey,
            signingKeys: input.signingKeys || undefined,
        });
    }
    if (requireSignedAiLogs && !aiChangeLogIntegrity.valid) {
        governanceDecisionFinal = {
            ...governanceDecisionFinal,
            decision: 'block',
            reasonCodes: [...new Set([...governanceDecisionFinal.reasonCodes, 'ai_change_log_integrity'])],
            summary: 'Block change set until signed AI change-log integrity is valid',
            requiresManualApproval: false,
        };
    }
    return {
        planSpec,
        changeSet: analysis.changeSet,
        effectiveContextPolicy,
        policySources,
        contextPolicy,
        changeJustification: analysis.changeJustification,
        blastRadius,
        suspiciousChange,
        governanceDecision: governanceDecisionFinal,
        aiChangeLogPath: writtenChangeLog.path,
        aiChangeLogAuditPath: writtenChangeLog.auditPath,
        aiChangeLogIntegrity,
        engineeringContext: runtimeContext
            ? {
                source: 'intent-runtime',
                sessionId: runtimeContext.sessionRuntime.sessionId,
                intentPackId: runtimeContext.intentPack.intentPackId,
                contextPackId: runtimeContext.contextPack.contextPackId,
                repositoryGraphId: runtimeContext.repositoryGraph.graphId,
                approvedScope: runtimeContext.intentPack.approvedScope,
                intentSummary: runtimeContext.intentPack.intent.normalized,
                constraints: [...runtimeContext.intentPack.constraints],
                expectedDependencies: [...runtimeContext.intentPack.expectedDependencies],
                expectedInfrastructure: [...runtimeContext.intentPack.expectedInfrastructure],
                rolloutExpectations: [...runtimeContext.intentPack.rolloutExpectations],
                governanceExpectations: [...runtimeContext.intentPack.governanceExpectations],
                forbiddenBoundaries: runtimeContext.intentPack.forbiddenBoundaries.map((item) => ({
                    type: item.type,
                    path: item.path,
                    policy: item.policy,
                    reason: item.reason,
                })),
                semanticExpectations: {
                    ownershipBoundaries: [...runtimeSemanticExpectations.ownershipBoundaries],
                    contractIds: [...runtimeSemanticExpectations.contractIds],
                    invariantIds: [...runtimeSemanticExpectations.invariantIds],
                    expectedResponsibilities: [...runtimeSemanticExpectations.expectedResponsibilities],
                    expectedBehaviorKinds: [...runtimeSemanticExpectations.expectedBehaviorKinds],
                    expectedRuntimeFlows: [...runtimeSemanticExpectations.expectedRuntimeFlows],
                    expectedRolloutUnits: [...runtimeSemanticExpectations.expectedRolloutUnits],
                },
                expectedBlastRadius: runtimeContext.intentPack.expectedBlastRadius,
                contextFiles: runtimeContext.contextPack.selectedFiles.map((item) => ({
                    path: item.path,
                    confidence: item.confidence,
                    source: item.source,
                })),
                serviceBoundaries: runtimeContext.contextPack.serviceBoundaries.map((item) => ({
                    name: item.name,
                    path: item.path,
                    kind: item.kind,
                })),
                ownershipBoundaries: (runtimeContext.repositoryGraph.semantic?.ownershipBoundaries || []).slice(0, 16).map((item) => ({
                    name: item.name,
                    domain: item.domain,
                    kind: item.kind,
                    primaryOwner: item.stewardship.primaryOwner,
                    responsibilities: [...item.responsibilities],
                    forbiddenResponsibilities: [...item.forbiddenResponsibilities],
                    criticality: item.criticality,
                })),
                semanticContracts: (runtimeContext.repositoryGraph.semantic?.contracts || []).slice(0, 20).map((item) => ({
                    id: item.id,
                    name: item.name,
                    kind: item.kind,
                    boundaryName: item.boundaryName,
                    expectedResponsibilities: [...item.expectedResponsibilities],
                    forbiddenResponsibilities: [...item.forbiddenResponsibilities],
                    forbiddenDependencyKinds: [...item.forbiddenDependencyKinds],
                })),
                invariants: (runtimeContext.repositoryGraph.semantic?.invariants || []).slice(0, 20).map((item) => ({
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    expectation: item.expectation,
                    impact: item.impact,
                    boundaryName: item.boundaryName,
                })),
                runtimeBehaviors: (runtimeContext.repositoryGraph.semantic?.runtime.behaviorProfiles || []).slice(0, 20).map((item) => ({
                    boundaryName: item.boundaryName,
                    behaviorKinds: [...item.behaviorKinds],
                    sideEffectKinds: [...item.sideEffectKinds],
                    stateSurfaces: [...item.stateSurfaces],
                    rolloutUnits: [...item.rolloutUnits],
                    runtimeEnvironments: [...item.runtimeEnvironments],
                    criticalFlows: [...item.criticalFlows],
                })),
                runtimeInteractions: (runtimeContext.repositoryGraph.semantic?.runtime.interactions || []).slice(0, 24).map((item) => ({
                    kind: item.kind,
                    fromBoundaryName: item.fromBoundaryName,
                    toBoundaryName: item.toBoundaryName,
                    subject: item.subject,
                    rationale: item.rationale,
                })),
                deploymentBoundaries: (runtimeContext.repositoryGraph.semantic?.runtime.deploymentBoundaries || []).slice(0, 16).map((item) => ({
                    name: item.name,
                    type: item.type,
                    rolloutUnits: [...item.rolloutUnits],
                    runtimeEnvironments: [...item.runtimeEnvironments],
                    dependentBoundaryNames: [...item.dependentBoundaryNames],
                })),
                invariantMemory: updatedInvariantMemory
                    ? {
                        invariantMemoryId: updatedInvariantMemory.invariantMemoryId,
                        historicalDriftPatterns: updatedInvariantMemory.historicalDriftPatterns.slice(0, 12).map((item) => ({
                            category: item.category,
                            count: item.count,
                            latestSummary: item.latestSummary,
                        })),
                    }
                    : null,
                relatedModules: runtimeContext.contextPack.relatedModules,
                sessionLineage: runtimeContext.sessionRuntime.continuity.lineage,
                warnings: runtimeContext.warnings,
            }
            : {
                source: 'legacy-plan',
                sessionId: null,
                intentPackId: null,
                contextPackId: null,
                repositoryGraphId: null,
                approvedScope: {
                    files: normalizedExpectedFiles,
                    modules: planSpec.expectedModules,
                    services: [],
                },
                intentSummary: effectiveTask,
                constraints: [],
                expectedDependencies: effectiveDependencies,
                expectedInfrastructure: [],
                rolloutExpectations: [],
                governanceExpectations: [],
                forbiddenBoundaries: [],
                semanticExpectations: {
                    ownershipBoundaries: [],
                    contractIds: [],
                    invariantIds: [],
                    expectedResponsibilities: [],
                    expectedBehaviorKinds: [],
                    expectedRuntimeFlows: [],
                    expectedRolloutUnits: [],
                },
                expectedBlastRadius: null,
                contextFiles: [],
                serviceBoundaries: [],
                ownershipBoundaries: [],
                semanticContracts: [],
                invariants: [],
                runtimeBehaviors: [],
                runtimeInteractions: [],
                deploymentBoundaries: [],
                invariantMemory: null,
                relatedModules: planSpec.expectedModules,
                sessionLineage: [],
                warnings: ['Active intent runtime not found. Governance fell back to plan-derived scope inference.'],
            },
        driftIntelligence,
    };
}
//# sourceMappingURL=governance.js.map