/**
 * Scope-Guard + Governance Evaluation Orchestration
 * --------------------------------------------------
 * Extracts the plan-resolution / governance-evaluation / scope-guard compute
 * region previously inlined at `commands/verify.ts:4238–4376`.
 *
 * RESPONSIBILITIES (data-pure):
 *   - resolve plan scope (local Plan Sync vs remote plan fetch)
 *   - run the intent-aware engine
 *   - run structural analysis (via the existing plan-structural-analysis module)
 *   - call evaluateGovernance
 *   - resolve session ID and fetch allowed files
 *   - compute the approved-set intersection and filtered violations
 *
 * EXPLICITLY NOT RESPONSIBLE FOR:
 *   - rendering scope violations (chalk output, emitVerifyJson, exitWithEvidence)
 *   - `scopeGuardPassed` flag lifecycle (caller owns that)
 *   - catch-block error logging (caller owns the surrounding try/catch)
 *
 * SEMANTIC PRESERVATION:
 *   The computation sequence, fault-swallowing behaviour (intent engine, session
 *   fetch), and intersection logic are byte-identical to the prior inline region.
 *
 * REPLAY INVARIANT:
 *   - evaluateGovernance call params are identical to lines 4317-4330
 *   - runPlanStructuralAnalysis call is identical to lines 4312-4315
 *   - runIntentEngine call is identical to lines 4293-4302
 *   - getSessionId() fallback chain is identical to lines 4335-4342
 *   - allowedFiles resolution is identical to lines 4352-4371
 *   - approvedSet intersection is identical to lines 4373-4376
 */
import { evaluateGovernance } from '../../../utils/governance';
import type { IntentIssue, IntentSummary, FlowIssue, RegressionIssue } from '../../../intent-engine';
import type { StructuralViolation } from '../../../structural-rules/types';
import type { DiffFile } from '@neurcode-ai/diff-parser';
import type { OrgGovernanceSettings } from '@neurcode-ai/core';
interface PlanData {
    intent: string;
    sessionId: string | null;
    content: {
        title?: unknown;
        summary?: unknown;
        files: Array<{
            action: string;
            path: string;
        }>;
        dependencies?: unknown;
    };
}
interface SessionData {
    session: Record<string, unknown>;
}
export interface ScopeGuardPlanClient {
    getPlan(planId: string): Promise<PlanData>;
    getSession(sessionId: string): Promise<SessionData>;
}
export interface ScopeGuardLocalPlan {
    intent: string;
    constraints: string[];
    expectedFiles?: string[];
}
export interface ScopeGuardSigningParams {
    signedLogsRequired: boolean;
    /** May be null when no signing key is configured. */
    signingKey: string | null | undefined;
    signingKeyId: string | null | undefined;
    signingKeys: Record<string, string>;
    /** String identifier for the AI-log signer (matches evaluateGovernance's signer param). */
    signer: string | undefined;
}
export interface ScopeGuardOrchestrationInput {
    /** True when the resolved planId is 'local-plan-sync'. */
    useLocalPlanSync: boolean;
    /** Snapshot from ensureLocalPlan(). */
    localPlanSync: ScopeGuardLocalPlan;
    /** Deduplicated expected files from the local plan file. */
    localPlanExpectedFiles: string[];
    /** Resolved plan ID (truthy, non-advisory). */
    finalPlanId: string;
    /** API client duck-typed to the two methods we need. */
    client: ScopeGuardPlanClient;
    /** Normalised diff files from the diff-normalization stage. */
    diffFiles: DiffFile[];
    /** Absolute project root path. */
    projectRoot: string;
    /** Config file data (neurcode.config.json). Narrow type — only fields used. */
    configData: {
        sessionId?: unknown;
        lastSessionId?: unknown;
    };
    /** Governance signing credentials. */
    signing: ScopeGuardSigningParams;
    /** Org governance settings fetched from remote, or null. */
    orgGovernanceSettings: OrgGovernanceSettings | null;
    /** Returns true for file paths that should be excluded from scope-guard checks. */
    shouldIgnore: (path: string) => boolean;
}
/** Note surfaced when session resolution is attempted but fails or not available. */
export type SessionResolutionNote = 'session_not_available' | 'no_session_id' | null;
export interface ScopeGuardOrchestrationResult {
    /** Union of remote plan files and local plan files. */
    planFilesForVerification: string[];
    /** Dependency paths from the remote plan (empty for local sync). */
    planDependencies: string[];
    /** Original intent / constraint text used for intent-engine input. */
    intentConstraintsForVerification: string | undefined;
    /** Task label passed to evaluateGovernance. */
    governanceTask: string;
    /** Session ID extracted from the remote plan response (null for local sync). */
    remotePlanSessionId: string | null;
    intentEngineIssues: IntentIssue[];
    intentEngineDomains: string[];
    intentEngineSummary: IntentSummary | null;
    intentEngineFlowIssues: FlowIssue[];
    intentEngineRegressions: RegressionIssue[];
    structuralViolations: StructuralViolation[];
    structuralRulesApplied: string[];
    structuralSuppressedCount: number;
    governanceResult: ReturnType<typeof evaluateGovernance> | null;
    /** All file paths from the diff. */
    modifiedFiles: string[];
    /** Files from session allowedFiles (empty when session resolution fails). */
    allowedFiles: string[];
    /** Union set of plan files + allowedFiles (the approval boundary). */
    approvedSet: Set<string>;
    /** Modified files not in approvedSet (before shouldIgnore). */
    violations: string[];
    /** Violations after shouldIgnore filtering — the actionable violation set. */
    filteredViolations: string[];
    /** Resolved session ID string (for caller debug rendering). */
    sessionIdString: string | null;
    /**
     * Set to true when useLocalPlanSync is true so the caller can render
     * "Plan Sync scope loaded: N file(s)".
     */
    planSyncUsed: boolean;
    planSyncFileCount: number;
    /**
     * Indicates why session-based allowed files were unavailable.
     * Caller decides whether and how to surface this to the user.
     */
    sessionResolutionNote: SessionResolutionNote;
}
/**
 * Compute the scope-guard orchestration result. Replaces the inline compute
 * region at verify.ts:4239–4376.
 *
 * Does not emit JSON, does not log, does not exit.
 */
export declare function runScopeGuardOrchestration(input: ScopeGuardOrchestrationInput): Promise<ScopeGuardOrchestrationResult>;
export {};
//# sourceMappingURL=scope-guard-orchestration.d.ts.map