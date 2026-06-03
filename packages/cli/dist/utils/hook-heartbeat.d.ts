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
export declare const HOOK_HEARTBEAT_SCHEMA_VERSION = "neurcode.hook-heartbeat.v1";
export type HookEventType = 'start' | 'check' | 'finish';
export interface HookHeartbeatEvent {
    type: HookEventType;
    ts: string;
    /** Source-free session id (opaque hex), when a session is active. */
    sessionId?: string;
}
export interface HookHeartbeat {
    schemaVersion: typeof HOOK_HEARTBEAT_SCHEMA_VERSION;
    /** CLI version of the hook that is actually running in the live Claude session. */
    cliVersion: string;
    /** Realpath of the entrypoint the live hook is executing (process.argv[1]). */
    entrypoint: string;
    /** Short fingerprint of the running entrypoint (source-free). */
    entrypointFingerprint: string;
    repoRoot: string;
    /** Most recent hook event. */
    lastEvent: HookHeartbeatEvent;
    /** Last-seen timestamp per event type. */
    events: Partial<Record<HookEventType, string>>;
}
export declare function runtimeDir(repoRoot: string): string;
export declare function hookHeartbeatPath(repoRoot: string): string;
/** Short, stable, source-free fingerprint of an entrypoint path. */
export declare function fingerprintEntrypoint(entrypoint: string): string;
/** Read the CLI version from the package.json shipped alongside dist/. Best-effort. */
export declare function readCliVersion(): string;
/** Realpath of the entrypoint the current process is executing. */
export declare function runningEntrypoint(): string;
/**
 * Record a source-free heartbeat for the hook that is currently running.
 * Best-effort: any failure is swallowed so the governance hook is never broken.
 */
export declare function recordHookHeartbeat(input: {
    repoRoot: string;
    eventType: HookEventType;
    sessionId?: string;
}): void;
/** Read the heartbeat, or null when absent/unreadable/invalid. */
export declare function readHookHeartbeat(repoRoot: string): HookHeartbeat | null;
//# sourceMappingURL=hook-heartbeat.d.ts.map