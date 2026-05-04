/**
 * Intent Parser — keyword-heuristic only, no LLM calls.
 * Converts a free-text intent string into structured domains, expected code
 * patterns, and critical rules that the matcher uses to audit the diff.
 */
export interface ParsedIntent {
    domains: string[];
    expectedPatterns: string[];
    criticalRules: string[];
}
export declare function parseIntent(intent: string): ParsedIntent;
//# sourceMappingURL=parser.d.ts.map