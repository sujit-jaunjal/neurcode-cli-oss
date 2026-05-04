/**
 * Intent–Code Matcher — compares a ParsedIntent against a FileMeta index and
 * returns:
 *
 *  IntentIssue[]                   — missing / misplaced / partial issues
 *  componentMap                    — component → files where it was detected
 *  componentQuality                — component → 'strong' | 'weak' quality signal
 *
 * No LLM calls.  All checks are deterministic keyword/pattern matching.
 */
import type { ParsedIntent } from './parser';
import type { FileMeta } from './indexer';
export interface IntentIssue {
    type: 'missing' | 'misplaced' | 'partial';
    message: string;
    files?: string[];
    severity: 'high' | 'medium';
    rule: string;
}
export type ComponentQualityLevel = 'strong' | 'weak';
export interface MatchResult {
    intentIssues: IntentIssue[];
    checkedDomains: string[];
    /** component key → files where it was detected in added diff content */
    componentMap: Record<string, string[]>;
    /** component key → quality of the detected implementation */
    componentQuality: Record<string, ComponentQualityLevel>;
    /**
     * @deprecated Use componentMap instead.  Kept for backward compatibility with
     * coverage.ts which previously received Record<string, string[]> per domain.
     */
    foundComponents: Record<string, string[]>;
}
export declare function matchIntentToCode(intent: ParsedIntent, index: Map<string, FileMeta>): MatchResult;
//# sourceMappingURL=matcher.d.ts.map