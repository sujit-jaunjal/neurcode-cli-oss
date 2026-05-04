/**
 * Flow Validator — checks whether detected components are correctly connected
 * to each other to form a functioning end-to-end system.
 *
 * This is orthogonal to presence checking (matcher.ts).  A component can be
 * present but disconnected (e.g. middleware defined but never applied to routes).
 *
 * All checks are deterministic.  No LLM calls.  No disk I/O — operates only
 * on data already produced by the indexer and graph builder.
 */
import type { FileNode } from './graph';
export interface FlowIssue {
    /** Unique rule identifier — used for fix mapping and deduplication. */
    rule: string;
    type: 'missing-flow' | 'misplaced-flow' | 'disconnected-flow';
    message: string;
    files?: string[];
    severity: 'high' | 'medium';
}
/**
 * Run all flow validators for the given domains.
 *
 * @param domains       - Domains inferred from plan intent (e.g. ['auth', 'api'])
 * @param componentMap  - Component key → file paths (from matcher.ts)
 * @param graph         - Dependency graph built from indexed diff files
 * @returns Deduplicated list of FlowIssue
 */
export declare function validateFlows(domains: string[], componentMap: Record<string, string[]>, graph: Map<string, FileNode>): FlowIssue[];
//# sourceMappingURL=flow-validator.d.ts.map