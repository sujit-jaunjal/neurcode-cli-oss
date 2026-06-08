/** Directory containing the bundled CLI dist entry (`index.js`). */
export declare function bundledCliDir(): string;
/** Entry path used for child process spawns; matches the active invocation. */
export declare function getActiveCliEntry(): string;
/** Env vars that pin the CLI entry for spawned children. */
export declare function cliSpawnEnv(): Record<string, string>;
//# sourceMappingURL=cli-entry.d.ts.map