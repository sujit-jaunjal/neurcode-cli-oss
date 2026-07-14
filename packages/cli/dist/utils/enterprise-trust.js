"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectLocalEnterpriseTrust = inspectLocalEnterpriseTrust;
exports.submitEnterprisePosture = submitEnterprisePosture;
exports.reportEnterprisePostureBestEffort = reportEnterprisePostureBestEffort;
exports.assertEnterpriseSessionAdmission = assertEnterpriseSessionAdmission;
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const contracts_1 = require("@neurcode-ai/contracts");
const config_1 = require("../config");
const agent_adapter_setup_1 = require("./agent-adapter-setup");
const activation_telemetry_1 = require("./activation-telemetry");
const runtime_evidence_1 = require("./runtime-evidence");
const runtime_connection_1 = require("./runtime-connection");
const v0_governance_1 = require("./v0-governance");
const HOST_FROM_ADAPTER = {
    'claude-code-hooks': 'claude', 'codex-hooks': 'codex', 'codex-mcp': 'codex',
    'copilot-hooks': 'copilot', 'cursor-mcp': 'cursor', 'vscode-extension': 'vscode',
    'github-action': 'action',
};
function cliPackage() {
    try {
        return JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '..', '..', 'package.json'), 'utf8'));
    }
    catch {
        return { version: 'unknown' };
    }
}
function dependencyVersion(name, fallback) {
    const value = cliPackage().dependencies?.[name] || fallback;
    const match = /(\d+\.\d+\.\d+)/.exec(value);
    return match?.[1] || fallback;
}
function trustStatePath(repoRoot) { return (0, node_path_1.join)(repoRoot, '.neurcode', 'trust-state.json'); }
function readJson(path) {
    try {
        return (0, node_fs_1.existsSync)(path) ? JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8')) : null;
    }
    catch {
        return null;
    }
}
function writeTrustState(repoRoot, value) {
    const path = trustStatePath(repoRoot);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    const temporary = `${path}.tmp.${process.pid}`;
    (0, node_fs_1.writeFileSync)(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    (0, node_fs_1.renameSync)(temporary, path);
    try {
        (0, node_fs_1.chmodSync)(path, 0o600);
    }
    catch { /* best effort */ }
}
function branchHash(repoRoot) {
    try {
        const branch = (0, node_child_process_1.execFileSync)('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return branch ? (0, node_crypto_1.createHash)('sha256').update(branch).digest('hex') : null;
    }
    catch {
        return null;
    }
}
function lastGovernedOperation(repoRoot) {
    const latestRecord = (0, runtime_evidence_1.listRuntimeSessions)(repoRoot)[0];
    const latest = latestRecord?.session;
    if (!latest)
        return null;
    const candidates = [latest.finishedAt, latestRecord.startedAt, ...latest.events.map((event) => event.ts)].filter((value) => typeof value === 'string');
    return candidates.sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
}
function readManagedInstallation(repoRoot) {
    return readJson((0, node_path_1.join)(repoRoot, '.neurcode', 'host-enforcement.json'))?.installation || null;
}
function inferHost(repoRoot) {
    const installation = readManagedInstallation(repoRoot);
    return installation?.adapter ? HOST_FROM_ADAPTER[installation.adapter] || null : null;
}
function inspectInstallation(repoRoot, host) {
    if (host !== 'action')
        return (0, agent_adapter_setup_1.inspectHostRuntimeFacts)({ target: host, repoRoot, persist: true }).installation;
    const previous = readManagedInstallation(repoRoot);
    if (previous?.adapter === 'github-action')
        return previous;
    return {
        schemaVersion: 'neurcode.managed-host-installation.v1', adapter: 'github-action', state: 'attention',
        distribution: 'host_managed', manifestVersion: '1.0.0', configIntegrity: 'unverified',
        trustState: 'unknown', checkedAt: new Date().toISOString(), fingerprint: null,
        reasonCodes: ['host_boundary_post_change'],
    };
}
function hostRepairCommand(host) {
    return (0, contracts_1.getActivationHostCapability)(host).repairCommand.replace('<repository-path>', '.');
}
async function requestJson(url, apiKey, organizationId, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal, headers: { 'Content-Type': 'application/json', authorization: `Bearer ${apiKey}`,
                'x-org-id': organizationId, ...(init.headers || {}) } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new Error(`${body.code || `HTTP_${response.status}`}: ${body.message || body.error || 'Trust request failed'}`);
        return body;
    }
    finally {
        clearTimeout(timeout);
    }
}
function inspectLocalEnterpriseTrust(input) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(input.repoRoot || process.cwd());
    const connection = (0, runtime_connection_1.loadRuntimeConnection)(repoRoot);
    if (!connection)
        throw new Error('This repository is not connected. Run `neurcode activate <host> --connect <token>` first.');
    const host = input.host || inferHost(repoRoot);
    if (!host)
        throw new Error('The selected AI host is unknown. Re-run with `neurcode trust status --host <claude|codex|copilot|cursor|vscode|action>`.');
    const installation = inspectInstallation(repoRoot, host);
    const last = readJson(trustStatePath(repoRoot));
    return {
        generatedAt: new Date().toISOString(), repoRoot,
        repository: { id: connection.repo.id, key: connection.repo.repoKey, name: connection.repo.name, organizationId: connection.organizationId },
        installationId: (0, activation_telemetry_1.getActivationInstallId)(), host, capability: (0, contracts_1.getActivationHostCapability)(host), installation,
        lastReport: last?.reportedAt ? { reportedAt: last.reportedAt, trustState: last.trustState || 'unknown', receiptId: last.receiptId || null } : null,
        remediationCommand: hostRepairCommand(host),
        privacy: { sourceUploaded: false, absolutePathsUploaded: false, promptsUploaded: false, diffsUploaded: false, secretsUploaded: false },
    };
}
async function submitEnterprisePosture(input = {}) {
    const local = inspectLocalEnterpriseTrust(input);
    if (input.localOnly)
        return { ok: true, local, trust: null, policy: null, receipt: null, unavailableReason: 'local_only' };
    const config = (0, config_1.loadConfig)();
    const apiKey = (0, config_1.getApiKey)(local.repository.organizationId);
    if (!apiKey)
        return { ok: false, local, trust: null, policy: null, receipt: null, unavailableReason: 'No credential for the connected organization.' };
    const apiUrl = (config.apiUrl || 'https://api.neurcode.com').replace(/\/$/, '');
    try {
        const policyResponse = await requestJson(`${apiUrl}/api/v1/runtime/trust/policy`, apiKey, local.repository.organizationId);
        if (policyResponse.workspace?.isPersonal === true) {
            return { ok: true, local, trust: null, policy: { ...policyResponse.policy, workspace: { isPersonal: true } }, receipt: null, unavailableReason: null };
        }
        const pkg = cliPackage();
        const unsigned = {
            schemaVersion: contracts_1.ENTERPRISE_POSTURE_REPORT_SCHEMA_VERSION,
            organizationId: local.repository.organizationId,
            repositoryId: local.repository.id,
            repositoryKey: local.repository.key,
            installationId: local.installationId,
            host: local.host,
            adapter: local.installation.adapter,
            cliVersion: pkg.version,
            runtimeVersion: dependencyVersion('@neurcode-ai/governance-runtime', '0.4.9'),
            contractsVersion: dependencyVersion('@neurcode-ai/contracts', '0.2.17'),
            integrationVersion: local.installation.manifestVersion,
            policyVersion: String(policyResponse.policy?.policyVersion || ''),
            observedAt: new Date().toISOString(), nonce: (0, node_crypto_1.randomUUID)(), branchScopeHash: branchHash(local.repoRoot),
            configFingerprint: local.installation.fingerprint, configIntegrity: local.installation.configIntegrity,
            hostTrustState: local.installation.trustState, installationState: local.installation.state,
            lastGovernedOperationAt: lastGovernedOperation(local.repoRoot),
            lastSignedReceiptAt: null,
            signatureAlgorithm: 'hmac-sha256',
        };
        const signature = (0, node_crypto_1.createHmac)('sha256', apiKey).update((0, contracts_1.canonicalEnterprisePosturePayload)(unsigned)).digest('hex');
        const response = await requestJson(`${apiUrl}/api/v1/runtime/trust/posture`, apiKey, local.repository.organizationId, {
            method: 'POST', body: JSON.stringify({ ...unsigned, signature }),
        });
        writeTrustState(local.repoRoot, { schemaVersion: 1, reportedAt: response.trust?.evaluatedAt || new Date().toISOString(),
            trustState: response.trust?.state || 'unknown', receiptId: response.receipt?.receiptId || null,
            repositoryId: local.repository.id, installationId: local.installationId, host: local.host,
            policy: response.policy || policyResponse.policy || null });
        return { ok: true, local: inspectLocalEnterpriseTrust({ repoRoot: local.repoRoot, host: local.host }),
            trust: response.trust || null, policy: response.policy || null, receipt: response.receipt || null, unavailableReason: null };
    }
    catch (error) {
        return { ok: false, local, trust: null, policy: null, receipt: null, unavailableReason: error instanceof Error ? error.message : String(error) };
    }
}
async function reportEnterprisePostureBestEffort(input) {
    try {
        await submitEnterprisePosture(input);
    }
    catch { /* posture must not turn transient telemetry failure into a local outage */ }
}
async function assertEnterpriseSessionAdmission(input) {
    let result;
    try {
        result = await submitEnterprisePosture(input);
    }
    catch {
        // A repository that is not connected to an organization has no enterprise
        // authority to consult. Preserve personal/local session behavior.
        return { outcome: 'warn', reasonCodes: ['enterprise_not_connected'] };
    }
    if (!result.ok) {
        const cached = readJson(trustStatePath(result.local.repoRoot));
        if (cached?.policy?.mode === 'enforce' && cached?.policy?.staleBehavior === 'deny') {
            throw new Error(`Enterprise runtime admission is unavailable under fail-closed stale policy: ${result.unavailableReason || 'unknown error'}`);
        }
        return { outcome: 'warn', reasonCodes: ['trust_service_unavailable'] };
    }
    if (result.policy?.workspace?.isPersonal === true) {
        return { outcome: 'allow', reasonCodes: ['personal_workspace'] };
    }
    const apiKey = (0, config_1.getApiKey)(result.local.repository.organizationId);
    if (!apiKey)
        return { outcome: 'warn', reasonCodes: ['trust_credential_unavailable'] };
    const config = (0, config_1.loadConfig)();
    const apiUrl = (config.apiUrl || 'https://api.neurcode.com').replace(/\/$/, '');
    const response = await requestJson(`${apiUrl}/api/v1/runtime/trust/admission`, apiKey, result.local.repository.organizationId, {
        method: 'POST', body: JSON.stringify({ repositoryId: result.local.repository.id, installationId: result.local.installationId,
            host: result.local.host, governanceDecision: 'allow' }),
    });
    const outcome = String(response.admission?.outcome || 'warn');
    const reasonCodes = Array.isArray(response.admission?.reasonCodes) ? response.admission.reasonCodes.map(String) : [];
    if (outcome === 'deny') {
        throw new Error(`Enterprise runtime admission denied (${reasonCodes.join(', ') || 'trust policy'}). Run \`neurcode trust status --host ${result.local.host}\`.`);
    }
    return { outcome, reasonCodes };
}
//# sourceMappingURL=enterprise-trust.js.map