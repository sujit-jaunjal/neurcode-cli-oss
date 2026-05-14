import type { DriftIntelligenceCategory, GovernanceDecisionState } from '@neurcode-ai/contracts';
export declare const GOVERNANCE_DECISIONS_SCHEMA_VERSION = "neurcode.governance-decisions.v1";
export interface GovernanceDecisionRecord {
    id: string;
    state: GovernanceDecisionState;
    findingId: string | null;
    category: DriftIntelligenceCategory | null;
    file: string | null;
    module: string | null;
    service: string | null;
    reason: string;
    actor: string;
    decidedAt: string;
    expiresAt: string | null;
    temporary: boolean;
}
export interface GovernanceDecisionDiagnostic {
    severity: 'info' | 'warning' | 'error';
    code: string;
    decisionId: string | null;
    message: string;
    remediation?: string;
}
export interface GovernanceDecisionRegistry {
    sourcePath: string | null;
    decisions: GovernanceDecisionRecord[];
    invalidEntries: number;
    rawDecisionCount: number;
    diagnostics: GovernanceDecisionDiagnostic[];
}
export interface GovernanceDecisionHygieneSummary {
    sourcePath: string | null;
    totalDecisions: number;
    activeDecisions: number;
    expiredDecisions: number;
    invalidEntries: number;
    issueCount: number;
    errorCount: number;
    warningCount: number;
    issues: GovernanceDecisionDiagnostic[];
}
export declare function getGovernanceDecisionsPath(projectRoot: string): string;
export declare function isGovernanceDecisionState(value: unknown): value is GovernanceDecisionState;
export declare function isDriftIntelligenceCategory(value: unknown): value is DriftIntelligenceCategory;
export declare function listDriftIntelligenceCategories(): DriftIntelligenceCategory[];
export declare function isGovernanceDecisionExpired(decision: Pick<GovernanceDecisionRecord, 'expiresAt'>, now?: number): boolean;
export declare function isGovernanceDecisionOverride(state: GovernanceDecisionState): boolean;
export declare function readGovernanceDecisionRegistry(projectRoot: string): GovernanceDecisionRegistry;
export declare function writeGovernanceDecisionRegistry(projectRoot: string, decisions: GovernanceDecisionRecord[]): string;
export declare function resolveGovernanceActor(projectRoot: string, explicit?: string): string;
export declare function resolveGovernanceDecisionExpiry(input: {
    expiresAt?: string;
    expiresInDays?: number;
    required?: boolean;
}): string | null;
export declare function buildGovernanceDecision(input: {
    state: GovernanceDecisionState;
    findingId?: string | null;
    category?: DriftIntelligenceCategory | null;
    file?: string | null;
    module?: string | null;
    service?: string | null;
    reason: string;
    actor: string;
    expiresAt?: string | null;
    temporary?: boolean;
    decidedAt?: string;
}): GovernanceDecisionRecord;
export declare function addGovernanceDecision(projectRoot: string, decision: GovernanceDecisionRecord): {
    decision: GovernanceDecisionRecord;
    sourcePath: string;
    totalDecisions: number;
};
export declare function summarizeGovernanceDecisionHygiene(registry: GovernanceDecisionRegistry): GovernanceDecisionHygieneSummary;
//# sourceMappingURL=governance-decisions.d.ts.map