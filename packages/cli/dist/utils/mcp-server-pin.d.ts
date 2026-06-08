export declare const MCP_SERVER_PACKAGE: "@neurcode-ai/mcp-server";
export declare const MIN_MCP_SERVER_VERSION: "0.2.5";
/** Legacy relative paths fail when Cursor MCP cwd is not the workspace root. */
export declare const PINNED_MCP_ENTRY_RELATIVE: "mcp-server/node_modules/@neurcode-ai/mcp-server/dist/index.js";
export declare function pinnedMcpBaseRoot(repoRoot: string, global?: boolean): string;
export declare function mcpServerPinDir(baseRoot: string): string;
export declare function mcpServerEntryScriptPath(baseRoot: string): string;
export declare function ensurePinnedMcpServer(baseRoot: string): {
    ok: boolean;
    entryPath: string;
    message: string;
};
export declare function buildRepoLocalMcpServerEntry(repoRoot: string): {
    command: string;
    args: string[];
};
export declare function buildGlobalMcpServerEntry(homeDir?: string): {
    command: string;
    args: string[];
};
export declare function buildPinnedMcpServerEntry(repoRoot: string, options?: {
    global?: boolean;
    homeDir?: string;
}): {
    command: string;
    args: string[];
};
export declare function normalizeMcpServerEntry(value: unknown): {
    command?: string;
    args?: string[];
} | null;
export declare function mcpServerEntryStaleReasons(value: unknown, expected: {
    command: string;
    args: string[];
}): string[];
export declare function mcpServerEntryIsCurrent(value: unknown, expected: {
    command: string;
    args: string[];
}): boolean;
/** Legacy npx-based entries are stale and fail on several npm/npx versions. */
export declare function isLegacyNpxMcpEntry(value: unknown): boolean;
/** Repo-relative node paths break Cursor MCP spawn when cwd is not workspace root. */
export declare function isRelativeNodeMcpEntry(value: unknown): boolean;
//# sourceMappingURL=mcp-server-pin.d.ts.map