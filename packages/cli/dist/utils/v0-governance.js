"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAUDE_GOVERNANCE_HOOKS = exports.MANIFEST_CANDIDATES = exports.CODEOWNERS_CANDIDATES = void 0;
exports.resolveRepoRoot = resolveRepoRoot;
exports.gitLsFiles = gitLsFiles;
exports.governanceConfigPath = governanceConfigPath;
exports.readRuntimeGovernanceConfig = readRuntimeGovernanceConfig;
exports.buildCurrentGovernanceProfile = buildCurrentGovernanceProfile;
exports.profilePath = profilePath;
exports.readGovernanceProfile = readGovernanceProfile;
exports.writeGovernanceProfile = writeGovernanceProfile;
exports.buildProfileFreshnessSignal = buildProfileFreshnessSignal;
exports.profileFreshnessActionForSession = profileFreshnessActionForSession;
exports.getProfileStaleness = getProfileStaleness;
exports.ensureFreshGovernanceProfile = ensureFreshGovernanceProfile;
exports.installClaudeGovernanceHooks = installClaudeGovernanceHooks;
exports.installClaudeMcpConfig = installClaudeMcpConfig;
exports.inspectClaudeActivation = inspectClaudeActivation;
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
            matcher: 'Edit|Write|MultiEdit',
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
function buildCurrentGovernanceProfile(repoRoot) {
    const paths = gitLsFiles(repoRoot);
    const codeowners = readFirstExisting(repoRoot, exports.CODEOWNERS_CANDIDATES);
    const manifest = readFirstExisting(repoRoot, exports.MANIFEST_CANDIDATES);
    const governance = readRuntimeGovernanceConfig(repoRoot);
    return (0, governance_runtime_1.buildRepoGovernanceProfile)({
        paths,
        codeownersContent: codeowners.content,
        manifestContent: manifest.content,
        repoName: (0, path_1.basename)(repoRoot),
        source: 'local',
        runtimeConfig: governance.config,
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
function entryHasNeurcodeSessionHook(entry) {
    if (!entry || typeof entry !== 'object')
        return false;
    const hooks = entry['hooks'];
    if (!Array.isArray(hooks))
        return false;
    return hooks.some((hook) => {
        if (!hook || typeof hook !== 'object')
            return false;
        const command = hook['command'];
        return typeof command === 'string' && command.includes('neurcode session-hook');
    });
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
    for (const [event, entries] of Object.entries(exports.CLAUDE_GOVERNANCE_HOOKS)) {
        const current = Array.isArray(hooks[event]) ? hooks[event] : [];
        const alreadyPresent = current.some(entryHasNeurcodeSessionHook);
        if (alreadyPresent && !options.force) {
            preserved.push(`hooks.${event}`);
            continue;
        }
        const filtered = current.filter((entry) => !entryHasNeurcodeSessionHook(entry));
        hooks[event] = [...filtered, ...entries];
        added.push(`hooks.${event}`);
    }
    if (!options.dryRun) {
        ensureDirOf(settingsPath);
        (0, fs_1.writeFileSync)(settingsPath, JSON.stringify({ ...existing, hooks }, null, 2) + '\n', 'utf8');
    }
    return { settingsPath, added, preserved };
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
    for (const key of Object.keys(servers)) {
        if (key !== 'neurcode')
            preserved.push(`mcpServers.${key}`);
    }
    if ('neurcode' in servers && !options.force) {
        preserved.push('mcpServers.neurcode');
    }
    else {
        servers.neurcode = CLAUDE_MCP_ENTRY;
        added.push('mcpServers.neurcode');
    }
    if (!options.dryRun) {
        ensureDirOf(configPath);
        (0, fs_1.writeFileSync)(configPath, JSON.stringify({ ...existing, mcpServers: servers }, null, 2) + '\n', 'utf8');
    }
    return { configPath, added, preserved };
}
function inspectClaudeActivation(repoRoot, options = {}) {
    const settingsPath = (0, path_1.join)(repoRoot, '.claude', 'settings.json');
    const eventStatus = {
        UserPromptSubmit: false,
        PreToolUse: false,
        Stop: false,
    };
    let hookError;
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
            eventStatus[event] = current.some(entryHasNeurcodeSessionHook);
        }
    }
    const configPath = (0, path_1.join)(options.homeDir || (0, os_1.homedir)(), '.claude.json');
    const mcp = parseJsonFile(configPath);
    let mcpConfigured = false;
    if (!mcp.error) {
        const servers = (mcp.data.mcpServers && typeof mcp.data.mcpServers === 'object' && !Array.isArray(mcp.data.mcpServers)
            ? mcp.data.mcpServers
            : {});
        mcpConfigured = Boolean(servers.neurcode);
    }
    return {
        hooks: {
            installed: Object.values(eventStatus).every(Boolean),
            settingsPath,
            events: eventStatus,
            error: hookError,
        },
        mcp: {
            configured: mcpConfigured,
            configPath,
            error: mcp.error,
        },
    };
}
//# sourceMappingURL=v0-governance.js.map