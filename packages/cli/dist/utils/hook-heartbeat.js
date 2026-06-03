"use strict";
/**
 * Hook heartbeat — source-free liveness evidence for Claude Code governance hooks.
 *
 * Every time a `session-hook start|check|finish` runs, the *currently loaded* hook
 * records a small, source-free heartbeat under `.neurcode/runtime/`. doctor uses it to
 * tell whether the running Claude Code session is executing the hooks that are
 * installed on disk right now — the only reliable signal that activation actually
 * reached the live agent (hooks load at Claude Code startup and do not hot-reload).
 *
 * SOURCE-FREE CONTRACT: the heartbeat contains only the hook entrypoint path, CLI
 * version, repo root, event type, timestamp, and the (opaque) session id. It never
 * contains source code, diffs, or prompt/goal text.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOOK_HEARTBEAT_SCHEMA_VERSION = void 0;
exports.runtimeDir = runtimeDir;
exports.hookHeartbeatPath = hookHeartbeatPath;
exports.fingerprintEntrypoint = fingerprintEntrypoint;
exports.readCliVersion = readCliVersion;
exports.runningEntrypoint = runningEntrypoint;
exports.recordHookHeartbeat = recordHookHeartbeat;
exports.readHookHeartbeat = readHookHeartbeat;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
exports.HOOK_HEARTBEAT_SCHEMA_VERSION = 'neurcode.hook-heartbeat.v1';
function runtimeDir(repoRoot) {
    return (0, path_1.join)(repoRoot, '.neurcode', 'runtime');
}
function hookHeartbeatPath(repoRoot) {
    return (0, path_1.join)(runtimeDir(repoRoot), 'hook-heartbeat.json');
}
/** Short, stable, source-free fingerprint of an entrypoint path. */
function fingerprintEntrypoint(entrypoint) {
    return (0, crypto_1.createHash)('sha256').update(entrypoint).digest('hex').slice(0, 16);
}
/** Read the CLI version from the package.json shipped alongside dist/. Best-effort. */
function readCliVersion() {
    const candidates = [
        (0, path_1.resolve)(__dirname, '..', '..', 'package.json'),
        (0, path_1.resolve)(__dirname, '..', 'package.json'),
    ];
    for (const candidate of candidates) {
        try {
            const pkg = JSON.parse((0, fs_1.readFileSync)(candidate, 'utf8'));
            if (pkg.version)
                return pkg.version;
        }
        catch {
            // try next candidate
        }
    }
    return 'unknown';
}
/** Realpath of the entrypoint the current process is executing. */
function runningEntrypoint() {
    const raw = process.argv[1] ?? '';
    try {
        return (0, fs_1.realpathSync)(raw);
    }
    catch {
        return raw;
    }
}
/**
 * Record a source-free heartbeat for the hook that is currently running.
 * Best-effort: any failure is swallowed so the governance hook is never broken.
 */
function recordHookHeartbeat(input) {
    try {
        const entrypoint = runningEntrypoint();
        const now = new Date().toISOString();
        const previous = readHookHeartbeat(input.repoRoot);
        const events = { ...(previous?.events ?? {}) };
        events[input.eventType] = now;
        const heartbeat = {
            schemaVersion: exports.HOOK_HEARTBEAT_SCHEMA_VERSION,
            cliVersion: readCliVersion(),
            entrypoint,
            entrypointFingerprint: fingerprintEntrypoint(entrypoint),
            repoRoot: input.repoRoot,
            lastEvent: {
                type: input.eventType,
                ts: now,
                ...(input.sessionId ? { sessionId: input.sessionId } : {}),
            },
            events,
        };
        const path = hookHeartbeatPath(input.repoRoot);
        (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
        (0, fs_1.writeFileSync)(path, JSON.stringify(heartbeat, null, 2) + '\n', 'utf8');
    }
    catch {
        // Heartbeat is best-effort liveness evidence; never break the hook.
    }
}
/** Read the heartbeat, or null when absent/unreadable/invalid. */
function readHookHeartbeat(repoRoot) {
    const path = hookHeartbeatPath(repoRoot);
    if (!(0, fs_1.existsSync)(path))
        return null;
    try {
        const data = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
        if (!data || data.schemaVersion !== exports.HOOK_HEARTBEAT_SCHEMA_VERSION)
            return null;
        if (typeof data.entrypoint !== 'string' || !data.lastEvent || typeof data.lastEvent.ts !== 'string') {
            return null;
        }
        return data;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=hook-heartbeat.js.map