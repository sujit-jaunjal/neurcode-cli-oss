export { ViolationFormatter } from './ViolationFormatter';
export { DeterminismClassifier } from './DeterminismClassifier';
export type { ExplainedViolation, ViolationReport, DeterminismClass } from './types';
import type { ViolationReport } from './types';
import type { StructuralViolation } from '../structural-rules/types';
/**
 * Build a ViolationReport from structural rule violations.
 * This is the bridge between the structural rule engine output
 * and the explainability layer.
 *
 * Deterministic violationId: `${ruleId}:${filePath}:${line}:${column}`
 * Same input always produces the same ID.
 */
export declare function buildViolationReport(violations: StructuralViolation[], repoRoot: string): ViolationReport;
//# sourceMappingURL=index.d.ts.map