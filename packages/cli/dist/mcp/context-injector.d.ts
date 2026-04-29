export interface GovernedPlanContext {
    available: boolean;
    source: 'change_contract' | 'state' | 'none';
    planId: string | null;
    intent: string | null;
    expectedFiles: string[];
    constraints: string[];
    blockedFiles: string[];
    notes: string[];
}
export interface GovernedPolicyContext {
    available: boolean;
    source: 'compiled_policy' | 'policy_lock' | 'compiled_policy+policy_lock' | 'none';
    policyPackId: string | null;
    policyPackVersion: string | null;
    effectiveRuleCount: number | null;
    deterministicRuleHints: string[];
    customPolicyCount: number | null;
    notes: string[];
}
export interface GovernedProjectContext {
    rootPath: string;
    treeLines: string[];
    scannedEntries: number;
    maxEntries: number;
    maxDepth: number;
    truncated: boolean;
}
export interface BuildGovernedPromptInput {
    userPrompt: string;
    plan: GovernedPlanContext;
    policies: GovernedPolicyContext;
    projectContext: GovernedProjectContext;
}
export declare function buildProjectContext(projectRoot: string, options?: {
    maxEntries?: number;
    maxDepth?: number;
}): GovernedProjectContext;
export declare function buildPlanContext(projectRoot: string, requestedPlanId?: string): GovernedPlanContext;
export declare function buildPolicyContext(projectRoot: string): GovernedPolicyContext;
export declare function buildInjectedContext(input: Omit<BuildGovernedPromptInput, 'userPrompt'> & {
    userPrompt?: string;
}): string;
export declare function buildGovernedPrompt(input: BuildGovernedPromptInput): string;
//# sourceMappingURL=context-injector.d.ts.map