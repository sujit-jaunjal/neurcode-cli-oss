"use strict";
/**
 * Doctor Command - Enterprise Readiness Diagnostics
 *
 * Verifies:
 * - CLI configuration and auth
 * - Project/workspace wiring
 * - Deterministic governance artifacts
 * - API health + runtime compatibility handshake
 * - Notifications stream CORS preflight (dashboard critical path)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.doctorCommand = doctorCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const chalk_1 = __importDefault(require("chalk"));
const contracts_1 = require("@neurcode-ai/contracts");
const api_client_1 = require("../api-client");
const config_1 = require("../config");
const change_contract_1 = require("../utils/change-contract");
const policy_compiler_1 = require("../utils/policy-compiler");
const policy_packs_1 = require("../utils/policy-packs");
const project_root_1 = require("../utils/project-root");
const runtime_guard_1 = require("../utils/runtime-guard");
const messages_1 = require("../utils/messages");
const structural_rules_1 = require("../structural-rules");
function summarizeChecks(checks) {
    const summary = {
        total: checks.length,
        passed: 0,
        warned: 0,
        failed: 0,
        skipped: 0,
    };
    for (const check of checks) {
        if (check.status === 'pass')
            summary.passed += 1;
        if (check.status === 'warn')
            summary.warned += 1;
        if (check.status === 'fail')
            summary.failed += 1;
        if (check.status === 'skip')
            summary.skipped += 1;
    }
    return summary;
}
function iconForStatus(status) {
    if (status === 'pass')
        return '✅';
    if (status === 'warn')
        return '⚠️ ';
    if (status === 'fail')
        return '❌';
    return '⏭️ ';
}
function colorizeStatus(status, text) {
    if (status === 'pass')
        return chalk_1.default.green(text);
    if (status === 'warn')
        return chalk_1.default.yellow(text);
    if (status === 'fail')
        return chalk_1.default.red(text);
    return chalk_1.default.dim(text);
}
function normalizeUrl(input) {
    return input.replace(/\/+$/, '');
}
function parseJsonObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
async function fetchWithTimeout(input, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    }
    finally {
        clearTimeout(timer);
    }
}
async function probeHealth(apiUrl) {
    const healthUrl = `${normalizeUrl(apiUrl)}/health`;
    try {
        const response = await fetchWithTimeout(healthUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'neurcode-cli-doctor',
            },
        }, 5000);
        if (!response.ok) {
            return {
                ok: false,
                statusCode: response.status,
                apiVersion: null,
                compatibility: null,
                error: `Health endpoint returned HTTP ${response.status}`,
            };
        }
        const payload = await response.json().catch(() => null);
        const record = parseJsonObject(payload);
        const compatibility = record ? parseJsonObject(record.compatibility) : null;
        return {
            ok: true,
            statusCode: response.status,
            apiVersion: record && typeof record.version === 'string' ? record.version : null,
            compatibility,
            error: null,
        };
    }
    catch (error) {
        const message = error instanceof Error && error.name === 'AbortError'
            ? 'Health endpoint timed out after 5s'
            : error instanceof Error
                ? error.message
                : String(error);
        return {
            ok: false,
            statusCode: null,
            apiVersion: null,
            compatibility: null,
            error: message,
        };
    }
}
async function probeNotificationsCors(apiUrl) {
    const streamUrl = `${normalizeUrl(apiUrl)}/api/v1/notifications/stream`;
    try {
        const response = await fetchWithTimeout(streamUrl, {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://www.neurcode.com',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'authorization,content-type,x-org-id',
                'User-Agent': 'neurcode-cli-doctor',
            },
        }, 5000);
        const allowedOrigin = response.headers.get('access-control-allow-origin');
        const allowedHeaders = response.headers.get('access-control-allow-headers');
        const headersNormalized = (allowedHeaders || '').toLowerCase();
        const hasRequiredHeaders = headersNormalized.includes('authorization')
            && headersNormalized.includes('content-type')
            && headersNormalized.includes('x-org-id');
        const ok = response.ok
            && allowedOrigin === 'https://www.neurcode.com'
            && hasRequiredHeaders;
        return {
            ok,
            statusCode: response.status,
            allowedOrigin,
            allowedHeaders,
            error: ok
                ? null
                : `Preflight missing required CORS headers (origin=${allowedOrigin || 'none'}, headers=${allowedHeaders || 'none'})`,
        };
    }
    catch (error) {
        return {
            ok: false,
            statusCode: null,
            allowedOrigin: null,
            allowedHeaders: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
function readProjectConfig(projectRoot) {
    const path = (0, path_1.join)(projectRoot, '.neurcode', 'config.json');
    if (!(0, fs_1.existsSync)(path)) {
        return {
            exists: false,
            projectId: null,
            orgId: null,
            path,
        };
    }
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf-8'));
        return {
            exists: true,
            projectId: typeof parsed.projectId === 'string' && parsed.projectId.trim() ? parsed.projectId : null,
            orgId: typeof parsed.orgId === 'string' && parsed.orgId.trim() ? parsed.orgId : null,
            path,
        };
    }
    catch (error) {
        return {
            exists: true,
            projectId: null,
            orgId: null,
            error: error instanceof Error ? error.message : 'Failed to parse config.json',
            path,
        };
    }
}
function printCheck(check) {
    const head = `${iconForStatus(check.status)} ${check.label}`;
    console.log(colorizeStatus(check.status, head));
    console.log(chalk_1.default.dim(`   ${check.message}`));
    if (check.details && check.details.length > 0) {
        for (const line of check.details) {
            console.log(chalk_1.default.dim(`   • ${line}`));
        }
    }
    if (check.recommendation) {
        console.log(chalk_1.default.dim(`   ↳ ${check.recommendation}`));
    }
    console.log('');
}
async function doctorCommand(options = {}) {
    const startedAt = new Date().toISOString();
    const config = (0, config_1.loadConfig)();
    const apiUrl = normalizeUrl(config.apiUrl || config_1.DEFAULT_API_URL);
    const apiKey = (0, config_1.getApiKey)();
    const cliVersion = (options.cliVersion || 'unknown').trim() || 'unknown';
    const localCompatibility = (0, contracts_1.buildRuntimeCompatibilityDescriptor)('cli', cliVersion);
    const checks = [];
    if (!options.json) {
        const userInfo = await (0, messages_1.getUserInfo)();
        const greeting = userInfo ? `, ${userInfo.displayName}` : '';
        await (0, messages_1.printSuccessBanner)('Neurcode Enterprise Doctor', `Running diagnostics${greeting}...`);
    }
    checks.push({
        id: 'config.api_url',
        label: 'API URL',
        status: 'pass',
        message: `Using ${apiUrl}`,
        details: process.env.NEURCODE_API_URL ? [`env override: ${process.env.NEURCODE_API_URL}`] : undefined,
    });
    checks.push({
        id: 'config.auth',
        label: 'Authentication key',
        status: apiKey ? 'pass' : 'fail',
        message: apiKey ? 'API key is configured.' : 'No API key configured.',
        recommendation: apiKey ? undefined : 'Run `neurcode login`.',
    });
    const rootTrace = (0, project_root_1.resolveNeurcodeProjectRootWithTrace)(process.cwd());
    const projectConfig = readProjectConfig(rootTrace.projectRoot);
    checks.push({
        id: 'workspace.root',
        label: 'Workspace root',
        status: projectConfig.exists ? 'pass' : 'warn',
        message: projectConfig.exists
            ? `Resolved root: ${rootTrace.projectRoot}`
            : `No linked workspace found at ${rootTrace.projectRoot}`,
        details: [
            `git root: ${rootTrace.gitRoot || 'not in git repo'}`,
            `override status: ${rootTrace.overrideStatus}`,
        ],
        recommendation: projectConfig.exists ? undefined : 'Run `neurcode init` in your repository root.',
    });
    checks.push({
        id: 'workspace.project_config',
        label: 'Project binding',
        status: projectConfig.exists && !projectConfig.error && projectConfig.projectId ? 'pass' : 'warn',
        message: projectConfig.exists && !projectConfig.error && projectConfig.projectId
            ? `Project bound (${projectConfig.projectId})${projectConfig.orgId ? ` in org ${projectConfig.orgId}` : ''}.`
            : projectConfig.error
                ? `Project config parse error (${projectConfig.error}).`
                : 'Project ID not found in .neurcode/config.json.',
        details: [`path: ${projectConfig.path}`],
        recommendation: projectConfig.exists && !projectConfig.error && projectConfig.projectId
            ? undefined
            : 'Run `neurcode init` to bind this repo to a project.',
    });
    const policyLock = (0, policy_packs_1.readPolicyLockFile)(rootTrace.projectRoot);
    checks.push({
        id: 'artifact.policy_lock',
        label: 'Policy lock artifact',
        status: policyLock.lock ? 'pass' : policyLock.exists ? 'fail' : 'warn',
        message: policyLock.lock
            ? `Policy lock present (effective rules: ${policyLock.lock.effective.ruleCount}).`
            : policyLock.exists
                ? `Policy lock invalid (${policyLock.error || 'parse failure'}).`
                : 'Policy lock artifact not found.',
        details: [`path: ${policyLock.path}`],
        recommendation: policyLock.lock || !projectConfig.exists
            ? undefined
            : 'Run `neurcode policy install soc2 && neurcode policy compile`.',
    });
    const compiledPolicy = (0, policy_compiler_1.readCompiledPolicyArtifact)(rootTrace.projectRoot);
    checks.push({
        id: 'artifact.compiled_policy',
        label: 'Compiled policy artifact',
        status: compiledPolicy.artifact ? 'pass' : compiledPolicy.exists ? 'fail' : 'warn',
        message: compiledPolicy.artifact
            ? `Compiled policy present (deterministic rules: ${compiledPolicy.artifact.compilation.deterministicRuleCount}).`
            : compiledPolicy.exists
                ? `Compiled policy invalid (${compiledPolicy.error || 'parse failure'}).`
                : 'Compiled policy artifact not found.',
        details: [`path: ${compiledPolicy.path}`],
        recommendation: compiledPolicy.artifact || !projectConfig.exists
            ? undefined
            : 'Run `neurcode policy compile --include-dashboard --out neurcode.policy.compiled.json`.',
    });
    const changeContract = (0, change_contract_1.readChangeContract)(rootTrace.projectRoot);
    checks.push({
        id: 'artifact.change_contract',
        label: 'Change contract artifact',
        status: changeContract.contract ? 'pass' : changeContract.exists ? 'fail' : 'warn',
        message: changeContract.contract
            ? `Change contract present (plan ${changeContract.contract.planId}, files ${changeContract.contract.expectedFiles.length}).`
            : changeContract.exists
                ? `Change contract invalid (${changeContract.error || 'parse failure'}).`
                : 'Change contract artifact not found.',
        details: [`path: ${changeContract.path}`],
        recommendation: changeContract.contract || !projectConfig.exists
            ? undefined
            : 'Run `neurcode plan ...` or `neurcode contract import ...` to create .neurcode/change-contract.json.',
    });
    const runtimeGuard = (0, runtime_guard_1.readRuntimeGuardArtifact)(rootTrace.projectRoot);
    checks.push({
        id: 'artifact.runtime_guard',
        label: 'Runtime guard artifact',
        status: runtimeGuard.artifact ? (runtimeGuard.artifact.active ? 'pass' : 'warn') : runtimeGuard.exists ? 'fail' : 'warn',
        message: runtimeGuard.artifact
            ? runtimeGuard.artifact.active
                ? `Runtime guard active (${runtimeGuard.artifact.mode}, checks: ${runtimeGuard.artifact.stats.checksRun}).`
                : 'Runtime guard artifact exists but is inactive.'
            : runtimeGuard.exists
                ? `Runtime guard invalid (${runtimeGuard.error || 'parse failure'}).`
                : 'Runtime guard artifact not found.',
        details: [`path: ${runtimeGuard.path}`],
        recommendation: runtimeGuard.artifact && runtimeGuard.artifact.active
            ? undefined
            : 'Run `neurcode guard start --strict` before coding sessions.',
    });
    // ── LOCAL-ONLY CHECKS (no network required) ────────────────────────────────
    // Node version check
    const nodeVersion = process.version.replace(/^v/, '');
    const nodeRequiredMajor = 18;
    const nodeMajor = parseInt(nodeVersion.split('.')[0], 10);
    checks.push({
        id: 'local.node_version',
        label: 'Node.js version',
        status: nodeMajor >= nodeRequiredMajor ? 'pass' : 'fail',
        message: nodeMajor >= nodeRequiredMajor
            ? `Node ${nodeVersion} meets minimum requirement (>= ${nodeRequiredMajor}).`
            : `Node ${nodeVersion} is below minimum (>= ${nodeRequiredMajor}).`,
        recommendation: nodeMajor >= nodeRequiredMajor ? undefined : `Upgrade Node.js to v${nodeRequiredMajor} or later.`,
    });
    // Structural rule engine availability
    let structuralRuleStatus = 'pass';
    let structuralRuleMessage = '';
    let structuralRuleCount = 0;
    try {
        const engine = (0, structural_rules_1.createDefaultStructuralRuleEngine)();
        structuralRuleCount = engine.getRuleIds().length;
        structuralRuleMessage = `Structural rule engine initialized (${structuralRuleCount} rules available).`;
    }
    catch (err) {
        structuralRuleStatus = 'fail';
        structuralRuleMessage = `Structural rule engine failed to initialize: ${err instanceof Error ? err.message : String(err)}`;
    }
    checks.push({
        id: 'local.structural_rules',
        label: 'Structural rule engine',
        status: structuralRuleStatus,
        message: structuralRuleMessage,
        recommendation: structuralRuleStatus === 'fail' ? 'Check CLI installation integrity. Try reinstalling @neurcode-ai/cli.' : undefined,
    });
    // Structural cache status
    const cachePath = (0, path_1.join)(rootTrace.projectRoot, '.neurcode', 'structural-cache.json');
    let cacheStatus = 'warn';
    let cacheMessage = 'Structural cache not found (first-run cold cache).';
    let cacheDetails = [];
    if ((0, fs_1.existsSync)(cachePath)) {
        try {
            const cacheRaw = JSON.parse((0, fs_1.readFileSync)(cachePath, 'utf-8'));
            const entries = Object.keys(cacheRaw.entries ?? {}).length;
            const staleCount = typeof cacheRaw.staleRiskEntryCount === 'number' ? cacheRaw.staleRiskEntryCount : 0;
            cacheStatus = 'pass';
            cacheMessage = `Structural cache present (${entries} entries${staleCount > 0 ? `, ${staleCount} stale-risk` : ''}).`;
            try {
                const st = (0, fs_1.statSync)(cachePath);
                const ageMs = Date.now() - st.mtimeMs;
                const ageHours = Math.round(ageMs / 3_600_000);
                cacheDetails = [`age: ${ageHours}h`, `path: ${cachePath}`];
                if (ageHours > 168) {
                    cacheStatus = 'warn';
                    cacheMessage += ' Cache is older than 7 days.';
                }
            }
            catch { /* non-fatal */ }
        }
        catch (err) {
            cacheStatus = 'fail';
            cacheMessage = `Structural cache exists but could not be read: ${err instanceof Error ? err.message : String(err)}`;
        }
    }
    checks.push({
        id: 'local.structural_cache',
        label: 'Structural rule cache',
        status: cacheStatus,
        message: cacheMessage,
        details: cacheDetails.length > 0 ? cacheDetails : undefined,
        recommendation: cacheStatus === 'warn' ? 'Run `neurcode verify --local-only` to warm up the structural cache.' : undefined,
    });
    // Local-only mode availability
    checks.push({
        id: 'local.local_only_mode',
        label: 'Local-only governance mode',
        status: structuralRuleStatus === 'pass' ? 'pass' : 'fail',
        message: structuralRuleStatus === 'pass'
            ? `Local-only mode available (${structuralRuleCount} deterministic rules, no network required).`
            : 'Local-only mode unavailable because structural rule engine failed to initialize.',
        recommendation: structuralRuleStatus !== 'pass' ? 'Repair structural rule engine first.' : undefined,
    });
    const healthProbe = await probeHealth(apiUrl);
    checks.push({
        id: 'api.health',
        label: 'API health endpoint',
        status: healthProbe.ok ? 'pass' : 'fail',
        message: healthProbe.ok
            ? `API reachable (${apiUrl}/health).`
            : `API health probe failed (${healthProbe.error || 'unknown error'}).`,
        details: [
            `http status: ${healthProbe.statusCode ?? 'n/a'}`,
            `api version: ${healthProbe.apiVersion || 'unknown'}`,
        ],
        recommendation: healthProbe.ok ? undefined : 'Verify API availability and `NEURCODE_API_URL`.',
    });
    if (healthProbe.ok && healthProbe.compatibility) {
        const apiCompat = healthProbe.compatibility;
        const contractId = typeof apiCompat.contractId === 'string' ? apiCompat.contractId.trim() : '';
        const runtimeContractVersion = typeof apiCompat.runtimeContractVersion === 'string'
            ? apiCompat.runtimeContractVersion.trim()
            : '';
        const minimumPeers = parseJsonObject(apiCompat.minimumPeerVersions);
        const requiredCli = minimumPeers && typeof minimumPeers.cli === 'string'
            ? minimumPeers.cli.trim()
            : null;
        const requiredApi = localCompatibility.minimumPeerVersions.api || null;
        const contractOk = contractId === contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_ID
            && runtimeContractVersion === contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_VERSION;
        const details = [
            `api contract: ${contractId || 'missing'}@${runtimeContractVersion || 'missing'}`,
            `expected contract: ${contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_ID}@${contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_VERSION}`,
        ];
        let status = contractOk ? 'pass' : 'fail';
        let message = contractOk
            ? 'Runtime compatibility contract handshake passed.'
            : 'Runtime compatibility contract mismatch.';
        let recommendation;
        if (requiredCli) {
            details.push(`api requires cli >= ${requiredCli}`);
            const cliCompat = (0, contracts_1.isSemverAtLeast)(cliVersion, requiredCli);
            if (cliCompat === false) {
                status = 'fail';
                message = `CLI version ${cliVersion} is below API minimum ${requiredCli}.`;
                recommendation = 'Upgrade CLI to a compatible release.';
            }
            else if (cliCompat === null) {
                status = status === 'fail' ? 'fail' : 'warn';
                details.push(`unable to parse semver for CLI version "${cliVersion}"`);
            }
        }
        if (requiredApi && healthProbe.apiVersion) {
            details.push(`cli expects api >= ${requiredApi}`);
            const apiCompatResult = (0, contracts_1.isSemverAtLeast)(healthProbe.apiVersion, requiredApi);
            if (apiCompatResult === false) {
                status = 'fail';
                message = `API version ${healthProbe.apiVersion} is below CLI minimum ${requiredApi}.`;
                recommendation = 'Deploy compatible API version before running strict verify gates.';
            }
            else if (apiCompatResult === null) {
                status = status === 'fail' ? 'fail' : 'warn';
                details.push(`unable to parse semver for API version "${healthProbe.apiVersion}"`);
            }
        }
        checks.push({
            id: 'api.runtime_compatibility',
            label: 'Runtime compatibility handshake',
            status,
            message,
            details,
            recommendation,
        });
    }
    else {
        checks.push({
            id: 'api.runtime_compatibility',
            label: 'Runtime compatibility handshake',
            status: healthProbe.ok ? 'warn' : 'skip',
            message: healthProbe.ok
                ? 'API health payload is missing compatibility metadata.'
                : 'Skipped because API health probe failed.',
            recommendation: healthProbe.ok
                ? 'Deploy API build that exposes compatibility metadata on /health.'
                : undefined,
        });
    }
    const corsProbe = await probeNotificationsCors(apiUrl);
    checks.push({
        id: 'api.notifications_cors',
        label: 'Notifications stream CORS preflight',
        status: corsProbe.ok ? 'pass' : 'warn',
        message: corsProbe.ok
            ? 'CORS preflight allows dashboard stream headers.'
            : `Preflight check reported issues (${corsProbe.error || 'unknown'}).`,
        details: [
            `http status: ${corsProbe.statusCode ?? 'n/a'}`,
            `allow-origin: ${corsProbe.allowedOrigin || 'missing'}`,
            `allow-headers: ${corsProbe.allowedHeaders || 'missing'}`,
        ],
        recommendation: corsProbe.ok ? undefined : 'Ensure CORS allowlist includes dashboard origin and x-org-id header.',
    });
    if (apiKey) {
        try {
            const client = new api_client_1.ApiClient(config);
            const projects = await client.getProjects();
            checks.push({
                id: 'api.authenticated_request',
                label: 'Authenticated API request',
                status: 'pass',
                message: `Authentication valid (projects visible: ${projects.length}).`,
            });
        }
        catch (error) {
            checks.push({
                id: 'api.authenticated_request',
                label: 'Authenticated API request',
                status: 'fail',
                message: `Authenticated request failed (${error instanceof Error ? error.message : String(error)}).`,
                recommendation: 'Run `neurcode login` and verify org/project permissions.',
            });
        }
    }
    else {
        checks.push({
            id: 'api.authenticated_request',
            label: 'Authenticated API request',
            status: 'skip',
            message: 'Skipped because API key is not configured.',
            recommendation: 'Run `neurcode login`.',
        });
    }
    const summary = summarizeChecks(checks);
    const recommendations = [...new Set(checks
            .filter((check) => check.status === 'warn' || check.status === 'fail')
            .map((check) => check.recommendation)
            .filter((value) => typeof value === 'string' && value.trim().length > 0))];
    const payload = {
        success: summary.failed === 0,
        timestamp: startedAt,
        cliVersion,
        apiUrl,
        projectRoot: rootTrace.projectRoot,
        summary,
        checks,
        recommendations,
    };
    if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
    }
    else {
        console.log(chalk_1.default.bold.white('\n🔎 Diagnostics\n'));
        checks.forEach(printCheck);
        const summaryLine = `Pass ${summary.passed} · Warn ${summary.warned} · Fail ${summary.failed} · Skip ${summary.skipped}`;
        if (summary.failed > 0) {
            console.log(chalk_1.default.red(`❌ ${summaryLine}`));
        }
        else if (summary.warned > 0) {
            console.log(chalk_1.default.yellow(`⚠️  ${summaryLine}`));
        }
        else {
            console.log(chalk_1.default.green(`✅ ${summaryLine}`));
        }
        console.log('');
        if (recommendations.length > 0) {
            console.log(chalk_1.default.bold.white('Next actions:'));
            for (const recommendation of recommendations) {
                console.log(chalk_1.default.dim(`  • ${recommendation}`));
            }
            console.log('');
        }
        if (summary.failed === 0) {
            await (0, messages_1.printSuccessBanner)('Doctor Complete', summary.warned > 0
                ? 'Core checks passed with advisory warnings.'
                : 'All enterprise readiness checks passed.');
        }
    }
    if (summary.failed > 0) {
        process.exitCode = 1;
    }
}
//# sourceMappingURL=doctor.js.map