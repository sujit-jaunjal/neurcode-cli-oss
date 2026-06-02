/**
 * Runtime Admission — git capture (Phase A, CLI side).
 *
 * Produces RawDeltaInput[] for the pure governance-runtime core. Two modes:
 *
 *   1. captureWorktreeCoverage  — governed-session finish. Post-image object
 *      ids are computed with `git hash-object` (Git-native, applies .gitattributes
 *      clean filters) so they equal the blobs that will later be committed.
 *      We do NOT trust `git diff --raw` new-side ids for unstaged files.
 *
 *   2. captureCommittedDelta    — base..head over committed trees (reliable old
 *      AND new object ids straight from `git diff --raw`). For future Action use.
 *
 * Source-free: only paths, modes, and content-addressed object ids leave git.
 * No file bytes, no diff hunks.
 */
import type { GitObjectFormat } from '@neurcode-ai/contracts';
import type { RawDeltaInput } from '@neurcode-ai/governance-runtime';
export interface GitCaptureResult {
    objectFormat: GitObjectFormat;
    raw: RawDeltaInput[];
    /** Resolved base reference used for the capture (for worktree: HEAD or override). */
    baseRef: string | null;
    headRef: string | null;
}
/** Admission artifacts are provenance support records, never governed source effects. */
export declare function isAdmissionSupportArtifactPath(path: string): boolean;
export declare function detectGitObjectFormat(repoRoot: string): GitObjectFormat;
/**
 * Compute the would-be-committed object id + git mode for a worktree path.
 * Returns null if the path no longer exists (handled as a delete elsewhere).
 */
export declare function computeWorktreeObject(repoRoot: string, relPath: string): {
    mode: string;
    objectId: string;
} | null;
export interface WorktreeCaptureOptions {
    /** Base ref to diff the worktree against. Defaults to HEAD. */
    baseRef?: string;
}
/**
 * Capture the worktree effect set at session finish. Old-side ids come from the
 * committed base (reliable); new-side ids are recomputed with git hash-object.
 */
export declare function captureWorktreeCoverage(repoRoot: string, options?: WorktreeCaptureOptions): GitCaptureResult;
/**
 * Capture a committed tree delta (base..head). Both old and new object ids are
 * read directly from git (reliable for committed trees). --no-renames so renames
 * arrive as delete + add (the pure core also normalizes any R/C defensively).
 */
export declare function captureCommittedDelta(repoRoot: string, baseRef: string, headRef: string): GitCaptureResult;
//# sourceMappingURL=git-coverage.d.ts.map