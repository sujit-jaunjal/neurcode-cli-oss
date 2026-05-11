import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export type ExceptionFlowClass = 'swallow' | 'log-only' | 'transformed-rethrow' | 'partial-rethrow';
/**
 * Strip Python comment lines and string literal regions from source lines.
 *
 * Algorithm (deterministic state machine):
 *   - Track whether we are inside a triple-quoted string (""" or ''')
 *   - Track whether we are inside a single-quoted string (" or ')
 *   - If a line starts with # (after stripping indent) → replace with empty string
 *   - Content inside string regions is neutralized (replaced with spaces of same length)
 *
 * This is NOT a full Python tokenizer — it handles the common cases that enable
 * bypass of governance checks while remaining O(n) and dependency-free.
 */
export declare function stripCommentsAndStrings(lines: string[]): string[];
/**
 * Classify the exception-handling flow of an except block body.
 *
 * Input: stripped lines (comments and strings already neutralized).
 * Returns the strictest applicable classification.
 */
export declare function classifyExceptionFlow(strippedBodyLines: string[], exceptIndent: number): ExceptionFlowClass;
export declare class PY003BroadExceptClause implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY003-broad-except-clause.d.ts.map