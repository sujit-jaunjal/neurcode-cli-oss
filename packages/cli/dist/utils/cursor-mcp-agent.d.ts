export declare const CURSOR_MCP_AGENT_SCHEMA_VERSION: "neurcode.cursor-mcp-agent.v1";
export interface CursorMcpAgentCheck {
    id: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
}
export interface CursorMcpAgentInspection {
    schemaVersion: typeof CURSOR_MCP_AGENT_SCHEMA_VERSION;
    ok: boolean;
    repoRoot: string;
    checks: CursorMcpAgentCheck[];
    remediation: string[];
    neurcodeInAgentToolList: boolean;
    neurcodeInRepoWorkspace: boolean;
}
export declare function projectIdMatchesRepo(projectId: string, repoRoot: string): boolean;
export declare function inspectCursorAgentMcpSurface(repoRoot: string): {
    neurcodeInAgentToolList: boolean;
    neurcodeInRepoWorkspace: boolean;
    matchingProjectIds: string[];
    globalOnlyProjectIds: string[];
    message: string;
};
export declare function inspectCursorMcpAdoptionPath(dir?: string): CursorMcpAgentInspection;
//# sourceMappingURL=cursor-mcp-agent.d.ts.map