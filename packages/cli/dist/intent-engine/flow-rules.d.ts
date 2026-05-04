/**
 * Flow Rules — per-domain rules that describe how components must be
 * connected to each other to form a correct end-to-end implementation.
 *
 * These rules are evaluated by flow-validator.ts against the dependency
 * graph built from indexed diff files.  They describe connectivity
 * requirements, NOT presence requirements (presence is handled by matcher.ts).
 */
export type FlowRuleType = 'missing-flow' | 'misplaced-flow' | 'disconnected-flow';
export interface FlowRule {
    /** Unique identifier used as the rule key in FlowIssue and fix mappings. */
    id: string;
    description: string;
    type: FlowRuleType;
    severity: 'high' | 'medium';
    domain: string;
}
export declare const FLOW_RULES: Record<string, FlowRule[]>;
/** Returns all flow rules for a given domain, or [] if the domain is unknown. */
export declare function flowRulesForDomain(domain: string): FlowRule[];
//# sourceMappingURL=flow-rules.d.ts.map