"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activationTelemetryPath = activationTelemetryPath;
exports.activationTelemetryEnabled = activationTelemetryEnabled;
exports.getActivationInstallId = getActivationInstallId;
exports.setActivationTelemetryEnabled = setActivationTelemetryEnabled;
exports.buildActivationTelemetryEvent = buildActivationTelemetryEvent;
exports.maybeShowActivationTelemetryNotice = maybeShowActivationTelemetryNotice;
exports.trackActivationEvent = trackActivationEvent;
exports.flushActivationTelemetry = flushActivationTelemetry;
exports.getActivationTelemetryStatus = getActivationTelemetryStatus;
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const contracts_1 = require("@neurcode-ai/contracts");
const config_1 = require("../config");
const state_1 = require("./state");
const TELEMETRY_DIR = '.neurcode';
const TELEMETRY_FILE = 'activation-telemetry.json';
const MAX_QUEUE_SIZE = 100;
const FLUSH_TIMEOUT_MS = 1200;
function homeDir() {
    return process.env.HOME || process.env.USERPROFILE || process.cwd();
}
function activationTelemetryPath() {
    return (0, path_1.join)(homeDir(), TELEMETRY_DIR, TELEMETRY_FILE);
}
function ensureTelemetryDir() {
    const dir = (0, path_1.join)(homeDir(), TELEMETRY_DIR);
    if (!(0, fs_1.existsSync)(dir))
        (0, fs_1.mkdirSync)(dir, { recursive: true });
}
function readStore() {
    const path = activationTelemetryPath();
    if (!(0, fs_1.existsSync)(path)) {
        return {
            version: 1,
            anonymousInstallId: (0, crypto_1.randomUUID)(),
            enabled: true,
            firstRunNoticeShown: false,
            queue: [],
            updatedAt: new Date().toISOString(),
        };
    }
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
        return {
            version: 1,
            anonymousInstallId: typeof parsed.anonymousInstallId === 'string' ? parsed.anonymousInstallId : (0, crypto_1.randomUUID)(),
            enabled: parsed.enabled !== false,
            firstRunNoticeShown: parsed.firstRunNoticeShown === true,
            queue: Array.isArray(parsed.queue) ? parsed.queue.slice(-MAX_QUEUE_SIZE) : [],
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        };
    }
    catch {
        return {
            version: 1,
            anonymousInstallId: (0, crypto_1.randomUUID)(),
            enabled: true,
            firstRunNoticeShown: false,
            queue: [],
            updatedAt: new Date().toISOString(),
        };
    }
}
function writeStore(store) {
    ensureTelemetryDir();
    const next = {
        ...store,
        queue: store.queue.slice(-MAX_QUEUE_SIZE),
        updatedAt: new Date().toISOString(),
    };
    (0, fs_1.writeFileSync)(activationTelemetryPath(), JSON.stringify(next, null, 2) + '\n', 'utf8');
    try {
        (0, fs_1.chmodSync)(activationTelemetryPath(), 0o600);
    }
    catch {
        // Permission hardening is best-effort on non-POSIX systems.
    }
}
function envTelemetryDisabled() {
    const raw = process.env.NEURCODE_TELEMETRY;
    if (!raw)
        return false;
    return ['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase());
}
function activationTelemetryEnabled() {
    if (envTelemetryDisabled())
        return false;
    return readStore().enabled !== false;
}
function getActivationInstallId() {
    const store = readStore();
    if (!(0, fs_1.existsSync)(activationTelemetryPath())) {
        writeStore(store);
    }
    return store.anonymousInstallId;
}
function setActivationTelemetryEnabled(enabled) {
    const store = readStore();
    writeStore({ ...store, enabled });
}
function normalizeCommandFamily(commandFamily) {
    if (!commandFamily)
        return null;
    const normalized = commandFamily.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '_').slice(0, 80);
    return normalized || null;
}
function normalizeReasonCode(reasonCode) {
    if (!reasonCode)
        return null;
    const normalized = reasonCode.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_').slice(0, 80);
    return normalized || null;
}
function detectPackageManager() {
    const ua = (process.env.npm_config_user_agent || '').toLowerCase();
    const execPath = (process.env.npm_execpath || '').toLowerCase();
    if (ua.includes('pnpm') || execPath.includes('pnpm'))
        return 'pnpm';
    if (ua.includes('yarn') || execPath.includes('yarn'))
        return 'yarn';
    if (ua.includes('bun') || execPath.includes('bun'))
        return 'bun';
    if (ua.includes('npm') || execPath.includes('npm'))
        return 'npm';
    return 'unknown';
}
function detectInstallMode(packageManager) {
    const ua = (process.env.npm_config_user_agent || '').toLowerCase();
    const execArgv = process.argv.join(' ').toLowerCase();
    if (process.env.NPX_CLI_JS || ua.includes('npx') || execArgv.includes('_npx'))
        return 'npx';
    if (process.env.NEURCODE_LOCAL_BUILD === '1' || __dirname.includes('/src/'))
        return 'local_build';
    if (packageManager === 'pnpm')
        return 'pnpm';
    if (packageManager === 'yarn')
        return 'yarn';
    if (packageManager === 'bun')
        return 'bun';
    if (packageManager === 'npm')
        return 'npm_global';
    return 'unknown';
}
function readCliVersion() {
    try {
        const packageJson = require('../../package.json');
        return typeof packageJson.version === 'string' ? packageJson.version : null;
    }
    catch {
        return null;
    }
}
function buildActivationTelemetryEvent(store, options) {
    const packageManager = detectPackageManager();
    const success = options.success ?? true;
    const event = (0, contracts_1.assertActivationTelemetryEvent)({
        schemaVersion: contracts_1.ACTIVATION_TELEMETRY_SCHEMA_VERSION,
        eventId: (0, crypto_1.randomUUID)(),
        eventType: options.eventType,
        anonymousInstallId: store.anonymousInstallId,
        cliVersion: readCliVersion(),
        commandFamily: normalizeCommandFamily(options.commandFamily),
        os: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        packageManager,
        installMode: detectInstallMode(packageManager),
        agentTarget: options.agentTarget ?? null,
        timestamp: new Date().toISOString(),
        stage: options.stage ?? (0, contracts_1.activationStageForEventType)(options.eventType, success),
        reasonCode: normalizeReasonCode(options.reasonCode),
        success,
    });
    return event;
}
function appendToQueue(event) {
    const store = readStore();
    writeStore({ ...store, queue: [...store.queue, event].slice(-MAX_QUEUE_SIZE) });
}
function replaceQueue(queue) {
    const store = readStore();
    writeStore({ ...store, queue: queue.slice(-MAX_QUEUE_SIZE) });
}
function maybeShowActivationTelemetryNotice() {
    if (process.env.CI || !process.stdout.isTTY || envTelemetryDisabled())
        return;
    const store = readStore();
    if (store.firstRunNoticeShown || store.enabled === false)
        return;
    process.stderr.write('Neurcode collects minimal source-free activation telemetry to improve first-run setup. '
        + 'No source, prompts, diffs, secrets, paths, or raw args are sent. '
        + 'Opt out with NEURCODE_TELEMETRY=0 or `neurcode telemetry off`.\n');
    writeStore({ ...store, firstRunNoticeShown: true });
}
function trackActivationEvent(options) {
    try {
        if (envTelemetryDisabled())
            return;
        const store = readStore();
        if (store.enabled === false)
            return;
        const event = buildActivationTelemetryEvent(store, options);
        appendToQueue(event);
        if (options.flush !== false) {
            void flushActivationTelemetry().catch(() => undefined);
        }
    }
    catch {
        // Telemetry must never fail the user command.
    }
}
async function flushActivationTelemetry() {
    if (envTelemetryDisabled())
        return { attempted: 0, sent: 0, remaining: readStore().queue.length };
    const store = readStore();
    if (store.enabled === false || store.queue.length === 0) {
        return { attempted: 0, sent: 0, remaining: store.queue.length };
    }
    const config = (0, config_1.loadConfig)();
    const apiUrl = (config.apiUrl || config_1.DEFAULT_API_URL).replace(/\/$/, '');
    const apiKey = (0, config_1.getApiKey)((0, state_1.getOrgId)() || undefined) || (0, config_1.getApiKey)();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS);
    try {
        let sent = 0;
        const remaining = [...store.queue];
        for (const event of store.queue) {
            const headers = {
                'Content-Type': 'application/json',
            };
            if (apiKey)
                headers.authorization = `Bearer ${apiKey}`;
            const orgId = (0, state_1.getOrgId)();
            if (orgId)
                headers['x-org-id'] = orgId;
            const response = await fetch(`${apiUrl}/api/v1/activation/events`, {
                method: 'POST',
                headers,
                body: JSON.stringify(event),
                signal: controller.signal,
            });
            if (response.status === 409 || response.status === 202 || response.ok) {
                sent += 1;
                remaining.shift();
                continue;
            }
            if (response.status >= 400 && response.status < 500) {
                sent += 1;
                remaining.shift();
                continue;
            }
            break;
        }
        replaceQueue(remaining);
        return { attempted: store.queue.length, sent, remaining: remaining.length };
    }
    catch {
        return { attempted: store.queue.length, sent: 0, remaining: store.queue.length };
    }
    finally {
        clearTimeout(timeout);
    }
}
function getActivationTelemetryStatus() {
    const store = readStore();
    if (!(0, fs_1.existsSync)(activationTelemetryPath())) {
        writeStore(store);
    }
    return {
        enabled: store.enabled !== false && !envTelemetryDisabled(),
        envDisabled: envTelemetryDisabled(),
        anonymousInstallId: store.anonymousInstallId,
        queueLength: store.queue.length,
        path: activationTelemetryPath(),
    };
}
//# sourceMappingURL=activation-telemetry.js.map