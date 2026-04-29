/**
 * Git Utility Functions
 *
 * Wraps git command execution with debug logging and large buffer support
 * to prevent ENOBUFS errors in large repositories.
 * Handles initial-commit case by falling back to empty tree when base is invalid.
 */
/** Git's canonical empty tree hash - safe to use when repo has only one commit */
export declare const GIT_EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
export interface DefaultDiffContext {
    mode: 'base' | 'staged';
    baseRef: string | null;
    currentBranch: string | null;
}
/**
 * Execute a git command with large buffer
 */
export declare function execGitCommand(command: string, options?: {
    encoding?: BufferEncoding;
    stdio?: any;
    cwd?: string;
}): string;
export declare function detectCurrentGitBranch(cwd?: string): string | null;
export declare function detectDefaultBaseRef(cwd?: string): string | null;
export declare function resolveDefaultDiffContext(cwd?: string): DefaultDiffContext;
/**
 * Get diff from a base ref to current work tree.
 * If base is invalid (e.g. HEAD~1 on initial commit), falls back to diff from empty tree to HEAD
 * so all files are treated as newly added and the policy engine can scan them.
 */
export declare function getDiffFromBase(base: string): string;
//# sourceMappingURL=git.d.ts.map