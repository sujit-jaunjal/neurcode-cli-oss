/**
 * Diff Normalization Stage
 * ------------------------
 * Canonical stage that resolves the diff context, parses tracked/staged diff,
 * merges untracked files, and applies the project-wide exclusion filter.
 *
 * SEMANTIC PRESERVATION:
 *   This stage is a structural wrapper around the pre-existing diff loading
 *   logic in `verify.ts`. The order of operations, the helper functions
 *   invoked, and the returned `diffFiles` set are byte-identical to the
 *   inline implementation. The stage adds nothing but lineage and metrics.
 *
 *   Specifically, this stage MUST produce the same DiffFile[] that
 *   `verify.ts` line ~3580 produces — every downstream pipeline step
 *   depends on that identity.
 */
import { type DiffFile } from '@neurcode-ai/diff-parser';
import type { GovernancePipelineStage } from '../types';
export type DiffMode = 'staged' | 'base' | 'head' | 'auto';
export interface DiffNormalizationInput {
    /** Absolute project root, used for resolving default diff context. */
    projectRoot: string;
    /** Requested diff mode. 'auto' resolves origin/main → origin/master → staged. */
    mode: DiffMode;
    /** Explicit base ref when mode === 'base'. */
    baseRef?: string;
    /**
     * Function to source untracked files. Injected so we can:
     *   - reuse verify.ts's pre-existing `getUntrackedDiffFiles` without
     *     duplicating its excluded-file rules
     *   - test the stage with deterministic fixtures
     */
    getUntrackedDiffFiles: (projectRoot: string) => DiffFile[];
    /**
     * Function to test whether a path should be excluded from analysis.
     * Injected for the same reason as `getUntrackedDiffFiles`.
     */
    isExcludedFile: (filePath: string) => boolean;
}
export interface DiffNormalizationOutput {
    /** Raw `git diff` text. */
    diffText: string;
    /** Human-readable label, e.g. "working tree vs origin/main". */
    diffContextLabel: string;
    /** Diff files after parsing and untracked merge, BEFORE exclusion filter. */
    allDiffFiles: DiffFile[];
    /** Diff files after exclusion filtering — canonical input to downstream stages. */
    diffFiles: DiffFile[];
    /** True when no tracked or untracked changes are present. */
    emptyDiff: boolean;
    /** Count of files removed by the exclusion filter. */
    excludedFileCount: number;
}
/**
 * Stage definition. Use with `runStage(diffNormalizationStage, input, ctx)`.
 */
export declare const diffNormalizationStage: GovernancePipelineStage<DiffNormalizationInput, DiffNormalizationOutput>;
/**
 * Pure helper for direct invocation (used both by the stage and by tests).
 * Mirrors the semantics of the verify.ts inline implementation.
 */
export declare function computeDiffNormalization(input: DiffNormalizationInput): DiffNormalizationOutput;
//# sourceMappingURL=diff-normalization-stage.d.ts.map