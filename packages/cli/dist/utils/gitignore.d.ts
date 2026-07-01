/**
 * Gitignore Updater Utility
 *
 * Ensures .neurcode runtime artifacts are ignored without mutating a tracked
 * .gitignore unless the operator explicitly consents.
 */
export type GitignoreHygieneResult = {
    mutated: boolean;
    method: 'gitignore' | 'info_exclude' | 'skipped_tracked_gitignore' | 'already_present';
};
/**
 * Ensure .neurcode runtime hygiene is represented in ignore rules.
 * Tracked `.gitignore` files are never mutated automatically; prefer
 * `.git/info/exclude` unless explicit operator consent is provided.
 */
export declare function ensureNeurcodeInGitignore(cwd?: string, options?: {
    consentMutateTrackedGitignore?: boolean;
}): GitignoreHygieneResult;
//# sourceMappingURL=gitignore.d.ts.map