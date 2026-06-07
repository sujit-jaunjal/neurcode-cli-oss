"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAUDE_GOVERNANCE_HOOKS = exports.MANIFEST_CANDIDATES = exports.CODEOWNERS_CANDIDATES = void 0;
exports.resolveRepoRoot = resolveRepoRoot;
exports.gitLsFiles = gitLsFiles;
exports.governanceConfigPath = governanceConfigPath;
exports.readRuntimeGovernanceConfig = readRuntimeGovernanceConfig;
exports.readModuleImports = readModuleImports;
exports.buildCurrentGovernanceProfile = buildCurrentGovernanceProfile;
exports.profilePath = profilePath;
exports.readGovernanceProfile = readGovernanceProfile;
exports.writeGovernanceProfile = writeGovernanceProfile;
exports.buildProfileFreshnessSignal = buildProfileFreshnessSignal;
exports.profileFreshnessActionForSession = profileFreshnessActionForSession;
exports.getProfileStaleness = getProfileStaleness;
exports.ensureFreshGovernanceProfile = ensureFreshGovernanceProfile;
exports.parseHookEntrypoint = parseHookEntrypoint;
exports.installClaudeGovernanceHooks = installClaudeGovernanceHooks;
exports.copilotHooksPath = copilotHooksPath;
exports.installCopilotGovernanceHooks = installCopilotGovernanceHooks;
exports.installClaudeMcpConfig = installClaudeMcpConfig;
exports.inspectClaudeActivation = inspectClaudeActivation;
exports.inspectCopilotActivation = inspectCopilotActivation;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
exports.CODEOWNERS_CANDIDATES = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];
exports.MANIFEST_CANDIDATES = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml'];
const CLAUDE_MCP_ENTRY = Object.freeze({
    command: 'npx',
    args: ['-y', '@neurcode-ai/mcp-server'],
});
const CLAUDE_PRE_TOOL_MATCHER = 'Bash|Edit|Write|MultiEdit';
const COPILOT_HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'Stop'];
exports.CLAUDE_GOVERNANCE_HOOKS = {
    UserPromptSubmit: [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'neurcode session-hook start',
                },
            ],
        },
    ],
    PreToolUse: [
        {
            matcher: CLAUDE_PRE_TOOL_MATCHER,
            hooks: [
                {
                    type: 'command',
                    command: 'neurcode session-hook check',
                },
            ],
        },
    ],
    Stop: [
        {
            hooks: [
                {
                    type: 'command',
                    command: 'neurcode session-hook finish',
                },
            ],
        },
    ],
};
const CLAUDE_EVENT_SESSION_HOOK = {
    UserPromptSubmit: 'start',
    PreToolUse: 'check',
    Stop: 'finish',
};
const COPILOT_EVENT_SESSION_HOOK = {
    UserPromptSubmit: 'start',
    PreToolUse: 'check',
    Stop: 'finish',
};
function shellQuote(value) {
    return JSON.stringify(value);
}
function resolveCliEntrypoint() {
    const candidates = [
        (0, path_1.resolve)(__dirname, '..', 'index.js'),
        (0, path_1.resolve)(__dirname, '..', '..', 'dist', 'index.js'),
    ];
    return candidates.find((candidate) => (0, fs_1.existsSync)(candidate)) ?? null;
}
function sessionHookCommand(subcommand) {
    const entrypoint = resolveCliEntrypoint();
    if (entrypoint)
        return `node ${shellQuote(entrypoint)} session-hook ${subcommand}`;
    return `neurcode session-hook ${subcommand}`;
}
function claudeGovernanceHooks() {
    return {
        UserPromptSubmit: [
            {
                hooks: [
                    {
                        type: 'command',
                        command: sessionHookCommand('start'),
                    },
                ],
            },
        ],
        PreToolUse: [
            {
                matcher: CLAUDE_PRE_TOOL_MATCHER,
                hooks: [
                    {
                        type: 'command',
                        command: sessionHookCommand('check'),
                    },
                ],
            },
        ],
        Stop: [
            {
                hooks: [
                    {
                        type: 'command',
                        command: sessionHookCommand('finish'),
                    },
                ],
            },
        ],
    };
}
function copilotGovernanceHooks() {
    return {
        UserPromptSubmit: [
            {
                type: 'command',
                command: sessionHookCommand('start'),
                bash: sessionHookCommand('start'),
                timeoutSec: 30,
            },
        ],
        PreToolUse: [
            {
                type: 'command',
                command: sessionHookCommand('check'),
                bash: sessionHookCommand('check'),
                timeoutSec: 30,
            },
        ],
        Stop: [
            {
                type: 'command',
                command: sessionHookCommand('finish'),
                bash: sessionHookCommand('finish'),
                timeoutSec: 30,
            },
        ],
    };
}
function resolveRepoRoot(cwd = process.cwd()) {
    const target = (0, path_1.resolve)(cwd);
    try {
        return (0, child_process_1.execSync)('git rev-parse --show-toplevel', {
            cwd: target,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    }
    catch {
        return target;
    }
}
function gitLsFiles(cwd) {
    try {
        const out = (0, child_process_1.execSync)('git ls-files', {
            cwd,
            maxBuffer: 50 * 1024 * 1024,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return out.split('\n').map((line) => line.trim()).filter(Boolean);
    }
    catch {
        return [];
    }
}
function readFirstExisting(cwd, candidates) {
    for (const rel of candidates) {
        const path = (0, path_1.join)(cwd, rel);
        if (!(0, fs_1.existsSync)(path))
            continue;
        try {
            return { path, content: (0, fs_1.readFileSync)(path, 'utf8') };
        }
        catch {
            return { path, content: null };
        }
    }
    return { path: null, content: null };
}
function prefixCodeownersContent(content, baseDir) {
    const prefix = baseDir.replace(/\\/g, '/').replace(/\/$/, '');
    if (!prefix || prefix === '.')
        return content;
    return content.split('\n').map((rawLine) => {
        const commentIndex = rawLine.indexOf('#');
        const body = commentIndex >= 0 ? rawLine.slice(0, commentIndex) : rawLine;
        const comment = commentIndex >= 0 ? rawLine.slice(commentIndex) : '';
        const trimmed = body.trim();
        if (!trimmed)
            return rawLine;
        const parts = trimmed.split(/\s+/);
        const pattern = parts[0];
        const owners = parts.slice(1);
        if (!pattern || owners.length === 0)
            return rawLine;
        const normalizedPattern = pattern.startsWith('/') ? pattern.slice(1) : pattern;
        return `${prefix}/${normalizedPattern} ${owners.join(' ')}${comment ? ` ${comment}` : ''}`;
    }).join('\n');
}
function readCodeownersBundle(cwd, paths) {
    const chunks = [];
    let firstPath = null;
    const seen = new Set();
    for (const candidate of exports.CODEOWNERS_CANDIDATES) {
        seen.add(candidate);
        const found = readFirstExisting(cwd, [candidate]);
        if (found.content !== null) {
            firstPath ??= found.path;
            chunks.push(found.content);
        }
    }
    for (const rel of paths) {
        const normalized = rel.replace(/\\/g, '/');
        if (seen.has(normalized))
            continue;
        if (!/(^|\/)CODEOWNERS$/i.test(normalized))
            continue;
        seen.add(normalized);
        try {
            const content = (0, fs_1.readFileSync)((0, path_1.join)(cwd, normalized), 'utf8');
            firstPath ??= (0, path_1.join)(cwd, normalized);
            chunks.push(prefixCodeownersContent(content, (0, path_1.dirname)(normalized)));
        }
        catch {
            // Ignore unreadable nested CODEOWNERS files. Sensitive boundary detection
            // still provides a conservative approval gate.
        }
    }
    return {
        path: firstPath,
        content: chunks.length > 0 ? chunks.join('\n') : null,
    };
}
const EMPTY_GOVERNANCE_CONFIG = {
    approvalRequiredGlobs: [],
    sensitiveGlobs: [],
    safeSupportGlobs: [],
    ignoredGlobs: [],
    planCoherence: 'warn',
    architectureObligations: { mode: 'warn', ruleModes: {} },
};
function normalizeStringArray(value, field, errors) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        errors.push(`${field} must be an array of strings`);
        return [];
    }
    const out = [];
    for (const item of value) {
        if (typeof item !== 'string') {
            errors.push(`${field} entries must be strings`);
            continue;
        }
        const normalized = item.trim().replace(/^\.\//, '').replace(/\/+$/, '');
        if (normalized)
            out.push(normalized);
    }
    return Array.from(new Set(out)).sort();
}
function normalizePlanCoherence(value, errors) {
    if (value === undefined || value === null || value === '')
        return 'warn';
    if (value === 'off' || value === 'warn' || value === 'block')
        return value;
    errors.push('planCoherence must be one of: off, warn, block');
    return 'warn';
}
function governanceConfigPath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', 'governance.json');
}
function readRuntimeGovernanceConfig(repoRoot) {
    const path = governanceConfigPath(repoRoot);
    if (!(0, fs_1.existsSync)(path)) {
        return {
            path,
            exists: false,
            config: { ...EMPTY_GOVERNANCE_CONFIG },
        };
    }
    let parsed;
    try {
        parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
    }
    catch (error) {
        return {
            path,
            exists: true,
            config: { ...EMPTY_GOVERNANCE_CONFIG },
            error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    const errors = [];
    const config = {
        approvalRequiredGlobs: normalizeStringArray(parsed.approvalRequiredGlobs, 'approvalRequiredGlobs', errors),
        sensitiveGlobs: normalizeStringArray(parsed.sensitiveGlobs, 'sensitiveGlobs', errors),
        safeSupportGlobs: normalizeStringArray(parsed.safeSupportGlobs, 'safeSupportGlobs', errors),
        ignoredGlobs: normalizeStringArray(parsed.ignoredGlobs, 'ignoredGlobs', errors),
        planCoherence: normalizePlanCoherence(parsed.planCoherence, errors),
        architectureObligations: (0, governance_runtime_1.normalizeArchitectureObligationPolicy)(parsed.architectureObligations),
    };
    return {
        path,
        exists: true,
        config,
        error: errors.length > 0 ? errors.join('; ') : undefined,
    };
}
// Architecture-graph import extraction is deterministic local analysis. To keep
// `neurcode profile` / session start fast on large repos we cap the number of
// files scanned and only read each file's head (imports live at the top). Only
// import *specifiers* are kept; raw source is read, scanned, and discarded.
const GRAPH_SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py|pyi)$/i;
const MAX_GRAPH_FILES = 6000;
const MAX_GRAPH_FILE_BYTES = 2 * 1024 * 1024;
const MAX_GRAPH_HEAD_LINES = 400;
/**
 * Read per-file import specifiers from the local working tree. Source-free
 * output: returns only module specifier strings (e.g. "../billing/charge"),
 * never file contents. Bounded + deterministic.
 */
function readModuleImports(repoRoot, paths) {
    const sourcePaths = paths
        .filter((p) => GRAPH_SOURCE_EXT.test(p))
        .sort()
        .slice(0, MAX_GRAPH_FILES);
    const records = [];
    for (const rel of sourcePaths) {
        const abs = (0, path_1.join)(repoRoot, rel);
        let content;
        try {
            if (!(0, fs_1.existsSync)(abs))
                continue;
            const raw = (0, fs_1.readFileSync)(abs, 'utf8');
            if (raw.length > MAX_GRAPH_FILE_BYTES)
                continue;
            content = raw.split('\n').slice(0, MAX_GRAPH_HEAD_LINES).join('\n');
        }
        catch {
            continue; // unreadable / binary — skip
        }
        const specifiers = typeof governance_runtime_1.extractImportSpecifiers === 'function'
            ? (0, governance_runtime_1.extractImportSpecifiers)(rel, content)
            : [];
        if (specifiers.length > 0)
            records.push({ filePath: rel, specifiers });
    }
    return records;
}
function buildCurrentGovernanceProfile(repoRoot) {
    const paths = gitLsFiles(repoRoot);
    const codeowners = readCodeownersBundle(repoRoot, paths);
    const manifest = readFirstExisting(repoRoot, exports.MANIFEST_CANDIDATES);
    const governance = readRuntimeGovernanceConfig(repoRoot);
    const imports = readModuleImports(repoRoot, paths);
    return (0, governance_runtime_1.buildRepoGovernanceProfile)({
        paths,
        codeownersContent: codeowners.content,
        manifestContent: manifest.content,
        repoName: (0, path_1.basename)(repoRoot),
        source: 'local',
        runtimeConfig: governance.config,
        imports,
    });
}
function profilePath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', 'profile.json');
}
function readGovernanceProfile(repoRoot) {
    const path = profilePath(repoRoot);
    if (!(0, fs_1.existsSync)(path))
        return { profile: null, path };
    try {
        return { profile: JSON.parse((0, fs_1.readFileSync)(path, 'utf8')), path };
    }
    catch (error) {
        return {
            profile: null,
            path,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
function writeGovernanceProfile(repoRoot, profile) {
    const path = profilePath(repoRoot);
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
    (0, fs_1.writeFileSync)(path, JSON.stringify(profile, null, 2) + '\n', 'utf8');
    return path;
}
function topologyHash(profile) {
    const maybe = profile;
    return typeof maybe?.topology?.hash === 'string' ? maybe.topology.hash : null;
}
function buildProfileFreshnessSignal(result, action = 'none') {
    const currentTopologyHash = topologyHash(result.currentProfile) || result.currentProfile.profileHash;
    const cachedTopology = topologyHash(result.cachedProfile);
    const refreshed = 'refreshed' in result ? result.refreshed : false;
    return {
        status: result.status,
        refreshed,
        action: refreshed && action === 'none' ? 'auto_refreshed' : action,
        checkedAt: new Date().toISOString(),
        profilePath: result.profilePath,
        reasons: [...result.reasons],
        cachedProfileHash: result.cachedProfile?.profileHash,
        cachedTopologyHash: cachedTopology || undefined,
        currentProfileHash: result.currentProfile.profileHash,
        currentTopologyHash,
        trackedFileCount: result.currentProfile.topology.trackedFileCount,
    };
}
function profileFreshnessActionForSession(result, sessionProfileHash) {
    const currentProfileHash = result.currentProfile.profileHash;
    if (!sessionProfileHash || sessionProfileHash === currentProfileHash) {
        return 'none';
    }
    return 'session_restart_required';
}
function getProfileStaleness(repoRoot) {
    const currentProfile = buildCurrentGovernanceProfile(repoRoot);
    const cached = readGovernanceProfile(repoRoot);
    const reasons = [];
    if (cached.error) {
        return {
            status: 'unreadable',
            profilePath: cached.path,
            cachedProfile: null,
            currentProfile,
            reasons: [`profile could not be parsed: ${cached.error}`],
        };
    }
    if (!cached.profile) {
        return {
            status: 'missing',
            profilePath: cached.path,
            cachedProfile: null,
            currentProfile,
            reasons: ['profile is missing'],
        };
    }
    const cachedTopology = topologyHash(cached.profile);
    const currentTopology = topologyHash(currentProfile);
    if (!cachedTopology || !currentTopology) {
        reasons.push('profile lacks topology fingerprint');
    }
    else if (cachedTopology !== currentTopology) {
        reasons.push('repo topology changed since profile generation');
    }
    if (cached.profile.profileHash !== currentProfile.profileHash) {
        reasons.push('profile hash differs from current repo metadata');
    }
    return {
        status: reasons.length > 0 ? 'stale' : 'fresh',
        profilePath: cached.path,
        cachedProfile: cached.profile,
        currentProfile,
        reasons,
    };
}
function ensureFreshGovernanceProfile(repoRoot, options = {}) {
    const staleness = getProfileStaleness(repoRoot);
    const shouldRefresh = options.force === true || staleness.status !== 'fresh';
    const profile = shouldRefresh
        ? staleness.currentProfile
        : staleness.cachedProfile ?? staleness.currentProfile;
    if (shouldRefresh) {
        writeGovernanceProfile(repoRoot, profile);
    }
    return {
        ...staleness,
        profile,
        refreshed: shouldRefresh,
    };
}
function ensureDirOf(path) {
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
}
function parseJsonFile(path) {
    if (!(0, fs_1.existsSync)(path))
        return { data: {} };
    const raw = (0, fs_1.readFileSync)(path, 'utf8').trim();
    if (!raw)
        return { data: {} };
    try {
        return { data: JSON.parse(raw) };
    }
    catch (error) {
        return {
            data: {},
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
function isPlainRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function expectedClaudeMcpEntry() {
    return {
        command: CLAUDE_MCP_ENTRY.command,
        args: [...CLAUDE_MCP_ENTRY.args],
    };
}
function normalizeClaudeMcpEntry(value) {
    if (!isPlainRecord(value))
        return null;
    const command = typeof value.command === 'string' ? value.command : undefined;
    const args = Array.isArray(value.args) && value.args.every((arg) => typeof arg === 'string')
        ? [...value.args]
        : undefined;
    return { command, args };
}
function claudeMcpEntryStaleReasons(value) {
    const entry = normalizeClaudeMcpEntry(value);
    const expected = expectedClaudeMcpEntry();
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
function claudeMcpEntryIsCurrent(value) {
    return claudeMcpEntryStaleReasons(value).length === 0;
}
function hookCommands(entry) {
    if (!entry || typeof entry !== 'object')
        return [];
    const directCommand = entry['command'];
    const directBash = entry['bash'];
    const direct = [
        typeof directCommand === 'string' ? directCommand : null,
        typeof directBash === 'string' ? directBash : null,
    ].filter((value) => Boolean(value));
    if (direct.length > 0)
        return direct;
    const hooks = entry['hooks'];
    if (!Array.isArray(hooks))
        return [];
    return hooks.flatMap((hook) => {
        if (!hook || typeof hook !== 'object')
            return [];
        const command = hook['command'];
        return typeof command === 'string' ? [command] : [];
    });
}
/**
 * Parse the node entrypoint path out of a pinned hook command.
 * Pinned form: `node "<entrypoint>" session-hook <sub>` (entrypoint may be quoted or bare).
 * Returns null for the legacy bare `neurcode session-hook <sub>` form (no entrypoint to verify).
 */
function parseHookEntrypoint(command) {
    const quoted = command.match(/^node\s+"([^"]+)"\s+session-hook\b/);
    if (quoted)
        return quoted[1];
    const bare = command.match(/^node\s+(\S+)\s+session-hook\b/);
    if (bare)
        return bare[1];
    return null;
}
/** First installed Neurcode session-hook command found for an event (current or stale). */
function installedSessionHookCommand(entries) {
    for (const entry of entries) {
        const match = hookCommands(entry).find(commandHasNeurcodeSessionHook);
        if (match)
            return match;
    }
    return null;
}
function commandHasNeurcodeSessionHook(command) {
    return /\bsession-hook\s+(start|check|finish|approve)\b/.test(command);
}
function entryHasAnyNeurcodeSessionHook(entry) {
    return hookCommands(entry).some(commandHasNeurcodeSessionHook);
}
function expectedSessionHookCommand(event) {
    return sessionHookCommand(CLAUDE_EVENT_SESSION_HOOK[event]);
}
function expectedCopilotSessionHookCommand(event) {
    return sessionHookCommand(COPILOT_EVENT_SESSION_HOOK[event]);
}
function entryHasCurrentNeurcodeSessionHook(entry, event) {
    const expected = expectedSessionHookCommand(event);
    if (!hookCommands(entry).some((command) => command === expected))
        return false;
    if (event !== 'PreToolUse')
        return true;
    const matcher = typeof entry['matcher'] === 'string'
        ? String(entry['matcher'])
        : '';
    return ['Bash', 'Edit', 'Write', 'MultiEdit'].every((tool) => matcher.split('|').map((part) => part.trim()).includes(tool));
}
function entryHasCurrentCopilotSessionHook(entry, event) {
    const expected = expectedCopilotSessionHookCommand(event);
    return hookCommands(entry).some((command) => command === expected);
}
function staleNeurcodeHookCommands(entries, event) {
    const expected = expectedSessionHookCommand(event);
    const stale = [];
    for (const entry of entries) {
        for (const command of hookCommands(entry).filter(commandHasNeurcodeSessionHook)) {
            if (command !== expected) {
                stale.push(command);
            }
            else if (event === 'PreToolUse' && !entryHasCurrentNeurcodeSessionHook(entry, event)) {
                stale.push(`${command} (matcher missing Bash)`);
            }
        }
    }
    return stale;
}
function staleCopilotHookCommands(entries, event) {
    const expected = expectedCopilotSessionHookCommand(event);
    const stale = [];
    for (const entry of entries) {
        for (const command of hookCommands(entry).filter(commandHasNeurcodeSessionHook)) {
            if (command !== expected)
                stale.push(command);
        }
    }
    return stale;
}
function installClaudeGovernanceHooks(repoRoot, options = {}) {
    const settingsPath = (0, path_1.join)(repoRoot, '.claude', 'settings.json');
    const parsed = parseJsonFile(settingsPath);
    if (parsed.error) {
        throw new Error(`Refusing to update ${settingsPath}: invalid JSON (${parsed.error})`);
    }
    const existing = parsed.data;
    const hooks = (existing.hooks && typeof existing.hooks === 'object' && !Array.isArray(existing.hooks)
        ? existing.hooks
        : {});
    const added = [];
    const preserved = [];
    const repaired = [];
    for (const [event, entries] of Object.entries(claudeGovernanceHooks())) {
        const hookEvent = event;
        const current = Array.isArray(hooks[event]) ? hooks[event] : [];
        const alreadyCurrent = current.some((entry) => entryHasCurrentNeurcodeSessionHook(entry, hookEvent));
        if (alreadyCurrent && !options.force) {
            preserved.push(`hooks.${event}`);
            continue;
        }
        const hadPriorNeurcodeHook = current.some((entry) => entryHasAnyNeurcodeSessionHook(entry));
        const filtered = current.filter((entry) => !entryHasAnyNeurcodeSessionHook(entry));
        hooks[event] = [...filtered, ...entries];
        if (hadPriorNeurcodeHook)
            repaired.push(`hooks.${event}`);
        else
            added.push(`hooks.${event}`);
    }
    if (!options.dryRun) {
        ensureDirOf(settingsPath);
        (0, fs_1.writeFileSync)(settingsPath, JSON.stringify({ ...existing, hooks }, null, 2) + '\n', 'utf8');
    }
    return {
        settingsPath,
        added,
        preserved,
        repaired,
        restartRequired: added.length + repaired.length > 0,
    };
}
function copilotHooksPath(repoRoot) {
    return (0, path_1.join)(repoRoot, '.github', 'hooks', 'neurcode.json');
}
function installCopilotGovernanceHooks(repoRoot, options = {}) {
    const hooksPath = copilotHooksPath(repoRoot);
    const parsed = parseJsonFile(hooksPath);
    if (parsed.error) {
        throw new Error(`Refusing to update ${hooksPath}: invalid JSON (${parsed.error})`);
    }
    const existing = parsed.data;
    const hooks = (existing.hooks && typeof existing.hooks === 'object' && !Array.isArray(existing.hooks)
        ? existing.hooks
        : {});
    const added = [];
    const preserved = [];
    const repaired = [];
    for (const [event, entries] of Object.entries(copilotGovernanceHooks())) {
        const hookEvent = event;
        const current = Array.isArray(hooks[event]) ? hooks[event] : [];
        const alreadyCurrent = current.some((entry) => entryHasCurrentCopilotSessionHook(entry, hookEvent));
        if (alreadyCurrent && !options.force) {
            preserved.push(`hooks.${event}`);
            continue;
        }
        const hadPriorNeurcodeHook = current.some((entry) => entryHasAnyNeurcodeSessionHook(entry));
        const filtered = current.filter((entry) => !entryHasAnyNeurcodeSessionHook(entry));
        hooks[event] = [...filtered, ...entries];
        if (hadPriorNeurcodeHook)
            repaired.push(`hooks.${event}`);
        else
            added.push(`hooks.${event}`);
    }
    if (!options.dryRun) {
        ensureDirOf(hooksPath);
        (0, fs_1.writeFileSync)(hooksPath, JSON.stringify({ version: 1, ...existing, hooks }, null, 2) + '\n', 'utf8');
    }
    return {
        hooksPath,
        added,
        preserved,
        repaired,
        restartRequired: added.length + repaired.length > 0,
    };
}
function installClaudeMcpConfig(options = {}) {
    const configPath = (0, path_1.join)(options.homeDir || (0, os_1.homedir)(), '.claude.json');
    const parsed = parseJsonFile(configPath);
    if (parsed.error) {
        throw new Error(`Refusing to update ${configPath}: invalid JSON (${parsed.error})`);
    }
    const existing = parsed.data;
    const servers = (existing.mcpServers && typeof existing.mcpServers === 'object' && !Array.isArray(existing.mcpServers)
        ? existing.mcpServers
        : {});
    const added = [];
    const preserved = [];
    const repaired = [];
    for (const key of Object.keys(servers)) {
        if (key !== 'neurcode')
            preserved.push(`mcpServers.${key}`);
    }
    const hasNeurcode = Object.prototype.hasOwnProperty.call(servers, 'neurcode');
    const current = hasNeurcode && claudeMcpEntryIsCurrent(servers.neurcode);
    if (hasNeurcode && current && !options.force) {
        preserved.push('mcpServers.neurcode');
    }
    else {
        servers.neurcode = expectedClaudeMcpEntry();
        if (hasNeurcode)
            repaired.push('mcpServers.neurcode');
        else
            added.push('mcpServers.neurcode');
    }
    if (!options.dryRun) {
        ensureDirOf(configPath);
        (0, fs_1.writeFileSync)(configPath, JSON.stringify({ ...existing, mcpServers: servers }, null, 2) + '\n', 'utf8');
    }
    return {
        configPath,
        added,
        preserved,
        repaired,
        restartRequired: added.length + repaired.length > 0,
    };
}
function inspectClaudeActivation(repoRoot, options = {}) {
    const settingsPath = (0, path_1.join)(repoRoot, '.claude', 'settings.json');
    const eventStatus = {
        UserPromptSubmit: false,
        PreToolUse: false,
        Stop: false,
    };
    const expectedCommands = {
        UserPromptSubmit: expectedSessionHookCommand('UserPromptSubmit'),
        PreToolUse: expectedSessionHookCommand('PreToolUse'),
        Stop: expectedSessionHookCommand('Stop'),
    };
    const staleCommands = [];
    let hookError;
    let installedCommand = null;
    const settings = parseJsonFile(settingsPath);
    if (settings.error) {
        hookError = settings.error;
    }
    else {
        const hooks = (settings.data.hooks && typeof settings.data.hooks === 'object' && !Array.isArray(settings.data.hooks)
            ? settings.data.hooks
            : {});
        for (const event of Object.keys(eventStatus)) {
            const current = Array.isArray(hooks[event]) ? hooks[event] : [];
            eventStatus[event] = current.some((entry) => entryHasCurrentNeurcodeSessionHook(entry, event));
            staleCommands.push(...staleNeurcodeHookCommands(current, event));
        }
        // PreToolUse (the write-blocking hook) is the representative installed command.
        const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
        installedCommand = installedSessionHookCommand(preToolUse);
    }
    const entrypoint = installedCommand ? parseHookEntrypoint(installedCommand) : null;
    const entrypointExists = entrypoint ? (0, fs_1.existsSync)(entrypoint) : null;
    const entrypointPortable = entrypoint ? !(0, path_1.isAbsolute)(entrypoint) : null;
    const configPath = (0, path_1.join)(options.homeDir || (0, os_1.homedir)(), '.claude.json');
    const mcp = parseJsonFile(configPath);
    let mcpConfigured = false;
    let mcpPresent = false;
    let mcpStale = false;
    let mcpEntry = null;
    let mcpStaleReasons = [];
    if (!mcp.error) {
        const servers = (mcp.data.mcpServers && typeof mcp.data.mcpServers === 'object' && !Array.isArray(mcp.data.mcpServers)
            ? mcp.data.mcpServers
            : {});
        mcpPresent = Object.prototype.hasOwnProperty.call(servers, 'neurcode');
        if (mcpPresent) {
            mcpEntry = normalizeClaudeMcpEntry(servers.neurcode);
            mcpStaleReasons = claudeMcpEntryStaleReasons(servers.neurcode);
            mcpStale = mcpStaleReasons.length > 0;
            mcpConfigured = !mcpStale;
        }
    }
    return {
        hooks: {
            installed: Object.values(eventStatus).every(Boolean) && staleCommands.length === 0,
            settingsPath,
            events: eventStatus,
            expectedCommands,
            stale: staleCommands.length > 0,
            staleCommands: Array.from(new Set(staleCommands)).sort(),
            installedCommand,
            entrypoint,
            entrypointExists,
            entrypointPortable,
            error: hookError,
        },
        mcp: {
            configured: mcpConfigured,
            present: mcpPresent,
            stale: mcpStale,
            configPath,
            entry: mcpEntry,
            expectedEntry: expectedClaudeMcpEntry(),
            staleReasons: mcpStaleReasons,
            error: mcp.error,
        },
    };
}
function inspectCopilotActivation(repoRoot) {
    const hooksPath = copilotHooksPath(repoRoot);
    const eventStatus = {
        UserPromptSubmit: false,
        PreToolUse: false,
        Stop: false,
    };
    const expectedCommands = {
        UserPromptSubmit: expectedCopilotSessionHookCommand('UserPromptSubmit'),
        PreToolUse: expectedCopilotSessionHookCommand('PreToolUse'),
        Stop: expectedCopilotSessionHookCommand('Stop'),
    };
    const staleCommands = [];
    let hookError;
    let installedCommand = null;
    const settings = parseJsonFile(hooksPath);
    if (settings.error) {
        hookError = settings.error;
    }
    else {
        const hooks = (settings.data.hooks && typeof settings.data.hooks === 'object' && !Array.isArray(settings.data.hooks)
            ? settings.data.hooks
            : {});
        for (const event of COPILOT_HOOK_EVENTS) {
            const current = Array.isArray(hooks[event]) ? hooks[event] : [];
            eventStatus[event] = current.some((entry) => entryHasCurrentCopilotSessionHook(entry, event));
            staleCommands.push(...staleCopilotHookCommands(current, event));
        }
        const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
        installedCommand = installedSessionHookCommand(preToolUse);
    }
    const entrypoint = installedCommand ? parseHookEntrypoint(installedCommand) : null;
    const entrypointExists = entrypoint ? (0, fs_1.existsSync)(entrypoint) : null;
    const entrypointPortable = entrypoint ? !(0, path_1.isAbsolute)(entrypoint) : null;
    return {
        hooks: {
            installed: Object.values(eventStatus).every(Boolean) && staleCommands.length === 0,
            hooksPath,
            events: eventStatus,
            expectedCommands,
            stale: staleCommands.length > 0,
            staleCommands: Array.from(new Set(staleCommands)).sort(),
            installedCommand,
            entrypoint,
            entrypointExists,
            entrypointPortable,
            error: hookError,
        },
    };
}
//# sourceMappingURL=v0-governance.js.map