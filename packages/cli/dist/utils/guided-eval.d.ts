/**
 * Guided Evaluation Runner — shared state engine.
 *
 * One source-free model that turns the Enterprise Evaluation from a static
 * checklist into a progress-aware guided flow. The CLI `neurcode eval`
 * command group, the `demo:guided-enterprise-eval` harness, and (by mirror)
 * the dashboard all key off the same step ids and truth tiers defined here.
 *
 * Hard rules:
 *   - Source-free. We only ever read/emit paths, owners, symbol names, counts,
 *     verdicts, hashes, and truth-tier labels. Never source, diffs, prompts,
 *     secrets, or private file contents. {@link assertGuidedEvalSourceFree}
 *     is the backstop run before any report is written.
 *   - Honest. Every step carries exactly one truth tier. A step we cannot
 *     measure is `not_evaluated`, never silently "done".
 *   - Read-only against the user's repo. Nothing here mutates user source.
 *     The only writer is {@link scaffoldEvalFixture}, used solely for the
 *     explicit `--fixture` safe-demo mode.
 *
 * Keep the step ids / labels / tiers in lockstep with the dashboard mirror at
 * `web/dashboard/src/lib/guidedEval.ts` and the truth taxonomy at
 * `scripts/lib/truth-taxonomy.mjs` + `web/dashboard/src/lib/truthTaxonomy.ts`.
 */
export declare const GUIDED_EVAL_SCHEMA_VERSION: "neurcode.guided-eval.v1";
export type GuidedEvalTruthTier = 'deterministic' | 'backend_signed' | 'advisory' | 'not_evaluated';
export declare const GUIDED_EVAL_TRUTH_TIERS: Record<GuidedEvalTruthTier, {
    label: string;
    proves: string;
}>;
export type GuidedEvalAgent = 'claude' | 'codex' | 'cursor' | 'copilot' | 'vscode' | 'action';
export type GuidedEvalEnforcement = 'hard_hook' | 'supervised' | 'post_pr';
export declare const GUIDED_EVAL_AGENTS: GuidedEvalAgent[];
export declare function normalizeGuidedEvalAgent(value: unknown): GuidedEvalAgent;
export declare function enforcementForAgent(agent: GuidedEvalAgent): GuidedEvalEnforcement;
export declare function enforcementLabel(enforcement: GuidedEvalEnforcement): string;
export type GuidedEvalStepStatus = 'done' | 'pending' | 'attention' | 'not_applicable';
export type GuidedEvalMode = 'real' | 'fixture';
export interface GuidedEvalStepDef {
    id: string;
    title: string;
    truthTier: GuidedEvalTruthTier;
    /** Reporting key from the spec (CLI installed, repo detected, …). */
    reportKey: string;
    summary: string;
    /** Enforcement postures this step is meaningful for. */
    appliesTo: GuidedEvalEnforcement[];
    /** When true, the step is optional for postures it applies to (no red). */
    optional?: boolean;
}
/**
 * The canonical eleven evaluation checkpoints, in lifecycle order. The dashboard
 * renders the same ids; the harness asserts parity.
 */
export declare const GUIDED_EVAL_STEPS: GuidedEvalStepDef[];
export interface GuidedEvalRepoBrainFindings {
    status: 'measured' | 'not_evaluated';
    recoveryCommand: string;
    filesIndexed: number | null;
    sensitiveSurfaces: string[];
    ownerBoundaries: Array<{
        pattern: string;
        owners: string[];
    }>;
    reuseAdvisories: Array<{
        symbolName: string | null;
        files: string[];
        severity: string;
        confidence: string;
    }>;
    highFanOutSymbols: Array<{
        file: string;
        importFanIn: number;
        symbolCount: number;
    }>;
    reviewFirst: string[];
}
export interface GuidedEvalFacts {
    cliInstalled: boolean;
    cliVersion: string | null;
    isGitRepo: boolean;
    hasHeadCommit: boolean;
    brainIndexed: boolean;
    runtimeActive: boolean;
    activeSessionId: string | null;
    sessionCount: number;
    blockCount: number;
    approvalCount: number;
    lastBlockPath: string | null;
    exactApprovalPath: string | null;
    exactApprovalOnly: boolean;
    neighborContained: boolean;
    neighborBlockedPath: string | null;
    aiChangeRecordSessionId: string | null;
    aiChangeRecordTrustLevel: string | null;
    receiptPresent: boolean;
    receiptVerified: boolean;
    actionWorkflowConfigured: boolean;
    repoBrain: GuidedEvalRepoBrainFindings;
}
export interface GuidedEvalContext {
    schemaVersion: typeof GUIDED_EVAL_SCHEMA_VERSION;
    generatedAt: string;
    repoRoot: string;
    repoRootHash: string;
    agent: GuidedEvalAgent;
    enforcement: GuidedEvalEnforcement;
    mode: GuidedEvalMode;
    facts: GuidedEvalFacts;
}
/** Source-free repo identity: a hash of the absolute path, never its contents. */
export declare function hashRepoIdentity(repoRoot: string): string;
export interface GatherGuidedEvalContextOptions {
    agent?: GuidedEvalAgent;
    mode?: GuidedEvalMode;
    generatedAt?: string;
}
/**
 * Read-only inspection of the repo's local governance state. Every probe is
 * defensive — a missing/corrupt artifact degrades to "not done", never throws.
 */
