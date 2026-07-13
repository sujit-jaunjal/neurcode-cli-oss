"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_HOST_INSTALLATION_MANIFEST_VERSION = void 0;
exports.inspectManagedHostInstallation = inspectManagedHostInstallation;
exports.persistManagedHostInstallation = persistManagedHostInstallation;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const contracts_1 = require("@neurcode-ai/contracts");
const v0_governance_1 = require("./v0-governance");
exports.MANAGED_HOST_INSTALLATION_MANIFEST_VERSION = '1.0.0';
function digest(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
function fileDigest(path) {
    try {
        return (0, node_fs_1.existsSync)(path) ? digest((0, node_fs_1.readFileSync)(path)) : 'missing';
    }
    catch {
        return 'unreadable';
    }
}
function previousManifest(repoRoot) {
    const path = (0, node_path_1.join)(repoRoot, '.neurcode', 'host-enforcement.json');
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
        return parsed.installation || null;
    }
    catch {
        return null;
    }
}
function managedSurface(input) {
    if (input.target === 'claude') {
        const inspection = (0, v0_governance_1.inspectClaudeActivation)(input.repoRoot);
        return {
            configured: inspection.hooks.installed && !inspection.hooks.stale && inspection.mcp.configured,
            surfaceDigests: [fileDigest(inspection.hooks.settingsPath), fileDigest(inspection.mcp.configPath)],
        };
    }
    if (input.target === 'copilot') {
        const inspection = (0, v0_governance_1.inspectCopilotActivation)(input.repoRoot);
        return {
            configured: inspection.hooks.installed && !inspection.hooks.stale,
            surfaceDigests: [fileDigest(inspection.hooks.hooksPath)],
        };
    }
    const paths = [input.setup.configPath];
    if (input.target === 'codex') {
        paths.push((0, node_path_1.join)(input.repoRoot, '.codex', 'hooks.json'), (0, node_path_1.join)(input.repoRoot, '.neurcode', 'codex-hook.cjs'));
    }
    return {
        configured: input.setup.configured === true,
        surfaceDigests: paths.filter((path) => Boolean(path)).map(fileDigest),
    };
}
function inspectManagedHostInstallation(input) {
    const checkedAt = new Date().toISOString();
    const previous = previousManifest(input.repoRoot);
    if (input.target === 'generic-mcp') {
        return {
            schemaVersion: contracts_1.MANAGED_HOST_INSTALLATION_SCHEMA_VERSION,
            adapter: input.setup.adapter,
            state: 'unsupported', distribution: 'manual', manifestVersion: exports.MANAGED_HOST_INSTALLATION_MANIFEST_VERSION,
            configIntegrity: 'unverified', trustState: 'unknown', checkedAt, fingerprint: null,
            reasonCodes: ['managed_config_missing'],
        };
    }
    const surface = managedSurface(input);
    const reasons = [];
    if (!input.detected)
        reasons.push('host_not_detected');
    if (!surface.configured) {
        reasons.push(previous?.adapter === input.setup.adapter ? 'managed_config_drifted' : 'managed_config_missing');
    }
    if (input.target === 'codex') {
        if (!input.authenticated)
            reasons.push('host_auth_unverified');
        reasons.push('host_trust_required', 'host_invocation_unobserved');
    }
    else if (input.target === 'copilot') {
        reasons.push('host_invocation_unobserved');
    }
    else if (input.target === 'cursor') {
        reasons.push('host_boundary_cooperative');
    }
    else if (input.target === 'vscode') {
        reasons.push('host_boundary_observe_only');
    }
    const fingerprint = surface.configured
        ? digest(JSON.stringify({ target: input.target, adapter: input.setup.adapter, surfaces: surface.surfaceDigests }))
        : null;
    const configIntegrity = surface.configured ? 'verified'
        : previous?.adapter === input.setup.adapter ? 'drifted' : 'unverified';
    const trustState = input.target === 'codex' ? 'user_action_required'
        : input.target === 'copilot' ? 'unknown' : 'not_applicable';
    const state = !surface.configured ? (configIntegrity === 'drifted' ? 'drifted' : 'incomplete')
        : !input.detected || (input.target === 'codex' && !input.authenticated) || trustState === 'user_action_required' || trustState === 'unknown'
            ? 'attention'
            : 'healthy';
    return {
        schemaVersion: contracts_1.MANAGED_HOST_INSTALLATION_SCHEMA_VERSION,
        adapter: input.setup.adapter,
        state, distribution: 'managed', manifestVersion: exports.MANAGED_HOST_INSTALLATION_MANIFEST_VERSION,
        configIntegrity, trustState, checkedAt, fingerprint, reasonCodes: [...new Set(reasons)],
    };
}
function persistManagedHostInstallation(repoRoot, installation) {
    const path = (0, node_path_1.join)(repoRoot, '.neurcode', 'host-enforcement.json');
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    const temporary = `${path}.tmp.${process.pid}`;
    const payload = {
        schemaVersion: contracts_1.MANAGED_HOST_INSTALLATION_SCHEMA_VERSION,
        installation,
        privacy: { sourceUploaded: false, machinePathsStored: false },
    };
    (0, node_fs_1.writeFileSync)(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    (0, node_fs_1.renameSync)(temporary, path);
    return path;
}
//# sourceMappingURL=managed-host-installation.js.map