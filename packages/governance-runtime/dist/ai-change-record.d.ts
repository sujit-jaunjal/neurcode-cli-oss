import { type ArchitectureObligationSummary } from './architecture-obligations';
import type { AgentPlanAmendmentProposal, ApprovalGrant, GovernanceSession, IntentContract } from './session';
export declare const AI_CHANGE_RECORD_SCHEMA_VERSION: "neurcode.governed-session-record.v1";
export declare const AI_CHANGE_RECORD_TYPE: "ai-change-accountability-record";
export interface AIChangeRecordPathTrajectory {
    filePath: string;
    verdicts: string[];
    checks: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    owners: string[];
    suggestedApprovalPath: string | null;
}
export interface AIChangeRecordPlanTimelineEntry {
    revision: number | null;
    kind: string;
    summary: string | null;
    capturedAt: string | null;
    reason: string | null;
    expectedFiles: string[];
    expectedGlobs: string[];
    constraints: string[];
    risks: string[];
}
export interface AIChangeRecordApprovalEntry {
    path: string;
    status: 'active' | 'expired' | 'revoked';
    source: ApprovalGrant['source'];
    approvedAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    approvedBy: string | null;
    reason: string;
    requestId: string | null;
}
export interface AIChangeRecordStructuralUnderstanding {
    schemaVersion: string;
    artifactHash: string | null;
    artifactPath: string | null;
    analyzed: boolean;
    reason: string | null;
    changedFileCount: number;
    changedSymbolCount: number;
    referenceCount: number;
    testReferenceCount: number;
    changedSymbols: Array<{
        file: string;
        name: string;
        kind: string;
        action: string;
    }>;
    topReferences: Array<{
        targetFile: string;
        targetSymbol: string;
        referencingFile: string;
        referencingSymbol: string | null;
        line: number;
        isTestFile: boolean;
    }>;
    suppressedArtifacts: Array<{
        path: string;
        reasonCode: string;
    }>;
    consequenceUnderstanding: unknown | null;
    digest: {
        summary: unknown;
        hidden: unknown;
        topSymbols: unknown[];
        topConsequences: unknown[];
        topReferences: unknown[];
        limitations: string[];
    } | null;
    planAlignment: unknown;
    boundaryImpact: unknown[];
}
export type AIChangeRecordReviewVerdict = 'ready_to_review' | 'needs_human_inspection' | 'blocked_unresolved' | 'evidence_incomplete';
export interface AIChangeRecordReviewBriefSection {
    id: 'change_thesis' | 'what_changed' | 'what_could_break' | 'governance_events' | 'final_verdict';
    title: string;
    status: 'pass' | 'warn' | 'block' | 'pending';
    summary: string;
    facts: string[];
    reviewFocus: string[];
    provenance: 'deterministic' | 'advisory';
}
export interface AIChangeRecordReviewBrief {
    schemaVersion: 'neurcode.review-brief.v1';
    verdict: AIChangeRecordReviewVerdict;
    headline: string;
    summary: string;
    riskLabels: string[];
    reviewFocus: string[];
    sections: AIChangeRecordReviewBriefSection[];
    generatedFrom: string[];
    limitations: string[];
}
export interface AIChangeRecord {
    schemaVersion: typeof AI_CHANGE_RECORD_SCHEMA_VERSION;
    recordType: typeof AI_CHANGE_RECORD_TYPE;
    displayName: 'AI Change Record';
    generatedAt: string;
    privacy: {
        sourceUploaded: false;
        sourceFree: true;
        omittedFields: string[];
    };
    session: {
        sessionId: string;
        repoName: string;
        status: GovernanceSession['status'];
        goal: string;
        scopeMode: GovernanceSession['contract']['scopeMode'];
        profileHash: string;
        startedAt: string | null;
        finishedAt: string | null;
        counts: {
            ok: number;
            warn: number;
            block: number;
            approval: number;
            planEvents: number;
            events: number;
        };
    };
    intent: {
        contract: IntentContract | null;
        expectedPathGlobs: string[];
        riskNotes: string[];
    };
    plan: {
        activeRevision: number | null;
        activeSummary: string | null;
        timeline: AIChangeRecordPlanTimelineEntry[];
        pendingAmendments: Array<{
            proposalId: string;
            previousRevision: number;
            riskLevel: AgentPlanAmendmentProposal['risk']['level'];
            requiresHumanApproval: boolean;
            addedFiles: string[];
            addedGlobs: string[];
            reasons: string[];
            createdAt: string;
        }>;
    };
    scope: {
        allowedGlobs: string[];
        approvalRequiredGlobs: string[];
        approvedPaths: string[];
    };
    trajectory: AIChangeRecordPathTrajectory[];
    architecture: {
        summary: ArchitectureObligationSummary;
        obligations: Array<{
            id: string;
            title: string;
            severity: string;
            status: string;
            effectiveMode: string;
            relatedPaths: string[];
        }>;
    };
    approvals: AIChangeRecordApprovalEntry[];
    understanding: {
        latest: AIChangeRecordStructuralUnderstanding | null;
    };
    reviewBrief: AIChangeRecordReviewBrief;
    integrity: {
        recordHash: string;
        replayHash: string | null;
        replayHashStatus: 'present' | 'pending-session-finish';
        deterministicFacts: string[];
        advisoryFacts: string[];
    };
}
export declare function aiChangeRecordPath(projectRoot: string, sessionId: string): string;
export declare function buildAIChangeRecord(session: GovernanceSession, options?: {
    generatedAt?: string;
}): AIChangeRecord;
export declare function writeAIChangeRecord(projectRoot: string, session: GovernanceSession, options?: {
    generatedAt?: string;
}): {
    record: AIChangeRecord;
    path: string;
};
//# sourceMappingURL=ai-change-record.d.ts.map