import { type StructuralViolation } from '../structural-rules';
export interface StructuralOnDiffResult {
    violations: StructuralViolation[];
    rulesApplied: string[];
    suppressedCount: number;
}
/**
 * Run the default structural rule set on files touched by the diff. No I/O beyond reads.
 */
export declare function runStructuralOnDiffFiles(projectRoot: string, diffFiles: Array<{
    path: string;
}>): StructuralOnDiffResult;
//# sourceMappingURL=structural-on-diff.d.ts.map