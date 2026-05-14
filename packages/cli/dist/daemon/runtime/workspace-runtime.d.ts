import { type ExecutionActionType, type ExecutionRecord, type ExecutionSource } from './execution-bus';
declare const WORKSPACE_SCHEMA: "neurcode.workspace.v1";
declare const WORKSPACE_RUNTIME_SCHEMA: "neurcode.workspace-runtime.v1";
type GovernanceRiskLevel = 'low' | 'medium' | 'high';
type RepositoryHealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';
export type WorkspaceRole = 'workspace_admin' | 'governance_admin' | 'engineer' | 'auditor';
export interface WorkspaceMember {
    actor: string;
    role: WorkspaceRole;
}
export interface WorkspaceRepository {
    id: string;
    name: string;
    rootPath: string;
    services: string[];
    policyDomain: string | null;
    tags: string[];
    enabled: boolean;
}
export interface WorkspaceControlPlaneOverrides {
    runtime?: Record<string, unknown>;
    remediation?: Record<string, unknown>;
    evidence?: Record<string, unknown>;
    eventRuntime?: Record<string, unknown>;
    ciGovernance?: Record<string, unknown>;
}
export interface WorkspaceDefinition {
    schemaVersion: typeof WORKSPACE_SCHEMA;
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    repositories: WorkspaceRepository[];
    governance: {
        posture: {
            targetRisk: GovernanceRiskLevel;
            enforcement: 'strict' | 'balanced' | 'advisory';
            notes: string | null;
        };
        controlPlane: {
            inherit: boolean;
            overrides: WorkspaceControlPlaneOverrides;
        };
        policy: {
            workspacePacks: string[];
            repositoryPackOverrides: Record<string, string[]>;
            precedence: 'workspace-first' | 'repo-first';
        };
        evidence: {
            retentionMaxArtifacts: number;
            indexLimit: number;
        };
        remediation: {
            autonomousApplySafe: boolean;
            requireManualApprovalAtRisk: 'none' | 'high' | 'critical';
        };
        runtime: {
            executionRetention: number;
            eventRetention: number;
        };
    };
    access: {
        defaultRole: WorkspaceRole;
        members: WorkspaceMember[];
    };
}
export interface WorkspaceSummary {
    id: string;
    name: string;
    description: string | null;
    updatedAt: string;
    repositoryCount: number;
    enabledRepositoryCount: number;
    posture: WorkspaceDefinition['governance']['posture'];
}
export interface WorkspaceRepositoryHealth {
    workspaceId: string;
    repositoryId: string;
    repositoryName: string;
    rootPath: string;
    exists: boolean;
    status: RepositoryHealthStatus;
    riskLevel: GovernanceRiskLevel;
    riskScore: number;
    runs: number;
    passRate: number;
    blockRate: number;
    averageBlocking: number;
    averageAdvisory: number;
    regressionRate: number;
    coverageScore: number | null;
    lastRunAt: string | null;
    policyDrift: boolean;
    topPolicies: Array<{
        policy: string;
        occurrences: number;
    }>;
    topFiles: Array<{
        file: string;
        occurrences: number;
    }>;
    services: string[];
    policyDomain: string | null;
}
export interface WorkspaceHotspot {
    key: string;
    kind: 'file' | 'policy' | 'directory';
    score: number;
    occurrences: number;
    repositoryCount: number;
}
export interface WorkspaceRuntimeActivity {
    eventCounts: Record<string, number>;
    recentEvents: Array<{
        cursor: string;
        type: string;
        timestamp: string;
        source: string;
        actor: string;
        severity: string;
        executionId: string;
        repositoryId: string;
        repositoryName: string;
    }>;
}
export interface WorkspacePostureSummary {
    workspaceId: string;
    workspaceName: string;
    repositoryCount: number;
    healthyRepositories: number;
    degradedRepositories: number;
    criticalRepositories: number;
    overallRiskLevel: GovernanceRiskLevel;
    overallRiskScore: number;
    passRate: number;
    blockRate: number;
    averageCoverageScore: number | null;
    regressionConcentration: Array<{
        repositoryId: string;
        repositoryName: string;
        regressionRate: number;
    }>;
    policyDriftRepositories: number;
    unstableServices: string[];
}
export interface WorkspaceRuntimeSnapshot {
    schemaVersion: typeof WORKSPACE_RUNTIME_SCHEMA;
    generatedAt: string;
    rootDir: string;
    activeWorkspaceId: string | null;
    activeWorkspaceRole: WorkspaceRole;
    workspaces: WorkspaceSummary[];
    workspace: WorkspaceDefinition | null;
    effectiveControlPlane: {
        inherited: boolean;
        overridesApplied: Array<'runtime' | 'remediation' | 'evidence' | 'eventRuntime' | 'ciGovernance'>;
        runtime: Record<string, unknown>;
        remediation: Record<string, unknown>;
        evidence: Record<string, unknown>;
        eventRuntime: Record<string, unknown>;
        ciGovernance: Record<string, unknown>;
    } | null;
    repositoryHealthMatrix: WorkspaceRepositoryHealth[];
    hotspots: {
        files: WorkspaceHotspot[];
        policies: WorkspaceHotspot[];
        directories: WorkspaceHotspot[];
    };
    runtimeActivity: WorkspaceRuntimeActivity;
    posture: WorkspacePostureSummary | null;
}
export interface CreateWorkspaceInput {
    id?: string;
    name: string;
    description?: string | null;
    repositories?: Array<Partial<WorkspaceRepository>>;
    governance?: Partial<WorkspaceDefinition['governance']>;
    access?: Partial<WorkspaceDefinition['access']>;
}
export interface WorkspaceMutationResult {
    workspace: WorkspaceDefinition;
    executionId: string;
}
export interface AddWorkspaceRepositoryInput {
    id?: string;
    name: string;
    rootPath: string;
    services?: string[];
    policyDomain?: string | null;
    tags?: string[];
    enabled?: boolean;
}
export interface WorkspaceExecutionRequest {
    workspaceId?: string;
    repositoryIds?: string[];
    type: ExecutionActionType;
    source?: ExecutionSource;
    actor?: string;
    target?: string | null;
    intentText?: string | null;
    reverify?: boolean;
    ciMode?: boolean;
    evidenceDir?: string;
    dedupeWindowMs?: number;
}
export interface WorkspaceExecutionItem {
    repositoryId: string;
    repositoryName: string;
    rootPath: string;
    ok: boolean;
    execution: ExecutionRecord | null;
    primaryPayload: Record<string, unknown> | null;
    verificationPayload: Record<string, unknown> | null;
    error: string | null;
}
export interface WorkspaceExecutionResult {
    workspaceId: string;
    workspaceName: string;
    executionId: string;
    source: ExecutionSource;
    actor: string;
    type: ExecutionActionType;
    startedAt: string;
    completedAt: string;
    totals: {
        repositories: number;
        attempted: number;
        succeeded: number;
        failed: number;
    };
    items: WorkspaceExecutionItem[];
}
export interface WorkspaceReplayAttestationResult {
    required: boolean;
    snapshotId: string | null;
    snapshotPath: string | null;
    workspaceId: string | null;
}
export declare function listWorkspaces(cwd?: string): WorkspaceSummary[];
export declare function getWorkspaceById(workspaceId: string, cwd?: string): WorkspaceDefinition | null;
export declare function getActiveWorkspace(cwd?: string): WorkspaceDefinition | null;
export declare function createWorkspace(input: CreateWorkspaceInput, options?: {
    cwd?: string;
    source?: ExecutionSource;
    actor?: string;
    setActive?: boolean;
}): WorkspaceMutationResult;
export declare function setActiveWorkspace(workspaceId: string, options?: {
    cwd?: string;
    source?: ExecutionSource;
    actor?: string;
}): WorkspaceMutationResult;
export declare function addWorkspaceRepository(workspaceId: string, input: AddWorkspaceRepositoryInput, options?: {
    cwd?: string;
    source?: ExecutionSource;
    actor?: string;
}): WorkspaceMutationResult;
export declare function updateWorkspace(workspaceId: string, patch: Partial<Omit<WorkspaceDefinition, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'>>, options?: {
    cwd?: string;
    source?: ExecutionSource;
    actor?: string;
}): WorkspaceMutationResult;
export declare function getWorkspaceRuntimeSnapshot(options?: {
    cwd?: string;
    workspaceId?: string;
    actor?: string | null;
}): WorkspaceRuntimeSnapshot;
export declare function captureWorkspaceReplayAttestation(options?: {
    cwd?: string;
    actor?: string | null;
    source?: ExecutionSource;
    action?: string;
    executionId?: string | null;
}): WorkspaceReplayAttestationResult;
export declare function executeWorkspaceAction(request: WorkspaceExecutionRequest, options?: {
    cwd?: string;
}): Promise<WorkspaceExecutionResult>;
export {};
//# sourceMappingURL=workspace-runtime.d.ts.map