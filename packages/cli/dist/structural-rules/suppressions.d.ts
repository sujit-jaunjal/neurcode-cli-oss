/**
 * Inline suppression annotations for structural rules.
 *
 * Supported formats:
 *   // neurcode-ignore: SR003
 *   // neurcode-ignore: SR003, SR007
 *   // neurcode-ignore-next-line: SR003
 *   // neurcode-ignore-file: SR003
 *   // neurcode-ignore-file: SR003 — reason: timer is cleaned up in test teardown
 *
 * Every suppression is preserved in the audit trail as a SuppressedViolation.
 * Suppressions never silently drop findings — they reclassify them as suppressed.
 */
import type { StructuralViolation } from './types';
export interface SuppressionDirective {
    type: 'line' | 'next-line' | 'file';
    ruleIds: string[];
    line: number;
    reason: string | null;
    raw: string;
}
export interface SuppressedViolation {
    violation: StructuralViolation;
    directive: SuppressionDirective;
    suppressedAt: string;
}
/**
 * Parse all neurcode-ignore directives from source text.
 * Returns directives sorted by line number.
 */
export declare function parseSuppressionDirectives(sourceText: string): SuppressionDirective[];
/**
 * Apply suppression directives to a set of violations.
 *
 * Returns:
 *  - active: violations NOT suppressed (to be reported normally)
 *  - suppressed: violations that matched a directive (audit trail)
 */
export declare function applySuppressions(violations: StructuralViolation[], directives: SuppressionDirective[], _filePath: string): {
    active: StructuralViolation[];
    suppressed: SuppressedViolation[];
};
//# sourceMappingURL=suppressions.d.ts.map