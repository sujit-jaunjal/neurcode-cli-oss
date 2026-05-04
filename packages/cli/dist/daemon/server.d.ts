/**
 * Neurcode Daemon V2 — lightweight local HTTP bridge.
 *
 * Runs at http://localhost:4321
 *
 * Routes:
 *   POST /verify         → neurcode verify --json
 *   POST /fix            → neurcode fix --json
 *   POST /fix/apply-safe → neurcode fix --apply-safe --json
 *   POST /patch          → neurcode patch + verify (auto state sync)
 *   GET  /health         → { ok: true, version }
 *
 * Implementation notes:
 *  - Uses runCliJson (internal CLI invocation utility) — no raw child_process
 *  - Only accepts requests from 127.0.0.1 / ::1 / localhost
 *  - All responses use unified shape: { success, data, error? }
 */
import * as http from 'node:http';
export declare const DAEMON_PORT = 4321;
export declare const DAEMON_HOST = "127.0.0.1";
export declare function createDaemonServer(): http.Server;
export declare function startDaemon(): void;
//# sourceMappingURL=server.d.ts.map