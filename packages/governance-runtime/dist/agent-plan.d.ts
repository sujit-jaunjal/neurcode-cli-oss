/**
 * Agent Plan Capture V1
 *
 * Source-free model of the *agent's own stated plan* during an agentic coding
 * session. This is intentionally distinct from the V0 diff-based plan
 * verification primitives in `./index.ts` (PlanVerification*, PlanDiffFile,
 * etc.). Here we capture what the agent *said it would do* so the runtime can
 * answer: "is the agent still executing its own plan, or has it started making
 * changes its plan never justified?"
 *
 * Hard rules honored by this module:
 *  - Never store source code, diffs, patches, or file contents. Only file path
 *    references, globs, and short natural-language summaries the agent emitted.
 *  - Extraction is conservative: when no plan is present we return null rather
 *    than inventing one, and a bare user prompt is never treated as an agent
 *    plan.
 *  - Everything is deterministic (no model calls, no randomness).
 */
export type AgentPlanSource = 'claude_prompt' | 'manual' | 'mcp' | 'unknown';
export type AgentPlanConfidence = 'high' | 'medium' | 'low';
export declare const AGENT_PLAN_SCHEMA_VERSION: 1;
export interface AgentPlan {
    schemaVersion: number;
    /** Short natural-language description of the plan (source-free). */
    summary: string;
    /** Ordered plan steps as short text lines (source-free). */
    steps: string[];
    /** Concrete file paths the plan expects to touch. */
    expectedFiles: string[];
    /** Glob patterns the plan expects to touch. */
    expectedGlobs: string[];
    /** Stated constraints / guardrails the agent committed to. */
    constraints: string[];
    /** Stated risks / caveats the agent called out. */
    risks: string[];
    /** ISO-8601 timestamp of when the plan was captured. */
    capturedAt: string;
    source: AgentPlanSource;
    confidence: AgentPlanConfidence;
}
export type PlanCoherenceVerdict = 'planned' | 'implied' | 'unplanned' | 'unknown';
export interface PlanCoherenceResult {
    verdict: PlanCoherenceVerdict;
    /** 0-100; higher means the edit is better justified by the agent's plan. */
    score: number;
    /** Plan items (file/glob/step text) that matched the edited path. */
    matchedPlanItems: string[];
    /** Human-readable, deterministic explanation lines. */
    reasons: string[];
}
export interface PlanCoherenceInput {
    /** The captured agent plan, if any. */
    agentPlan?: AgentPlan | null;
    /** Repo-relative path being edited. */
    filePath: string;
    /**
     * Support paths derived from the *user intent* contract (e.g. globs the
     * intent allows as supporting work). Kept as an input so this module stays
     * decoupled from the intent-contract shape.
     */
    intentSupportGlobs?: string[];
    /**
     * Explicit override for whether the plan implies support work (tests,
     * utilities, refactors). When omitted we infer it deterministically from the
     * plan text.
     */
    planImpliesSupportWork?: boolean;
}
/**
 * Extract expected file paths and globs from free-form plan text. We only look
 * at backtick code spans and whitespace-delimited tokens that pass strict
 * path/glob shape checks — never arbitrary words.
 */
export declare function extractExpectedTargetsFromText(text: string): {
    expectedFiles: string[];
    expectedGlobs: string[];
};
/** Parse ordered/checklist step lines out of a markdown-ish block. */
export declare function parsePlanSteps(text: string): string[];
/** Does the plan text imply legitimate supporting work (tests/utils/refactor)? */
export declare function planImpliesSupportWork(plan: AgentPlan | null | undefined): boolean;
/** Is this path a conventional test or utility/support file? */
export declare function isTestOrUtilityPath(filePath: string): boolean;
/**
 * Deterministically grade an edit against the agent's plan.
 *
 * Verdict precedence:
 *  1. No agent plan captured           -> unknown
 *  2. Path matches expectedFiles/globs -> planned
 *  3. Path is intent-support/test/util AND plan implies support work -> implied
 *  4. Otherwise                        -> unplanned
 *
 * NOTE: this is advisory in V1. Boundary/approval blocks always override this
 * verdict at the call sites; an `unplanned` verdict alone must not block.
 */
export declare function evaluatePlanCoherence(input: PlanCoherenceInput): PlanCoherenceResult;
export interface ExtractAgentPlanOptions {
    /** Override capture timestamp (mainly for deterministic tests). */
    now?: Date;
    /** Override the recorded source (e.g. 'mcp' when called from the MCP server). */
    source?: AgentPlanSource;
}
/**
 * Deterministically extract an {@link AgentPlan} from a Claude Code hook
 * payload. Returns null when no plan is present — callers must treat a null
 * result as "no plan", never as a failure.
 *
 * This function never throws: any malformed payload yields null.
 */
export declare function extractAgentPlan(payload: unknown, options?: ExtractAgentPlanOptions): AgentPlan | null;
/**
 * Source-free projection of an agent plan for live sync / evidence export.
 * Drops nothing sensitive (the model is already source-free) but enforces the
 * shape and trims away anything unexpected callers may have attached.
 */
export declare function sanitizeAgentPlan(value: unknown): AgentPlan | undefined;
/** Sanitize a plan-coherence result coming back over the wire. */
export declare function sanitizePlanCoherence(value: unknown): PlanCoherenceResult | undefined;
//# sourceMappingURL=agent-plan.d.ts.map