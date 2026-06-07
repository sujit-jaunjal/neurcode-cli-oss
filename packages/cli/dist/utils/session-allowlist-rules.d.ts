import { type GovernanceSession } from '@neurcode-ai/governance-runtime';
export declare const SESSION_SCOPE_RULES_RELATIVE: ".cursor/rules/neurcode-session-scope.mdc";
export declare const STRICT_CURSOR_RULES_MARKER = "neurcode-enterprise-strict-mode";
export interface SessionScopeRulesResult {
    ok: boolean;
    filePath: string;
    sessionId: string | null;
    allowedGlobs: string[];
    message: string;
}
export interface StrictCursorRulesResult {
    ok: boolean;
    filePath: string;
    message: string;
}
export declare function buildSessionScopeRulesBody(session: GovernanceSession): string;
export declare function writeSessionScopeRules(input: {
    repoRoot: string;
    session: GovernanceSession;
}): SessionScopeRulesResult;
export declare function refreshSessionScopeRules(input: {
    dir?: string;
    sessionId?: string;
}): SessionScopeRulesResult;
export declare function writeStrictCursorRules(input: {
    repoRoot: string;
}): StrictCursorRulesResult;
export declare function listStrictOnboardArtifacts(repoRoot: string): string[];
//# sourceMappingURL=session-allowlist-rules.d.ts.map