import type { DriftIntelligenceReport } from '@neurcode-ai/contracts';
import type { ChangeSet } from '@neurcode-ai/core';
import type { ActiveEngineeringContext } from './active-engineering-context';
type RiskLevel = 'low' | 'medium' | 'high';
export interface ContextAwareBlastRadiusReport {
    filesChanged: number;
    functionsAffected: number;
    modulesAffected: string[];
    dependenciesAdded: string[];
    dependencyChanges: number;
    touchedCoreModule: boolean;
    riskScore: RiskLevel;
    rationale: string[];
    generatedAt: string;
    durationMs: number;
    affectedServices: string[];
    impactedModules: string[];
    impactedServices: string[];
    infraTouched: boolean;
    authTouched: boolean;
    apiTouched: boolean;
    deploymentTouched: boolean;
    dependencyManifestTouched: boolean;
    rolloutComplexity: RiskLevel;
    transitiveImpactCount: number;
    affectedRuntimeFlows: string[];
    affectedRolloutUnits: string[];
    cascadingRisk: 'low' | 'medium' | 'high' | 'critical';
    stateOwnershipExposure: boolean;
    externalSideEffectExposure: boolean;
    contextSource: 'intent-runtime' | 'fallback-plan';
}
export declare function buildDriftIntelligence(changeSet: ChangeSet, runtime: ActiveEngineeringContext | null): DriftIntelligenceReport;
export declare function buildContextAwareBlastRadius(changeSet: ChangeSet, runtime: ActiveEngineeringContext | null, baseline: {
    filesChanged: number;
    functionsAffected: number;
    modulesAffected: string[];
    dependenciesAdded: string[];
    dependencyChanges: number;
    touchedCoreModule: boolean;
    riskScore: RiskLevel;
    rationale: string[];
    generatedAt: string;
    durationMs: number;
}, drift: DriftIntelligenceReport): ContextAwareBlastRadiusReport;
export {};
//# sourceMappingURL=drift-intelligence.d.ts.map