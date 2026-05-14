"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_INDEX_FILENAME = exports.ACTIVE_SESSION_RUNTIME_FILENAME = exports.ACTIVE_INVARIANT_MEMORY_FILENAME = exports.ACTIVE_REPOSITORY_GRAPH_FILENAME = exports.ACTIVE_CONTEXT_PACK_FILENAME = exports.ACTIVE_INTENT_PACK_FILENAME = exports.SESSIONS_DIRNAME = exports.NEURCODE_DIRNAME = exports.LOCAL_INTELLIGENCE_SCHEMA_VERSION = void 0;
exports.nowIso = nowIso;
exports.normalizeText = normalizeText;
exports.normalizeRepoPath = normalizeRepoPath;
exports.dedupeSorted = dedupeSorted;
exports.dedupeSortedPaths = dedupeSortedPaths;
exports.sha256Hex = sha256Hex;
exports.fingerprintValue = fingerprintValue;
exports.ensureNeurcodeRuntimeDir = ensureNeurcodeRuntimeDir;
exports.ensureSessionsDir = ensureSessionsDir;
exports.writeJsonFile = writeJsonFile;
exports.readJsonFile = readJsonFile;
exports.getGitBranchName = getGitBranchName;
exports.getGitHeadSha = getGitHeadSha;
exports.createLocalSessionId = createLocalSessionId;
exports.classifyBoundaryPath = classifyBoundaryPath;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const telemetry_1 = require("@neurcode-ai/telemetry");
exports.LOCAL_INTELLIGENCE_SCHEMA_VERSION = 1;
exports.NEURCODE_DIRNAME = '.neurcode';
exports.SESSIONS_DIRNAME = 'sessions';
exports.ACTIVE_INTENT_PACK_FILENAME = 'intent-pack.json';
exports.ACTIVE_CONTEXT_PACK_FILENAME = 'context-pack.json';
exports.ACTIVE_REPOSITORY_GRAPH_FILENAME = 'repository-intelligence.json';
exports.ACTIVE_INVARIANT_MEMORY_FILENAME = 'engineering-invariants.json';
exports.ACTIVE_SESSION_RUNTIME_FILENAME = 'session-runtime.json';
exports.SESSION_INDEX_FILENAME = 'session-index.json';
function nowIso() {
    return new Date().toISOString();
}
function normalizeText(value) {
    return value.replace(/\s+/g, ' ').trim();
}
function normalizeRepoPath(pathValue) {
    return pathValue.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function dedupeSorted(values) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
function dedupeSortedPaths(values) {
    return dedupeSorted(values.map(normalizeRepoPath));
}
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
function fingerprintValue(value) {
    return sha256Hex((0, telemetry_1.stableStringify)(value));
}
function ensureNeurcodeRuntimeDir(projectRoot) {
    const runtimeDir = (0, path_1.join)(projectRoot, exports.NEURCODE_DIRNAME);
    if (!(0, fs_1.existsSync)(runtimeDir)) {
        (0, fs_1.mkdirSync)(runtimeDir, { recursive: true });
    }
    return runtimeDir;
}
function ensureSessionsDir(projectRoot) {
    const sessionsDir = (0, path_1.join)(ensureNeurcodeRuntimeDir(projectRoot), exports.SESSIONS_DIRNAME);
    if (!(0, fs_1.existsSync)(sessionsDir)) {
        (0, fs_1.mkdirSync)(sessionsDir, { recursive: true });
    }
    return sessionsDir;
}
function writeJsonFile(pathValue, payload) {
    (0, fs_1.writeFileSync)(pathValue, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}
function readJsonFile(pathValue) {
    if (!(0, fs_1.existsSync)(pathValue)) {
        return null;
    }
    try {
        return JSON.parse((0, fs_1.readFileSync)(pathValue, 'utf-8'));
    }
    catch {
        return null;
    }
}
function getGitBranchName(projectRoot) {
    try {
        const output = (0, child_process_1.execSync)('git rev-parse --abbrev-ref HEAD', {
            cwd: projectRoot,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return output || null;
    }
    catch {
        return null;
    }
}
function getGitHeadSha(projectRoot) {
    try {
        const output = (0, child_process_1.execSync)('git rev-parse HEAD', {
            cwd: projectRoot,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return output || null;
    }
    catch {
        return null;
    }
}
function createLocalSessionId(projectRoot, intent) {
    const timestamp = nowIso().replace(/[:.]/g, '-');
    const prefix = (0, path_1.basename)(projectRoot)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 20) || 'repo';
    const hash = sha256Hex(`${projectRoot}|${intent}|${timestamp}`).slice(0, 10);
    return `${prefix}-${timestamp}-${hash}`;
}
function classifyBoundaryPath(pathValue) {
    const normalized = normalizeRepoPath(pathValue).toLowerCase();
    const sensitive = normalized.includes('/auth/')
        || normalized.includes('/billing/')
        || normalized.includes('/payment')
        || normalized.includes('/secrets')
        || normalized.includes('/secret')
        || normalized.includes('/config/')
        || normalized.includes('.env');
    const infra = normalized.startsWith('infra/')
        || normalized.startsWith('terraform/')
        || normalized.startsWith('helm/')
        || normalized.startsWith('k8s/')
        || normalized.includes('/migrations/')
        || normalized.includes('/deploy/')
        || normalized === 'docker-compose.yml'
        || normalized === 'docker-compose.yaml'
        || normalized.startsWith('docker/');
    const ci = normalized.startsWith('.github/workflows/')
        || normalized.startsWith('.circleci/')
        || normalized.startsWith('.buildkite/')
        || normalized.includes('/ci/');
    const dependencyManifest = normalized.endsWith('/package.json')
        || normalized === 'package.json'
        || normalized === 'pnpm-workspace.yaml'
        || normalized === 'pnpm-lock.yaml'
        || normalized === 'yarn.lock'
        || normalized === 'package-lock.json'
        || normalized.endsWith('/requirements.txt')
        || normalized === 'requirements.txt'
        || normalized.endsWith('/pyproject.toml')
        || normalized === 'pyproject.toml'
        || normalized.endsWith('/go.mod')
        || normalized === 'go.mod'
        || normalized.endsWith('/Cargo.toml')
        || normalized === 'Cargo.toml';
    return { sensitive, infra, ci, dependencyManifest };
}
//# sourceMappingURL=intelligence-runtime-common.js.map