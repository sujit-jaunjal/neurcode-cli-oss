"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PINNED_MCP_ENTRY_RELATIVE = exports.MIN_MCP_SERVER_VERSION = exports.MCP_SERVER_PACKAGE = void 0;
exports.pinnedMcpBaseRoot = pinnedMcpBaseRoot;
exports.mcpServerPinDir = mcpServerPinDir;
exports.mcpServerEntryScriptPath = mcpServerEntryScriptPath;
exports.ensurePinnedMcpServer = ensurePinnedMcpServer;
exports.buildRepoLocalMcpServerEntry = buildRepoLocalMcpServerEntry;
exports.buildGlobalMcpServerEntry = buildGlobalMcpServerEntry;
exports.buildPinnedMcpServerEntry = buildPinnedMcpServerEntry;
exports.normalizeMcpServerEntry = normalizeMcpServerEntry;
exports.mcpServerEntryStaleReasons = mcpServerEntryStaleReasons;
exports.mcpServerEntryIsCurrent = mcpServerEntryIsCurrent;
exports.isLegacyNpxMcpEntry = isLegacyNpxMcpEntry;
exports.isRelativeNodeMcpEntry = isRelativeNodeMcpEntry;
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
exports.MCP_SERVER_PACKAGE = '@neurcode-ai/mcp-server';
exports.MIN_MCP_SERVER_VERSION = '0.3.1';
/** Legacy relative paths fail when Cursor MCP cwd is not the workspace root. */
exports.PINNED_MCP_ENTRY_RELATIVE = 'mcp-server/node_modules/@neurcode-ai/mcp-server/dist/index.js';
function pinnedMcpBaseRoot(repoRoot, global = false) {
    return global ? (0, node_path_1.join)((0, node_os_1.homedir)(), '.neurcode') : repoRoot;
}
function mcpServerPinDir(baseRoot) {
    return (0, node_path_1.join)(baseRoot, 'mcp-server');
}
function mcpServerEntryScriptPath(baseRoot) {
    return (0, node_path_1.join)(mcpServerPinDir(baseRoot), 'node_modules', '@neurcode-ai', 'mcp-server', 'dist', 'index.js');
}
function ensurePinnedMcpServer(baseRoot) {
    const entryPath = mcpServerEntryScriptPath(baseRoot);
    if ((0, node_fs_1.existsSync)(entryPath)) {
        return { ok: true, entryPath, message: `Pinned MCP server present at ${entryPath}` };
    }
    const installDir = mcpServerPinDir(baseRoot);
    (0, node_fs_1.mkdirSync)(installDir, { recursive: true });
    const versionsToTry = [exports.MIN_MCP_SERVER_VERSION, '0.3.0', '0.2.5'].filter((version, index, all) => all.indexOf(version) === index);
    let lastMessage = `Failed to install pinned MCP server (${exports.MCP_SERVER_PACKAGE}).`;
    for (const version of versionsToTry) {
        const install = (0, node_child_process_1.spawnSync)('npm', [
            'install',
            '--prefix',
            installDir,
            '--silent',
            '--no-save',
            `${exports.MCP_SERVER_PACKAGE}@${version}`,
        ], { cwd: baseRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        if (install.status === 0 && (0, node_fs_1.existsSync)(entryPath)) {
            return {
                ok: true,
                entryPath,
                message: `Installed pinned MCP server @${version} at ${entryPath}`,
            };
        }
        lastMessage = install.stderr?.trim() || install.stdout?.trim() || lastMessage;
    }
    return {
        ok: false,
        entryPath,
        message: lastMessage,
    };
}
function buildRepoLocalMcpServerEntry(repoRoot) {
    return {
        command: 'node',
        args: [mcpServerEntryScriptPath((0, node_path_1.resolve)(repoRoot))],
    };
}
function buildGlobalMcpServerEntry(homeDir = (0, node_os_1.homedir)()) {
    return {
        command: 'node',
        args: [mcpServerEntryScriptPath((0, node_path_1.join)(homeDir, '.neurcode'))],
    };
}
function buildPinnedMcpServerEntry(repoRoot, options = {}) {
    if (options.global) {
        return buildGlobalMcpServerEntry(options.homeDir);
    }
    return buildRepoLocalMcpServerEntry(repoRoot);
}
function normalizeMcpServerEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    const command = typeof record.command === 'string' ? record.command : undefined;
    const rawArgs = record.args;
    const args = Array.isArray(rawArgs) && rawArgs.every((arg) => typeof arg === 'string')
        ? [...rawArgs]
        : undefined;
    return { command, args };
}
function mcpServerEntryStaleReasons(value, expected) {
    const entry = normalizeMcpServerEntry(value);
    if (!entry)
        return ['mcpServers.neurcode must be an object'];
    const reasons = [];
    if (entry.command !== expected.command) {
        reasons.push(`expected command "${expected.command}", found "${entry.command || 'missing'}"`);
    }
    if (!entry.args) {
        reasons.push(`expected args ${JSON.stringify(expected.args)}, found missing/non-string args`);
    }
    else if (entry.args.length !== expected.args.length ||
        entry.args.some((arg, index) => arg !== expected.args[index])) {
        reasons.push(`expected args ${JSON.stringify(expected.args)}, found ${JSON.stringify(entry.args)}`);
    }
    return reasons;
}
function mcpServerEntryIsCurrent(value, expected) {
    return mcpServerEntryStaleReasons(value, expected).length === 0;
}
/** Legacy npx-based entries are stale and fail on several npm/npx versions. */
function isLegacyNpxMcpEntry(value) {
    const entry = normalizeMcpServerEntry(value);
    if (!entry)
        return false;
    if (entry.command !== 'npx')
        return false;
    return Boolean(entry.args?.some((arg) => arg.includes(exports.MCP_SERVER_PACKAGE)));
}
/** Repo-relative node paths break Cursor MCP spawn when cwd is not workspace root. */
function isRelativeNodeMcpEntry(value) {
    const entry = normalizeMcpServerEntry(value);
    if (!entry || entry.command !== 'node' || !entry.args?.[0])
        return false;
    const script = entry.args[0];
    return !script.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(script);
}
//# sourceMappingURL=mcp-server-pin.js.map