"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_API_URL = void 0;
exports.getOrCreateLocalGovernanceSigningMaterial = getOrCreateLocalGovernanceSigningMaterial;
exports.loadConfig = loadConfig;
exports.getApiKey = getApiKey;
exports.requireApiKey = requireApiKey;
exports.saveGlobalAuth = saveGlobalAuth;
exports.getGlobalAuthPath = getGlobalAuthPath;
exports.deleteGlobalAuth = deleteGlobalAuth;
exports.deleteApiKeyFromAllSources = deleteApiKeyFromAllSources;
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const state_1 = require("./utils/state");
const project_root_1 = require("./utils/project-root");
const runtime_connection_1 = require("./utils/runtime-connection");
/**
 * Default production API URL
 * Priority: NEURCODE_API_URL env var > Production URL
 * Users don't need to configure this - it's automatic
 */
exports.DEFAULT_API_URL = process.env.NEURCODE_API_URL || 'https://api.neurcode.com';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
function parseEnvBoolean(value) {
    if (!value)
        return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
function isLoopbackApiUrl(apiUrl) {
    if (!apiUrl)
        return false;
    try {
        const url = new URL(apiUrl);
        return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
    }
    catch {
        return false;
    }
}
function shouldUsePersistedApiUrl(apiUrl) {
    if (!apiUrl)
        return false;
    if (!isLoopbackApiUrl(apiUrl))
        return true;
    if (process.env.NEURCODE_API_URL)
        return true;
    return parseEnvBoolean(process.env.NEURCODE_ALLOW_LOOPBACK_API_URL);
}
function safeReadJson(path) {
    try {
        if (!(0, fs_1.existsSync)(path))
            return null;
        const content = (0, fs_1.readFileSync)(path, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
function getHomeDir() {
    return process.env.HOME || process.env.USERPROFILE || '';
}
function getCanonicalGlobalAuthPath() {
    const homeDir = getHomeDir();
    if (!homeDir) {
        throw new Error('Cannot determine home directory');
    }
    return (0, path_1.join)(homeDir, '.neurcoderc');
}
function readGlobalAuthFile() {
    const homeDir = getHomeDir();
    if (!homeDir)
        return null;
    const canonical = (0, path_1.join)(homeDir, '.neurcoderc');
    const legacy = (0, path_1.join)(homeDir, 'neurcode.config.json');
    const canonicalData = safeReadJson(canonical);
    if (canonicalData) {
        return { path: canonical, data: canonicalData };
    }
    const legacyData = safeReadJson(legacy);
    if (legacyData) {
        return { path: legacy, data: legacyData };
    }
    return null;
}
function writeGlobalAuthFile(data) {
    const canonicalPath = getCanonicalGlobalAuthPath();
    (0, fs_1.writeFileSync)(canonicalPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    // Best-effort permission hardening on POSIX. (On Windows chmod is a no-op or may throw.)
    try {
        (0, fs_1.chmodSync)(canonicalPath, 0o600);
    }
    catch {
        // Ignore
    }
}
/**
 * Resolve a local governance signing key from ~/.neurcoderc.
 * If authenticated and no key exists, auto-provision one for smoother
 * login-first onboarding in orgs that require signed AI logs.
 */
function getOrCreateLocalGovernanceSigningMaterial(options) {
    const autoProvision = options?.autoProvision !== false;
    const global = readGlobalAuthFile();
    if (!global)
        return null;
    const cfg = global.data || {};
    const persistedKey = typeof cfg.governanceSigningKey === 'string'
        ? cfg.governanceSigningKey.trim()
        : '';
    let persistedKeyId = typeof cfg.governanceSigningKeyId === 'string'
        ? cfg.governanceSigningKeyId.trim()
        : '';
    if (persistedKey) {
        if (!persistedKeyId) {
            persistedKeyId = `local-${Date.now().toString(36)}`;
            cfg.governanceSigningKeyId = persistedKeyId;
            writeGlobalAuthFile(cfg);
        }
        return {
            signingKey: persistedKey,
            signingKeyId: persistedKeyId,
            source: 'persisted',
        };
    }
    if (!autoProvision)
        return null;
    const hasApiAuthMaterial = Boolean((cfg.apiKey || '').trim())
        || Object.keys(cfg.apiKeysByOrg || {}).length > 0;
    if (!hasApiAuthMaterial)
        return null;
    const signingKey = (0, crypto_1.randomBytes)(32).toString('hex');
    const signingKeyId = `local-${Date.now().toString(36)}`;
    cfg.governanceSigningKey = signingKey;
    cfg.governanceSigningKeyId = signingKeyId;
    writeGlobalAuthFile(cfg);
    return {
        signingKey,
        signingKeyId,
        source: 'generated',
    };
}
function pickApiKeyFromKeyring(globalCfg, desiredOrgId) {
    const keyring = globalCfg.apiKeysByOrg || {};
    if (desiredOrgId) {
        if (keyring[desiredOrgId])
            return keyring[desiredOrgId];
        // If config only has a legacy apiKey but also a defaultOrgId, allow it as a fallback.
        if (globalCfg.apiKey && globalCfg.defaultOrgId === desiredOrgId)
            return globalCfg.apiKey;
        // No key saved for this org
        return undefined;
    }
    // No project org: use defaultOrgId if set
    if (globalCfg.defaultOrgId && keyring[globalCfg.defaultOrgId]) {
        return keyring[globalCfg.defaultOrgId];
    }
    // Legacy single key
    if (globalCfg.apiKey)
        return globalCfg.apiKey;
    // Any saved org key (stable order: first key)
    const firstOrgId = Object.keys(keyring)[0];
    if (firstOrgId)
        return keyring[firstOrgId];
    return undefined;
}
function loadConfig() {
    const config = {};
    // Priority 1: Environment variables - Only for API URL (not API keys)
    // API keys are managed via 'neurcode login' and stored in ~/.neurcoderc
    if (process.env.NEURCODE_API_URL) {
        config.apiUrl = process.env.NEURCODE_API_URL;
    }
    // Note: NEURCODE_API_KEY is intentionally NOT checked here
    // Use 'neurcode login' to authenticate instead
    if (process.env.NEURCODE_PROJECT_ID) {
        config.projectId = process.env.NEURCODE_PROJECT_ID;
    }
    if (process.env.NEURCODE_ORG_ID) {
        config.orgId = process.env.NEURCODE_ORG_ID;
    }
    // Priority 2: Project-local state file (.neurcode/config.json)
    // Used for project binding (orgId + projectId). We also use orgId to select an org-scoped API key.
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const neurcodeDir = (0, path_1.join)(projectRoot, '.neurcode');
    const neurcodeConfigPath = (0, path_1.join)(neurcodeDir, 'config.json');
    let stateOrgId = null;
    if ((0, fs_1.existsSync)(neurcodeConfigPath)) {
        try {
            const fileContent = (0, fs_1.readFileSync)(neurcodeConfigPath, 'utf-8');
            const fileConfig = JSON.parse(fileContent);
            // Load projectId from .neurcode/config.json (new format)
            if (!config.projectId && fileConfig.projectId) {
                config.projectId = fileConfig.projectId;
            }
            if (typeof fileConfig.orgId === 'string' && fileConfig.orgId.trim()) {
                stateOrgId = fileConfig.orgId.trim();
                if (!config.orgId) {
                    config.orgId = fileConfig.orgId.trim();
                }
            }
        }
        catch (error) {
            // Ignore parse errors, continue to legacy config
        }
    }
    // Priority 2b: Runtime dashboard connection (.neurcode/connection.json).
    // This is written by `neurcode activate claude --connect ...`; unlike global
    // auth, it is repository-local and safe to use for explicit loopback/dev API URLs.
    const runtimeConnection = (0, runtime_connection_1.loadRuntimeConnection)(projectRoot);
    if (runtimeConnection) {
        if (!config.apiUrl && runtimeConnection.apiUrl) {
            config.apiUrl = runtimeConnection.apiUrl.trim().replace(/\/$/, '');
        }
        if (!config.orgId && runtimeConnection.organizationId) {
            config.orgId = runtimeConnection.organizationId;
        }
        if (!stateOrgId && runtimeConnection.organizationId) {
            stateOrgId = runtimeConnection.organizationId;
        }
        if (!config.projectId && runtimeConnection.projectId) {
            config.projectId = runtimeConnection.projectId;
        }
    }
    // Priority 3: Legacy local config file (neurcode.config.json) - for backwards compatibility
    // IMPORTANT: apiKey here is treated as a fallback only; the global keyring is authoritative for auth.
    const localConfigPath = (0, path_1.join)(projectRoot, 'neurcode.config.json');
    const localFileConfig = safeReadJson(localConfigPath);
    if (localFileConfig) {
        // Local config can override apiUrl (enterprise/on-prem), but should not override global auth
        if (!config.apiUrl && localFileConfig.apiUrl) {
            config.apiUrl = localFileConfig.apiUrl;
        }
        if (!config.projectId && localFileConfig.projectId) {
            config.projectId = localFileConfig.projectId;
        }
    }
    // Priority 4: Global auth config (~/.neurcoderc or legacy home neurcode.config.json)
    const global = readGlobalAuthFile();
    if (global) {
        if (!config.apiUrl && shouldUsePersistedApiUrl(global.data.apiUrl)) {
            config.apiUrl = global.data.apiUrl;
        }
        // Prefer org-scoped keys in the keyring when we are in a linked directory.
        if (!config.apiKey) {
            config.apiKey = pickApiKeyFromKeyring(global.data, stateOrgId);
        }
    }
    // Priority 5: Fallback apiKey from local legacy neurcode.config.json (discouraged)
    if ((0, fs_1.existsSync)(localConfigPath)) {
        try {
            if (!config.apiKey && localFileConfig?.apiKey) {
                config.apiKey = localFileConfig.apiKey;
            }
        }
        catch (error) {
            // Ignore parse errors
        }
    }
    // Set default API URL if not specified
    // Priority: Env Var (for devs) > Config JSON (for enterprise) > Default (for everyone)
    if (!config.apiUrl) {
        config.apiUrl = exports.DEFAULT_API_URL;
    }
    return config;
}
/**
 * Get API key with helpful error message if not found
 */
function getApiKey(orgId) {
    // If orgId is explicitly provided, only return a key that is saved for that org.
    // This avoids accidentally using a key for the wrong organization.
    if (orgId) {
        const global = readGlobalAuthFile();
        if (!global)
            return null;
        const cfg = global.data;
        if (cfg.apiKeysByOrg && cfg.apiKeysByOrg[orgId])
            return cfg.apiKeysByOrg[orgId];
        if (cfg.apiKey && cfg.defaultOrgId === orgId)
            return cfg.apiKey;
        return null;
    }
    const config = loadConfig();
    return config.apiKey || null;
}
/**
 * Require API key - throws helpful error if not found
 */
function requireApiKey(orgId) {
    const desiredOrgId = orgId || (0, state_1.getOrgId)();
    // Prefer strict org-scoped key lookup when we know the target org.
    const orgScopedKey = desiredOrgId ? getApiKey(desiredOrgId) : null;
    const fallbackKey = !orgScopedKey ? getApiKey() : null;
    const apiKey = orgScopedKey || fallbackKey;
    if (!apiKey) {
        console.error('\nNo Neurcode runtime connection found.');
        console.log('\nTo connect this machine, run:');
        console.log('   neurcode login');
        if (desiredOrgId) {
            console.log(`\nThis repository is bound to workspace: ${desiredOrgId}`);
            console.log('Run login from this directory to connect the matching workspace runtime.');
        }
        console.log('\nThis opens browser approval and stores the credential in the local Neurcode keyring.\n');
        process.exit(1);
    }
    return apiKey;
}
/**
 * Save API key to global config file (~/.neurcoderc)
 * This is for user authentication, separate from project config
 */
function saveGlobalAuth(apiKey, apiUrl, organizationId) {
    const existing = readGlobalAuthFile();
    const cfg = existing?.data || {};
    cfg.version = 2;
    if (apiUrl) {
        const normalizedApiUrl = apiUrl.trim().replace(/\/$/, '');
        if (shouldUsePersistedApiUrl(normalizedApiUrl)) {
            cfg.apiUrl = normalizedApiUrl;
        }
        else {
            cfg.apiUrl = 'https://api.neurcode.com';
        }
    }
    // Keep a legacy top-level apiKey for older CLI versions (and as a last-resort fallback).
    cfg.apiKey = apiKey;
    if (organizationId) {
        cfg.apiKeysByOrg = cfg.apiKeysByOrg || {};
        cfg.apiKeysByOrg[organizationId] = apiKey;
        cfg.defaultOrgId = organizationId;
    }
    writeGlobalAuthFile(cfg);
}
/**
 * Get global auth config path
 */
function getGlobalAuthPath() {
    return getCanonicalGlobalAuthPath();
}
/**
 * Delete global auth config (logout)
 */
function deleteGlobalAuth() {
    // Delete canonical auth file completely (simplest + safest)
    const globalConfigPath = getGlobalAuthPath();
    if ((0, fs_1.existsSync)(globalConfigPath)) {
        (0, fs_1.unlinkSync)(globalConfigPath);
    }
}
/**
 * Delete API key from all file-based config sources (logout)
 * This ensures logout works even if API key exists in multiple locations
 */
function deleteApiKeyFromAllSources(options) {
    const result = {
        removedFromGlobal: false,
        removedFromLocal: false,
        removedOrgIds: [],
    };
    // Remove from global config
    try {
        const homeDir = getHomeDir();
        if (homeDir) {
            const canonicalPath = (0, path_1.join)(homeDir, '.neurcoderc');
            const legacyHomePath = (0, path_1.join)(homeDir, 'neurcode.config.json');
            const orgId = options?.orgId;
            const removeAll = options?.all === true || !orgId;
            if (removeAll) {
                const removedOrgIds = [];
                const canonicalBefore = safeReadJson(canonicalPath);
                const legacyBefore = safeReadJson(legacyHomePath);
                if (canonicalBefore?.apiKeysByOrg)
                    removedOrgIds.push(...Object.keys(canonicalBefore.apiKeysByOrg));
                if (legacyBefore?.apiKeysByOrg)
                    removedOrgIds.push(...Object.keys(legacyBefore.apiKeysByOrg));
                const hadAnyAuth = !!canonicalBefore?.apiKey ||
                    (canonicalBefore?.apiKeysByOrg && Object.keys(canonicalBefore.apiKeysByOrg).length > 0) ||
                    !!legacyBefore?.apiKey ||
                    (legacyBefore?.apiKeysByOrg && Object.keys(legacyBefore.apiKeysByOrg).length > 0) ||
                    (0, fs_1.existsSync)(canonicalPath) ||
                    (0, fs_1.existsSync)(legacyHomePath);
                // Canonical file is dedicated to auth; delete it entirely.
                if ((0, fs_1.existsSync)(canonicalPath)) {
                    (0, fs_1.unlinkSync)(canonicalPath);
                }
                // Legacy home file may contain other config; strip auth fields.
                if ((0, fs_1.existsSync)(legacyHomePath)) {
                    const legacyObj = safeReadJson(legacyHomePath);
                    if (!legacyObj) {
                        // Corrupt legacy file: safest is to delete it.
                        (0, fs_1.unlinkSync)(legacyHomePath);
                    }
                    else {
                        delete legacyObj.apiKey;
                        delete legacyObj.apiKeysByOrg;
                        delete legacyObj.defaultOrgId;
                        delete legacyObj.apiUrl;
                        const remainingKeys = Object.keys(legacyObj).filter(k => legacyObj[k] !== undefined && legacyObj[k] !== null);
                        if (remainingKeys.length === 0) {
                            (0, fs_1.unlinkSync)(legacyHomePath);
                        }
                        else {
                            (0, fs_1.writeFileSync)(legacyHomePath, JSON.stringify(legacyObj, null, 2) + '\n', 'utf-8');
                            try {
                                (0, fs_1.chmodSync)(legacyHomePath, 0o600);
                            }
                            catch {
                                // ignore
                            }
                        }
                    }
                }
                result.removedOrgIds = Array.from(new Set(removedOrgIds));
                result.removedFromGlobal = hadAnyAuth;
            }
            else {
                // Remove only one org key from keyring (canonical auth file)
                const global = readGlobalAuthFile();
                if (global) {
                    const cfg = global.data || {};
                    if (cfg.apiKeysByOrg && cfg.apiKeysByOrg[orgId]) {
                        delete cfg.apiKeysByOrg[orgId];
                        result.removedOrgIds = [orgId];
                        result.removedFromGlobal = true;
                        if (cfg.defaultOrgId === orgId) {
                            const nextDefault = Object.keys(cfg.apiKeysByOrg)[0];
                            cfg.defaultOrgId = nextDefault || undefined;
                            // Keep top-level apiKey pointing at the "default" if we have one; otherwise clear it.
                            cfg.apiKey = nextDefault ? cfg.apiKeysByOrg[nextDefault] : undefined;
                        }
                        // If keyring is now empty, remove it
                        if (cfg.apiKeysByOrg && Object.keys(cfg.apiKeysByOrg).length === 0) {
                            delete cfg.apiKeysByOrg;
                        }
                        writeGlobalAuthFile(cfg);
                    }
                }
            }
        }
    }
    catch (error) {
        // Ignore errors, continue to local config
    }
    // Remove from local config (neurcode.config.json)
    try {
        // Only wipe local legacy apiKey on full logout.
        // Local config is discouraged for auth, but it may still exist in some setups.
        if (options?.all !== true && options?.orgId) {
            return result;
        }
        const localConfigPath = (0, path_1.join)((0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd()), 'neurcode.config.json');
        if ((0, fs_1.existsSync)(localConfigPath)) {
            let config = {};
            try {
                const fileContent = (0, fs_1.readFileSync)(localConfigPath, 'utf-8');
                config = JSON.parse(fileContent);
            }
            catch (error) {
                // If parse fails, skip
            }
            if (config.apiKey) {
                delete config.apiKey;
                result.removedFromLocal = true;
                // Write back config without API key (keep projectId and other fields)
                (0, fs_1.writeFileSync)(localConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
            }
        }
    }
    catch (error) {
        // Ignore errors
    }
    return result;
}
//# sourceMappingURL=config.js.map