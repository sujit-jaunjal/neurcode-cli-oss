"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAEMON_HOST = exports.DAEMON_PORT = void 0;
exports.createDaemonServer = createDaemonServer;
exports.startDaemon = startDaemon;
const http = __importStar(require("node:http"));
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const cli_json_1 = require("../utils/cli-json");
// ── Configuration ──────────────────────────────────────────────────────────────
exports.DAEMON_PORT = 4321;
exports.DAEMON_HOST = '127.0.0.1';
// ── Request helpers ────────────────────────────────────────────────────────────
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}
function send(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}
function success(res, data) {
    send(res, 200, { success: true, data });
}
function failure(res, error, status = 200) {
    send(res, status, { success: false, error });
}
function addCorsHeaders(res, _origin) {
    // Wildcard is safe: daemon binds to 127.0.0.1 only and isLoopback() rejects
    // any non-local TCP connection. CORS * just lets browsers read the response
    // regardless of what origin the dashboard is served from (local dev, prod domain, etc).
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
}
function isLoopback(req) {
    const addr = req.socket.remoteAddress ?? '';
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
// ── Route handlers ─────────────────────────────────────────────────────────────
async function handleVerify(_req, res) {
    const result = await (0, cli_json_1.runCliJson)(['verify']);
    if (!result.payload) {
        failure(res, result.stderr.trim() || 'verify produced no JSON output');
        return;
    }
    success(res, result.payload);
}
async function handleFix(_req, res) {
    const result = await (0, cli_json_1.runCliJson)(['fix']);
    if (!result.payload) {
        failure(res, result.stderr.trim() || 'fix produced no JSON output');
        return;
    }
    success(res, result.payload);
}
async function handleFixApplySafe(_req, res) {
    const result = await (0, cli_json_1.runCliJson)(['fix', '--apply-safe']);
    if (!result.payload) {
        failure(res, result.stderr.trim() || 'fix --apply-safe produced no JSON output');
        return;
    }
    const applyData = result.payload;
    // Auto state sync: run verify immediately after applying, return full payload
    const verifyResult = await (0, cli_json_1.runCliJson)(['verify']);
    const verifyAfter = verifyResult.payload ?? null;
    success(res, { ...applyData, verifyAfter });
}
async function handlePatch(req, res) {
    let body = {};
    try {
        body = JSON.parse(await readBody(req));
    }
    catch {
        failure(res, 'Invalid JSON body', 400);
        return;
    }
    const file = body.file;
    if (!file || typeof file !== 'string' || file.includes('..')) {
        failure(res, 'Missing or unsafe "file" field', 400);
        return;
    }
    // Run patch
    const patchResult = await (0, cli_json_1.runCliJson)(['patch', '--file', file]);
    const patchData = patchResult.payload ?? { success: false, file, message: 'No patch output' };
    // Auto state sync: immediately run verify after patch (Part 3)
    const verifyResult = await (0, cli_json_1.runCliJson)(['verify']);
    const verifyData = verifyResult.payload ?? null;
    success(res, { patch: patchData, verify: verifyData });
}
// ── Server factory ─────────────────────────────────────────────────────────────
function createDaemonServer() {
    const server = http.createServer(async (req, res) => {
        addCorsHeaders(res, req.headers.origin);
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        if (!isLoopback(req)) {
            failure(res, 'Only localhost connections are allowed', 403);
            return;
        }
        const url = req.url ?? '/';
        const method = req.method ?? 'GET';
        try {
            if (method === 'GET' && url === '/health') {
                let version = '0.0.0';
                try {
                    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
                    version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? version;
                }
                catch { /* ignore */ }
                send(res, 200, { ok: true, version, cwd: process.cwd() });
                return;
            }
            if (method === 'POST' && url === '/verify') {
                await handleVerify(req, res);
                return;
            }
            if (method === 'POST' && url === '/fix') {
                await handleFix(req, res);
                return;
            }
            if (method === 'POST' && url === '/fix/apply-safe') {
                await handleFixApplySafe(req, res);
                return;
            }
            if (method === 'POST' && url === '/patch') {
                await handlePatch(req, res);
                return;
            }
            failure(res, `No route for ${method} ${url}`, 404);
        }
        catch (err) {
            failure(res, err instanceof Error ? err.message : String(err), 500);
        }
    });
    return server;
}
// ── Start function ─────────────────────────────────────────────────────────────
function startDaemon() {
    const server = createDaemonServer();
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n❌  Port ${exports.DAEMON_PORT} is already in use.\n` +
                `    Another Neurcode daemon may already be running.\n` +
                `    Check with: lsof -i :${exports.DAEMON_PORT}\n`);
        }
        else {
            console.error(`\n❌  Daemon error: ${err.message}\n`);
        }
        process.exit(1);
    });
    server.listen(exports.DAEMON_PORT, exports.DAEMON_HOST, () => {
        console.log(`\nNeurcode daemon v2 running on http://localhost:${exports.DAEMON_PORT}`);
        console.log(`  POST /verify         → neurcode verify --json`);
        console.log(`  POST /fix            → neurcode fix --json`);
        console.log(`  POST /fix/apply-safe → neurcode fix --apply-safe --json`);
        console.log(`  POST /patch          → neurcode patch + auto-verify`);
        console.log(`\n  CWD: ${process.cwd()}`);
        console.log(`  Press Ctrl+C to stop.\n`);
    });
    process.on('SIGINT', () => { server.close(() => { console.log('\nNeurcode daemon stopped.'); process.exit(0); }); });
    process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
}
//# sourceMappingURL=server.js.map