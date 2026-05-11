import type { ExplainedViolation, ViolationReport } from './types';
export declare class ViolationFormatter {
    /**
     * Format a single violation into a concise, actionable terminal string.
     *
     * Example:
     * ┌─ SR001 · BLOCKING · deterministic-structural (confidence: 97%)
     * │  File:    packages/server/src/middleware/requestCoalescer.ts:43
     * │  Pattern: .catch() callback contains no throw/reject path
     * │  Code:    .catch((err) => { this.pending.delete(key); console.error(err); })
     * │  Risk:    All coalesced waiters receive undefined instead of rejection
     * │  Fix:     Add `throw err;` before the closing brace of the .catch callback
     * └─────────────────────────────────────────────────────────────────────────────
     */
    formatSingle(v: ExplainedViolation): string;
    /**
     * Format a ViolationReport into a full terminal report.
     * Sections: Summary header, Blocking violations (grouped by file),
     * Advisory violations (grouped by file), Determinism breakdown.
     */
    formatReport(report: ViolationReport): string;
    /**
     * Format as GitHub PR comment markdown.
     * Uses GitHub markdown: collapsible sections, code blocks, tables.
     */
    formatGitHubPRComment(report: ViolationReport, planId?: string): string;
    /**
     * Format as compact JSON for CI/CD pipeline consumption.
     */
    formatJSON(report: ViolationReport): string;
}
//# sourceMappingURL=ViolationFormatter.d.ts.map