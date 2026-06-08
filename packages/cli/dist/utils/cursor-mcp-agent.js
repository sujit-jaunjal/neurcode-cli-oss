"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURSOR_MCP_AGENT_SCHEMA_VERSION = void 0;
exports.projectIdMatchesRepo = projectIdMatchesRepo;
exports.inspectCursorAgentMcpSurface = inspectCursorAgentMcpSurface;
exports.inspectCursorMcpAdoptionPath = inspectCursorMcpAdoptionPath;
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
const agent_adapter_setup_1 = require("./agent-adapter-setup");
const mcp_server_pin_1 = require("./mcp-server-pin");
const v0_governance_1 = require("./v0-governance");
exports.CURSOR_MCP_AGENT_SCHEMA_VERSION = 'neurcode.cursor-mcp-agent.v1';
function cursorProjectsDir() {
    return (0, node_path_1.join)((0, node_os_1.homedir)(), '.cursor', 'projects');
}
function normalizeProjectKey(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function repoProjectMatchKeys(repoRoot) {
    const segments = (0, node_path_1.resolve)(repoRoot).replace(/\\/g, '/').split('/').filter(Boolean);
    const keys = new Set();
    for (let length = Math.min(5, segments.length); length >= 1; length -= 1) {
        keys.add(normalizeProjectKey(segments.slice(-length).join('-')));
    }
    return [...keys].filter(Boolean);
}
function mcpsDirHasNeurcodeTools(mcpsDir) {
    if (!(0, node_fs_1.existsSync)(mcpsDir))
        return false;
    for (const server of (0, node_fs_1.readdirSync)(mcpsDir)) {
        if (!/neurcode/i.test(server))
            continue;
        const toolsDir = (0, node_path_1.join)(mcpsDir, server, 'tools');
        if (!(0, node_fs_1.existsSync)(toolsDir))
            return true;
        if ((0, node_fs_1.readdirSync)(toolsDir).some((tool) => tool.includes('edit_before') || tool.includes('agent_edit_before'))) {
            return true;
        }
    }
    return false;
}
function projectIdMatchesRepo(projectId, repoRoot) {
    const normalizedProject = normalizeProjectKey(projectId);
    return repoProjectMatchKeys(repoRoot).some((key) => key.length >= 4 && normalizedProject.includes(key));
}
function inspectCursorAgentMcpSurface(repoRoot) {
    const projectsDir = cursorProjectsDir();
    if (!(0, node_fs_1.existsSync)(projectsDir)) {
        return {
            neurcodeInAgentToolList: false,
            neurcodeInRepoWorkspace: false,
            matchingProjectIds: [],
            globalOnlyProjectIds: [],
            message: 'Cursor has not indexed MCP tools for this machine yet (.cursor/projects missing).',
        };
    }
    const matchingProjectIds = [];
    const globalOnlyProjectIds = [];
    let neurcodeInAnyWorkspace = false;
    for (const projectId of (0, node_fs_1.readdirSync)(projectsDir)) {
        const mcpsDir = (0, node_path_1.join)(projectsDir, projectId, 'mcps');
        if (!mcpsDirHasNeurcodeTools(mcpsDir))
            continue;
        neurcodeInAnyWorkspace = true;
        if (projectIdMatchesRepo(projectId, repoRoot)) {
            matchingProjectIds.push(projectId);
        }
        else if (/^(empty-window|global)/i.test(projectId)) {
            globalOnlyProjectIds.push(projectId);
        }
    }
    const neurcodeInRepoWorkspace = matchingProjectIds.length > 0;
    const neurcodeInAgentToolList = neurcodeInRepoWorkspace || neurcodeInAnyWorkspace;
    let message;
    if (neurcodeInRepoWorkspace) {
        message = `Neurcode MCP indexed for this repo workspace (${matchingProjectIds.join(', ')}).`;
    }
    else if (neurcodeInAnyWorkspace) {
        message =
            'Neurcode MCP is indexed in another Cursor workspace, not this repo. Open this repository in Cursor and reload the window.';
    }
    else {
        message = 'Neurcode MCP is not present in Cursor Agent tool list. Enable Home MCP and reload the window.';
    }
    return {
        neurcodeInAgentToolList,
        neurcodeInRepoWorkspace,
        matchingProjectIds,
        globalOnlyProjectIds,
        message,
    };
}
function runPinnedMcpDoctor(repoRoot) {
    const globalRoot = (0, mcp_server_pin_1.pinnedMcpBaseRoot)(repoRoot, true);
    const pinned = (0, mcp_server_pin_1.ensurePinnedMcpServer)(globalRoot);
    if (!pinned.ok) {
        return {
            id: 'mcp_server_pinned',
            status: 'fail',
            message: pinned.message,
        };
    }
    const doctor = (0, node_child_process_1.spawnSync)(process.execPath, [(0, mcp_server_pin_1.mcpServerEntryScriptPath)(globalRoot), '--doctor'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const ok = doctor.status === 0;
    return {
        id: 'mcp_server_doctor',
        status: ok ? 'pass' : 'fail',
        message: ok
            ? 'Pinned @neurcode-ai/mcp-server --doctor reports ready.'
            : (doctor.stderr || doctor.stdout || 'MCP server doctor failed').trim().slice(0, 240),
    };
}
function inspectCursorMcpAdoptionPath(dir) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(dir || process.cwd());
    const checks = [];
    const remediation = [];
    const repoMcp = (0, agent_adapter_setup_1.inspectAgentSetup)({ target: 'cursor', repoRoot, global: false });
    checks.push({
        id: 'repo_mcp_config',
        status: repoMcp.configured ? 'pass' : 'fail',
        message: repoMcp.configured
            ? `Repo MCP pinned at ${repoMcp.configPath}.`
            : repoMcp.message,
    });
    const homeMcp = (0, agent_adapter_setup_1.inspectAgentSetup)({ target: 'cursor', repoRoot, global: true });
    const homeConfigured = homeMcp.configured === true;
    checks.push({
        id: 'home_mcp_config',
        status: homeConfigured ? 'pass' : 'fail',
        message: homeConfigured
            ? `Home MCP pinned at ${homeMcp.configPath}. Enable Home MCP in Cursor Settings → MCP.`
            : `Missing or stale Home MCP at ${homeMcp.configPath}. Run: neurcode cursor onboard --strict`,
    });
    if (!homeConfigured) {
        remediation.push('neurcode cursor onboard --strict');
        remediation.push('Cursor Settings → MCP → enable Home MCP, then Developer: Reload Window');
    }
    checks.push(runPinnedMcpDoctor(repoRoot));
    const agentSurface = inspectCursorAgentMcpSurface(repoRoot);
    const agentToolsStatus = agentSurface.neurcodeInRepoWorkspace
        ? 'pass'
        : agentSurface.neurcodeInAgentToolList
            ? 'warn'
            : 'fail';
    checks.push({
        id: 'cursor_agent_mcp_tools',
        status: agentToolsStatus,
        message: agentSurface.message,
    });
    if (!agentSurface.neurcodeInRepoWorkspace) {
        remediation.push('Open this repository root in Cursor, enable Home MCP, then Developer: Reload Window');
        remediation.push('Confirm ~/.cursor/projects/<this-repo>/mcps/user-neurcode/tools includes neurcode_agent_edit_before');
    }
    const failCount = checks.filter((check) => check.status === 'fail').length;
    const warnCount = checks.filter((check) => check.status === 'warn').length;
    return {
        schemaVersion: exports.CURSOR_MCP_AGENT_SCHEMA_VERSION,
        ok: failCount === 0,
        repoRoot,
        checks,
        remediation: [...new Set(remediation)],
        neurcodeInAgentToolList: agentSurface.neurcodeInAgentToolList,
        neurcodeInRepoWorkspace: agentSurface.neurcodeInRepoWorkspace,
    };
}
//# sourceMappingURL=cursor-mcp-agent.js.map