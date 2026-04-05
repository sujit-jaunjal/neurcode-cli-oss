import { NeurcodeConfig } from './config';
export interface AnalyzeDiffRequest {
    diff: string;
    projectId?: string;
}
export interface AnalyzeDiffResponse {
    logId: string;
    decision: 'allow' | 'warn' | 'block';
    violations: Array<{
        rule: string;
        file: string;
        severity: 'allow' | 'warn' | 'block';
        message?: string;
    }>;
    summary: {
        totalFiles: number;
        totalAdded: number;
        totalRemoved: number;
        files: Array<{
            path: string;
            changeType: 'add' | 'delete' | 'modify' | 'rename';
            added: number;
            removed: number;
        }>;
    };
}
export interface AnalyzeBloatResponse {
    analysis: {
        redundancy: {
            originalLines: number;
            suggestedLines: number;
            redundancyPercentage: number;
            redundantBlocks: Array<{
                lines: [number, number];
                reason: string;
                suggestion: string;
            }>;
            tokenSavings: number;
            costSavings: number;
        };
        intentMatch: {
            matches: boolean;
            confidence: number;
            explanation: string;
            mismatches: Array<{
                file: string;
                reason: string;
            }>;
        };
        recommendation: 'block' | 'warn' | 'allow';
        summary: string;
    };
    sessionId?: string;
    timestamp: string;
}
export interface CreateShipCardRequest {
    goal: string;
    status: 'READY_TO_MERGE' | 'BLOCKED';
    mergeConfidence: number;
    riskScore: number;
    verification: {
        verdict?: string;
        grade?: string;
        score?: number;
        violations?: number;
    };
    repoUrl?: string;
    commitSha?: string;
    branch?: string;
    workflowRunId?: string;
    projectId?: string;
    card: Record<string, unknown>;
}
export interface CreateShipCardResponse {
    id: string;
    shareToken: string;
    shareUrl: string;
    createdAt: string;
    message: string;
}
export interface OrgGovernanceSettingsResponse {
    settings: {
        contextPolicy: {
            allowRead: string[];
            denyRead: string[];
            denyModify: string[];
        };
        requireSignedAiLogs: boolean;
        requireManualApproval: boolean;
        minimumManualApprovals: number;
        policyGovernance?: {
            schemaVersion?: number;
            exceptionApprovals?: {
                required?: boolean;
                minApprovals?: number;
                disallowSelfApproval?: boolean;
                allowedApprovers?: string[];
                requireReason?: boolean;
                minReasonLength?: number;
                maxExpiryDays?: number;
                criticalRulePatterns?: string[];
                criticalMinApprovals?: number;
            };
            audit?: {
                requireIntegrity?: boolean;
            };
        };
        updatedAt: string | null;
    };
}
export interface UpdateOrgGovernanceSettingsRequest {
    contextPolicy?: {
        allowRead?: string[];
        denyRead?: string[];
        denyModify?: string[];
    };
    requireSignedAiLogs?: boolean;
    requireManualApproval?: boolean;
    minimumManualApprovals?: number;
    policyGovernance?: {
        schemaVersion?: number;
        exceptionApprovals?: {
            required?: boolean;
            minApprovals?: number;
            disallowSelfApproval?: boolean;
            allowedApprovers?: string[];
            requireReason?: boolean;
            minReasonLength?: number;
            maxExpiryDays?: number;
            criticalRulePatterns?: string[];
            criticalMinApprovals?: number;
        };
        audit?: {
            requireIntegrity?: boolean;
        };
    };
}
export interface OrgPolicyExceptionApproval {
    id: string;
    exceptionId: string;
    organizationId: string;
    approverUserId: string;
    approverRole: string | null;
    approverEmail: string | null;
    approverFirstName: string | null;
    approverLastName: string | null;
    note: string | null;
    createdAt: string;
}
export interface OrgPolicyException {
    id: string;
    organizationId: string;
    rulePattern: string;
    filePattern: string;
    reason: string;
    ticket: string | null;
    requestedBy: string | null;
    requestedByEmail: string | null;
    requestedByFirstName: string | null;
    requestedByLastName: string | null;
    createdBy: string | null;
    severity: 'allow' | 'warn' | 'block' | null;
    workflowState: 'pending_approval' | 'approved' | 'rejected' | 'revoked';
    effectiveState: 'pending_approval' | 'approved' | 'rejected' | 'revoked' | 'expired';
    requiredApprovals: number;
    approvalCount: number;
    approvalsRemaining: number;
    critical: boolean;
    active: boolean;
    isExpired: boolean;
    isUsable: boolean;
    expiresAt: string;
    approvedBy: string | null;
    approvedAt: string | null;
    rejectedBy: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    revokedBy: string | null;
    revokedAt: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    approvals: OrgPolicyExceptionApproval[];
}
export interface OrgPolicyExceptionEvent {
    id: string;
    exceptionId: string;
    organizationId: string;
    actorUserId: string | null;
    actorRole: string | null;
    actorEmail: string | null;
    actorFirstName: string | null;
    actorLastName: string | null;
    action: 'created' | 'approval_recorded' | 'approved' | 'rejected' | 'revoked' | 'expired';
    note: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
}
export interface OrgAuditEvidenceBundle {
    schemaVersion: 1;
    generatedAt: string;
    organizationId: string;
    filters: {
        action: string | null;
        actorUserId: string | null;
        targetType: string | null;
        from: string | null;
        to: string | null;
        limit: number;
        includeEvents: boolean;
    };
    summary: {
        eventCount: number;
        truncated: boolean;
        checkedEvents: number;
        integrityVerified: boolean;
        latestEventHash: string | null;
    };
    settings: {
        auditRetentionDays: number;
        updatedAt: string | null;
    };
    integrity: {
        verified: boolean;
        checkedEvents: number;
        missingIntegrityEvents: number;
        signedEvents: number;
        signatureVerifiedEvents: number;
        signatureMissingEvents: number;
        signatureRequired: boolean;
        signatureVerificationAvailable: boolean;
        chainStartSeq: number | null;
        chainEndSeq: number | null;
        latestEventHash: string | null;
        issues: string[];
    };
    events?: Array<{
        id: string;
        organizationId: string;
        actorUserId: string | null;
        actorRole: string | null;
        actorEmail: string | null;
        actorFirstName: string | null;
        actorLastName: string | null;
        action: string;
        targetType: string | null;
        targetId: string | null;
        targetLabel: string | null;
        metadata: Record<string, unknown>;
        ipAddress: string | null;
        userAgent: string | null;
        integritySeq: number | null;
        prevEventHash: string | null;
        eventHash: string | null;
        signatureAlgorithm: string | null;
        signature: string | null;
        signingKeyId: string | null;
        integrityVersion: number | null;
        createdAt: string;
    }>;
    evidenceHash: string;
    signatureAlgorithm: string | null;
    signature: string | null;
    signingKeyId: string | null;
}
export declare class ApiClient {
    private apiUrl;
    private apiKey?;
    private scopedOrgId?;
    private readonly requestTimeout;
    private readonly applyRequestTimeout;
    private readonly applyRecoveryWaitMs;
    private readonly applyRecoveryPollIntervalMs;
    private isRetryingAuth;
    constructor(config: NeurcodeConfig);
    /**
     * Update API key after re-login
     */
    updateApiKey(newApiKey: string): void;
    /**
     * Get API key, requiring it if not set
     * Shows helpful error message if missing
     */
    private getApiKey;
    /**
     * Resolve org context for outgoing requests.
     * Explicit constructor scope wins; fallback is project-local state.
     */
    private resolveRequestOrgId;
    /**
     * Create a fetch request with timeout support
     * Uses AbortController to implement timeout for long-running requests
     */
    private fetchWithTimeout;
    /**
     * Wrapper for fetch with debug logging on error
     * Logs the exact URL attempted when fetch fails
     */
    private fetchWithDebug;
    /**
     * Central request handler with 401 recovery
     * Handles authentication failures gracefully by prompting for re-login
     */
    private makeRequest;
    analyzeDiff(diff: string, projectId?: string): Promise<AnalyzeDiffResponse>;
    analyzeBloat(diff: string, intent?: string, projectId?: string, sessionId?: string, fileContents?: Record<string, string>): Promise<AnalyzeBloatResponse>;
    getFileVersions(filePath: string, projectId?: string, limit?: number): Promise<Array<{
        id: string;
        organizationId: string;
        projectId: string | null;
        filePath: string;
        versionNumber: number;
        fileContent: string;
        diffFromPrevious: string | null;
        sessionId: string | null;
        userId: string | null;
        changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
        linesAdded: number;
        linesRemoved: number;
        createdAt: string;
    }>>;
    getFileVersion(filePath: string, version: number, projectId?: string): Promise<{
        version: {
            id: string;
            organizationId: string;
            projectId: string | null;
            filePath: string;
            versionNumber: number;
            fileContent: string;
            diffFromPrevious: string | null;
            sessionId: string | null;
            userId: string | null;
            changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
            linesAdded: number;
            linesRemoved: number;
            createdAt: string;
        };
        fileContent: string;
        lineInfo: {
            totalLines: number;
            changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
            linesAdded: number;
            linesRemoved: number;
        };
    }>;
    /**
     * Save a file version (for pre-flight snapshots)
     */
    saveFileVersion(filePath: string, fileContent: string, projectId?: string, reason?: string, changeType?: 'add' | 'delete' | 'modify' | 'rename' | null, linesAdded?: number, linesRemoved?: number): Promise<{
        message: string;
        version: {
            id: string;
            organizationId: string;
            projectId: string | null;
            filePath: string;
            versionNumber: number;
            fileContent: string;
            diffFromPrevious: string | null;
            sessionId: string | null;
            userId: string | null;
            changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
            linesAdded: number;
            linesRemoved: number;
            createdAt: string;
        };
    }>;
    /**
     * Save multiple file versions in one request (faster pre-flight snapshot capture).
     * Falls back to per-file uploads when the server does not support batch endpoint.
     */
    saveFileVersionsBatch(snapshots: Array<{
        filePath: string;
        fileContent: string;
        changeType?: 'add' | 'delete' | 'modify' | 'rename' | null;
        linesAdded?: number;
        linesRemoved?: number;
    }>, projectId?: string, reason?: string): Promise<{
        message: string;
        savedCount: number;
        failedCount: number;
        saved: Array<{
            filePath: string;
            version: {
                id: string;
                organizationId: string;
                projectId: string | null;
                filePath: string;
                versionNumber: number;
                fileContent: string;
                diffFromPrevious: string | null;
                sessionId: string | null;
                userId: string | null;
                changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
                linesAdded: number;
                linesRemoved: number;
                createdAt: string;
            };
        }>;
        failed: Array<{
            filePath: string;
            error: string;
        }>;
    }>;
    revertFile(filePath: string, toVersion: number, projectId?: string, reason?: string): Promise<{
        message: string;
        version: {
            id: string;
            organizationId: string;
            projectId: string | null;
            filePath: string;
            versionNumber: number;
            fileContent: string;
            diffFromPrevious: string | null;
            sessionId: string | null;
            userId: string | null;
            changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
            linesAdded: number;
            linesRemoved: number;
            createdAt: string;
        };
        fileContent: string;
        lineInfo: {
            totalLines: number;
            changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
            linesAdded: number;
            linesRemoved: number;
        };
        revertInstructions: {
            method: 'full_replace';
            filePath: string;
            fromVersion: number;
            toVersion: number;
        };
    }>;
    refactor(fileContent: string, redundantBlocks: Array<{
        lines: [number, number];
        reason: string;
        suggestion: string;
    }>, options?: {
        projectType?: string;
        framework?: string;
        patterns?: string[];
    }): Promise<RefactorResponse>;
    analyzeSecurity(diff: string, projectType?: string): Promise<SecurityAnalysisResponse>;
    /**
     * Connect or ensure project exists
     * Automatically detects Git URL and creates/links project
     *
     * Note: organizationId is automatically extracted from the auth token by the backend,
     * so it does not need to be passed in the request body.
     *
     * Backend Issue: The /api/v1/projects/connect endpoint currently requires a non-empty gitUrl.
     * When creating name-only projects (without Git), this will fail with "gitUrl is required".
     * The backend should be updated to allow empty gitUrl when name is provided.
     */
    ensureProject(gitUrl?: string, name?: string): Promise<{
        id: string;
        name: string;
    }>;
    /**
     * Select relevant files from a file tree (Semantic Scout - Pass 1)
     *
     * @param intent - User's intent/request description
     * @param fileTree - Array of file paths representing the project structure
     * @param projectSummary - Optional project summary (tech stack + architecture)
     * @returns Array of selected file paths (max 15)
     */
    selectFiles(intent: string, fileTree: string[], projectSummary?: string): Promise<string[]>;
    generatePlan(intent: string, files: string[], projectId?: string, ticketMetadata?: {
        id: string;
        title: string;
        description: string;
        acceptanceCriteria?: string;
    }, projectSummary?: string): Promise<GeneratePlanResponse>;
    importExternalPlan(input: {
        provider?: string;
        projectId?: string;
        intent?: string;
        title?: string;
        planText?: string;
        planJson?: unknown;
    }): Promise<ImportExternalPlanResponse>;
    applyPlan(planId: string, snapshots?: Array<{
        path: string;
        originalContent: string;
    }>): Promise<ApplyPlanResponse>;
    /**
     * Get active custom policies for the authenticated user (dashboard-defined rules).
     * Used by verify to enforce e.g. "No console.log" and other custom rules.
     */
    getActiveCustomPolicies(): Promise<Array<{
        id: string;
        user_id: string;
        rule_text: string;
        severity: 'low' | 'medium' | 'high';
        is_active: boolean;
        created_at: string;
        updated_at: string;
    }>>;
    getOrgGovernanceSettings(): Promise<OrgGovernanceSettingsResponse['settings'] | null>;
    updateOrgGovernanceSettings(input: UpdateOrgGovernanceSettingsRequest): Promise<OrgGovernanceSettingsResponse['settings'] | null>;
    getOrgAuditEvidenceBundle(params?: {
        includeEvents?: boolean;
        limit?: number;
        action?: string;
        actorUserId?: string;
        targetType?: string;
        from?: string;
        to?: string;
    }): Promise<OrgAuditEvidenceBundle>;
    listOrgPolicyExceptions(params?: {
        state?: 'pending' | 'active' | 'expired' | 'pending_approval' | 'approved' | 'rejected' | 'revoked';
        limit?: number;
    }): Promise<OrgPolicyException[]>;
    createOrgPolicyException(input: {
        rulePattern: string;
        filePattern: string;
        reason: string;
        ticket?: string;
        severity?: 'allow' | 'warn' | 'block';
        expiresAt: string;
        metadata?: Record<string, unknown>;
    }): Promise<OrgPolicyException>;
    approveOrgPolicyException(exceptionId: string, input?: {
        note?: string;
    }): Promise<OrgPolicyException>;
    rejectOrgPolicyException(exceptionId: string, input: {
        reason: string;
    }): Promise<OrgPolicyException>;
    revokeOrgPolicyException(exceptionId: string, input?: {
        reason?: string;
    }): Promise<OrgPolicyException>;
    listOrgPolicyExceptionEvents(exceptionId: string, limit?: number): Promise<OrgPolicyExceptionEvent[]>;
    enqueueVerifyPlanJob(input: {
        planId: string;
        diffStats: {
            totalAdded: number;
            totalRemoved: number;
            totalFiles: number;
        };
        changedFiles: Array<{
            path: string;
            oldPath?: string;
            changeType: 'add' | 'delete' | 'modify' | 'rename';
            added: number;
            removed: number;
            hunks: Array<{
                oldStart: number;
                oldLines: number;
                newStart: number;
                newLines: number;
                lines: Array<{
                    type: 'context' | 'added' | 'removed';
                    content: string;
                    lineNumber?: number;
                }>;
            }>;
        }>;
        projectId?: string;
        intentConstraints?: string;
        policyRules?: string[];
        verificationSource?: string;
        compiledPolicy?: {
            fingerprint: string;
            deterministicRuleCount: number;
            unmatchedStatements: number;
            sourcePath: string;
            policyLockFingerprint: string | null;
        } | null;
        idempotencyKey?: string;
        maxAttempts?: number;
    }): Promise<VerifyPlanJobResponse>;
    getVerifyPlanJob(jobId: string): Promise<VerifyPlanJobResponse>;
    verifyPlan(planId: string, diffStats: {
        totalAdded: number;
        totalRemoved: number;
        totalFiles: number;
    }, changedFiles: Array<{
        path: string;
        oldPath?: string;
        changeType: 'add' | 'delete' | 'modify' | 'rename';
        added: number;
        removed: number;
        hunks: Array<{
            oldStart: number;
            oldLines: number;
            newStart: number;
            newLines: number;
            lines: Array<{
                type: 'context' | 'added' | 'removed';
                content: string;
                lineNumber?: number;
            }>;
        }>;
    }>, projectId?: string, intentConstraints?: string, policyRules?: string[], verificationSource?: string, compiledPolicy?: {
        fingerprint: string;
        deterministicRuleCount: number;
        unmatchedStatements: number;
        sourcePath: string;
        policyLockFingerprint: string | null;
    } | null, executionOptions?: VerifyPlanExecutionOptions): Promise<VerifyPlanResponse>;
    submitVerificationFeedback(verificationId: string, payload: {
        feedbackType: 'false_positive' | 'false_negative' | 'true_positive' | 'accepted_risk';
        reason: string;
        findingKey?: string;
        rule?: string;
        filePath?: string;
        severity?: string;
        suggestedAdjustment?: string;
        metadata?: Record<string, unknown>;
    }): Promise<VerificationFeedbackItem>;
    listVerificationFeedback(verificationId: string, options?: {
        reviewStatus?: 'pending' | 'approved' | 'rejected';
        limit?: number;
    }): Promise<VerificationFeedbackItem[]>;
    listVerificationFeedbackInbox(options?: {
        reviewStatus?: 'pending' | 'approved' | 'rejected';
        limit?: number;
        mine?: boolean;
    }): Promise<VerificationFeedbackInboxItem[]>;
    getVerificationFeedbackStats(options?: {
        reviewStatus?: 'pending' | 'approved' | 'rejected';
        mine?: boolean;
        days?: number;
        limit?: number;
    }): Promise<VerificationFeedbackStatsResponse>;
    reviewVerificationFeedback(verificationId: string, feedbackId: string, payload: {
        decision: 'approved' | 'rejected';
        reviewNote?: string;
    }): Promise<VerificationFeedbackItem>;
    escalateVerificationFeedback(verificationId: string, feedbackId: string, payload?: {
        rulePattern?: string;
        filePattern?: string;
        reason?: string;
        ticket?: string;
        severity?: 'allow' | 'warn' | 'block';
        expiresAt?: string;
        expiresInDays?: number;
        metadata?: Record<string, unknown>;
    }): Promise<VerificationFeedbackEscalateResponse>;
    /**
     * Allow a file to be modified in a session (bypass scope guard)
     */
    allowFile(sessionId: string, filePath: string): Promise<AISession>;
    /**
     * Get plan by ID
     */
    getPlan(planId: string): Promise<{
        id: string;
        organizationId: string;
        projectId: string | null;
        userId: string | null;
        sessionId: string | null;
        intent: string;
        content: ArchitectPlan;
        status: 'PENDING' | 'APPLIED' | 'REJECTED' | 'CANCELLED';
        appliedAt: string | null;
        appliedBy: string | null;
        rejectionReason: string | null;
        createdAt: string;
        updatedAt: string;
    }>;
    /**
     * Get Cursor prompt for a plan
     */
    getPlanPrompt(planId: string): Promise<{
        prompt: string;
        intent: string;
        telemetry?: PromptGenerationTelemetry;
    }>;
    /**
     * Get list of projects for the authenticated user
     */
    getProjects(): Promise<Array<{
        id: string;
        name: string;
        slug: string;
        git_url: string | null;
        git_provider: string | null;
        default_branch: string | null;
        description: string | null;
        created_at: string;
        updated_at: string;
    }>>;
    /**
     * Get project by name (for CLI auto-discovery)
     */
    getProjectByName(name: string): Promise<{
        id: string;
        name: string;
        slug: string;
        git_url: string | null;
        git_provider: string | null;
        default_branch: string | null;
        description: string | null;
        created_at: string;
        updated_at: string;
    } | null>;
    /**
     * Get current user information
     * Works with both API keys and Clerk JWT tokens
     */
    getCurrentUser(): Promise<{
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
        imageUrl?: string;
    }>;
    /**
     * Get sessions for a project
     */
    getSessions(projectId?: string, limit?: number): Promise<Array<{
        id: string;
        sessionId: string;
        title: string | null;
        intentDescription: string | null;
        status: string;
        createdAt: string;
    }>>;
    /**
     * End a session (mark as completed)
     */
    endSession(sessionId: string): Promise<{
        message: string;
    }>;
    /**
     * Get a specific session by ID
     */
    getSession(sessionId: string): Promise<{
        session: {
            id: string;
            sessionId: string;
            title: string | null;
            intentDescription: string | null;
            status: string;
            createdAt: string;
            endedAt: string | null;
        };
        files: Array<any>;
    }>;
    /**
     * Get all organizations the authenticated user belongs to
     * Used by `neurcode init` for org selection
     */
    getUserOrganizations(): Promise<Array<{
        id: string;
        name: string;
        slug: string;
        role: string;
        isPersonal: boolean;
    }>>;
    /**
     * Publish a merge confidence card to Neurcode Cloud.
     */
    createShipCard(payload: CreateShipCardRequest): Promise<CreateShipCardResponse>;
}
export interface AISession {
    id: string;
    organizationId: string;
    userId: string | null;
    projectId: string | null;
    sessionId: string;
    intentDescription: string | null;
    aiModel: string | null;
    status: 'active' | 'completed' | 'cancelled';
    startedAt: string;
    endedAt: string | null;
    totalFilesChanged: number;
    totalLinesAdded: number;
    totalLinesRemoved: number;
    expectedFiles: string[];
    allowedFiles: string[];
    createdAt: string;
    updatedAt: string;
}
export interface ArchitectPlan {
    type: 'neurcode_architect_plan';
    summary: string;
    files: Array<{
        path: string;
        action: 'CREATE' | 'MODIFY' | 'BLOCK';
        reason?: string;
        suggestion?: string;
    }>;
    expectedFiles?: string[];
    expectedModules?: string[];
    dependencies?: string[];
    recommendations?: string[];
    estimatedComplexity?: 'low' | 'medium' | 'high';
}
export interface ApplyPlanResponse {
    success: boolean;
    planId: string;
    filesGenerated: number;
    files: Array<{
        path: string;
        content: string;
    }>;
    message: string;
}
export interface RefactorResponse {
    suggestion: {
        originalCode: string;
        optimizedCode: string;
        changes: Array<{
            type: 'removed' | 'modified' | 'added';
            lines: [number, number];
            original: string;
            optimized: string;
            reason: string;
        }>;
        improvements: Array<{
            category: string;
            description: string;
            impact: 'high' | 'medium' | 'low';
        }>;
        tokenSavings: number;
        costSavings: number;
        riskAssessment: {
            breakingChanges: boolean;
            riskLevel: 'low' | 'medium' | 'high';
            warnings: string[];
        };
    };
    timestamp: string;
}
export interface SecurityAnalysisResponse {
    analysis: {
        issues: Array<{
            severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
            type: string;
            description: string;
            file: string;
            lines: [number, number];
            code: string;
            exploitation: string;
            fix: string;
            cwe?: string;
        }>;
        summary: {
            critical: number;
            high: number;
            medium: number;
            low: number;
            total: number;
        };
        recommendation: 'block' | 'warn' | 'allow';
        overallRisk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    };
    timestamp: string;
}
export interface PlanUsageTelemetry {
    provider: 'deepinfra';
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
}
export interface PlanGenerationTelemetry {
    attempts: number;
    generationMs: number;
    totalRequestMs: number;
    usage?: PlanUsageTelemetry;
}
export interface PromptGenerationTelemetry {
    timingMs: number;
    promptChars: number;
    promptLines: number;
    estimatedTokens: number;
}
export interface GeneratePlanResponse {
    plan: {
        type: 'neurcode_architect_plan';
        summary: string;
        files: Array<{
            path: string;
            action: 'CREATE' | 'MODIFY' | 'BLOCK';
            reason?: string;
            suggestion?: string;
        }>;
        expectedFiles?: string[];
        expectedModules?: string[];
        dependencies?: string[];
        recommendations?: string[];
        estimatedComplexity?: 'low' | 'medium' | 'high';
    };
    planId: string;
    sessionId?: string | null;
    telemetry?: PlanGenerationTelemetry;
    timestamp: string;
}
export interface ImportExternalPlanResponse {
    plan: {
        type: 'neurcode_architect_plan';
        title?: string;
        summary: string;
        files: Array<{
            path: string;
            action: 'CREATE' | 'MODIFY' | 'BLOCK';
            reason?: string;
            suggestion?: string;
            rationale?: string;
        }>;
        expectedFiles?: string[];
        expectedModules?: string[];
        dependencies?: string[];
        recommendations?: string[];
        estimatedComplexity?: 'low' | 'medium' | 'high';
    };
    planId: string;
    provider: string;
    parseMode: 'json' | 'text';
    importedFiles: number;
    sessionId?: string | null;
    warnings: string[];
    timestamp: string;
    message: string;
}
export interface VerificationFeedbackItem {
    id: string;
    organizationId: string;
    verificationId: string;
    projectId: string | null;
    submitterUserId: string;
    submitterRole: string | null;
    feedbackType: 'false_positive' | 'false_negative' | 'true_positive' | 'accepted_risk';
    findingKey: string | null;
    rule: string | null;
    filePath: string | null;
    severity: string | null;
    reason: string;
    suggestedAdjustment: string | null;
    metadata: Record<string, unknown>;
    reviewStatus: 'pending' | 'approved' | 'rejected';
    reviewerUserId: string | null;
    reviewerRole: string | null;
    reviewNote: string | null;
    reviewedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface VerificationFeedbackInboxItem extends VerificationFeedbackItem {
    verification: {
        verdict: 'PASS' | 'WARN' | 'FAIL' | null;
        createdAt: string | null;
        repoUrl: string | null;
        branch: string | null;
        commitSha: string | null;
    };
}
export interface VerificationFeedbackStatsRow {
    label: string;
    total: number;
    falsePositive: number;
    falseNegative: number;
    pending: number;
    approved: number;
    rejected: number;
}
export interface VerificationFeedbackStatsResponse {
    organizationId: string;
    generatedAt: string;
    windowDays: number;
    filters: {
        mine: boolean;
        reviewStatus: 'pending' | 'approved' | 'rejected' | null;
    };
    totals: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        falsePositive: number;
        falseNegative: number;
        truePositive: number;
        acceptedRisk: number;
        reviewed: number;
        approvalRate: number;
        falsePositiveRate: number;
        falseNegativeRate: number;
    };
    topRules: VerificationFeedbackStatsRow[];
    topFiles: VerificationFeedbackStatsRow[];
}
export interface VerificationFeedbackEscalateResponse {
    feedback: VerificationFeedbackItem;
    exception: OrgPolicyException;
}
export interface VerifyPlanResponse {
    verificationId: string;
    adherenceScore: number;
    bloatCount: number;
    bloatFiles: string[];
    plannedFilesModified: number;
    totalPlannedFiles: number;
    verdict: 'PASS' | 'FAIL' | 'WARN';
    diffSummary: {
        added: number;
        removed: number;
        files: Array<{
            path: string;
            changeType: string;
            added: number;
            removed: number;
        }>;
    };
    message: string;
    compiledPolicy?: {
        fingerprint: string;
        deterministicRuleCount: number;
        unmatchedStatements: number;
        sourcePath: string;
        policyLockFingerprint: string | null;
    };
}
export interface VerifyPlanExecutionOptions {
    async?: boolean;
    pollIntervalMs?: number;
    timeoutMs?: number;
    idempotencyKey?: string;
    maxAttempts?: number;
}
export interface VerifyPlanJobResponse {
    jobId: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    deduplicated?: boolean;
    attemptCount: number;
    maxAttempts: number;
    createdAt: string;
    updatedAt: string;
    availableAt: string;
    startedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    errorMessage: string | null;
    pollUrl: string;
    result?: VerifyPlanResponse;
}
//# sourceMappingURL=api-client.d.ts.map