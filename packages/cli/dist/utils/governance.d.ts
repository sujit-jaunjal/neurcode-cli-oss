import { DiffFile } from '@neurcode-ai/diff-parser';
import { AiChangeJustification, AiChangeLogIntegrityStatus, BlastRadiusReport, ChangeSet, ContextPolicy, ContextPolicyEvaluation, GovernanceDecisionReport, GovernancePlanSpec, OrgGovernanceSettings, SuspiciousChangeReport } from '@neurcode-ai/core';
import { type ActiveEngineeringContext } from './active-engineering-context';
import { buildDriftIntelligence } from './drift-intelligence';
export interface GovernanceEvaluationInput {
    projectRoot: string;
    task: string;
    expectedFiles: string[];
    expectedDependencies?: string[];
    diffFiles: DiffFile[];
    contextCandidates?: string[];
    orgGovernance?: OrgGovernanceSettings | null;
    requireSignedAiLogs?: boolean;
    signingKey?: string | null;
    signingKeyId?: string | null;
    signingKeys?: Record<string, string> | null;
    signer?: string;
    activeEngineeringContext?: ActiveEngineeringContext | null;
}
export interface GovernanceEvaluationResult {
    planSpec: GovernancePlanSpec;
    changeSet: ChangeSet;
    effectiveContextPolicy: ContextPolicy;
    policySources: {
        localPolicy: boolean;
        orgPolicy: boolean;
        mode: 'local' | 'merged' | 'org_only';
    };
    contextPolicy: ContextPolicyEvaluation;
    changeJustification: AiChangeJustification;
    blastRadius: BlastRadiusReport;
    suspiciousChange: SuspiciousChangeReport;
    governanceDecision: GovernanceDecisionReport;
    aiChangeLogPath: string;
    aiChangeLogAuditPath: string;
    aiChangeLogIntegrity: AiChangeLogIntegrityStatus;
    engineeringContext: {
        source: 'intent-runtime' | 'legacy-plan';
        sessionId: string | null;
        intentPackId: string | null;
        contextPackId: string | null;
        repositoryGraphId: string | null;
        approvedScope: {
            files: string[];
            modules: string[];
            services: string[];
        };
        intentSummary: string | null;
        constraints: string[];
        expectedDependencies: string[];
        expectedInfrastructure: string[];
        rolloutExpectations: string[];
        governanceExpectations: string[];
        forbiddenBoundaries: Array<{
            type: string;
            path: string;
            policy: string;
            reason: string;
        }>;
        expectedBlastRadius: unknown;
        contextFiles: Array<{
            path: string;
            confidence: number;
            source: string;
        }>;
        serviceBoundaries: Array<{
            name: string;
            path: string;
            kind: string;
        }>;
        semanticExpectations: {
            ownershipBoundaries: string[];
            contractIds: string[];
            invariantIds: string[];
            expectedResponsibilities: string[];
            expectedBehaviorKinds: string[];
            expectedRuntimeFlows: string[];
            expectedRolloutUnits: string[];
        };
        ownershipBoundaries: Array<{
            name: string;
            domain: string;
            kind: string;
            primaryOwner: string;
            responsibilities: string[];
            forbiddenResponsibilities: string[];
            criticality: string;
        }>;
        semanticContracts: Array<{
            id: string;
            name: string;
            kind: string;
            boundaryName: string | null;
            expectedResponsibilities: string[];
            forbiddenResponsibilities: string[];
            forbiddenDependencyKinds: string[];
        }>;
        invariants: Array<{
            id: string;
            name: string;
            category: string;
            expectation: string;
            impact: string;
            boundaryName: string | null;
        }>;
        runtimeBehaviors: Array<{
            boundaryName: string;
            behaviorKinds: string[];
            sideEffectKinds: string[];
            stateSurfaces: string[];
            rolloutUnits: string[];
            runtimeEnvironments: string[];
            criticalFlows: string[];
        }>;
        runtimeInteractions: Array<{
            kind: string;
            fromBoundaryName: string;
            toBoundaryName: string | null;
            subject: string;
            rationale: string;
        }>;
        deploymentBoundaries: Array<{
            name: string;
            type: string;
            rolloutUnits: string[];
            runtimeEnvironments: string[];
            dependentBoundaryNames: string[];
        }>;
        invariantMemory: {
            invariantMemoryId: string | null;
            historicalDriftPatterns: Array<{
                category: string;
                count: number;
                latestSummary: string;
            }>;
        } | null;
        relatedModules: string[];
        sessionLineage: string[];
        warnings: string[];
    };
    driftIntelligence: ReturnType<typeof buildDriftIntelligence>;
}
export declare function evaluateGovernance(input: GovernanceEvaluationInput): GovernanceEvaluationResult;
//# sourceMappingURL=governance.d.ts.map