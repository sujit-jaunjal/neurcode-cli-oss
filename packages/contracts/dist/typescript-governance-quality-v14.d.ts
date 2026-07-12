export declare const GOVERNANCE_CALIBRATION_V14_SCHEMA_VERSION: "neurcode.governance-calibration.v1.4";
export type GovernanceCalibrationDecision = 'allow' | 'block' | 'advisory' | 'unknown';
export type GovernanceCalibrationHost = 'codex' | 'cursor' | 'claude_code';
export type GovernanceCalibrationHostStatus = 'real' | 'quota_unavailable' | 'authentication_unavailable' | 'binary_unavailable' | 'failed';
export interface GovernanceCalibrationV14Session {
    schemaVersion: typeof GOVERNANCE_CALIBRATION_V14_SCHEMA_VERSION;
    scenarioId: string;
    repositoryId: string;
    host: GovernanceCalibrationHost;
    hostStatus: GovernanceCalibrationHostStatus;
    includeInRealHostMetrics: boolean;
    labelledBeforeRun: boolean;
    labelHash: string;
    expectedDecision: GovernanceCalibrationDecision;
    predictedDecision: GovernanceCalibrationDecision | null;
    deterministicAuthorityExpected: boolean;
    deterministicAuthorityClaimed: boolean;
    hostPlanCaptured: boolean;
    runtimeDriver: 'host_automatic' | 'calibration_harness' | 'none';
    automaticHostInterceptionProven: boolean;
    handshakeRecorded: boolean;
    planRecorded: boolean;
    preWriteRecorded: boolean;
    denialRecorded: boolean;
    exactApprovalRecorded: boolean;
    exactPathContainmentPassed: boolean | null;
    finishRecorded: boolean;
    evidenceReconstructed: boolean;
    backendSignedReceipt: boolean;
    latencyMs: number;
    approvalFrictionMs: number | null;
    failureReason: string | null;
}
export interface GovernanceCalibrationV14Summary {
    schemaVersion: typeof GOVERNANCE_CALIBRATION_V14_SCHEMA_VERSION;
    labelledSessions: number;
    attemptedSessions: number;
    realHostSessions: number;
    excludedSessions: number;
    correct: number;
    accuracy: number | null;
    precision: number | null;
    recall: number | null;
    falsePositiveRate: number | null;
    falseNegativeRate: number | null;
    abstentionRate: number | null;
    deterministicAuthorityViolations: number;
    exactPathContainmentFailures: number;
    reconstructionMismatches: number;
    automaticInterceptionProven: number;
    harnessDrivenRuntimeSessions: number;
    latencyP50Ms: number | null;
    latencyP95Ms: number | null;
    approvalFrictionP95Ms: number | null;
    byHost: Record<GovernanceCalibrationHost, {
        status: GovernanceCalibrationHostStatus | 'not_attempted';
        attempted: number;
        included: number;
        correct: number;
        accuracy: number | null;
        automaticInterceptionProven: number;
    }>;
}
export declare function governanceCalibrationSessionCountsAsReal(session: Pick<GovernanceCalibrationV14Session, 'hostStatus' | 'includeInRealHostMetrics' | 'hostPlanCaptured'>): boolean;
export declare function summarizeGovernanceCalibrationV14(sessions: GovernanceCalibrationV14Session[]): GovernanceCalibrationV14Summary;
//# sourceMappingURL=typescript-governance-quality-v14.d.ts.map