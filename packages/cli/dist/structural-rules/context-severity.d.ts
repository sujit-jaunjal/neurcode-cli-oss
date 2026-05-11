/**
 * Context-aware severity adjustment.
 *
 * The same structural violation has different operational risk depending
 * on where it appears in the codebase:
 *   - SR001 in src/auth/middleware.ts → BLOCKING (auth path is critical)
 *   - SR001 in test/helpers.ts → ADVISORY (tests are not production code)
 *   - SR004 in src/api/routes.ts → BLOCKING (request boundary)
 *   - SR004 in scripts/seed.ts → ADVISORY (internal tooling)
 */
import type { StructuralViolation, RuleSeverity } from './types';
export interface SeverityContext {
    isTestFile: boolean;
    isAuthPath: boolean;
    isPaymentPath: boolean;
    isSecurityPath: boolean;
    isScriptOrTooling: boolean;
    isInfraPath: boolean;
}
export interface SeverityAdjustment {
    originalSeverity: RuleSeverity;
    adjustedSeverity: RuleSeverity;
    reason: string;
    contextFlags: SeverityContext;
}
/**
 * Classify a file path into a severity context.
 */
export declare function classifyFileContext(filePath: string): SeverityContext;
/**
 * Adjust a violation's severity based on file path context.
 * Returns the adjusted violation (new object, original unmodified).
 */
export declare function adjustViolationSeverity(violation: StructuralViolation, context: SeverityContext): {
    violation: StructuralViolation;
    adjustment: SeverityAdjustment;
};
/**
 * Apply context-aware severity to an array of violations.
 * Returns adjusted violations with a summary of what changed.
 */
export declare function applyContextualSeverity(violations: StructuralViolation[]): {
    violations: StructuralViolation[];
    adjustments: SeverityAdjustment[];
};
//# sourceMappingURL=context-severity.d.ts.map