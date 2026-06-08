"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bundledCliDir = bundledCliDir;
exports.getActiveCliEntry = getActiveCliEntry;
exports.cliSpawnEnv = cliSpawnEnv;
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const path_1 = require("path");
/** Directory containing the bundled CLI dist entry (`index.js`). */
function bundledCliDir() {
    return (0, path_1.join)(__dirname, '..');
}
/** Entry path used for child process spawns; matches the active invocation. */
function getActiveCliEntry() {
    return (0, cli_runtime_1.getActiveCliEntry)(bundledCliDir());
}
/** Env vars that pin the CLI entry for spawned children. */
function cliSpawnEnv() {
    const entry = getActiveCliEntry();
    return {
        NEURCODE_CLI_SPAWN_ENTRY: entry,
    };
}
//# sourceMappingURL=cli-entry.js.map