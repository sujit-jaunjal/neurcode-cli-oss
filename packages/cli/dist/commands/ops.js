"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateReleaseConsistency = evaluateReleaseConsistency;
exports.compareOpsCliVersions = compareOpsCliVersions;
exports.buildOpsStatus = buildOpsStatus;
exports.renderOpsStatus = renderOpsStatus;
exports.opsCommand = opsCommand;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const api_client_1 = require("../api-client");
const config_1 = require("../config");
const semver = require('semver');
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (s) => s,
        yellow: (s) => s,
        red: (s) => s,
        dim: (s) => s,
        bold: (s) => s,
    };
}
function commitPrefix(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed)
        return null;
    return trimmed.slice(0, 7);
}
/**
 * Pure, source-free cross-service release commit consistency check.
 *
 * Mirror of services/api/src/utils/ops-status.ts:evaluateReleaseConsistency.
 * The gate (production-reliability-operator-console-v1) asserts the two
 * implementations agree on shared test vectors so they cannot drift apart.
 */
function evaluateReleaseConsistency(input) {
    const surfaces = [
        { name: 'api', prefix: commitPrefix(input.api) },
        { name: 'dashboard', prefix: commitPrefix(input.dashboard) },
        { name: 'worker', prefix: commitPrefix(input.worker) },
    ];
    const expectedPrefix = commitPrefix(input.expected);
    const present = surfaces.filter((s) => s.prefix !== null);
    const comparedSurfaces = present.map((s) => s.name);
    if (present.length === 0) {
        return {
            status: 'unknown',
            comparedSurfaces,
            mismatchedSurfaces: [],
            referenceCommit: expectedPrefix,
            expectedCommit: expectedPrefix,
            note: 'No release commit markers are available to compare.',
        };
    }
    const reference = expectedPrefix
        ?? present.find((s) => s.name === 'api')?.prefix
        ?? present[0].prefix;
    const mismatchedSurfaces = present.filter((s) => s.prefix !== reference).map((s) => s.name);
    if (!expectedPrefix && present.length < 2) {
        return {
            status: 'unknown',
            comparedSurfaces,
            mismatchedSurfaces: [],
            referenceCommit: reference,
            expectedCommit: null,
            note: 'Only one release commit marker is available; cross-service consistency cannot be assessed.',
        };
    }
    if (mismatchedSurfaces.length > 0) {
        return {
            status: 'drift',
            comparedSurfaces,
            mismatchedSurfaces,
            referenceCommit: reference,
            expectedCommit: expectedPrefix,
            note: `Release commit drift: ${mismatchedSurfaces.join(', ')} disagree with ${expectedPrefix ? 'the expected commit' : 'the api commit'}.`,
        };
    }
    return {
        status: 'consistent',
        comparedSurfaces,
        mismatchedSurfaces: [],
        referenceCommit: reference,
        expectedCommit: expectedPrefix,
        note: expectedPrefix
            ? 'All available release commit markers match the expected commit.'
            : 'All available release commit markers agree.',
    };
}
function compareOpsCliVersions(localVersion, registryVersion) {
    const local = typeof localVersion === 'string' ? semver.valid(localVersion.trim()) : null;
    const registry = typeof registryVersion === 'string' ? semver.valid(registryVersion.trim()) : null;
    if (!local || !registry)
        return 'unknown';
    const comparison = semver.compare(local, registry);
    if (comparison < 0)
        return 'update_available';
    if (comparison > 0)
        return 'local_newer';
    return 'current';
}
function resolveCliVersion() {
    const candidates = [
        (0, path_1.join)(__dirname, '../package.json'),
        (0, path_1.join)(__dirname, '../../package.json'),
        (0, path_1.join)(process.cwd(), 'packages/cli/package.json'),
    ];
    for (const candidate of candidates) {
        try {
            if (!(0, fs_1.existsSync)(candidate))
                continue;
            const parsed = JSON.parse((0, fs_1.readFileSync)(candidate, 'utf8'));
            if (typeof parsed.version === 'string' && parsed.version.trim())
                return parsed.version.trim();
        }
        catch {
            // Try the next candidate.
        }
    }
    return '0.0.0';
}
function normalizeBaseUrl(value) {
    return value.replace(/\/+$/, '');
}
function defaultDashboardUrl(apiUrl) {
    if (process.env.NEURCODE_APP_URL)
        return normalizeBaseUrl(process.env.NEURCODE_APP_URL);
    if (process.env.VITE_APP_URL)
        return normalizeBaseUrl(process.env.VITE_APP_URL);
    try {
        const parsed = new URL(apiUrl);
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return `${parsed.protocol}//${parsed.hostname}:5173`;
        }
    }
    catch {
        // Fall through to production.
    }
    return 'https://neurcode.com';
}
function npmLatestVersion(enabled) {
    if (!enabled)
        return { status: 'warn', version: null, error: 'skipped by --no-npm' };
    const result = (0, child_process_1.spawnSync)('npm', ['view', '@neurcode-ai/cli', 'version', '--silent'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20_000,
    });
    if (result.status !== 0) {
        return {
            status: 'warn',
            version: null,
            error: String(result.stderr || result.stdout || 'npm view failed').trim(),
        };
    }
    const version = String(result.stdout || '').trim();
    return version
        ? { status: 'pass', version, error: null }
        : { status: 'warn', version: null, error: 'npm view returned no version' };
}
async function probe(url, options) {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: { accept: options.json ? 'application/json' : 'text/html,application/json;q=0.9,*/*;q=0.8' },
        });
        const text = await response.text();
        let body = null;
        if (options.json) {
            try {
                body = JSON.parse(text);
            }
            catch {
                body = null;
            }
        }
        const ok = response.ok && (!options.json || body != null);
        return {
            ok,
            status: ok ? 'pass' : 'fail',
            url,
            httpStatus: response.status,
            latencyMs: Date.now() - started,
            error: ok ? null : `HTTP ${response.status}`,
            ...(body ? { body } : {}),
        };
    }
    catch (error) {
        return {
            ok: false,
            status: 'fail',
            url,
            httpStatus: null,
            latencyMs: Date.now() - started,
            error: error instanceof Error ? error.message : String(error),
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
function hasConfiguredApiKey(config) {
    return Boolean(config.apiKey || (0, config_1.getApiKey)(config.orgId) || (0, config_1.getApiKey)());
}
async function fetchRuntimeOperationsStatus(config, apiUrl, timeoutMs) {
    const previousTimeout = process.env.NEURCODE_REQUEST_TIMEOUT_MS;
    process.env.NEURCODE_REQUEST_TIMEOUT_MS = String(timeoutMs);
    try {
        const apiKey = process.env.NEURCODE_API_KEY?.trim() || config.apiKey;
        return await new api_client_1.ApiClient({ ...config, apiUrl, apiKey }).getRuntimeOperationsStatus();
    }
    finally {
        if (previousTimeout === undefined) {
            delete process.env.NEURCODE_REQUEST_TIMEOUT_MS;
        }
        else {
            process.env.NEURCODE_REQUEST_TIMEOUT_MS = previousTimeout;
        }
    }
}
function statusFromBool(ok) {
    return ok ? 'pass' : 'fail';
}
async function buildOpsStatus(options = {}) {
    const config = (0, config_1.loadConfig)();
    const apiUrl = normalizeBaseUrl(options.apiUrl || config.apiUrl || 'https://api.neurcode.com');
    const dashboardUrl = normalizeBaseUrl(options.dashboardUrl || defaultDashboardUrl(apiUrl));
    const timeoutMs = Math.max(1000, Math.min(60_000, Number(options.timeoutMs || process.env.NEURCODE_OPS_TIMEOUT_MS || 8000)));
    const cliVersion = resolveCliVersion();
    const npm = npmLatestVersion(options.npm !== false);
    const [apiHealth, dashboard] = await Promise.all([
        probe(`${apiUrl}/health`, { json: true, timeoutMs }),
        probe(dashboardUrl, { json: false, timeoutMs }),
    ]);
    let runtimeOperations = null;
    let runtimeOperationsError = null;
    const runtimeConfig = {
        ...config,
        apiUrl,
        apiKey: process.env.NEURCODE_API_KEY?.trim() || config.apiKey,
    };
    if (!apiHealth.ok) {
        runtimeOperationsError = 'API health probe failed; authenticated runtime operations status skipped.';
    }
    else if (hasConfiguredApiKey(runtimeConfig)) {
        try {
            runtimeOperations = await fetchRuntimeOperationsStatus(runtimeConfig, apiUrl, timeoutMs);
        }
        catch (error) {
            runtimeOperationsError = error instanceof Error ? error.message : String(error);
        }
    }
    else {
        runtimeOperationsError = 'No API key configured; authenticated runtime operations status skipped.';
    }
    const release = runtimeOperations?.release || apiHealth.body?.release || null;
    const registryVersion = npm.status === 'pass' ? npm.version : null;
    const versionStatus = compareOpsCliVersions(cliVersion, registryVersion);
    const runtimeBackend = runtimeOperations?.runtimeBackend || apiHealth.body?.runtimeBackend || null;
    const receiptSigningConfigured = Boolean(release?.runtime?.receiptSigningConfigured);
    // Operator-declared expected commit: --expect-commit flag wins over env.
    const expectedCommit = (options.expectCommit && options.expectCommit.trim())
        || (process.env.NEURCODE_EXPECTED_GIT_COMMIT && process.env.NEURCODE_EXPECTED_GIT_COMMIT.trim())
        || null;
    // Worker posture is only on the authenticated route; null when unauthenticated.
    const worker = runtimeOperations?.worker || null;
    const databaseTls = release?.databaseTls || null;
    const fatal = release?.fatal || null;
    // Compute consistency client-side so --expect-commit reflects the operator's
    // local intent (git-on-disk HEAD), not just the server's declared markers.
    const releaseConsistency = evaluateReleaseConsistency({
        api: release?.api?.commit ?? null,
        dashboard: release?.dashboard?.commit ?? null,
        worker: worker?.commit ?? null,
        expected: expectedCommit,
    });
    const posture = {
        api: statusFromBool(apiHealth.ok),
        dashboard: statusFromBool(dashboard.ok),
        runtimeBackend: runtimeBackend?.status || (runtimeOperationsError ? 'unknown' : 'not_reported'),
        npm: npm.status,
        receiptSigning: receiptSigningConfigured ? 'configured' : 'not_configured_or_unknown',
        releaseConsistency: releaseConsistency.status,
    };
    const ok = apiHealth.ok
        && dashboard.ok
        && (runtimeBackend ? runtimeBackend.status !== 'degraded' : true)
        && (!runtimeOperations || runtimeOperations.ingestion.status !== 'degraded')
        // Stale-container / partial-deploy guard: any confirmed commit drift fails
        // --strict. 'unknown' never fails (no false alarms).
        && releaseConsistency.status !== 'drift';
    return {
        schemaVersion: 'neurcode.ops-cli-status.v1',
        ok,
        generatedAt: new Date().toISOString(),
        cli: {
            package: '@neurcode-ai/cli',
            version: cliVersion,
            npmLatest: npm.version || release?.cli?.latestVersion || null,
            registryVersion,
            releaseLatest: release?.cli?.latestVersion || null,
            npmError: npm.error,
            versionStatus,
            upToDate: versionStatus === 'current'
                ? true
                : versionStatus === 'update_available'
                    ? false
                    : null,
        },
        api: {
            url: apiUrl,
            health: apiHealth,
            version: apiHealth.body?.version || release?.api?.version || null,
            buildId: release?.api?.buildId || null,
            commit: release?.api?.commit || null,
            deployedAt: release?.api?.deployedAt || null,
        },
        dashboard: {
            url: dashboardUrl,
            health: dashboard,
            buildId: release?.dashboard?.buildId || null,
            commit: release?.dashboard?.commit || null,
            deployedAt: release?.dashboard?.deployedAt || null,
        },
        runtimeBackend,
        runtimeOperations: runtimeOperations ? {
            ingestion: runtimeOperations.ingestion,
            sessions: runtimeOperations.sessions || null,
            approvals: runtimeOperations.approvals || null,
            scopeAmendments: runtimeOperations.scopeAmendments || null,
        } : null,
        runtimeOperationsError,
        release,
        migrationLedger: release?.runtime?.migrationLedger || { status: 'unknown', lastAppliedAt: null },
        action: release?.action || { bundleVersion: null, bundleCommit: null, posture: 'unknown' },
        releaseConsistency,
        expectedCommit,
        worker,
        databaseTls,
        fatal,
        posture,
        privacy: {
            sourceUploaded: false,
            commandMode: 'read_only',
            uploadedFields: runtimeOperations ? ['authenticated runtime operations metadata'] : [],
        },
    };
}
function renderOpsStatus(status) {
    const lines = [];
    lines.push(chalk.bold('Neurcode Ops Status'));
    const versionDetail = status.cli.versionStatus === 'update_available'
        ? `npm latest ${status.cli.registryVersion} - update available`
        : status.cli.versionStatus === 'current'
            ? `npm latest ${status.cli.registryVersion} - current`
            : status.cli.versionStatus === 'local_newer'
                ? `npm latest ${status.cli.registryVersion} - local/prerelease build newer than registry`
                : 'npm registry unavailable - version relationship unknown';
    lines.push(`CLI:       ${status.cli.version} (${versionDetail})`);
    lines.push(`API:       ${status.api.health.ok ? chalk.green('healthy') : chalk.red('unhealthy')} ${chalk.dim(status.api.url)}${status.api.version ? ` · v${status.api.version}` : ''}`);
    lines.push(`Dashboard: ${status.dashboard.health.ok ? chalk.green('reachable') : chalk.red('unreachable')} ${chalk.dim(status.dashboard.url)}`);
    lines.push(`Runtime:   ${status.runtimeBackend?.status ? status.runtimeBackend.status : 'not reported'}${status.runtimeBackend?.coordinationMode ? ` · ${status.runtimeBackend.coordinationMode}` : ''}`);
    lines.push(`Receipts:  ${status.posture.receiptSigning}`);
    const marker = status.migrationLedger.marker;
    lines.push(`Migrations:${status.migrationLedger.status}${marker ? ` (${marker})` : ''}${status.migrationLedger.lastAppliedAt ? ` · ${status.migrationLedger.lastAppliedAt}` : ''}`);
    lines.push(`Action:    ${status.action.bundleVersion || 'unknown'} · ${status.action.posture || 'unknown'}`);
    const rc = status.releaseConsistency;
    const rcText = rc.status === 'drift'
        ? chalk.red(`drift · ${rc.mismatchedSurfaces.join(', ')} ≠ ${rc.expectedCommit ? `expected ${rc.expectedCommit}` : `api ${rc.referenceCommit || 'unknown'}`}`)
        : rc.status === 'consistent'
            ? chalk.green(`consistent${rc.expectedCommit ? ` · matches expected ${rc.expectedCommit}` : ''}`)
            : chalk.dim('unknown');
    lines.push(`Release:   ${rcText}${rc.comparedSurfaces.length ? chalk.dim(` (compared: ${rc.comparedSurfaces.join('+')})`) : ''}`);
    if (status.worker) {
        const w = status.worker;
        lines.push(`Worker:    ${w.present ? `${w.processRole || 'worker'} · ${w.commit ? `commit ${commitPrefix(w.commit)}` : 'commit unknown'}${w.stale ? chalk.yellow(' · stale') : ''}` : chalk.yellow('no heartbeat')}`);
    }
    if (status.databaseTls) {
        const tls = status.databaseTls;
        lines.push(`DB TLS:    ${tls.status === 'enforced' ? chalk.green('enforced') : tls.status === 'insecure_allowed' ? chalk.red('insecure_allowed') : chalk.yellow('not_required')}${tls.caCertConfigured ? chalk.dim(' · CA configured') : ''}`);
    }
    if (status.fatal) {
        const f = status.fatal;
        lines.push(`Fatal:     ${f.count === 0 ? chalk.green('0') : chalk.red(String(f.count))}${f.lastAt ? chalk.dim(` · last ${f.lastAt}`) : ''}${typeof f.windowSeconds === 'number' ? chalk.dim(` · ${f.windowSeconds}s window`) : ''}`);
    }
    if (status.runtimeOperationsError)
        lines.push(chalk.dim(`Runtime operations: ${status.runtimeOperationsError}`));
    if (status.api.health.error)
        lines.push(chalk.dim(`API probe: ${status.api.health.error}`));
    if (status.dashboard.health.error)
        lines.push(chalk.dim(`Dashboard probe: ${status.dashboard.health.error}`));
    lines.push(chalk.dim('Privacy: read-only probes; no source, diffs, prompts, or secrets uploaded.'));
    return lines.join('\n');
}
function opsCommand(program) {
    const ops = program
        .command('ops')
        .description('Release and production operations checks');
    ops
        .command('status')
        .description('Show CLI, API, dashboard, runtime backend, receipts, Action, and release posture')
        .option('--api-url <url>', 'API base URL (default: configured API URL)')
        .option('--dashboard-url <url>', 'Dashboard URL to probe (default: production or local dev pairing)')
        .option('--timeout-ms <ms>', 'Probe timeout in milliseconds (default: 8000)')
        .option('--no-npm', 'Skip npm latest-version lookup')
        .option('--expect-commit <sha>', 'Expected deployed commit (e.g. git-on-disk HEAD); --strict fails on drift. Env: NEURCODE_EXPECTED_GIT_COMMIT')
        .option('--strict', 'Exit non-zero when required probes fail or release commits drift')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        const status = await buildOpsStatus({
            apiUrl: options.apiUrl,
            dashboardUrl: options.dashboardUrl,
            timeoutMs: options.timeoutMs,
            npm: options.npm,
            expectCommit: options.expectCommit,
            strict: options.strict === true,
            json: options.json === true,
        });
        if (options.json) {
            console.log(JSON.stringify(status, null, 2));
        }
        else {
            console.log(renderOpsStatus(status));
        }
        if (options.strict === true && !status.ok)
            process.exitCode = 1;
    });
}
//# sourceMappingURL=ops.js.map