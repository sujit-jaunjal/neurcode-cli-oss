export interface AccurateImpactResult {
    /** True only when the TS program was built and references were resolved. */
    analyzed: boolean;
    /** Modules (via the caller's deriveModulePath) that contain real references. */
    impactedModules: string[];
    /** Number of resolved reference sites (excluding the declarations). */
    referenceCount: number;
    /** Source files included in the analysis program. */
    filesAnalyzed: number;
    /** Confidence in completeness. 'medium' acknowledges cross-package/dynamic gaps. */
    confidence: 'medium' | 'none';
    /** Human-readable reason when analyzed === false. */
    reason?: string;
}
export interface AccurateImpactOptions {
    /** Hard cap on program size; above this we bail to protect verify latency. */
    maxProgramFiles?: number;
    /** Wall-clock budget; if exceeded mid-analysis we stop and report partial=false. */
    timeBudgetMs?: number;
}
/**
 * Compute accurate impacted modules for a change set.
 * @param deriveModulePath maps a repo-relative file path to its module key
 *        (caller supplies its own so the module set aligns with changedModules).
 */
export declare function computeAccurateImpact(projectRoot: string, changedRepoRelFiles: string[], deriveModulePath: (repoRelPath: string) => string, options?: AccurateImpactOptions): AccurateImpactResult;
//# sourceMappingURL=impact-analysis.d.ts.map