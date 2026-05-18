/**
 * Runtime state guardrails.
 *
 * Detects the operational state of a project root and produces structured
 * "what's next" guidance when a command would otherwise fail with a raw
 * runtime / git / filesystem error.
 *
 * Pure, deterministic, no network. Read-only. No mutations to .neurcode/
 * or any other on-disk state.
 *
 * Aesthetic discipline: subtle sophistication, no terminal theatrics.
 * Aligned with the operational-experience refabrication phase
 * (docs/ux/final-operational-experience-report.md).
 */
export type RuntimeStateIssue = 'not-a-git-repo' | 'no-head-commit' | 'no-neurcode-dir' | 'no-intent-pack';
export interface RuntimeStateSnapshot {
    projectRoot: string;
    isGitRepo: boolean;
    hasHeadCommit: boolean;
    hasNeurcodeDir: boolean;
    hasIntentPack: boolean;
    hasLastVerifyOutput: boolean;
}
export declare function detectRuntimeState(projectRoot: string): RuntimeStateSnapshot;
/**
 * Render an operational-guidance panel when a command cannot run because
 * a prerequisite is not met. Same aesthetic as the welcome banner + the
 * `neurcode home` panels: subtle, structured, no theatrics.
 *
 * The panel writes to stderr (so JSON-mode callers piping stdout get clean
 * JSON or no output) and returns the exit code the caller should propagate.
 */
export declare function renderRuntimeStateGuidance(issue: RuntimeStateIssue, state: RuntimeStateSnapshot, options?: {
    commandLabel?: string;
}): number;
/**
 * Convenience: detect state + render guidance + return the exit code for
 * the FIRST unsatisfied prerequisite (in lifecycle order). Returns null if
 * all required prerequisites are satisfied.
 */
export declare function guardRequired(projectRoot: string, required: ReadonlyArray<RuntimeStateIssue>, options?: {
    commandLabel?: string;
}): number | null;
//# sourceMappingURL=runtime-state.d.ts.map