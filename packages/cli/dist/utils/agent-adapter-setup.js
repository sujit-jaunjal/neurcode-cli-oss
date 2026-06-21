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
const v0_governance_1 = require("./v0-governance");
const mcp_server_pin_1 = require("./mcp-server-pin");
exports.AGENT_ADAPTER_SETUP_SCHEMA_VERSION = 'neurcode.agent-adapter-setup.v1';
exports.AGENT_ADAPTER_DOCTOR_SCHEMA_VERSION = 'neurcode.agent-adapter-doctor.v1';
const MCP_PACKAGE = mcp_server_pin_1.MCP_SERVER_PACKAGE;
const VSCODE_EXTENSION_ID = 'sujit-jaunjal.neurcode-governance';
function mcpServerEntry(repoRoot, global = false) {
    const baseRoot = (0, mcp_server_pin_1.pinnedMcpBaseRoot)(repoRoot, global);
    const pinned = (0, mcp_server_pin_1.ensurePinnedMcpServer)(baseRoot);
    if (!pinned.ok) {
        throw new Error(pinned.message);
    }
    return (0, mcp_server_pin_1.buildPinnedMcpServerEntry)(repoRoot, { global });
}
function jsonSnippet(repoRoot, global = false) {
    return JSON.stringify({
        mcpServers: {
            neurcode: mcpServerEntry(repoRoot, global),
        },
    }, null, 2);
}
function tomlSnippet(repoRoot) {
    const entry = mcpServerEntry(repoRoot, true);
    return [
        '[mcp_servers.neurcode]',
        `command = "${entry.command}"`,
        `args = ${JSON.stringify(entry.args)}`,
        '',
    ].join('\n');
}
function normalizeAgentSetupTarget(value) {
    const normalized = (value || 'codex').trim().toLowerCase();
    if (['claude', 'claude-code', 'claude_code'].includes(normalized))
        return 'claude';
    if (['copilot', 'github-copilot', 'github_copilot', 'copilot-hooks'].includes(normalized))
        return 'copilot';
    if (['codex', 'codex-mcp'].includes(normalized))
        return 'codex';
    if (['cursor', 'cursor-mcp'].includes(normalized))
        return 'cursor';
    if (['generic', 'generic-mcp', 'mcp', 'gemini'].includes(normalized))
        return 'generic-mcp';
    if (['vscode', 'vs-code', 'vscode-extension'].includes(normalized))
        return 'vscode';
    throw new Error(`Unsupported agent setup target "${value}". Supported: claude, copilot, codex, cursor, generic-mcp, vscode.`);
}
function adapterForSetupTarget(target) {
    if (target === 'claude')
        return 'claude-code-hooks';
    if (target === 'copilot')
        return 'copilot-hooks';
    if (target === 'codex')
        return 'codex-mcp';
    if (target === 'cursor')
        return 'cursor-mcp';
    if (target === 'vscode')
        return 'vscode-extension';
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
function vscodeExtensionsPath(repoRoot) {
    return (0, node_path_1.join)(repoRoot, '.vscode', 'extensions.json');
}
function instructionPath(target, repoRoot) {
    if (target === 'codex')
        return (0, node_path_1.join)(repoRoot, 'AGENTS.md');
    if (target === 'cursor')
        return (0, node_path_1.join)(repoRoot, '.cursor', 'rules', 'neurcode.mdc');
    if (target === 'copilot')
        return (0, node_path_1.join)(repoRoot, '.github', 'copilot-instructions.md');
    if (target === 'vscode')
        return (0, node_path_1.join)(repoRoot, '.vscode', 'neurcode-runtime.md');
    if (target === 'generic-mcp')
        return (0, node_path_1.join)(repoRoot, 'NEURCODE_AGENT.md');
    return null;
}
function instructionDestination(target) {
    if (target === 'codex')
        return 'AGENTS.md';
    if (target === 'cursor')
        return '.cursor/rules/neurcode.mdc';
    if (target === 'copilot')
        return '.github/copilot-instructions.md';
    if (target === 'vscode')
        return '.vscode/neurcode-runtime.md';
    if (target === 'generic-mcp')
        return 'NEURCODE_AGENT.md';
    return 'Claude Code hook contract';
}
function instructionHeader(target) {
    if (target !== 'cursor')
        return [];
    return [
        '---',
        'description: Neurcode in-flow governance runtime for Cursor (cooperative MCP enforcement)',
        'globs:',
        '  - "**/*"',
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
    if (input.target === 'vscode') {
        return [
            '<!-- neurcode-agent-runtime-v1 -->',
            '# Neurcode Runtime Companion',
            '',
            'This workspace uses the Neurcode VS Code companion as the live operator surface for governed AI coding sessions.',
            '',
            'Use this workflow for serious agentic work:',
            '',
            '1. Start the local Neurcode daemon from the command palette or CLI.',
            '2. Run "Neurcode: Start Governed AI Session" and choose the real agent host: Claude Code, Codex, Cursor, or Generic MCP.',
            '3. Treat the VS Code extension as observe-only. It shows live session state, active plan, blocked paths, guard posture, exact-path approvals, repo profile drift, and replayable evidence.',
            '4. For Codex, Cursor, or another MCP-capable agent, keep the MCP/CLI runtime calls active before writes. VS Code visibility is not a substitute for pre-write checks.',
            '5. If a protected path is blocked, approve the exact suggested path from the Runtime Companion or Control Plane. Do not broaden approval scope unless the human explicitly asks.',
            '6. Finish the governed session so source-free replay evidence is written.',
            '',
            'Never send source code, diffs, patches, file contents, or before/after text to Neurcode runtime payloads. Runtime evidence is paths, owners, decisions, plan metadata, guard posture, and integrity hashes.',
            '',
        ].join('\n');
    }
    if (input.target === 'copilot') {
        return [
            '<!-- neurcode-agent-runtime-v1 -->',
            '# Neurcode Runtime Governance for GitHub Copilot',
            '',
            'This repository uses Neurcode Copilot hooks for hook-backed runtime checks where Copilot Agent Mode exposes lifecycle hooks.',
            '',
            'Follow this contract during coding tasks:',
            '',
            '1. Work inside a governed repository where `.github/hooks/neurcode.json` was written by `neurcode activate copilot` or `neurcode agent setup copilot --write`.',
            '2. Keep UserPromptSubmit, PreToolUse, and Stop hooks enabled in the Copilot host.',
            '3. Treat a Neurcode deny as authoritative. Do not create, edit, or overwrite the denied file.',
            '4. If a protected boundary must change, ask the human operator to approve only the exact suggested path in the Runtime Control Plane.',
            '5. Do not broaden approval to a directory or glob unless the human explicitly changes the task scope.',
            '6. Finish the governed session so source-free runtime evidence and replay records are written.',
            '',
            'Never send source code, diffs, patches, file contents, or before/after text to Neurcode runtime payloads. Runtime evidence is paths, owners, decisions, plan metadata, guard posture, and integrity hashes.',
            '',
        ].join('\n');
    }
    if (input.target === 'cursor') {
        const adapter = cliAdapterName(input.adapter);
        return [
            ...instructionHeader('cursor'),
            '<!-- neurcode-agent-runtime-v1 -->',
            '# Neurcode (Cursor supervised governance)',
            '',
            'This repository uses Neurcode as the in-flow governance runtime. Cursor reaches the',
            'local CLI engine **cooperatively through MCP** — there is no host-level hard pre-write deny.',
            '',
            '## Mandatory contract',
            '',
            '1. Start or join a governed session before implementation.',
            '2. Handshake: `neurcode_agent_session_handshake`.',
            '3. Capture plan: `neurcode_agent_plan_capture` before edits.',
            '4. **Before EVERY proposed file write**, call `neurcode_agent_edit_before` with the repo-relative `filePath`.',
            '5. If decision is `deny`, **do not write the file**. Surface `approvalContext` to the human.',
            '6. Exact-path approval only: `neurcode_session_approve` with the suggested path — never broaden to a directory.',
            '7. Plan changes: `neurcode_agent_plan_amend` before editing outside the accepted plan.',
            '8. Finish: `neurcode_agent_session_finish` for replayable evidence.',
            '',
            'Bypassing MCP and writing anyway is detected by the local guard supervisor as `unverified_write`.',
            'Finish sessions with `neurcode agent guard finish --fail-on-unverified` so automation fails on bypass.',
            '',
            'Never send source code, diffs, patches, or file contents in Neurcode payloads.',
            '',
            'CLI fallback:',
            '',
            '```bash',
            `neurcode agent check <repo-relative-path> --adapter ${adapter} --session-id <session-id>`,
            `neurcode agent approve <exact-path> --adapter ${adapter} --session-id <session-id> --reason "<reason>"`,
            'neurcode agent guard status --fail-on-unverified',
            `neurcode agent guard finish --session-id <session-id> --fail-on-unverified`,
            '```',
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
        case 'copilot':
            return {
                target: input.target,
                adapter,
                destination: '.github/hooks/neurcode.json',
                configPath: (0, v0_governance_1.copilotHooksPath)(input.repoRoot),
                format: 'json',
                body: JSON.stringify({
                    version: 1,
                    hooks: {
                        UserPromptSubmit: [{ type: 'command', command: 'neurcode session-hook start' }],
                        PreToolUse: [{ type: 'command', command: 'neurcode session-hook check --trusted-adapter copilot-hooks --trusted-timing before_write' }],
                        Stop: [{ type: 'command', command: 'neurcode session-hook finish' }],
                    },
                }, null, 2),
                instruction: 'GitHub Copilot Agent Mode is hook-backed where host lifecycle hooks are available. Use neurcode activate copilot or --write to install local checks.',
            };
        case 'codex':
            return {
                target: input.target,
                adapter,
                destination: '~/.codex/config.toml',
                configPath: codexConfigPath(),
                format: 'toml',
                body: tomlSnippet(input.repoRoot),
                instruction: 'Append this block to your Codex config so Codex can call Neurcode MCP tools before edits.',
            };
        case 'cursor':
            return {
                target: input.target,
                adapter,
                destination: input.global ? '~/.cursor/mcp.json' : '.cursor/mcp.json',
                configPath: cursorConfigPath(input.repoRoot, input.global === true),
                format: 'json',
                body: jsonSnippet(input.repoRoot, input.global === true),
                instruction: 'Merge this mcpServers.neurcode entry into Cursor MCP config.',
            };
        case 'generic-mcp':
            return {
                target: input.target,
                adapter,
                destination: 'your MCP client config',
                configPath: null,
                format: 'json',
                body: jsonSnippet(input.repoRoot),
                instruction: 'Register this MCP server in any agent host that supports stdio MCP tools.',
            };
        case 'vscode':
            return {
                target: input.target,
                adapter,
                destination: '.vscode/extensions.json',
                configPath: vscodeExtensionsPath(input.repoRoot),
                format: 'json',
                body: JSON.stringify({ recommendations: [VSCODE_EXTENSION_ID] }, null, 2),
                instruction: 'Add the Neurcode Runtime Companion extension recommendation for this workspace.',
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
            : input.target === 'vscode'
                ? 'Add this workspace runtime note so VS Code users understand the companion guarantee and the agent handoff.'
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
function isCursorConfigured(path, repoRoot, global) {
    if (!(0, node_fs_1.existsSync)(path))
        return false;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        const entry = parsed.mcpServers?.neurcode;
        if (!entry)
            return false;
        if ((0, mcp_server_pin_1.isLegacyNpxMcpEntry)(entry) || (0, mcp_server_pin_1.isRelativeNodeMcpEntry)(entry))
            return false;
        const expected = (0, mcp_server_pin_1.buildPinnedMcpServerEntry)(repoRoot, { global });
        return (0, mcp_server_pin_1.mcpServerEntryIsCurrent)(entry, expected);
    }
    catch {
        return readText(path).includes(MCP_PACKAGE);
    }
}
function isVscodeRecommended(path) {
    if (!(0, node_fs_1.existsSync)(path))
        return false;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        return Array.isArray(parsed.recommendations)
            && parsed.recommendations.some((item) => item === VSCODE_EXTENSION_ID);
    }
    catch {
        return readText(path).includes(VSCODE_EXTENSION_ID);
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
    if (input.target === 'copilot') {
        const hooks = (0, v0_governance_1.inspectCopilotActivation)(input.repoRoot).hooks;
        return {
            target: input.target,
            adapter,
            supported: true,
            configured: hooks.installed,
            configPath: hooks.hooksPath,
            message: hooks.installed
                ? `Neurcode Copilot hooks are installed in ${hooks.hooksPath}.`
                : hooks.error
                    ? `Could not inspect ${hooks.hooksPath}: ${hooks.error}.`
                    : `Neurcode Copilot hooks are missing or stale in ${hooks.hooksPath}.`,
        };
    }
    if (input.target === 'vscode') {
        const configPath = vscodeExtensionsPath(input.repoRoot);
        const configured = isVscodeRecommended(configPath);
        return {
            target: input.target,
            adapter,
            supported: true,
            configured,
            configPath,
            message: configured
                ? `Neurcode VS Code extension is recommended in ${configPath}.`
                : `Neurcode VS Code extension recommendation is missing from ${configPath}.`,
        };
    }
    const snippet = buildAgentSetupSnippet(input);
    const configPath = snippet.configPath;
    const configured = input.target === 'codex'
        ? Boolean(configPath && isCodexConfigured(configPath))
        : Boolean(configPath && isCursorConfigured(configPath, input.repoRoot, input.global === true));
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
function writeCodexConfig(path, repoRoot) {
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
    (0, node_fs_1.writeFileSync)(path, `${existing}${prefix}${tomlSnippet(repoRoot)}`, 'utf8');
    return {
        status: 'written',
        configPath: path,
        message: `Wrote Neurcode MCP server block to ${path}.`,
    };
}
function writeCursorConfig(path, repoRoot, global) {
    const expectedEntry = mcpServerEntry(repoRoot, global);
    if (isCursorConfigured(path, repoRoot, global)) {
        return {
            status: 'already_configured',
            configPath: path,
            message: `Cursor config already contains current Neurcode MCP at ${path}.`,
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
    const hadEntry = Object.prototype.hasOwnProperty.call(mcpServers, 'neurcode');
    parsed.mcpServers = {
        ...mcpServers,
        neurcode: expectedEntry,
    };
    (0, node_fs_1.writeFileSync)(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    return {
        status: 'written',
        configPath: path,
        message: hadEntry
            ? `Repaired stale Neurcode MCP entry in ${path} (pinned ${mcp_server_pin_1.MIN_MCP_SERVER_VERSION} via node).`
            : `Wrote Neurcode MCP server entry to ${path} (pinned ${mcp_server_pin_1.MIN_MCP_SERVER_VERSION} via node).`,
    };
}
function writeVscodeRecommendations(path) {
    if (isVscodeRecommended(path)) {
        return {
            status: 'already_configured',
            configPath: path,
            message: `VS Code extension recommendations already include ${VSCODE_EXTENSION_ID} at ${path}.`,
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
    const recommendations = Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter((item) => typeof item === 'string')
        : [];
    parsed.recommendations = Array.from(new Set([...recommendations, VSCODE_EXTENSION_ID]));
    (0, node_fs_1.writeFileSync)(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    return {
        status: 'written',
        configPath: path,
        message: `Added ${VSCODE_EXTENSION_ID} to VS Code extension recommendations at ${path}.`,
    };
}
function writeAgentSetup(input) {
    if (input.target === 'copilot') {
        const result = (0, v0_governance_1.installCopilotGovernanceHooks)(input.repoRoot);
        return {
            status: result.added.length + result.repaired.length > 0 ? 'written' : 'already_configured',
            configPath: result.hooksPath,
            message: result.added.length + result.repaired.length > 0
                ? `Installed Neurcode Copilot hooks in ${result.hooksPath}.`
                : `Copilot hooks already contain current Neurcode runtime entries at ${result.hooksPath}.`,
        };
    }
    if (input.target === 'codex')
        return writeCodexConfig(codexConfigPath(), input.repoRoot);
    if (input.target === 'cursor') {
        return writeCursorConfig(cursorConfigPath(input.repoRoot, input.global === true), input.repoRoot, input.global === true);
    }
    if (input.target === 'vscode')
        return writeVscodeRecommendations(vscodeExtensionsPath(input.repoRoot));
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