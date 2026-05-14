import { type PolicyGovernanceConfig } from './policy-governance';
import { type ExecutionSource } from './execution-bus';
declare const CONTROL_PLANE_SCHEMA: "neurcode.control-plane.v1";
declare const RUNTIME_SCHEMA: "neurcode.control-plane.runtime.v1";
declare const REMEDIATION_SCHEMA: "neurcode.control-plane.remediation.v1";
declare const EVIDENCE_SCHEMA: "neurcode.control-plane.evidence.v1";
declare const EVENT_RUNTIME_SCHEMA: "neurcode.control-plane.event-runtime.v1";
declare const CI_GOVERNANCE_SCHEMA: "neurcode.control-plane.ci-governance.v1";
export interface RuntimeGovernanceConfig {
    schemaVersion: typeof RUNTIME_SCHEMA;
    execution: {
        duplicateSuppression: boolean;
        dedupeWindowMs: number;
        maxConcurrentExecutions: number;
        replayEnabled: boolean;
        lockTimeoutMs: number;
    };
    verification: {
        autoReverify: boolean;
        deterministicOnlyInCi: boolean;
        allowPolicyOnlyFallback: boolean;
        ciEnforcement: 'strict' | 'advisory';
    };
    retention: {
        executionRecords: number;
    };
}
export interface RemediationGovernanceConfig {
    schemaVersion: typeof REMEDIATION_SCHEMA;
    automation: {
        autonomousApplySafe: boolean;
        maxAutoPatchesPerExecution: number;
        requireManualApprovalAtRisk: 'none' | 'high' | 'critical';
    };
    safety: {
        rollbackOnRegression: boolean;
        requireCleanWorkingTree: boolean;
    };
}
export interface EvidenceGovernanceConfig {
    schemaVersion: typeof EVIDENCE_SCHEMA;
    collection: {
        enabledByDefault: boolean;
        directory: string;
        retentionMaxArtifacts: number;
    };
    redaction: {
        maskSecrets: boolean;
        maskSensitivePaths: boolean;
    };
}
export interface EventRuntimeGovernanceConfig {
    schemaVersion: typeof EVENT_RUNTIME_SCHEMA;
    stream: {
        enabled: boolean;
        transport: 'sse';
        heartbeatMs: number;
        replayBatchSize: number;
    };
    retention: {
        maxEvents: number;
    };
}
export interface CiGovernanceConfig {
    schemaVersion: typeof CI_GOVERNANCE_SCHEMA;
    mode: {
        verifyCiMode: boolean;
        deterministicOnly: boolean;
        nonInteractiveOnly: boolean;
    };
    enforcement: {
        strictness: 'strict' | 'advisory';
        allowMissingIntent: boolean;
        allowMissingLocalRuntimeState: boolean;
        requireDeterministicArtifacts: boolean;
    };
}
export interface ControlPlaneState {
    schemaVersion: typeof CONTROL_PLANE_SCHEMA;
    generatedAt: string;
    rootDir: string;
    runtime: RuntimeGovernanceConfig;
    remediation: RemediationGovernanceConfig;
    evidence: EvidenceGovernanceConfig;
    eventRuntime: EventRuntimeGovernanceConfig;
    ciGovernance: CiGovernanceConfig;
    policyGovernance: PolicyGovernanceConfig;
    metadata: {
        files: {
            runtime: string;
            remediation: string;
            evidence: string;
            eventRuntime: string;
            ciGovernance: string;
            policyGovernance: string;
        };
        snapshots: {
            directory: string;
            retentionLimit: number;
            count: number;
            latestPath: string | null;
            latestId: string | null;
            latestAt: string | null;
        };
    };
}
export interface ControlPlaneUpdatePatch {
    runtime?: Partial<Omit<RuntimeGovernanceConfig, 'schemaVersion'>>;
    remediation?: Partial<Omit<RemediationGovernanceConfig, 'schemaVersion'>>;
    evidence?: Partial<Omit<EvidenceGovernanceConfig, 'schemaVersion'>>;
    eventRuntime?: Partial<Omit<EventRuntimeGovernanceConfig, 'schemaVersion'>>;
    ciGovernance?: Partial<Omit<CiGovernanceConfig, 'schemaVersion'>>;
    policyGovernance?: Partial<{
        required: boolean;
        minApprovals: number;
        disallowSelfApproval: boolean;
        allowedApprovers: string[];
        requireReason: boolean;
        minReasonLength: number;
        maxExpiryDays: number;
        criticalRulePatterns: string[];
        criticalMinApprovals: number;
        requireAuditIntegrity: boolean;
    }>;
}
export interface ControlPlaneImpactItem {
    id: string;
    severity: 'low' | 'medium' | 'high';
    title: string;
    summary: string;
    affectedSystems: Array<'runtime' | 'policy' | 'remediation' | 'evidence' | 'events' | 'ci' | 'dashboard' | 'vscode' | 'daemon' | 'cli'>;
}
export interface ControlPlaneImpactPreview {
    schemaVersion: 'neurcode.control-plane.impact.v1';
    generatedAt: string;
    riskLevel: 'low' | 'medium' | 'high';
    changedSections: string[];
    changedKeys: string[];
    items: ControlPlaneImpactItem[];
}
export interface ControlPlaneUpdateResult {
    previous: ControlPlaneState;
    current: ControlPlaneState;
    impact: ControlPlaneImpactPreview;
    snapshotPath: string | null;
    snapshotId: string | null;
    executionId: string | null;
}
export interface ControlPlaneSnapshotLineage {
    provenanceRunId?: string | null;
    replayChecksum?: string | null;
    verificationSource?: string | null;
    planId?: string | null;
    policyLockFingerprint?: string | null;
    compiledPolicyFingerprint?: string | null;
}
export declare function readControlPlaneState(cwd?: string): ControlPlaneState;
export declare function previewControlPlaneUpdate(patch: ControlPlaneUpdatePatch, cwd?: string): {
    previous: ControlPlaneState;
    current: ControlPlaneState;
    impact: ControlPlaneImpactPreview;
};
export declare function applyControlPlaneUpdate(patch: ControlPlaneUpdatePatch, options?: {
    cwd?: string;
    actor?: string;
    source?: ExecutionSource;
    reason?: string;
}): ControlPlaneUpdateResult;
export declare function captureControlPlaneSnapshot(options?: {
    cwd?: string;
    actor?: string;
    source?: ExecutionSource;
    reason?: string;
    lineage?: ControlPlaneSnapshotLineage;
}): {
    snapshotPath: string;
    snapshotId: string;
};
export declare function readControlPlaneSnapshotHistory(cwd?: string, limit?: number): Array<{
    snapshotId: string;
    createdAt: string;
    actor: string;
    source: ExecutionSource;
    riskLevel: 'low' | 'medium' | 'high';
    snapshotPath: string;
    changedSections: string[];
}>;
export {};
//# sourceMappingURL=control-plane.d.ts.map