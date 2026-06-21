/**
 * Enterprise evaluator report + dashboard summary — pure builders.
 *
 * The `neurcode eval demo` runner (utils/eval-demo.ts) drives a complete, safe,
 * local governance loop against a throwaway fixture and gathers a single
 * source-free facts object: {@link EvalDemoFacts}. This module turns that facts
 * object into the two shareable artifacts a first-time enterprise evaluator
 * needs:
 *
 *   1. {@link buildEnterpriseEvalReport} / {@link renderEnterpriseEvalReportMarkdown}
 *      — a polished, source-free report an engineering manager can read. It is
 *      deliberately honest: deterministic path/symbol/graph/policy facts are
 *      separated from advisory inference, and the trust posture never claims
 *      public-key signing when only an HMAC backend receipt (or self-attested
 *      local record) exists.
 *
 *   2. {@link buildEvalDemoSummary} — a compact machine-readable JSON the hosted
 *      dashboard can import (paste / upload). It carries completion status,
 *      pass/fail checkpoints, the boundary/approval/neighbor facts, the trust
 *      posture, the recommended next command, and a design-partner-pilot verdict.
 *
 * Everything here is pure (no I/O) and source-free. The orchestration engine
 * runs {@link assertEnterpriseEvalSourceFree} over the rendered artifacts before
 * anything is written, and the harness/tests assert the same contract.
 *
 * Keep the truth tiers and step ids in lockstep with utils/guided-eval.ts and
 * the dashboard mirrors (web/dashboard/src/lib/guidedEval.ts + evalDemoImport.ts).
 */
import { type GuidedEvalAgent, type GuidedEvalEnforcement, type GuidedEvalRepoBrainFindings, type GuidedEvalTruthTier } from './guided-eval';
import type { ImpactSummary } from './repo-brain-impact';
export declare const EVAL_DEMO_SUMMARY_SCHEMA_VERSION: "neurcode.eval-demo-summary.v1";
export declare const ENTERPRISE_EVAL_REPORT_SCHEMA_VERSION: "neurcode.enterprise-eval-report.v1";
export type DemoCheckpointStatus = 'pass' | 'fail' | 'advisory' | 'skipped';
/** A single asserted step in the demo loop. */
export interface DemoCheckpoint {
    id: string;
    title: string;
    truthTier: GuidedEvalTruthTier;
    status: DemoCheckpointStatus;
    /** What the runner expected to observe. */
    expected: string;
    /** What it actually observed (source-free: paths, verdicts, counts). */
    observed: string;
    /** True when a failure here should fail the whole demo. */
    critical: boolean;
}
export type BoundaryDecision = 'allow' | 'deny' | 'warn';
export type BoundaryPhase = 'safe_edit' | 'boundary_block' | 'post_approval_allow' | 'neighbor_block';
export interface BoundaryTimelineEntry {
    order: number;
    phase: BoundaryPhase;
    path: string;
    toolName: string;
    decision: BoundaryDecision;
    blockType: string | null;
    owners: string[];
}
export interface EvalDemoBackendReceipt {
    /** A backend/HMAC signing secret was present in the environment. */
    configured: boolean;
    /** The runner attempted an export + verify against that key. */
    attempted: boolean;
    /** Verification returned backend_signed_verified. */
    verified: boolean;
    trustLevel: string | null;
    /** Honest provenance, e.g. "self-attested local record" or "local test HMAC key". */
    provenance: string;
}
/**
 * The single source-free facts object produced by one demo run. Every field is
 * a path, owner, symbol name, count, verdict, hash, or boolean — never source.
 */
