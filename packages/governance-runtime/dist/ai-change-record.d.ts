import { type RepoIntelligenceEvidence } from '@neurcode-ai/contracts';
import { type ArchitectureObligationSummary } from './architecture-obligations';
import type { AgentPlanAmendmentProposal, ApprovalGrant, GovernanceSession, IntentContract } from './session';
import { type IntentSummaryV1 } from './intent-privacy';
export declare const AI_CHANGE_RECORD_SCHEMA_VERSION: "neurcode.governed-session-record.v1";
export declare const AI_CHANGE_RECORD_TYPE: "ai-change-accountability-record";
export declare const AI_CHANGE_RECORD_RECEIPT_SCHEMA_VERSION: "neurcode.ai-change-record-receipt.v1";
export declare const AI_CHANGE_RECORD_SIGNING_VERSION: "neurcode.ai-change-record-signing.v1";
export type AIChangeRecordTrustLevel = 'self_attested' | 'backend_signed_unverified' | 'backend_signed_verified' | 'backend_signed_invalid';
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
    repoSymbolIndex: {
        schemaVersion: string;
        language: string;
        indexedFileCount: number;
        indexedSymbolCount: number;
        exportedSymbolCount: number;
        localFunctionCount: number;
        changedCandidateCount: number;
        indexHash: string;
        modelUsed: false;
        sourceStored: false;
    } | null;
    reuseFindings: AIChangeRecordReuseFinding[];
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
export interface AIChangeRecordReuseFinding {
    schemaVersion: 'neurcode.reuse-finding.v1' | string;
    severity: 'warn' | string;
    advisory: true;
    hardBlock: false;
    changed: {
        file: string;
        name: string;
        kind: string;
        exported: boolean;
        signatureHash: string;
        tokenFingerprintHash: string | null;
    };
    existing: {
        file: string;
        name: string;
        kind: string;
        exported: boolean;
        signatureHash: string;
        tokenFingerprintHash: string | null;
    };
    matchType: string;
    confidence: string;
    reasonCodes: string[];
    evidence: {
        signatureHash: string | null;
        tokenFingerprintHash: string | null;
        tokenShingleSetHash: string | null;
        tokenOverlap: number | null;
        changedNormalizedTokenCount: number;
        existingNormalizedTokenCount: number;
    };
    action: string;
    message: string;
    provenance: string;
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
export interface AIChangeRecordAccountabilitySummary {
    schemaVersion: 'neurcode.change-accountability.v1';
    facts: {
        agentGoal: string;
        scopeMode: string;
        intendedScope: string[];
        touchedPaths: string[];
        allowedPaths: string[];
        warnedPaths: string[];
        blockedBoundaries: string[];
        boundaryOwners: string[];
        approvalRequired: boolean;
        exactPathApprovalOnly: boolean;
        approvedExactPaths: string[];
        neighboringSensitiveFilesBlocked: boolean;
        reuseAdvisoryCount: number;
        reuseAdvisoryReviewPaths: string[];
        evidenceReceipt: 'self_attested' | 'backend_signed_unverified' | 'backend_signed_verified' | 'backend_signed_invalid' | 'replay-pending';
        sourceExcluded: true;
    };
    assumptions: string[];
    limitations: string[];
}
export interface AIChangeRecordRepoBrain {
    status: 'found' | 'missing';
    artifactHash: string | null;
    generatedAt: string | null;
    declarationsIndexed: number | null;
    sensitiveFilesCount: number | null;
    ownerBoundaryStatus: 'found' | 'not_found' | null;
    recoveryCommand: string;
}
export interface AIChangeRecordRepoSymbolPolicy {
    schemaVersion: string;
    evaluated: boolean;
    verdict: 'ok' | 'warn' | 'block' | 'not_evaluated' | string;
    policyMode: 'off' | 'warn' | 'block' | string;
    classification: 'deterministic_symbol_duplicate' | 'not_evaluated' | 'clean' | string;
    reason: string;
    artifactHash: string | null;
    generatedAt: string | null;
    freshness: {
        gitHead: string | null;
        workingTreeStatus: string | null;
    } | null;
    enforcement: {
        adapterId: string;
        capability: string;
        timing: string;
        decisionBinding: string;
    } | null;
    contentAvailability: {
        present: boolean;
        reason: string;
        contentHash: string | null;
        rawRetained: false;
    } | null;
    findings: Array<{
        classification: 'deterministic_symbol_duplicate' | string;
        verdict: 'warn' | 'block' | string;
        strength: string;
        changed: {
            file: string;
            name: string;
            kind: string;
            language: string;
            exported: boolean;
            normalizedSignatureHash: string | null;
            signatureHash: string;
        };
        existing: Array<{
            file: string;
            name: string;
            kind: string;
            language: string;
            exported: boolean;
            normalizedSignatureHash: string | null;
            signatureHash: string;
        }>;
        evidence: {
            matchingFiles: string[];
            existingSymbolCount: number;
            reasonCodes: string[];
            sourceFree: true;
        };
        message: string;
        provenance: string;
    }>;
    advisorySimilarity: {
        classification: 'advisory_similarity';
        evaluated: false;
        reason: string;
    } | null;
    privacy: {
        sourceUploaded: false;
        sourceStored: false;
        diffStored: false;
        promptStored: false;
        evaluatedInMemoryOnly: true;
    };
}
export interface AIChangeRecordIntentContinuityContext {
    latestUserClarification: {
        summary: string;
        promptLength: number;
        promptHash: string | null;
        recordedAt: string | null;
        source: string | null;
    } | null;
    acceptedAgentProposal: {
        activePlanRevision: number;
        summary: string | null;
        expectedFiles: string[];
        expectedGlobs: string[];
        constraints: string[];
        risks: string[];
        source: string | null;
    } | null;
    pendingPlanAmendment: {
        proposalId: string;
        previousRevision: number;
        proposedBy: string | null;
        reason: string | null;
        riskLevel: string | null;
        addedFiles: string[];
        addedGlobs: string[];
        status: string | null;
    } | null;
    privacy: {
        sourceIncluded: false;
        rawPromptStored: false;
        summaryOnly: true;
    };
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
        summary: IntentSummaryV1;
        userGoal: string;
        contract: IntentContract | null;
        expectedPathGlobs: string[];
        riskNotes: string[];
        latestUserClarification: AIChangeRecordIntentContinuityContext['latestUserClarification'];
        acceptedAgentProposal: AIChangeRecordIntentContinuityContext['acceptedAgentProposal'];
        continuityContext: AIChangeRecordIntentContinuityContext | null;
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
    repoBrain: AIChangeRecordRepoBrain | null;
    repoSymbolPolicy: {
        latest: AIChangeRecordRepoSymbolPolicy | null;
    };
    repoIntelligence: {
        latest: RepoIntelligenceEvidence | null;
    };
    accountability: AIChangeRecordAccountabilitySummary;
    reviewBrief: AIChangeRecordReviewBrief;
    integrity: {
        recordHash: string;
        replayHash: string | null;
        replayHashStatus: 'present' | 'pending-session-finish';
        trustLevel: AIChangeRecordTrustLevel;
        receipt: {
            present: boolean;
            receiptId: string | null;
            keyId: string | null;
            signatureAlgorithm: string | null;
            signingVersion: string | null;
            signedAt: string | null;
            verificationStatus: AIChangeRecordTrustLevel;
        };
        deterministicFacts: string[];
        advisoryFacts: string[];
    };
}
export interface AIChangeRecordReceipt {
    schemaVersion: typeof AI_CHANGE_RECORD_RECEIPT_SCHEMA_VERSION;
    receiptId: string;
    issuer: 'neurcode-api';
    issuedAt: string;
    organizationId: string;
    repoId: string | null;
    repoKey: string | null;
    sessionId: string;
    recordHash: string;
    recordSchemaVersion: typeof AI_CHANGE_RECORD_SCHEMA_VERSION | string;
    recordGeneratedAt: string | null;
    sourceFree: true;
    signingVersion: typeof AI_CHANGE_RECORD_SIGNING_VERSION;
    canonicalHash: string;
    signatureStatus: 'signed' | 'unsigned_missing_secret';
    signingKeyId: string | null;
    signatureAlgorithm: 'hmac-sha256';
    signature: string | null;
    receiptHash: string;
    verification: {
        algorithm: 'hmac-sha256';
        signedFields: string[];
        sourceFree: true;
    };
}
export interface AIChangeRecordReceiptVerification {
    valid: boolean;
    trustLevel: AIChangeRecordTrustLevel;
    status: 'valid' | 'unsigned' | 'unverifiable' | 'tampered';
    receiptId: string | null;
    recordHash: string | null;
    signingKeyId: string | null;
    sourceFree: boolean;
    checks: {
        recordHash: boolean;
        canonicalHash: boolean;
        receiptHash: boolean;
        signature: boolean;
        sourceFree: boolean;
    };
    reasons: string[];
}
export declare function stableStringify(value: unknown): string;
export declare function stableHash(value: unknown, length?: number): string;
export declare function assertSourceFreeAIChangeRecordPayload(value: unknown, path?: string): void;
export declare function canonicalAIChangeRecordHash(record: unknown): string;
export declare function buildAIChangeRecordReceipt(input: {
    organizationId: string;
    repoId: string | null;
    repoKey: string | null;
    sessionId: string;
    recordHash: string;
    recordSchemaVersion?: string;
    recordGeneratedAt?: string | null;
    issuedAt?: string;
    receiptId?: string;
    signingSecret?: string | null;
    signingKeyId?: string | null;
}): AIChangeRecordReceipt;
export declare function verifyAIChangeRecordReceipt(input: {
    recordHash?: string | null;
    receipt: unknown;
    signingSecret?: string | null;
    expectedSigningKeyId?: string | null;
}): AIChangeRecordReceiptVerification;
export declare function aiChangeRecordPath(projectRoot: string, sessionId: string): string;
export declare function buildAIChangeRecord(session: GovernanceSession, options?: {
    generatedAt?: string;
    projectRoot?: string;
}): AIChangeRecord;
export declare function writeAIChangeRecord(projectRoot: string, session: GovernanceSession, options?: {
    generatedAt?: string;
}): {
    record: AIChangeRecord;
    path: string;
};
//# sourceMappingURL=ai-change-record.d.ts.map