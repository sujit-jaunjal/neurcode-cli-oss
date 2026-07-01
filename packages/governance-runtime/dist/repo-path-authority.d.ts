import { type IntentRedactionReasonCode } from './intent-privacy';
export type PathAuthorityReasonCode = IntentRedactionReasonCode | 'outside_repository' | 'symlink_escape' | 'glob_negation_unsupported' | 'glob_malformed' | 'glob_absolute_rejected' | 'windows_absolute_path_rejected' | 'unc_path_rejected';
export interface PathAuthorityResult {
    ok: boolean;
    path: string | null;
    kind: 'file' | 'glob' | null;
    reasonCodes: PathAuthorityReasonCode[];
}
export declare function resolveCanonicalRepoRoot(repoRoot: string): string;
export declare function validateRepoGlob(repoRoot: string, rawGlob: string): PathAuthorityResult;
export declare function validateRepoFilePath(repoRoot: string, rawPath: string, options?: {
    allowPlannedMissing?: boolean;
    allowGlobs?: boolean;
}): PathAuthorityResult;
export declare function assertRepoFilePath(repoRoot: string, rawPath: string, options?: {
    allowPlannedMissing?: boolean;
    allowGlobs?: boolean;
}): string;
export declare function assertRepoGlob(repoRoot: string, rawGlob: string): string;
//# sourceMappingURL=repo-path-authority.d.ts.map