export declare function gatherGuidedEvalContext(repoRoot: string, options?: GatherGuidedEvalContextOptions): GuidedEvalContext;
/**
 * The single command an evaluator should run to make progress on a step, for
 * the selected agent. Source-free, copy-pasteable, no destructive edits — in
 * real-repo mode the "trigger a block" guidance is described, not auto-run.
 */
export declare function stepCommand(stepId: string, agent: GuidedEvalAgent, mode: GuidedEvalMode): string;
export interface GuidedEvalStepResult {
    id: string;
    title: string;
    truthTier: GuidedEvalTruthTier;
    reportKey: string;
    status: GuidedEvalStepStatus;
    fact: string;
    command: string;
    optional: boolean;
}
export interface GuidedEvalNextAction {
    stepId: string;
    title: string;
    command: string;
    why: string;
}
export interface GuidedEvalState {
    schemaVersion: typeof GUIDED_EVAL_SCHEMA_VERSION;
    generatedAt: string;
    repoRootHash: string;
    agent: GuidedEvalAgent;
    enforcement: GuidedEvalEnforcement;
    enforcementLabel: string;
    mode: GuidedEvalMode;
    steps: GuidedEvalStepResult[];
    summary: {
        applicable: number;
        done: number;
        pending: number;
        attention: number;
        notApplicable: number;
        complete: boolean;
        percent: number;
    };
    nextAction: GuidedEvalNextAction | null;
    sourceFree: true;
}
export declare function buildGuidedEvalState(ctx: GuidedEvalContext): GuidedEvalState;
export declare function findSourceLeaks(text: string): string[];
/** Throw if a would-be artifact contains source/diff/secret shapes. */
export declare function assertGuidedEvalSourceFree(value: unknown, label?: string): void;
export declare const GUIDED_EVAL_REPORT_SCHEMA_VERSION: "neurcode.guided-eval-report.v1";
export interface GuidedEvalReport {
    schemaVersion: typeof GUIDED_EVAL_REPORT_SCHEMA_VERSION;
    generatedAt: string;
    agent: GuidedEvalAgent;
    enforcement: GuidedEvalEnforcement;
    enforcementLabel: string;
    mode: GuidedEvalMode;
    repo: {
        rootHash: string;
    };
    result: {
        complete: boolean;
        percent: number;
        done: number;
        applicable: number;
    };
    steps: Array<{
        id: string;
        title: string;
        reportKey: string;
        truthTier: GuidedEvalTruthTier;
        truthTierLabel: string;
        status: GuidedEvalStepStatus;
        fact: string;
    }>;
    facts: {
        boundary: {
            lastBlockPath: string | null;
            blockCount: number;
        };
        approval: {
            exactApprovalPath: string | null;
            exactApprovalOnly: boolean;
            approvalCount: number;
        };
        neighbor: {
            contained: boolean;
            neighborBlockedPath: string | null;
        };
        aiChangeRecord: {
            sessionId: string | null;
            trustLevel: string | null;
        };
        backendReceipt: {
            present: boolean;
            verified: boolean;
        };
        actionReport: {
            configured: boolean;
        };
    };
    repoBrain: GuidedEvalRepoBrainFindings;
    truthTaxonomy: Record<GuidedEvalTruthTier, string>;
    whatThisDoesNotProve: string[];
    privacy: {
        sourceFree: true;
        excludes: string[];
    };
}
/**
 * Build the shareable, source-free evaluation report from a derived state +
 * gathered context. The returned object is asserted source-free by the caller
 * before it is written or surfaced.
 */
export declare function buildGuidedEvalReport(state: GuidedEvalState, ctx: GuidedEvalContext): GuidedEvalReport;
/** Render the report as a source-free shareable markdown artifact. */
export declare function renderGuidedEvalReportMarkdown(report: GuidedEvalReport): string;
export interface EvalFixtureResult {
    dir: string;
    relativeDir: string;
    created: boolean;
    files: string[];
}
/**
 * Create a controlled, source-free demo fixture under `.neurcode/eval/fixture/`
 * so an evaluator can safely run the "trigger a block / approve / neighbor"
 * steps WITHOUT touching their real source. The fixture is its own git repo
 * (the parent `.neurcode/*` is gitignored), with a CODEOWNERS boundary and
 * placeholder files that carry no secrets and no real logic.
 */
export declare function scaffoldEvalFixture(repoRoot: string): EvalFixtureResult;
//# sourceMappingURL=guided-eval.d.ts.map