export interface EvalDemoFacts {
    agent: GuidedEvalAgent;
    enforcement: GuidedEvalEnforcement;
    enforcementLabel: string;
    /** Honest description of how the local proof was driven for this posture. */
    enforcementMethod: string;
    mode: 'fixture' | 'real';
    generatedAt: string;
    durationMs: number;
    sessionId: string | null;
    repoRootHash: string;
    fixtureRelativeDir: string;
    adapter: string | null;
    compatibilityMode: string | null;
    cliVersion: string | null;
    safeEditAllowed: boolean;
    boundaryBlockPath: string | null;
    boundaryOwners: string[];
    boundaryBlockType: string | null;
    exactApprovalPath: string | null;
    exactApprovalOnly: boolean;
    approvedPathAllowedAfter: boolean;
    neighborPath: string | null;
    neighborContained: boolean;
    aiChangeRecordSessionId: string | null;
    aiChangeRecordRelativePath: string | null;
    admissionBlockedCount: number | null;
    admissionApprovedCount: number | null;
    backendReceipt: EvalDemoBackendReceipt;
    repoBrain: GuidedEvalRepoBrainFindings;
    /** Source-free change-impact map for the fixture's changed set (advisory). */
    impactIntelligence: ImpactSummary | null;
    boundaryTimeline: BoundaryTimelineEntry[];
    commandsRun: string[];
}
export type ReadinessLevel = 'ready' | 'ready_with_caveats' | 'not_ready';
export interface EvalDemoVerdict {
    founderDemo: ReadinessLevel;
    designPartnerPilot: ReadinessLevel;
    seriousEnterprisePilot: ReadinessLevel;
    reasons: string[];
}
/** The deterministic core loop that must hold for the demo to be meaningful. */
export declare const CORE_CHECKPOINT_IDS: readonly ["safe_edit_allowed", "boundary_block", "exact_approval", "approved_path_allowed", "neighbor_contained", "ai_change_record"];
export declare function deriveVerdict(checkpoints: DemoCheckpoint[], facts: EvalDemoFacts): EvalDemoVerdict;
export interface EnterpriseEvalReport {
    schemaVersion: typeof ENTERPRISE_EVAL_REPORT_SCHEMA_VERSION;
    generatedAt: string;
    agent: GuidedEvalAgent;
    enforcement: GuidedEvalEnforcement;
    enforcementLabel: string;
    enforcementMethod: string;
    mode: 'fixture' | 'real';
    durationMs: number;
    repo: {
        rootHash: string;
        fixtureRelativeDir: string;
    };
    result: {
        complete: boolean;
        passed: number;
        total: number;
        criticalFailures: number;
    };
    checkpoints: Array<DemoCheckpoint & {
        truthTierLabel: string;
    }>;
    whatThisProves: string[];
    whatThisDoesNotProve: string[];
    deterministicFacts: string[];
    advisoryFacts: string[];
    boundaryTimeline: BoundaryTimelineEntry[];
    exactApprovalContainment: {
        approvedPath: string | null;
        exactOnly: boolean;
        allowedAfterApproval: boolean;
        owners: string[];
    };
    neighborContainment: {
        neighborPath: string | null;
        stayedBlocked: boolean;
    };
    repoBrain: GuidedEvalRepoBrainFindings;
    impactIntelligence: ImpactSummary | null;
    evidenceTrustPosture: {
        aiChangeRecord: {
            sessionId: string | null;
            relativePath: string | null;
        };
        backendReceipt: EvalDemoBackendReceipt;
        statement: string;
    };
    commandsRun: string[];
    nextStepForRealRepo: string[];
    verdict: EvalDemoVerdict;
    truthTaxonomy: Record<GuidedEvalTruthTier, string>;
    privacy: {
        sourceFree: true;
        excludes: string[];
    };
}
export declare function buildEnterpriseEvalReport(facts: EvalDemoFacts, checkpoints: DemoCheckpoint[]): EnterpriseEvalReport;
export declare function renderEnterpriseEvalReportMarkdown(report: EnterpriseEvalReport): string;
export interface EvalDemoSummary {
    schemaVersion: typeof EVAL_DEMO_SUMMARY_SCHEMA_VERSION;
    generatedAt: string;
    agent: GuidedEvalAgent;
    enforcement: GuidedEvalEnforcement;
    enforcementLabel: string;
    mode: 'fixture' | 'real';
    repo: {
        rootHash: string;
    };
    completion: {
        complete: boolean;
        passed: number;
        total: number;
        percent: number;
    };
    checkpoints: Array<{
        id: string;
        title: string;
        truthTier: GuidedEvalTruthTier;
        status: DemoCheckpointStatus;
        observed: string;
    }>;
    facts: {
        boundaryBlock: {
            path: string | null;
            owners: string[];
            blockType: string | null;
        };
        exactApproval: {
            path: string | null;
            exactOnly: boolean;
            allowedAfter: boolean;
        };
        neighbor: {
            path: string | null;
            contained: boolean;
        };
        aiChangeRecord: {
            sessionId: string | null;
            relativePath: string | null;
        };
    };
    sourceFree: true;
    trustPosture: {
        backendReceiptConfigured: boolean;
        backendReceiptVerified: boolean;
        label: string;
        provenance: string;
    };
    recommendedNextCommand: string;
    verdict: EvalDemoVerdict;
    /** Source-free change-impact map for the fixture's changed set (advisory). */
    impactIntelligence: ImpactSummary | null;
    privacy: {
        sourceFree: true;
        excludes: string[];
    };
}
export declare function buildEvalDemoSummary(facts: EvalDemoFacts, checkpoints: DemoCheckpoint[]): EvalDemoSummary;
/** Throw if a would-be enterprise artifact contains source/diff/secret shapes. */
export declare function assertEnterpriseEvalSourceFree(value: unknown, label?: string): void;
//# sourceMappingURL=enterprise-eval-report.d.ts.map