"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_ADAPTER_DOCTOR_SCHEMA_VERSION = exports.AGENT_ADAPTER_SETUP_SCHEMA_VERSION = void 0;
exports.normalizeAgentSetupTarget = normalizeAgentSetupTarget;
exports.adapterForSetupTarget = adapterForSetupTarget;
exports.buildAgentSetupSnippet = buildAgentSetupSnippet;
exports.buildAgentInstructionArtifact = buildAgentInstructionArtifact;
exports.inspectAgentSetup = inspectAgentSetup;
exports.inspectAgentInstructions = inspectAgentInstructions;
exports.writeAgentSetup = writeAgentSetup;
exports.writeAgentInstructions = writeAgentInstructions;
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
exports.AGENT_ADAPTER_SETUP_SCHEMA_VERSION = 'neurcode.agent-adapter-setup.v1';
exports.AGENT_ADAPTER_DOCTOR_SCHEMA_VERSION = 'neurcode.agent-adapter-doctor.v1';
const MCP_PACKAGE = '@neurcode-ai/mcp-server';
function mcpServerEntry() {
    return {
        command: 'npx',
        args: ['-y', MCP_PACKAGE],
    };
}
function jsonSnippet() {
    return JSON.stringify({
        mcpServers: {
            neurcode: mcpServerEntry(),
        },
    }, null, 2);
}
function tomlSnippet() {
    return [
        '[mcp_servers.neurcode]',
        'command = "npx"',
        `args = ["-y", "${MCP_PACKAGE}"]`,
        '',
    ].join('\n');
}
function normalizeAgentSetupTarget(value) {
    const normalized = (value || 'codex').trim().toLowerCase();
    if (['claude', 'claude-code', 'claude_code'].includes(normalized))
        return 'claude';
    if (['codex', 'codex-mcp'].includes(normalized))
        return 'codex';
    if (['cursor', 'cursor-mcp'].includes(normalized))
        return 'cursor';
    if (['generic', 'generic-mcp', 'mcp', 'gemini'].includes(normalized))
        return 'generic-mcp';
    throw new Error(`Unsupported agent setup target "${value}". Supported: claude, codex, cursor, generic-mcp.`);
}
function adapterForSetupTarget(target) {
    if (target === 'claude')
        return 'claude-code-hooks';
    if (target === 'codex')
        return 'codex-mcp';
    if (target === 'cursor')
        return 'cursor-mcp';
    return 'generic-mcp';
}
function codexConfigPath() {
    return (0, node_path_1.join)((0, node_os_1.homedir)(), '.codex', 'config.toml');
}
function cursorConfigPath(repoRoot, global) {
    return global
        ? (0, node_path_1.join)((0, node_os_1.homedir)(), '.cursor', 'mcp.json')
        : (0, node_path_1.join)(repoRoot, '.cursor', 'mcp.json');
}
function instructionPath(target, repoRoot) {
    if (target === 'codex')
        return (0, node_path_1.join)(repoRoot, 'AGENTS.md');
    if (target === 'cursor')
        return (0, node_path_1.join)(repoRoot, '.cursor', 'rules', 'neurcode-governance.mdc');
    if (target === 'generic-mcp')
        return (0, node_path_1.join)(repoRoot, 'NEURCODE_AGENT.md');
    return null;
}
function instructionDestination(target) {
    if (target === 'codex')
        return 'AGENTS.md';
    if (target === 'cursor')
        return '.cursor/rules/neurcode-governance.mdc';
    if (target === 'generic-mcp')
        return 'NEURCODE_AGENT.md';
    return 'Claude Code hook contract';
}
function instructionHeader(target) {
    if (target !== 'cursor')
        return [];
    return [
        '---',
        'description: Neurcode runtime governance for AI coding edits',
        'alwaysApply: true',
        '---',
        '',
    ];
}
function cliAdapterName(adapter) {
    return adapter;
}
function instructionBody(input) {
    if (input.target === 'claude') {
        return [
            '<!-- neurcode-agent-runtime-v1 -->',
            '# Neurcode Runtime Governance',
            '',
            'Claude Code is governed by Neurcode hooks after `neurcode activate claude`.',
            'Hooks run before Edit/Write/MultiEdit and can hard-deny writes before they land.',
            '',
        ].join('\n');
    }
    const adapter = cliAdapterName(input.adapter);
    return [
        ...instructionHeader(input.target),
        '<!-- neurcode-agent-runtime-v1 -->',
        '# Neurcode Runtime Governance',
        '',
        'This repository uses Neurcode as the in-flow governance runtime for AI-generated software changes.',
        '',
        'Follow this contract during coding tasks:',
        '',
        '1. Start or join a governed session before implementation.',
        '2. Handshake into the active session with `neurcode_agent_session_handshake`.',
        '3. Capture a source-free implementation plan with `neurcode_agent_plan_capture` before edits.',
        '4. Before every proposed file write, call `neurcode_agent_edit_before` with the repo-relative `filePath` and write-tool name.',
        '5. If the decision is `deny`, do not write the file. Show the denial and `approvalContext` to the human.',
        '6. If approval is granted, use `neurcode_session_approve` with the exact suggested path. Do not broaden to a directory unless the human explicitly asks.',
        '7. If the plan or scope changes, call `neurcode_agent_plan_amend` before editing outside the accepted plan.',
        '8. Finish with `neurcode_agent_session_finish` so replayable evidence is written.',
        '',
        'Never send source code, diffs, patches, file contents, or before/after text in Neurcode MCP payloads. Use paths, plan summaries, owner metadata, decisions, and approval reasons only.',
        '',
        'If MCP tools are unavailable, use the local CLI fallback:',
        '',
        '```bash',
        `neurcode agent check <repo-relative-path> --adapter ${adapter} --session-id <session-id>`,
        `neurcode agent approve <exact-path> --adapter ${adapter} --session-id <session-id> --reason "<reason>"`,
        `neurcode agent finish --adapter ${adapter} --session-id <session-id>`,
        '```',
        '',
        'Treat Neurcode `deny` as authoritative. Re-plan or ask for exact approval instead of bypassing the runtime.',
        '',
    ].join('\n');
}
function buildAgentSetupSnippet(input) {
    const adapter = adapterForSetupTarget(input.target);
    switch (input.target) {
        case 'claude':
            return {
                target: input.target,
                adapter,
                destination: 'Claude Code hooks and MCP config',
                configPath: null,
                format: 'text',
                body: 'Run: neurcode activate claude',
                instruction: 'Claude Code is the hard-deny adapter. Use neurcode activate claude to install hooks and MCP approval tools.',
            };
        case 'codex':
            return {
                target: input.target,
                adapter,
                destination: '~/.codex/config.toml',
                configPath: codexConfigPath(),
                format: 'toml',
                body: tomlSnippet(),
                instruction: 'Append this block to your Codex config so Codex can call Neurcode MCP tools before edits.',
            };
        case 'cursor':
            return {
                target: input.target,
                adapter,
                destination: input.global ? '~/.cursor/mcp.json' : '.cursor/mcp.json',
                configPath: cursorConfigPath(input.repoRoot, input.global === true),
                format: 'json',
                body: jsonSnippet(),
                instruction: 'Merge this mcpServers.neurcode entry into Cursor MCP config.',
            };
        case 'generic-mcp':
            return {
                target: input.target,
                adapter,
                destination: 'your MCP client config',
                configPath: null,
                format: 'json',
                body: jsonSnippet(),
                instruction: 'Register this MCP server in any agent host that supports stdio MCP tools.',
            };
    }
}
function buildAgentInstructionArtifact(input) {
    const adapter = adapterForSetupTarget(input.target);
    const filePath = instructionPath(input.target, input.repoRoot);
    return {
        target: input.target,
        adapter,
        destination: instructionDestination(input.target),
        filePath,
        format: 'markdown',
        body: instructionBody({ target: input.target, adapter }),
        instruction: input.target === 'claude'
            ? 'Use neurcode activate claude; hook installation is the enforcement layer.'
            : `Add this runtime contract to ${instructionDestination(input.target)} so the agent knows when to call Neurcode tools.`,
    };
}
function readText(path) {
    return (0, node_fs_1.existsSync)(path) ? (0, node_fs_1.readFileSync)(path, 'utf8') : '';
}
function hasNeurcodeInstructions(path) {
    return readText(path).includes('neurcode-agent-runtime-v1');
}
function isCodexConfigured(path) {
    const text = readText(path);
    return /\[mcp_servers\.neurcode\]/.test(text) || text.includes(MCP_PACKAGE);
}
function isCursorConfigured(path) {
    if (!(0, node_fs_1.existsSync)(path))
        return false;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        return Boolean(parsed.mcpServers?.neurcode);
    }
    catch {
        return readText(path).includes(MCP_PACKAGE);
    }
}
function inspectAgentSetup(input) {
    const adapter = adapterForSetupTarget(input.target);
    if (input.target === 'claude') {
        return {
            target: input.target,
            adapter,
            supported: true,
            configured: null,
            configPath: null,
            message: 'Use neurcode activate claude for hook + MCP installation.',
        };
    }
    if (input.target === 'generic-mcp') {
        return {
            target: input.target,
            adapter,
            supported: true,
            configured: null,
            configPath: null,
            message: 'Generic MCP clients require manual registration using the emitted snippet.',
        };
    }
    const snippet = buildAgentSetupSnippet(input);
    const configPath = snippet.configPath;
    const configured = input.target === 'codex'
        ? Boolean(configPath && isCodexConfigured(configPath))
        : Boolean(configPath && isCursorConfigured(configPath));
    return {
        target: input.target,
        adapter,
        supported: true,
        configured,
        configPath,
        message: configured
            ? `Neurcode MCP is configured in ${configPath}.`
            : `Neurcode MCP is not configured in ${configPath}.`,
    };
}
function inspectAgentInstructions(input) {
    const artifact = buildAgentInstructionArtifact(input);
    if (input.target === 'claude') {
        return {
            target: input.target,
            adapter: artifact.adapter,
            supported: true,
            installed: null,
            filePath: artifact.filePath,
            message: 'Claude Code uses installed hooks; repo instructions are optional.',
        };
    }
    if (!artifact.filePath) {
        return {
            target: input.target,
            adapter: artifact.adapter,
            supported: false,
            installed: null,
            filePath: null,
            message: 'No instruction destination is defined for this adapter.',
        };
    }
    const installed = hasNeurcodeInstructions(artifact.filePath);
    return {
        target: input.target,
        adapter: artifact.adapter,
        supported: true,
        installed,
        filePath: artifact.filePath,
        message: installed
            ? `Neurcode agent instructions are installed in ${artifact.filePath}.`
            : `Neurcode agent instructions are missing from ${artifact.filePath}.`,
    };
}
function ensureParent(path) {
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
}
function writeCodexConfig(path) {
    if (isCodexConfigured(path)) {
        return {
            status: 'already_configured',
            configPath: path,
            message: `Codex config already contains Neurcode MCP at ${path}.`,
        };
    }
    ensureParent(path);
    const existing = readText(path);
    const prefix = existing.trim().length > 0 && !existing.endsWith('\n') ? '\n\n' : existing.trim().length > 0 ? '\n' : '';
    (0, node_fs_1.writeFileSync)(path, `${existing}${prefix}${tomlSnippet()}`, 'utf8');
    return {
        status: 'written',
        configPath: path,
        message: `Wrote Neurcode MCP server block to ${path}.`,
    };
}
function writeCursorConfig(path) {
    if (isCursorConfigured(path)) {
        return {
            status: 'already_configured',
            configPath: path,
            message: `Cursor config already contains Neurcode MCP at ${path}.`,
        };
    }
    ensureParent(path);
    let parsed = {};
    if ((0, node_fs_1.existsSync)(path)) {
        try {
            parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        }
        catch (error) {
            throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const mcpServers = parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)
        ? parsed.mcpServers
        : {};
    parsed.mcpServers = {
        ...mcpServers,
        neurcode: mcpServerEntry(),
    };
    (0, node_fs_1.writeFileSync)(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    return {
        status: 'written',
        configPath: path,
        message: `Wrote Neurcode MCP server entry to ${path}.`,
    };
}
function writeAgentSetup(input) {
    if (input.target === 'codex')
        return writeCodexConfig(codexConfigPath());
    if (input.target === 'cursor')
        return writeCursorConfig(cursorConfigPath(input.repoRoot, input.global === true));
    return {
        status: 'unsupported',
        configPath: null,
        message: input.target === 'claude'
            ? 'Use neurcode activate claude to install hard-deny hooks and MCP tools.'
            : 'Generic MCP setup is client-specific; use the emitted snippet.',
    };
}
function writeAgentInstructions(input) {
    const artifact = buildAgentInstructionArtifact(input);
    if (input.target === 'claude') {
        return {
            status: 'unsupported',
            filePath: artifact.filePath,
            message: 'Claude Code uses hard-deny hooks installed by neurcode activate claude.',
        };
    }
    if (!artifact.filePath) {
        return {
            status: 'unsupported',
            filePath: null,
            message: 'Generic MCP instruction destination could not be resolved.',
        };
    }
    if (hasNeurcodeInstructions(artifact.filePath)) {
        return {
            status: 'already_configured',
            filePath: artifact.filePath,
            message: `Neurcode agent instructions already exist in ${artifact.filePath}.`,
        };
    }
    ensureParent(artifact.filePath);
    const existing = readText(artifact.filePath);
    if (input.target === 'cursor' && existing.trim().length > 0) {
        (0, node_fs_1.writeFileSync)(artifact.filePath, `${artifact.body.trimEnd()}\n\n${existing}`, 'utf8');
    }
    else {
        const prefix = existing.trim().length === 0
            ? ''
            : existing.endsWith('\n')
                ? '\n'
                : '\n\n';
        (0, node_fs_1.writeFileSync)(artifact.filePath, `${existing}${prefix}${artifact.body}`, 'utf8');
    }
    return {
        status: 'written',
        filePath: artifact.filePath,
        message: `Wrote Neurcode agent instructions to ${artifact.filePath}.`,
    };
}
//# sourceMappingURL=agent-adapter-setup.js.map