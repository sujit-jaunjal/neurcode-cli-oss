"use strict";
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
exports.detectIntentMode = detectIntentMode;
exports.planCommand = planCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const project_detector_1 = require("../utils/project-detector");
const map_1 = require("./map");
const state_1 = require("../utils/state");
const ROILogger_1 = require("../utils/ROILogger");
const toolbox_service_1 = require("../services/toolbox-service");
const plan_cache_1 = require("../utils/plan-cache");
const neurcode_context_1 = require("../utils/neurcode-context");
const brain_context_1 = require("../utils/brain-context");
const project_root_1 = require("../utils/project-root");
const scope_telemetry_1 = require("../utils/scope-telemetry");
const plan_slo_1 = require("../utils/plan-slo");
const change_contract_1 = require("../utils/change-contract");
const policy_packs_1 = require("../utils/policy-packs");
const policy_compiler_1 = require("../utils/policy-compiler");
const artifact_signature_1 = require("../utils/artifact-signature");
const plan_symbols_1 = require("../utils/plan-symbols");
// Import chalk with fallback for plain strings if not available
let chalk;
try {
    chalk = require('chalk');
}
catch {
    // Fallback: create a mock chalk object that returns strings as-is
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
    };
}
/**
 * Recursively scan directory for files, ignoring common build/dependency directories
 * Returns only file paths (no content) for use in file tree scanning
 */
function scanFiles(dir, baseDir, maxFiles = 200) {
    const files = [];
    const ignoreDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.turbo', '.cache']);
    const ignorePatterns = [/^\./, /\.map$/, /\.log$/];
    function scan(currentDir) {
        if (files.length >= maxFiles)
            return;
        try {
            const entries = (0, fs_1.readdirSync)(currentDir);
            for (const entry of entries) {
                if (files.length >= maxFiles)
                    break;
                const fullPath = (0, path_1.join)(currentDir, entry);
                const relativePath = (0, path_1.relative)(baseDir, fullPath);
                const normalizedRelativePath = toUnixPath(relativePath);
                if (normalizedRelativePath === '' ||
                    normalizedRelativePath === '.' ||
                    normalizedRelativePath.startsWith('..')) {
                    continue;
                }
                // Skip hidden files and directories
                if (entry.startsWith('.')) {
                    // Allow .env, .gitignore, etc. but skip .git, .next, etc.
                    if (ignoreDirs.has(entry))
                        continue;
                    // Skip other hidden files that match ignore patterns
                    if (ignorePatterns.some(pattern => pattern.test(entry)))
                        continue;
                }
                // Skip ignored directories
                if (ignoreDirs.has(entry))
                    continue;
                try {
                    const stat = (0, fs_1.lstatSync)(fullPath);
                    if (stat.isSymbolicLink()) {
                        // Skip symlinked entries to avoid escaping repository boundaries.
                        continue;
                    }
                    if (stat.isDirectory()) {
                        scan(fullPath);
                    }
                    else if (stat.isFile()) {
                        // Skip binary-like files and common build artifacts
                        const ext = entry.split('.').pop()?.toLowerCase();
                        const skipExts = ['map', 'log', 'lock', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'eot'];
                        if (ext && skipExts.includes(ext))
                            continue;
                        files.push(relativePath);
                    }
                }
                catch {
                    // Skip files we can't access
                    continue;
                }
            }
        }
        catch {
            // Skip directories we can't access
            return;
        }
    }
    scan(dir);
    return files.slice(0, maxFiles);
}
/**
 * Display the plan in a beautiful format
 */
function displayPlan(plan) {
    console.log('\n' + chalk.bold.cyan('📋 Neurcode Architect Plan\n'));
    // Display summary and complexity
    console.log(chalk.bold.white('Summary:'));
    console.log(chalk.dim(plan.summary));
    console.log('');
    const complexityEmoji = {
        low: '🟢',
        medium: '🟡',
        high: '🔴',
    };
    const complexity = plan.estimatedComplexity || 'medium';
    console.log(chalk.bold.white('Estimated Complexity:'), complexityEmoji[complexity], chalk.bold(complexity.toUpperCase()));
    console.log('');
    // Group files by action
    const createFiles = plan.files.filter(f => f.action === 'CREATE');
    const modifyFiles = plan.files.filter(f => f.action === 'MODIFY');
    const blockFiles = plan.files.filter(f => f.action === 'BLOCK');
    // Display CREATE files (GREEN)
    if (createFiles.length > 0) {
        console.log(chalk.bold.green(`\n✨ CREATE (${createFiles.length} files):`));
        for (const file of createFiles) {
            console.log(chalk.green(`  + ${file.path}`));
            if (file.reason) {
                console.log(chalk.dim(`    └─ ${file.reason}`));
            }
            if (file.suggestion) {
                console.log(chalk.cyan(`    💡 ${file.suggestion}`));
            }
        }
    }
    // Display MODIFY files (YELLOW)
    if (modifyFiles.length > 0) {
        console.log(chalk.bold.yellow(`\n🔧 MODIFY (${modifyFiles.length} files):`));
        for (const file of modifyFiles) {
            console.log(chalk.yellow(`  ~ ${file.path}`));
            if (file.reason) {
                console.log(chalk.dim(`    └─ ${file.reason}`));
            }
            if (file.suggestion) {
                console.log(chalk.cyan(`    💡 ${file.suggestion}`));
            }
        }
    }
    // Display BLOCK files (RED)
    if (blockFiles.length > 0) {
        console.log(chalk.bold.red(`\n🚫 BLOCK (${blockFiles.length} files):`));
        for (const file of blockFiles) {
            console.log(chalk.red(`  ✗ ${file.path}`));
            if (file.reason) {
                console.log(chalk.dim(`    └─ ${file.reason}`));
            }
        }
    }
    // Display recommendations
    if (plan.recommendations && plan.recommendations.length > 0) {
        console.log(chalk.bold.white('\n💡 Recommendations:'));
        for (const rec of plan.recommendations) {
            console.log(chalk.cyan(`  • ${rec}`));
        }
    }
    console.log('');
}
function parseRatio(raw) {
    if (!raw)
        return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1)
        return null;
    return parsed;
}
function parsePercent(raw) {
    if (!raw)
        return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)
        return null;
    return Math.floor(parsed);
}
function getEscalationGuardPath(cwd) {
    return (0, path_1.join)(cwd, '.neurcode', 'asset-map-escalation-guard.json');
}
function loadEscalationGuardState(cwd) {
    const pathValue = getEscalationGuardPath(cwd);
    if (!(0, fs_1.existsSync)(pathValue)) {
        return {
            version: 1,
            updatedAt: new Date(0).toISOString(),
            consecutiveBreaches: 0,
        };
    }
    try {
        const raw = JSON.parse((0, fs_1.readFileSync)(pathValue, 'utf-8'));
        return {
            version: 1,
            updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
            consecutiveBreaches: typeof raw.consecutiveBreaches === 'number' && Number.isFinite(raw.consecutiveBreaches) && raw.consecutiveBreaches > 0
                ? Math.floor(raw.consecutiveBreaches)
                : 0,
            lastBreachAt: typeof raw.lastBreachAt === 'string' ? raw.lastBreachAt : undefined,
            lastReason: typeof raw.lastReason === 'string' ? raw.lastReason : undefined,
            cooldownUntil: typeof raw.cooldownUntil === 'string' ? raw.cooldownUntil : undefined,
        };
    }
    catch {
        return {
            version: 1,
            updatedAt: new Date(0).toISOString(),
            consecutiveBreaches: 0,
        };
    }
}
function saveEscalationGuardState(cwd, state) {
    const pathValue = getEscalationGuardPath(cwd);
    const dir = (0, path_1.join)(cwd, '.neurcode');
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
    (0, fs_1.writeFileSync)(pathValue, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}
function computeEscalationCanaryBucket(cwd) {
    const seed = (process.env.NEURCODE_ASSET_MAP_ESCALATE_CANARY_SEED || 'neurcode-escalation-v1').trim();
    const digest = (0, crypto_1.createHash)('sha1')
        .update(`${(0, path_1.resolve)(cwd)}|${seed}`, 'utf-8')
        .digest('hex');
    const bucketRaw = parseInt(digest.slice(0, 8), 16);
    if (!Number.isFinite(bucketRaw))
        return 0;
    return Math.abs(bucketRaw % 100);
}
function resolveEscalationPolicy(cwd) {
    const enabledByEnv = parseBooleanFlag(process.env.NEURCODE_ASSET_MAP_ESCALATE_DEEPEN, true);
    const canaryPercent = parsePercent(process.env.NEURCODE_ASSET_MAP_ESCALATE_CANARY_PERCENT) ?? 100;
    const canaryBucket = computeEscalationCanaryBucket(cwd);
    if (!enabledByEnv) {
        return {
            enabled: false,
            reason: 'env_disabled',
            canaryPercent,
            canaryBucket,
        };
    }
    const state = loadEscalationGuardState(cwd);
    const nowMs = Date.now();
    const cooldownMs = state.cooldownUntil ? Date.parse(state.cooldownUntil) : NaN;
    if (Number.isFinite(cooldownMs) && cooldownMs > nowMs) {
        return {
            enabled: false,
            reason: 'kill_switch_cooldown',
            canaryPercent,
            canaryBucket,
            cooldownUntil: state.cooldownUntil,
        };
    }
    if (canaryBucket >= canaryPercent) {
        return {
            enabled: false,
            reason: 'canary_excluded',
            canaryPercent,
            canaryBucket,
        };
    }
    return {
        enabled: true,
        reason: 'enabled',
        canaryPercent,
        canaryBucket,
    };
}
function updateEscalationGuardForBuild(cwd, escalationEnabled, buildStartedAtMs) {
    if (!escalationEnabled) {
        return { killSwitchTripped: false };
    }
    const maxBuildMs = parsePositiveInt(process.env.NEURCODE_ASSET_MAP_ESCALATE_KILL_MAX_BUILD_MS) ?? 5000;
    const maxRssKb = parsePositiveInt(process.env.NEURCODE_ASSET_MAP_ESCALATE_KILL_MAX_RSS_KB) ?? (512 * 1024);
    const minBreaches = parsePositiveInt(process.env.NEURCODE_ASSET_MAP_ESCALATE_KILL_BREACHES) ?? 3;
    const cooldownMinutes = parsePositiveInt(process.env.NEURCODE_ASSET_MAP_ESCALATE_KILL_COOLDOWN_MINUTES) ?? 60;
    const elapsedMs = Math.max(0, Date.now() - buildStartedAtMs);
    const rssKb = Math.max(0, Math.floor(process.memoryUsage().rss / 1024));
    const breachReasons = [];
    if (elapsedMs > maxBuildMs) {
        breachReasons.push(`build_ms>${maxBuildMs}`);
    }
    if (rssKb > maxRssKb) {
        breachReasons.push(`rss_kb>${maxRssKb}`);
    }
    const state = loadEscalationGuardState(cwd);
    const nowIso = new Date().toISOString();
    let killSwitchTripped = false;
    let cooldownUntil;
    if (breachReasons.length > 0) {
        const nextBreaches = state.consecutiveBreaches + 1;
        state.consecutiveBreaches = nextBreaches;
        state.lastBreachAt = nowIso;
        state.lastReason = breachReasons.join(',');
        if (nextBreaches >= minBreaches) {
            killSwitchTripped = true;
            const cooldownMs = Date.now() + cooldownMinutes * 60 * 1000;
            cooldownUntil = new Date(cooldownMs).toISOString();
            state.cooldownUntil = cooldownUntil;
            state.consecutiveBreaches = 0;
        }
    }
    else {
        state.consecutiveBreaches = 0;
        state.lastReason = undefined;
        state.lastBreachAt = undefined;
    }
    state.updatedAt = nowIso;
    saveEscalationGuardState(cwd, state);
    return {
        killSwitchTripped,
        cooldownUntil,
    };
}
function computeAssetMapIntentFingerprint(intent) {
    const tokens = (intent || '')
        .toLowerCase()
        .match(/[a-z0-9_]{3,}/g);
    if (!tokens || tokens.length === 0)
        return null;
    const filtered = Array.from(new Set(tokens))
        .filter((token) => token.length >= 3)
        .slice(0, 24)
        .sort();
    if (filtered.length === 0)
        return null;
    return (0, crypto_1.createHash)('sha1').update(filtered.join('|'), 'utf-8').digest('hex');
}
function decideAssetMapRefresh(map, intentForAdaptiveDeepen) {
    if (process.env.NEURCODE_ASSET_MAP_FORCE_REFRESH === '1') {
        return { refresh: true, reason: 'forced_refresh' };
    }
    const nowMs = Date.now();
    const scannedAtMs = Date.parse(map.scannedAt || '');
    const ageMs = Number.isFinite(scannedAtMs) ? Math.max(0, nowMs - scannedAtMs) : Number.POSITIVE_INFINITY;
    const maxAgeMinutes = parsePositiveInt(process.env.NEURCODE_ASSET_MAP_MAX_AGE_MINUTES) ?? 360;
    const minRefreshIntervalMinutes = parsePositiveInt(process.env.NEURCODE_ASSET_MAP_MIN_REFRESH_INTERVAL_MINUTES) ?? 20;
    const minRefreshIntervalMs = minRefreshIntervalMinutes * 60 * 1000;
    const staleByAge = ageMs > maxAgeMinutes * 60 * 1000;
    if (staleByAge) {
        return { refresh: true, reason: 'stale_age' };
    }
    const withinMinRefreshInterval = ageMs < minRefreshIntervalMs;
    const stats = map.scanStats;
    const indexedSourceFiles = Math.max(1, stats?.indexedSourceFiles || Object.keys(map.files || {}).length || 1);
    const shallowIndexedSourceFiles = stats?.shallowIndexedSourceFiles || 0;
    const shallowRatio = shallowIndexedSourceFiles / indexedSourceFiles;
    const shallowRatioThreshold = parseRatio(process.env.NEURCODE_ASSET_MAP_SHALLOW_RATIO_REFRESH_THRESHOLD) ?? 0.3;
    const shallowPressure = shallowIndexedSourceFiles > 0 && shallowRatio >= shallowRatioThreshold;
    const shallowFailures = (stats?.shallowIndexFailures || 0) > 0;
    const cappedCoverage = Boolean(stats?.cappedByMaxSourceFiles);
    const refreshOnCapped = process.env.NEURCODE_ASSET_MAP_REFRESH_ON_CAPPED !== '0';
    if (shallowFailures && !withinMinRefreshInterval) {
        return { refresh: true, reason: 'shallow_index_failures' };
    }
    if (cappedCoverage && refreshOnCapped && !withinMinRefreshInterval) {
        return { refresh: true, reason: 'capped_coverage' };
    }
    if (shallowPressure && !withinMinRefreshInterval) {
        const currentIntentFingerprint = computeAssetMapIntentFingerprint(intentForAdaptiveDeepen);
        const previousIntentFingerprint = map.scanContext?.adaptiveIntentFingerprint || null;
        if (currentIntentFingerprint && previousIntentFingerprint && currentIntentFingerprint !== previousIntentFingerprint) {
            return { refresh: true, reason: 'intent_shift_on_shallow_map' };
        }
        if ((stats?.adaptiveDeepenedFiles || 0) === 0) {
            return { refresh: true, reason: 'shallow_pressure_without_deepening' };
        }
    }
    return { refresh: false };
}
async function buildAssetMap(cwd, intentForAdaptiveDeepen) {
    const escalationPolicy = resolveEscalationPolicy(cwd);
    const startedAtMs = Date.now();
    let escalationKillSwitchTripped = false;
    let escalationKillSwitchCooldownUntil;
    try {
        const { ProjectScanner } = await Promise.resolve().then(() => __importStar(require('../services/mapper/ProjectScanner')));
        const scanner = new ProjectScanner(cwd, {
            maxSourceFiles: parsePositiveInt(process.env.NEURCODE_ASSET_MAP_MAX_FILES) ?? 800,
            maxFileBytes: parsePositiveInt(process.env.NEURCODE_ASSET_MAP_MAX_BYTES) ?? (512 * 1024),
            shallowScanBytes: parsePositiveInt(process.env.NEURCODE_ASSET_MAP_SHALLOW_SCAN_BYTES) ?? (256 * 1024),
            shallowScanWindows: parsePositiveInt(process.env.NEURCODE_ASSET_MAP_SHALLOW_SCAN_WINDOWS) ?? 5,
            adaptiveDeepenIntent: intentForAdaptiveDeepen || '',
            maxAdaptiveDeepenFiles: parsePositiveInt(process.env.NEURCODE_ASSET_MAP_ADAPTIVE_DEEPEN_FILES) ?? 3,
            maxAdaptiveDeepenTotalBytes: parsePositiveInt(process.env.NEURCODE_ASSET_MAP_ADAPTIVE_DEEPEN_TOTAL_BYTES) ?? (2 * 1024 * 1024),
            enableAdaptiveEscalation: escalationPolicy.enabled,
            adaptiveEscalationShallowRatioThreshold: parseRatio(process.env.NEURCODE_ASSET_MAP_ESCALATE_SHALLOW_RATIO) ?? 0.35,
            adaptiveEscalationMinCandidates: parsePositiveInt(process.env.NEURCODE_ASSET_MAP_ESCALATE_MIN_CANDIDATES) ?? 3,
            maxAdaptiveEscalationFiles: parsePositiveInt(process.env.NEURCODE_ASSET_MAP_ESCALATE_MAX_FILES) ?? 2,
            maxAdaptiveEscalationTotalBytes: parsePositiveInt(process.env.NEURCODE_ASSET_MAP_ESCALATE_MAX_BYTES) ?? (1024 * 1024),
        });
        const map = await scanner.scan();
        const killSwitchUpdate = updateEscalationGuardForBuild(cwd, escalationPolicy.enabled, startedAtMs);
        escalationKillSwitchTripped = killSwitchUpdate.killSwitchTripped;
        escalationKillSwitchCooldownUntil = killSwitchUpdate.cooldownUntil;
        const { writeFileSync, mkdirSync } = await Promise.resolve().then(() => __importStar(require('fs')));
        const neurcodeDir = (0, path_1.join)(cwd, '.neurcode');
        if (!(0, fs_1.existsSync)(neurcodeDir)) {
            mkdirSync(neurcodeDir, { recursive: true });
        }
        const mapPath = (0, path_1.join)(neurcodeDir, 'asset-map.json');
        writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf-8');
        return {
            map,
            escalationPolicy,
            escalationKillSwitchTripped,
            escalationKillSwitchCooldownUntil,
        };
    }
    catch (error) {
        if (process.env.DEBUG) {
            console.warn(chalk.yellow(`⚠️  Could not generate asset map: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
        return {
            map: null,
            escalationPolicy,
            escalationKillSwitchTripped: false,
            escalationKillSwitchCooldownUntil: undefined,
        };
    }
}
async function ensureAssetMap(cwd, intentForAdaptiveDeepen) {
    if (process.env.NEURCODE_DISABLE_ASSET_MAP === '1') {
        return {
            map: null,
            generated: false,
            refreshed: false,
        };
    }
    const existingMap = (0, map_1.loadAssetMap)(cwd);
    if (!existingMap) {
        const generated = await buildAssetMap(cwd, intentForAdaptiveDeepen);
        return {
            map: generated.map,
            generated: Boolean(generated.map),
            refreshed: false,
            refreshReason: generated.map ? 'missing' : undefined,
            escalationPolicy: generated.escalationPolicy,
            escalationKillSwitchTripped: generated.escalationKillSwitchTripped,
            escalationKillSwitchCooldownUntil: generated.escalationKillSwitchCooldownUntil,
        };
    }
    const refreshDecision = decideAssetMapRefresh(existingMap, intentForAdaptiveDeepen);
    if (!refreshDecision.refresh) {
        return {
            map: existingMap,
            generated: false,
            refreshed: false,
        };
    }
    const refreshed = await buildAssetMap(cwd, intentForAdaptiveDeepen);
    if (!refreshed.map) {
        return {
            map: existingMap,
            generated: false,
            refreshed: false,
            refreshReason: refreshDecision.reason,
            refreshFailed: true,
            escalationPolicy: refreshed.escalationPolicy,
            escalationKillSwitchTripped: refreshed.escalationKillSwitchTripped,
            escalationKillSwitchCooldownUntil: refreshed.escalationKillSwitchCooldownUntil,
        };
    }
    return {
        map: refreshed.map,
        generated: false,
        refreshed: true,
        refreshReason: refreshDecision.reason,
        escalationPolicy: refreshed.escalationPolicy,
        escalationKillSwitchTripped: refreshed.escalationKillSwitchTripped,
        escalationKillSwitchCooldownUntil: refreshed.escalationKillSwitchCooldownUntil,
    };
}
function detectIntentMode(intent) {
    const normalized = (0, plan_cache_1.normalizeIntent)(intent);
    if (!normalized)
        return 'implementation';
    const implementationSignals = [
        /\b(add|create|implement|build|fix|refactor|update|change|write|generate|migrate|remove|delete|ship)\b/,
    ];
    for (const pattern of implementationSignals) {
        if (pattern.test(normalized)) {
            return 'implementation';
        }
    }
    const analysisSignals = [
        /\b(read|review|inspect|analyze|audit|check|find|search|locate|compare|list|tell me|where|whether|is there)\b/,
        /\?$/,
    ];
    for (const pattern of analysisSignals) {
        if (pattern.test(normalized)) {
            return 'analysis';
        }
    }
    return 'implementation';
}
function applyReadOnlyDirective(intentText) {
    return [
        intentText,
        '',
        'NEURCODE_EXECUTION_MODE: READ_ONLY_ANALYSIS',
        '- The user asked for analysis only, not code implementation.',
        '- Do not propose code writes or file creation.',
        '- Prefer a compact investigation plan with target files and concrete checks.',
        '- Treat suggested files as inspection targets.',
    ].join('\n');
}
function renderCacheMissReason(reason, bestIntentSimilarity) {
    const reasonText = {
        no_scope_entries: 'no cached plans exist yet for this org/project scope',
        repo_identity_changed: 'repo identity changed for this scope',
        repo_snapshot_changed: 'repo snapshot changed (HEAD tree differs)',
        policy_changed: 'policy fingerprint changed',
        neurcode_version_changed: 'neurcode version changed',
        prompt_changed: 'prompt/context changed',
    };
    if (reason === 'prompt_changed' && bestIntentSimilarity > 0) {
        return `${reasonText[reason]} (closest intent similarity ${bestIntentSimilarity.toFixed(2)})`;
    }
    return reasonText[reason];
}
function hasPersistedPlanId(planId) {
    return typeof planId === 'string' && planId.trim().length > 0 && planId !== 'unknown';
}
function toUnixPath(filePath) {
    return filePath.replace(/\\/g, '/');
}
function parsePositiveInt(raw) {
    if (!raw)
        return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return null;
    return Math.floor(parsed);
}
function parseBooleanFlag(raw, fallback) {
    if (!raw || !raw.trim())
        return fallback;
    const normalized = raw.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
        return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
        return false;
    }
    return fallback;
}
function resolveChangeContractOptionsFromEnv() {
    return {
        enforceExpectedFiles: parseBooleanFlag(process.env.NEURCODE_CHANGE_CONTRACT_ENFORCE_EXPECTED_FILES, false),
        enforceActionMatching: parseBooleanFlag(process.env.NEURCODE_CHANGE_CONTRACT_ENFORCE_ACTION_MATCHING, true),
        allowRenameForModify: parseBooleanFlag(process.env.NEURCODE_CHANGE_CONTRACT_ALLOW_RENAME_FOR_MODIFY, true),
        enforceExpectedSymbols: parseBooleanFlag(process.env.NEURCODE_CHANGE_CONTRACT_ENFORCE_EXPECTED_SYMBOLS, false),
        enforceSymbolActionMatching: parseBooleanFlag(process.env.NEURCODE_CHANGE_CONTRACT_ENFORCE_SYMBOL_ACTION_MATCHING, false),
    };
}
function mapPlanFilesForChangeContract(files) {
    return files
        .map((file) => ({
        path: file.path,
        action: file.action,
        reason: file.reason,
    }))
        .filter((file) => typeof file.path === 'string' && file.path.trim().length > 0);
}
function parseConfidenceScoreThreshold(raw) {
    if (!raw)
        return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed))
        return null;
    if (parsed < 0 || parsed > 100)
        return null;
    return Math.floor(parsed);
}
function buildPlanCoverageConfidence(input) {
    const fileTreeCountSafe = Math.max(1, input.fileTreeCount);
    const selectionCoverageRatio = input.filesUsedForGeneration / fileTreeCountSafe;
    const readableSelectionRatio = input.selectedByScout > 0 ? input.readableSelected / input.selectedByScout : 1;
    const mapStats = input.assetMap?.scanStats;
    const metrics = {
        fileTreeCount: input.fileTreeCount,
        fileTreeCapped: input.fileTreeCapped,
        selectedByScout: input.selectedByScout,
        readableSelected: input.readableSelected,
        filesUsedForGeneration: input.filesUsedForGeneration,
        selectionCoverageRatio,
        readableSelectionRatio,
        usedFallbackSelection: input.usedFallbackSelection,
        assetMapAvailable: Boolean(input.assetMap),
        assetMapExports: input.assetMap?.globalExports.length || 0,
        assetMapCapped: Boolean(mapStats?.cappedByMaxSourceFiles),
        shallowIndexedSourceFiles: mapStats?.shallowIndexedSourceFiles || 0,
        shallowIndexFailures: mapStats?.shallowIndexFailures || 0,
        adaptiveDeepenedFiles: mapStats?.adaptiveDeepenedFiles || 0,
        adaptiveDeepenSkippedBudget: mapStats?.adaptiveDeepenSkippedBudget || 0,
        adaptiveEscalationTriggered: Boolean(mapStats?.adaptiveEscalationTriggered),
        adaptiveEscalationReason: mapStats?.adaptiveEscalationReason || null,
        adaptiveEscalationDeepenedFiles: mapStats?.adaptiveEscalationDeepenedFiles || 0,
        adaptiveEscalationSkippedBudget: mapStats?.adaptiveEscalationSkippedBudget || 0,
    };
    let score = 100;
    const reasons = [];
    if (metrics.fileTreeCapped) {
        score -= 12;
        reasons.push('File tree context hit the cap and may miss relevant paths.');
    }
    if (metrics.usedFallbackSelection) {
        score -= 14;
        reasons.push('Semantic Scout fallback was used instead of ranked file selection.');
    }
    if (metrics.selectionCoverageRatio < 0.04) {
        score -= 22;
        reasons.push('Very low file coverage for this intent.');
    }
    else if (metrics.selectionCoverageRatio < 0.1) {
        score -= 14;
        reasons.push('Low file coverage for this intent.');
    }
    else if (metrics.selectionCoverageRatio < 0.2) {
        score -= 8;
        reasons.push('Moderate file coverage; consider expanding selected files.');
    }
    if (metrics.readableSelectionRatio < 0.7) {
        score -= 10;
        reasons.push('Many selected files were unreadable and dropped from planning.');
    }
    else if (metrics.readableSelectionRatio < 0.9) {
        score -= 4;
        reasons.push('Some selected files were unreadable and excluded.');
    }
    if (metrics.fileTreeCount >= 30 && metrics.filesUsedForGeneration < 5) {
        score -= 8;
        reasons.push('Plan uses a small file set relative to repository size.');
    }
    if (!metrics.assetMapAvailable) {
        score -= 10;
        reasons.push('Asset map unavailable; toolbox context was not injected.');
    }
    else {
        if (metrics.assetMapCapped) {
            score -= 8;
            reasons.push('Asset map indexing was capped before full repository coverage.');
        }
        if (metrics.shallowIndexFailures > 0) {
            score -= 10;
            reasons.push('Some oversized files could not be indexed, reducing context completeness.');
        }
        if (metrics.shallowIndexedSourceFiles > 0 && metrics.adaptiveDeepenedFiles === 0) {
            score -= 4;
            reasons.push('Oversized files remained shallow-indexed with no adaptive deepening.');
        }
        if (metrics.adaptiveDeepenSkippedBudget > 0) {
            score -= 4;
            reasons.push('Adaptive deepening skipped candidates due to budget constraints.');
        }
        if (metrics.adaptiveEscalationTriggered && metrics.adaptiveEscalationDeepenedFiles === 0) {
            score -= 3;
            reasons.push('Escalation pass triggered but could not fully parse additional oversized files.');
        }
        if (metrics.adaptiveEscalationSkippedBudget > 0) {
            score -= 2;
            reasons.push('Escalation deepening skipped candidates due to strict byte/file limits.');
        }
    }
    score = Math.max(0, Math.min(100, score));
    const level = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
    const status = score >= 70 ? 'sufficient' : score >= 50 ? 'warning' : 'insufficient';
    if (reasons.length === 0) {
        reasons.push('Context coverage is strong for this plan run.');
    }
    return {
        score,
        level,
        status,
        reasons,
        metrics,
    };
}
function displayPlanCoverageConfidence(coverage) {
    const scoreColor = coverage.level === 'high' ? chalk.green : coverage.level === 'medium' ? chalk.yellow : chalk.red;
    console.log(chalk.bold.white('Context Confidence:'), scoreColor(`${coverage.score}/100 (${coverage.level.toUpperCase()})`));
    if (coverage.level !== 'high') {
        for (const reason of coverage.reasons.slice(0, 3)) {
            console.log(chalk.dim(`  • ${reason}`));
        }
    }
}
function parseSnapshotMode(raw) {
    if (!raw)
        return null;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'auto' || normalized === 'full' || normalized === 'off') {
        return normalized;
    }
    return null;
}
function resolveSnapshotMode(optionMode) {
    if (process.env.NEURCODE_PLAN_SKIP_SNAPSHOTS === '1') {
        return 'off';
    }
    const optionParsed = parseSnapshotMode(optionMode);
    const envMode = parseSnapshotMode(process.env.NEURCODE_PLAN_SNAPSHOT_MODE);
    return optionParsed || envMode || 'auto';
}
function resolveSnapshotMaxFiles(mode, optionValue) {
    const envOverride = parsePositiveInt(process.env.NEURCODE_PLAN_SNAPSHOT_MAX_FILES);
    const configured = optionValue && optionValue > 0 ? Math.floor(optionValue) : envOverride;
    if (configured && configured > 0)
        return configured;
    return mode === 'full' ? 500 : 40;
}
function resolveSnapshotBudgetMs(mode, optionValue) {
    const envOverride = parsePositiveInt(process.env.NEURCODE_PLAN_SNAPSHOT_BUDGET_MS);
    const configured = optionValue && optionValue > 0 ? Math.floor(optionValue) : envOverride;
    if (typeof configured === 'number' && configured > 0)
        return configured;
    return mode === 'full' ? 0 : 60_000;
}
function resolveSnapshotMaxBytes(mode) {
    const envOverride = parsePositiveInt(process.env.NEURCODE_PLAN_SNAPSHOT_MAX_BYTES);
    if (typeof envOverride === 'number' && envOverride > 0)
        return envOverride;
    return mode === 'full' ? 0 : 256 * 1024;
}
function resolveSnapshotBatchSize(mode) {
    const envOverride = parsePositiveInt(process.env.NEURCODE_PLAN_SNAPSHOT_BATCH_SIZE);
    if (typeof envOverride === 'number' && envOverride > 0) {
        return Math.min(100, Math.max(1, envOverride));
    }
    return mode === 'full' ? 30 : 20;
}
function resolveSnapshotBatchTimeoutMs(singleRequestTimeoutMs, mode) {
    const envOverride = parsePositiveInt(process.env.NEURCODE_PLAN_SNAPSHOT_BATCH_TIMEOUT_MS);
    if (typeof envOverride === 'number' && envOverride > 0)
        return envOverride;
    const multiplier = mode === 'full' ? 5 : 4;
    return Math.max(singleRequestTimeoutMs * multiplier, 12000);
}
function isBatchSnapshotEndpointUnsupported(error) {
    if (!(error instanceof Error))
        return false;
    const message = error.message.toLowerCase();
    return (message.includes('status 404') ||
        message.includes('not found') ||
        message.includes('not_found') ||
        message.includes('method not allowed'));
}
function getSnapshotManifestPath(projectRoot) {
    return (0, path_1.join)(projectRoot, '.neurcode', 'snapshot-manifest.json');
}
function loadSnapshotManifest(projectRoot) {
    const manifestPath = getSnapshotManifestPath(projectRoot);
    if (!(0, fs_1.existsSync)(manifestPath)) {
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            entries: {},
        };
    }
    try {
        const parsed = JSON.parse((0, fs_1.readFileSync)(manifestPath, 'utf-8'));
        if (parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
            return {
                version: 1,
                updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
                entries: parsed.entries,
            };
        }
    }
    catch {
        // Ignore manifest parse errors and start fresh.
    }
    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        entries: {},
    };
}
function saveSnapshotManifest(projectRoot, manifest) {
    const manifestPath = getSnapshotManifestPath(projectRoot);
    const manifestDir = (0, path_1.join)(projectRoot, '.neurcode');
    if (!(0, fs_1.existsSync)(manifestDir)) {
        (0, fs_1.mkdirSync)(manifestDir, { recursive: true });
    }
    (0, fs_1.writeFileSync)(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}
function computeSnapshotHash(content) {
    return (0, crypto_1.createHash)('sha256').update(content, 'utf-8').digest('hex');
}
let activePlanScopeTelemetry = null;
function emitPlanJson(payload) {
    const merged = activePlanScopeTelemetry
        ? { ...payload, scope: activePlanScopeTelemetry }
        : payload;
    process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
}
function emitCachedPlanHit(input) {
    if (input.touchKey) {
        try {
            (0, plan_cache_1.readCachedPlan)(input.cwd, input.touchKey);
        }
        catch {
            // Ignore cache touch failures.
        }
    }
    const createdAtLabel = new Date(input.createdAt).toLocaleString();
    if (input.mode === 'near' && typeof input.similarity === 'number') {
        console.log(chalk.dim(`⚡ Using near-cached plan (similarity ${input.similarity.toFixed(2)}, created: ${createdAtLabel})\n`));
    }
    else {
        console.log(chalk.dim(`⚡ Using cached plan (created: ${createdAtLabel})\n`));
    }
    const persistedPlan = hasPersistedPlanId(input.response.planId);
    let changeContractPayload = null;
    if (persistedPlan) {
        try {
            const expectedFiles = input.response.plan.files
                .filter((file) => file.action !== 'BLOCK')
                .map((file) => file.path);
            const lockRead = (0, policy_packs_1.readPolicyLockFile)(input.cwd);
            const compiledPolicyRead = (0, policy_compiler_1.readCompiledPolicyArtifact)(input.cwd);
            const unsignedChangeContract = (0, change_contract_1.createChangeContract)({
                planId: input.response.planId,
                sessionId: input.response.sessionId || null,
                projectId: input.projectId || null,
                intent: input.response.plan.summary || 'cached-plan',
                expectedFiles,
                planFiles: mapPlanFilesForChangeContract(input.response.plan.files),
                expectedSymbols: (0, plan_symbols_1.mapPlanSymbolsForChangeContract)(input.response.plan),
                options: resolveChangeContractOptionsFromEnv(),
                policyLockFingerprint: lockRead.lock?.effective.fingerprint || null,
                compiledPolicyFingerprint: compiledPolicyRead.artifact?.fingerprint || null,
            });
            const changeContract = (0, artifact_signature_1.signGovernanceArtifact)(unsignedChangeContract, (0, artifact_signature_1.resolveGovernanceArtifactSigningConfigFromEnv)());
            const contractPath = (0, change_contract_1.writeChangeContract)(input.cwd, changeContract);
            changeContractPayload = {
                id: changeContract.contractId,
                path: contractPath,
            };
        }
        catch {
            // Non-fatal for cached plan reuse.
        }
    }
    if (input.jsonMode) {
        emitPlanJson({
            success: persistedPlan,
            cached: true,
            mode: input.intentMode,
            planId: persistedPlan ? input.response.planId : null,
            sessionId: input.response.sessionId || null,
            projectId: input.projectId || null,
            changeContract: changeContractPayload,
            timestamp: input.response.timestamp,
            telemetry: input.response.telemetry,
            message: persistedPlan
                ? `Using ${input.mode === 'near' ? 'near-' : ''}cached plan`
                : 'Plan generated but could not be persisted (missing planId)',
            plan: input.response.plan,
        });
    }
    else {
        displayPlan(input.response.plan);
        console.log(chalk.dim(`\nGenerated at: ${new Date(input.response.timestamp).toLocaleString()} (cached)`));
        if (persistedPlan) {
            console.log(chalk.bold.cyan(`\n📌 Plan ID: ${input.response.planId} (Cached)`));
            console.log(chalk.dim('   Run \'neurcode prompt\' to generate a Cursor/AI prompt.'));
            if (changeContractPayload) {
                console.log(chalk.dim(`   Change contract refreshed: ${changeContractPayload.path}`));
            }
        }
    }
    try {
        if (persistedPlan) {
            (0, state_1.setActivePlanId)(input.response.planId);
            (0, state_1.setLastPlanGeneratedAt)(new Date().toISOString());
        }
        if (input.response.sessionId) {
            (0, state_1.setSessionId)(input.response.sessionId);
        }
        (0, brain_context_1.recordBrainProgressEvent)(input.cwd, {
            orgId: input.orgId,
            projectId: input.projectId,
        }, {
            type: 'plan',
            planId: input.response.planId || undefined,
            note: input.mode === 'near'
                ? `cache_hit=near;similarity=${typeof input.similarity === 'number' ? input.similarity.toFixed(2) : 'n/a'}`
                : 'cache_hit=exact',
        });
    }
    catch {
        // ignore state write errors
    }
    return persistedPlan;
}
async function planCommand(intent, options) {
    const suppressHumanLogs = options.json === true;
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    if (suppressHumanLogs) {
        console.log = (() => undefined);
        console.warn = (() => undefined);
    }
    const planStartedAtMs = Date.now();
    let planRootForSlo = (0, path_1.resolve)(process.cwd());
    try {
        planRootForSlo = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    }
    catch {
        // Fallback to current working directory when root resolution fails.
    }
    let planIntentModeForSlo = 'implementation';
    let planCachedForSlo = false;
    let planSuccessForSlo = false;
    let planEscalationPolicyForSlo = null;
    let planEscalationKillSwitchTrippedForSlo = false;
    let planEscalationKillSwitchCooldownUntilForSlo = null;
    let planSloEventFlushed = false;
    const flushPlanSloEvent = (exitCode) => {
        if (planSloEventFlushed) {
            return;
        }
        planSloEventFlushed = true;
        const coverageMetrics = coverageConfidence?.metrics;
        const rssKb = Math.max(0, Math.floor(process.memoryUsage().rss / 1024));
        try {
            (0, plan_slo_1.appendPlanSloEvent)(planRootForSlo, {
                timestamp: new Date().toISOString(),
                intentMode: planIntentModeForSlo,
                cached: planCachedForSlo,
                success: planSuccessForSlo && exitCode === 0,
                exitCode,
                elapsedMs: Math.max(0, Date.now() - planStartedAtMs),
                rssKb,
                coverageScore: coverageConfidence?.score ?? null,
                coverageLevel: coverageConfidence?.level ?? null,
                coverageStatus: coverageConfidence?.status ?? null,
                adaptiveEscalationTriggered: coverageMetrics?.adaptiveEscalationTriggered === true,
                adaptiveEscalationReason: coverageMetrics?.adaptiveEscalationReason || null,
                adaptiveEscalationDeepenedFiles: coverageMetrics?.adaptiveEscalationDeepenedFiles || 0,
                escalationPolicyEnabled: planEscalationPolicyForSlo?.enabled ?? null,
                escalationPolicyReason: planEscalationPolicyForSlo?.reason ?? null,
                escalationCanaryPercent: planEscalationPolicyForSlo?.canaryPercent ?? null,
                escalationCanaryBucket: planEscalationPolicyForSlo?.canaryBucket ?? null,
                escalationKillSwitchTripped: planEscalationKillSwitchTrippedForSlo,
                escalationKillSwitchCooldownUntil: planEscalationKillSwitchCooldownUntilForSlo || planEscalationPolicyForSlo?.cooldownUntil || null,
                fileTreeCount: coverageMetrics?.fileTreeCount ?? null,
                filesUsedForGeneration: coverageMetrics?.filesUsedForGeneration ?? null,
            });
        }
        catch {
            // SLO logging is best-effort and should never block plan command.
        }
    };
    const onPlanProcessExit = (code) => {
        flushPlanSloEvent(code);
    };
    process.once('exit', onPlanProcessExit);
    let coverageConfidence;
    let generatedChangeContract = null;
    try {
        if (!intent || !intent.trim()) {
            if (options.json) {
                emitPlanJson({
                    success: false,
                    cached: false,
                    mode: 'implementation',
                    planId: null,
                    sessionId: null,
                    projectId: options.projectId || null,
                    timestamp: new Date().toISOString(),
                    message: 'Intent cannot be empty',
                });
            }
            console.error(chalk.red('❌ Error: Intent cannot be empty. What are you building?'));
            console.log(chalk.dim('Usage: neurcode plan "<your intent description>"'));
            console.log(chalk.dim('Example: neurcode plan "Add user authentication to login page"'));
            process.exit(1);
        }
        if (options.snapshotMode) {
            const parsedSnapshotMode = parseSnapshotMode(String(options.snapshotMode));
            if (!parsedSnapshotMode) {
                if (options.json) {
                    emitPlanJson({
                        success: false,
                        cached: false,
                        mode: 'implementation',
                        planId: null,
                        sessionId: null,
                        projectId: options.projectId || null,
                        timestamp: new Date().toISOString(),
                        message: `Invalid --snapshot-mode "${options.snapshotMode}". Expected: auto | full | off.`,
                    });
                }
                console.error(chalk.red(`❌ Invalid --snapshot-mode "${options.snapshotMode}". Expected: auto | full | off.`));
                process.exit(1);
            }
        }
        // Load configuration first (needed for TicketService)
        const config = (0, config_1.loadConfig)();
        // API URL is automatically set to production - no need to check
        // Require API key (shows helpful error message if missing)
        // This will exit with helpful message if key is not found
        if (!config.apiKey) {
            config.apiKey = (0, config_1.requireApiKey)();
        }
        // Initialize API client (needed for TicketService)
        const client = new api_client_1.ApiClient(config);
        // ─── Fast Path: Local Plan Cache (Multi-Tenant Safe) ────────────────
        // If the same user/org/project runs the same intent against the same repo snapshot,
        // return the cached plan immediately (no network, no file scanning).
        const rootResolution = (0, project_root_1.resolveNeurcodeProjectRootWithTrace)(process.cwd());
        const cwd = rootResolution.projectRoot;
        activePlanScopeTelemetry = (0, scope_telemetry_1.buildScopeTelemetryPayload)(rootResolution);
        if (!options.json) {
            (0, scope_telemetry_1.printScopeTelemetry)(chalk, activePlanScopeTelemetry, {
                includeBlockedWarning: true,
            });
        }
        const homeDir = (0, path_1.resolve)(process.env.HOME || process.env.USERPROFILE || '');
        if (homeDir &&
            cwd === homeDir &&
            process.cwd() !== homeDir &&
            process.env.NEURCODE_ALLOW_HOME_ROOT !== '1') {
            const message = [
                'Resolved project root points to your home directory, which can mix unrelated repositories.',
                'Run `neurcode init` from this repository root to isolate Neurcode state.',
                'Set NEURCODE_ALLOW_HOME_ROOT=1 only if you intentionally want home-directory scope.',
            ].join(' ');
            if (options.json) {
                emitPlanJson({
                    success: false,
                    cached: false,
                    mode: 'implementation',
                    planId: null,
                    sessionId: null,
                    projectId: options.projectId || null,
                    timestamp: new Date().toISOString(),
                    message,
                });
            }
            console.error(chalk.red(`❌ ${message}`));
            process.exit(1);
        }
        const orgId = (0, state_1.getOrgId)();
        const stateProjectId = (0, state_1.getProjectId)();
        const finalProjectIdEarly = options.projectId || stateProjectId || config.projectId;
        const shouldUseCache = options.cache !== false && process.env.NEURCODE_PLAN_NO_CACHE !== '1';
        const normalizedIntent = (0, plan_cache_1.normalizeIntent)(intent);
        const intentMode = detectIntentMode(intent);
        planIntentModeForSlo = intentMode;
        const isReadOnlyAnalysis = intentMode === 'analysis';
        const nearIntentSimilarityFloor = isReadOnlyAnalysis ? 0.66 : undefined;
        const policyVersionHash = (0, plan_cache_1.computePolicyVersionHash)(cwd);
        const neurcodeVersion = (0, plan_cache_1.getNeurcodeVersion)();
        // Create a local, gitignored context file scaffold (similar to CLAUDE.md workflows),
        // so teams/users have a predictable place to add project-specific guidance.
        // This runs only on interactive terminals to avoid polluting CI checkouts.
        if (process.stdout.isTTY && !process.env.CI) {
            (0, neurcode_context_1.ensureDefaultLocalContextFile)(cwd);
        }
        const staticContextEarly = (0, neurcode_context_1.loadStaticNeurcodeContext)(cwd, orgId && finalProjectIdEarly ? { orgId, projectId: finalProjectIdEarly } : undefined);
        const ticketRef = options.issue
            ? `github_issue:${options.issue}`
            : options.pr
                ? `github_pr:${options.pr}`
                : options.ticket
                    ? `ticket:${options.ticket}`
                    : undefined;
        const promptHashEarly = (0, plan_cache_1.computePromptHash)({
            intent: normalizedIntent,
            ticketRef,
            contextHash: staticContextEarly.hash,
        });
        const gitFingerprint = (0, plan_cache_1.getGitRepoFingerprint)(cwd);
        if (shouldUseCache && orgId && finalProjectIdEarly && gitFingerprint) {
            const key = (0, plan_cache_1.computePlanCacheKey)({
                schemaVersion: 2,
                orgId,
                projectId: finalProjectIdEarly,
                repo: gitFingerprint,
                promptHash: promptHashEarly,
                policyVersionHash,
                neurcodeVersion,
            });
            const cached = (0, plan_cache_1.readCachedPlan)(cwd, key);
            if (cached) {
                const persisted = emitCachedPlanHit({
                    cwd,
                    response: cached.response,
                    createdAt: cached.createdAt,
                    mode: 'exact',
                    orgId,
                    projectId: finalProjectIdEarly,
                    jsonMode: options.json === true,
                    intentMode,
                });
                planCachedForSlo = true;
                planSuccessForSlo = persisted;
                if (!persisted)
                    process.exit(2);
                flushPlanSloEvent(0);
                process.removeListener('exit', onPlanProcessExit);
                return;
            }
            const near = (0, plan_cache_1.findNearCachedPlan)(cwd, {
                orgId,
                projectId: finalProjectIdEarly,
                repo: gitFingerprint,
                intent: normalizedIntent,
                policyVersionHash,
                neurcodeVersion,
                ticketRef,
                contextHash: staticContextEarly.hash,
                minIntentSimilarity: nearIntentSimilarityFloor,
            });
            if (near) {
                const persisted = emitCachedPlanHit({
                    cwd,
                    response: near.entry.response,
                    createdAt: near.entry.createdAt,
                    mode: 'near',
                    similarity: near.intentSimilarity,
                    orgId,
                    projectId: finalProjectIdEarly,
                    touchKey: near.entry.key,
                    jsonMode: options.json === true,
                    intentMode,
                });
                planCachedForSlo = true;
                planSuccessForSlo = persisted;
                if (!persisted)
                    process.exit(2);
                flushPlanSloEvent(0);
                process.removeListener('exit', onPlanProcessExit);
                return;
            }
            const miss = (0, plan_cache_1.diagnosePlanCacheMiss)(cwd, {
                orgId,
                projectId: finalProjectIdEarly,
                repo: gitFingerprint,
                intent: normalizedIntent,
                policyVersionHash,
                neurcodeVersion,
            });
            console.log(chalk.dim(`🧠 Cache miss: ${renderCacheMissReason(miss.reason, miss.bestIntentSimilarity)}`));
        }
        // Initialize Security Guard, Ticket Service, and Project Knowledge Service
        const { SecurityGuard } = await Promise.resolve().then(() => __importStar(require('../services/security/SecurityGuard')));
        const { TicketService } = await Promise.resolve().then(() => __importStar(require('../services/integrations/TicketService')));
        const { ProjectKnowledgeService } = await Promise.resolve().then(() => __importStar(require('../services/project-knowledge-service')));
        const securityGuard = new SecurityGuard();
        const ticketService = new TicketService(client);
        const projectKnowledgeService = new ProjectKnowledgeService();
        let enrichedIntent = intent.trim();
        let ticketMetadata;
        // Step 1: Fetch ticket context if --issue, --pr, or --ticket is provided
        if (options.issue) {
            try {
                console.log(chalk.dim(`🎫 Fetching GitHub issue: ${options.issue}...`));
                const ticketContext = await ticketService.fetchGitHubTicketAndEnrich(options.issue, 'issue', intent.trim(), cwd);
                enrichedIntent = ticketContext.enrichedIntent;
                ticketMetadata = {
                    id: ticketContext.ticket.id,
                    title: ticketContext.ticket.title,
                    description: ticketContext.ticket.description,
                    acceptanceCriteria: ticketContext.ticket.acceptanceCriteria,
                };
                console.log(chalk.green(`✅ Issue context loaded: ${ticketContext.ticket.title}`));
            }
            catch (error) {
                console.error(chalk.red(`❌ Error fetching GitHub issue ${options.issue}:`));
                console.error(chalk.red(error instanceof Error ? error.message : String(error)));
                process.exit(1);
            }
        }
        else if (options.pr) {
            try {
                console.log(chalk.dim(`🎫 Fetching GitHub PR: ${options.pr}...`));
                const ticketContext = await ticketService.fetchGitHubTicketAndEnrich(options.pr, 'pr', intent.trim(), cwd);
                enrichedIntent = ticketContext.enrichedIntent;
                ticketMetadata = {
                    id: ticketContext.ticket.id,
                    title: ticketContext.ticket.title,
                    description: ticketContext.ticket.description,
                    acceptanceCriteria: ticketContext.ticket.acceptanceCriteria,
                };
                console.log(chalk.green(`✅ PR context loaded: ${ticketContext.ticket.title}`));
            }
            catch (error) {
                console.error(chalk.red(`❌ Error fetching GitHub PR ${options.pr}:`));
                console.error(chalk.red(error instanceof Error ? error.message : String(error)));
                process.exit(1);
            }
        }
        else if (options.ticket) {
            try {
                console.log(chalk.dim(`🎫 Fetching ticket context: ${options.ticket}...`));
                const ticketContext = await ticketService.fetchTicketAndEnrich(options.ticket, intent.trim());
                enrichedIntent = ticketContext.enrichedIntent;
                ticketMetadata = {
                    id: ticketContext.ticket.id,
                    title: ticketContext.ticket.title,
                    description: ticketContext.ticket.description,
                    acceptanceCriteria: ticketContext.ticket.acceptanceCriteria,
                };
                console.log(chalk.green(`✅ Ticket context loaded: ${ticketContext.ticket.title}`));
            }
            catch (error) {
                console.error(chalk.red(`❌ Error fetching ticket ${options.ticket}:`));
                console.error(chalk.red(error instanceof Error ? error.message : String(error)));
                process.exit(1);
            }
        }
        // CRITICAL: Check state file FIRST for headless workflow support
        // Priority: state file (.neurcode/config.json) > config > auto-detection
        let projectId = (0, state_1.getProjectId)(); // Priority 1: State file (headless-friendly)
        // Fallback to config if state file doesn't have projectId
        if (!projectId) {
            projectId = config.projectId || null;
        }
        // Only auto-detect if we still don't have a projectId (interactive mode)
        if (!projectId) {
            try {
                const projectInfo = (0, project_detector_1.detectProject)();
                if (projectInfo.gitUrl) {
                    // We have a Git URL - connect the project
                    console.log(chalk.dim(`🔗 Connecting project: ${projectInfo.name || 'detecting...'}`));
                    const project = await client.ensureProject(projectInfo.gitUrl, projectInfo.name || undefined);
                    projectId = project.id;
                    // Save projectId to state file (.neurcode/config.json)
                    const { setProjectId } = await Promise.resolve().then(() => __importStar(require('../utils/state')));
                    setProjectId(projectId);
                    console.log(chalk.green(`✅ Project connected: ${project.name}`));
                    console.log(chalk.dim(`   Project ID saved to .neurcode/config.json\n`));
                }
                else {
                    // No Git URL - use name-based project (will be created by API if needed)
                    console.log(chalk.dim(`📁 Using project: ${projectInfo.name || 'default'}\n`));
                }
            }
            catch (error) {
                // If project connection fails, continue without it (graceful degradation)
                console.warn(chalk.yellow(`⚠️  Could not connect project: ${error.message}`));
                console.log(chalk.dim('   Continuing without project linking...\n'));
                // Log full error in debug mode
                if (process.env.DEBUG) {
                    console.error(error);
                }
            }
        }
        // SAFETY: Guard clause to prevent orphan sessions - ensure projectId is set before proceeding
        // After all auto-detection attempts, verify we have a valid projectId
        // This matches the finalProjectId logic used later in the function
        const finalProjectIdForGuard = options.projectId || projectId || config.projectId;
        if (!finalProjectIdForGuard) {
            console.log(chalk.yellow('⚠️  No project initialized. Running init first...\n'));
            const { initCommand } = await Promise.resolve().then(() => __importStar(require('./init')));
            await initCommand();
            return;
        }
        const brainScope = {
            orgId: orgId || null,
            projectId: finalProjectIdForGuard || null,
        };
        // Step B: Scan file tree (paths only, no content)
        console.log(chalk.dim(`📂 Scanning file tree in ${cwd}...`));
        const planFileTreeMaxFiles = Math.min(parsePositiveInt(process.env.NEURCODE_PLAN_FILE_TREE_MAX_FILES) ?? 200, 5000);
        const fileTree = scanFiles(cwd, cwd, planFileTreeMaxFiles);
        if (fileTree.length === 0) {
            console.warn(chalk.yellow('⚠️  No files found in current directory'));
            process.exit(1);
        }
        console.log(chalk.dim(`Found ${fileTree.length} files in project`));
        if (fileTree.length >= planFileTreeMaxFiles) {
            console.log(chalk.dim(`📎 File tree context capped at ${planFileTreeMaxFiles} files. Set NEURCODE_PLAN_FILE_TREE_MAX_FILES to increase.`));
        }
        // Load Neurcode static context (repo + local + org/project) early so it can:
        // - influence plan generation
        // - participate in the cache key (avoid stale cached plans after context edits)
        const staticContext = (0, neurcode_context_1.loadStaticNeurcodeContext)(cwd, orgId && finalProjectIdForGuard ? { orgId, projectId: finalProjectIdForGuard } : undefined);
        // Incremental Brain refresh: keep context in sync with human progress even when watch is not running.
        if (orgId && finalProjectIdForGuard) {
            try {
                const refresh = (0, brain_context_1.refreshBrainContextFromWorkspace)(cwd, brainScope, {
                    workingTreeHash: gitFingerprint?.kind === 'git' ? gitFingerprint.workingTreeHash : undefined,
                    maxFiles: 80,
                    recordEvent: false,
                });
                if (refresh.refreshed && (refresh.indexed > 0 || refresh.removed > 0)) {
                    console.log(chalk.dim(`🧠 Brain refresh: indexed ${refresh.indexed}, removed ${refresh.removed}, considered ${refresh.considered}`));
                }
            }
            catch {
                // Brain refresh should never block plan generation.
            }
        }
        // If we couldn't use the git-based fast path (non-git projects), try a filesystem-based cache hit
        // after we have the file tree fingerprint.
        if (shouldUseCache && orgId && finalProjectIdForGuard && !gitFingerprint) {
            const fsFingerprint = (0, plan_cache_1.getFilesystemFingerprintFromTree)(fileTree, cwd);
            const promptHash = (0, plan_cache_1.computePromptHash)({
                intent: normalizedIntent,
                ticketRef,
                contextHash: staticContext.hash,
            });
            const key = (0, plan_cache_1.computePlanCacheKey)({
                schemaVersion: 2,
                orgId,
                projectId: finalProjectIdForGuard,
                repo: fsFingerprint,
                promptHash,
                policyVersionHash,
                neurcodeVersion,
            });
            const cached = (0, plan_cache_1.readCachedPlan)(cwd, key);
            if (cached) {
                const persisted = emitCachedPlanHit({
                    cwd,
                    response: cached.response,
                    createdAt: cached.createdAt,
                    mode: 'exact',
                    orgId,
                    projectId: finalProjectIdForGuard,
                    jsonMode: options.json === true,
                    intentMode,
                });
                planCachedForSlo = true;
                planSuccessForSlo = persisted;
                if (!persisted)
                    process.exit(2);
                flushPlanSloEvent(0);
                process.removeListener('exit', onPlanProcessExit);
                return;
            }
            const near = (0, plan_cache_1.findNearCachedPlan)(cwd, {
                orgId,
                projectId: finalProjectIdForGuard,
                repo: fsFingerprint,
                intent: normalizedIntent,
                policyVersionHash,
                neurcodeVersion,
                ticketRef,
                contextHash: staticContext.hash,
                minIntentSimilarity: nearIntentSimilarityFloor,
            });
            if (near) {
                const persisted = emitCachedPlanHit({
                    cwd,
                    response: near.entry.response,
                    createdAt: near.entry.createdAt,
                    mode: 'near',
                    similarity: near.intentSimilarity,
                    orgId,
                    projectId: finalProjectIdForGuard,
                    touchKey: near.entry.key,
                    jsonMode: options.json === true,
                    intentMode,
                });
                planCachedForSlo = true;
                planSuccessForSlo = persisted;
                if (!persisted)
                    process.exit(2);
                flushPlanSloEvent(0);
                process.removeListener('exit', onPlanProcessExit);
                return;
            }
            const miss = (0, plan_cache_1.diagnosePlanCacheMiss)(cwd, {
                orgId,
                projectId: finalProjectIdForGuard,
                repo: fsFingerprint,
                intent: normalizedIntent,
                policyVersionHash,
                neurcodeVersion,
            });
            console.log(chalk.dim(`🧠 Cache miss: ${renderCacheMissReason(miss.reason, miss.bestIntentSimilarity)}`));
        }
        // Step 2: Build enhanced intent with static context + org/project memory (before any LLM call)
        let enhancedIntent = enrichedIntent;
        if (staticContext.text) {
            enhancedIntent = `${enhancedIntent}\n\n${staticContext.text}`;
        }
        if (orgId && finalProjectIdForGuard) {
            const memoryTail = (0, neurcode_context_1.loadOrgProjectMemoryTail)(cwd, orgId, finalProjectIdForGuard);
            if (memoryTail) {
                enhancedIntent = `${enhancedIntent}\n\n${memoryTail}`;
            }
        }
        if (isReadOnlyAnalysis) {
            console.log(chalk.dim('🔎 Read-only analysis mode enabled (no-code intent detected)'));
            enhancedIntent = applyReadOnlyDirective(enhancedIntent);
        }
        // Retrieval augmentation: include a repo-grounded live context pack (file summaries + recent progress events).
        if (orgId && finalProjectIdForGuard) {
            try {
                const pack = (0, brain_context_1.buildBrainContextPack)(cwd, brainScope, normalizedIntent, {
                    maxFiles: 8,
                    maxEvents: 6,
                    maxBytes: 10 * 1024,
                });
                if (pack.text) {
                    enhancedIntent = `${enhancedIntent}\n\n${pack.text}`;
                    console.log(chalk.dim(`🧠 Brain context: ${pack.selectedFiles} relevant file summary(s), ${pack.recentEvents} recent event(s) from ${pack.totalIndexedFiles} indexed file(s)`));
                }
            }
            catch {
                // Brain context pack should never block plan generation.
            }
        }
        // Step 3: Load or create asset map for context injection (toolbox summary)
        let assetMapForCoverage = null;
        try {
            const assetMapResolution = await ensureAssetMap(cwd, enrichedIntent);
            const map = assetMapResolution.map;
            assetMapForCoverage = map;
            if (assetMapResolution.escalationPolicy) {
                planEscalationPolicyForSlo = assetMapResolution.escalationPolicy;
            }
            if (assetMapResolution.escalationKillSwitchTripped) {
                planEscalationKillSwitchTrippedForSlo = true;
            }
            if (assetMapResolution.escalationKillSwitchCooldownUntil) {
                planEscalationKillSwitchCooldownUntilForSlo = assetMapResolution.escalationKillSwitchCooldownUntil;
            }
            if (assetMapResolution.generated) {
                console.log(chalk.dim('♻️  Generated fresh asset map for this repository.'));
            }
            else if (assetMapResolution.refreshed) {
                console.log(chalk.dim(`♻️  Refreshed asset map (${assetMapResolution.refreshReason || 'policy_trigger'}).`));
            }
            else if (assetMapResolution.refreshFailed) {
                console.log(chalk.yellow(`⚠️  Asset map refresh failed (${assetMapResolution.refreshReason || 'unknown'}), using previous cached map.`));
            }
            if (assetMapResolution.escalationPolicy && (assetMapResolution.generated || assetMapResolution.refreshed)) {
                const escalationPolicy = assetMapResolution.escalationPolicy;
                if (escalationPolicy.enabled) {
                    console.log(chalk.dim(`🧪 Escalation policy: enabled (canary=${escalationPolicy.canaryBucket}/${escalationPolicy.canaryPercent}).`));
                }
                else {
                    let detail = `reason=${escalationPolicy.reason}`;
                    if (escalationPolicy.reason === 'canary_excluded') {
                        detail += `, canary=${escalationPolicy.canaryBucket}/${escalationPolicy.canaryPercent}`;
                    }
                    if (escalationPolicy.reason === 'kill_switch_cooldown' && escalationPolicy.cooldownUntil) {
                        detail += `, cooldownUntil=${escalationPolicy.cooldownUntil}`;
                    }
                    console.log(chalk.yellow(`⚠️  Adaptive escalation disabled (${detail}).`));
                }
            }
            if (assetMapResolution.escalationKillSwitchTripped) {
                console.log(chalk.yellow(`⚠️  Escalation kill switch tripped; cooldown active until ${assetMapResolution.escalationKillSwitchCooldownUntil || 'later'}.`));
            }
            if (map && map.globalExports.length > 0) {
                if (map.scanStats?.cappedByMaxSourceFiles) {
                    console.log(chalk.yellow(`⚠️  Asset map coverage capped at ${map.scanStats.indexedSourceFiles} files (limit ${map.scanStats.maxSourceFiles}).`));
                    console.log(chalk.dim('   Increase NEURCODE_ASSET_MAP_MAX_FILES for broader coverage.'));
                }
                if ((map.scanStats?.skippedBySize || 0) > 0) {
                    console.log(chalk.dim(`📦 Asset map shallow-indexed ${map.scanStats?.skippedBySize} oversized source files (> ${map.scanStats?.maxFileBytes} bytes).`));
                }
                if ((map.scanStats?.shallowIndexFailures || 0) > 0) {
                    console.log(chalk.yellow(`⚠️  Asset map could not shallow-index ${map.scanStats?.shallowIndexFailures} oversized file(s).`));
                }
                if ((map.scanStats?.adaptiveDeepenedFiles || 0) > 0) {
                    console.log(chalk.dim(`🧠 Adaptive deepened ${map.scanStats?.adaptiveDeepenedFiles} oversized file(s) for this intent.`));
                }
                if ((map.scanStats?.adaptiveDeepenSkippedBudget || 0) > 0) {
                    console.log(chalk.dim(`📎 Adaptive deepening skipped ${map.scanStats?.adaptiveDeepenSkippedBudget} candidate(s) due to budget.`));
                }
                if (map.scanStats?.adaptiveEscalationTriggered) {
                    const escalationReason = map.scanStats?.adaptiveEscalationReason || 'policy_trigger';
                    console.log(chalk.dim(`🎯 Adaptive escalation pass triggered (${escalationReason}).`));
                }
                if ((map.scanStats?.adaptiveEscalationDeepenedFiles || 0) > 0) {
                    console.log(chalk.dim(`🚀 Escalation deepened ${map.scanStats?.adaptiveEscalationDeepenedFiles} additional oversized file(s).`));
                }
                if ((map.scanStats?.adaptiveEscalationSkippedBudget || 0) > 0) {
                    console.log(chalk.dim(`📎 Escalation skipped ${map.scanStats?.adaptiveEscalationSkippedBudget} candidate(s) due to escalation budget limits.`));
                }
                // Pass intent to generateToolboxSummary for relevance filtering
                const toolboxSummary = (0, toolbox_service_1.generateToolboxSummary)(map, enrichedIntent);
                if (toolboxSummary) {
                    // Inject toolbox summary into intent (append; do not override context blocks)
                    enhancedIntent = `${enhancedIntent}\n\n${toolboxSummary}\n\nIMPORTANT: The "Available Tools" list above shows existing code that CAN be reused. Only reference tools from this list if they are directly relevant to the user's intent. Do not create new files, functions, or features unless the user explicitly requested them. The list is for reference only - not a requirement to use everything.`;
                    console.log(chalk.dim(`📦 Loaded ${map.globalExports.length} exported assets, showing top 20 most relevant`));
                }
            }
        }
        catch (error) {
            // If asset map loading fails, continue without it (graceful degradation)
            if (process.env.DEBUG) {
                console.warn(chalk.yellow(`⚠️  Could not load asset map: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
        }
        // Retrieval augmentation: include summaries from similar cached plans (org+project scoped)
        if (shouldUseCache && orgId && finalProjectIdForGuard) {
            const repoIdentityForSimilarity = gitFingerprint
                ? gitFingerprint.repoIdentity
                : (0, plan_cache_1.getFilesystemFingerprintFromTree)(fileTree, cwd).repoIdentity;
            const similar = (0, plan_cache_1.findSimilarCachedPlans)(cwd, {
                orgId,
                projectId: finalProjectIdForGuard,
                repoIdentity: repoIdentityForSimilarity,
            }, normalizedIntent, 3);
            if (similar.length > 0) {
                const memoryLines = [];
                memoryLines.push('PROJECT MEMORY (recent Neurcode plans in this repo; use only if relevant):');
                similar.forEach((p, idx) => {
                    const summary = (p.response.plan.summary || '').trim().slice(0, 600);
                    const files = p.response.plan.files?.slice(0, 12).map(f => `${f.action}:${f.path}`).join(', ') || '';
                    memoryLines.push(`${idx + 1}) intent=\"${p.input.intent}\"`);
                    if (summary)
                        memoryLines.push(`   summary=\"${summary}\"`);
                    if (files)
                        memoryLines.push(`   files=${files}`);
                    if (p.response.planId && p.response.planId !== 'unknown')
                        memoryLines.push(`   planId=${p.response.planId}`);
                });
                memoryLines.push('');
                enhancedIntent = `${enhancedIntent}\n\n${memoryLines.join('\n')}`;
            }
        }
        // Step 4: Pre-Flight Security Check - Scan for secrets (on full enhanced intent)
        console.log(chalk.dim('🛡️  Running security scan...'));
        const scanResult = await securityGuard.scanAndMask(enhancedIntent, fileTree, cwd);
        if (scanResult.hasSecrets) {
            const secretCount = scanResult.secrets.length;
            const secretFiles = new Set(scanResult.secrets.map(s => s.location));
            // Log ROI event for secret interception (non-blocking)
            try {
                (0, ROILogger_1.logROIEvent)('SECRET_INTERCEPTED', {
                    secretCount,
                    secretTypes: Array.from(new Set(scanResult.secrets.map(s => s.type))),
                    locations: Array.from(secretFiles),
                    masked: options.mask !== false,
                }, finalProjectIdForGuard || null).catch(() => {
                    // Silently ignore - ROI logging should never block user workflows
                });
            }
            catch {
                // Silently ignore - ROI logging should never block user workflows
            }
            if (options.mask !== false) {
                // Mask mode: Auto-replace secrets and log warnings
                console.log(chalk.yellow(`\n⚠️  Secret detected and masked (${secretCount} occurrence(s)):`));
                scanResult.secrets.forEach(secret => {
                    console.log(chalk.yellow(`   ${secret.severity.toUpperCase()}: ${secret.type} in ${secret.location}`));
                });
                if (scanResult.maskedIntent) {
                    enhancedIntent = scanResult.maskedIntent;
                }
                console.log(chalk.green('\n✅ Secrets masked - proceeding with plan generation'));
            }
            else {
                // No-mask mode: Abort and require user intervention
                console.error(chalk.red(`\n❌ SECRET DETECTED - Command aborted`));
                console.error(chalk.red(`Found ${secretCount} secret(s) in ${secretFiles.size} file(s):`));
                scanResult.secrets.forEach(secret => {
                    console.error(chalk.red(`   ${secret.severity.toUpperCase()}: ${secret.type} in ${secret.location}`));
                });
                console.log(chalk.yellow('\n💡 To auto-mask secrets, run with --mask flag (default)'));
                console.log(chalk.yellow('   Or remove secrets from your code before running neurcode plan'));
                process.exit(1);
            }
        }
        else {
            console.log(chalk.green('✅ Security scan passed - no secrets detected'));
        }
        // Check for active sessions before creating a new one
        const finalProjectId = options.projectId || projectId || config.projectId;
        if (finalProjectId && process.stdout.isTTY && !process.env.CI && !isReadOnlyAnalysis) {
            try {
                const sessions = await client.getSessions(finalProjectId, 10);
                const activeSessions = sessions.filter(s => s.status === 'active');
                if (activeSessions.length > 0) {
                    console.log(chalk.yellow(`\n⚠️  You have ${activeSessions.length} active session(s):\n`));
                    activeSessions.slice(0, 3).forEach((session, index) => {
                        const title = session.title || session.intentDescription || 'Untitled';
                        console.log(chalk.dim(`   ${index + 1}. ${title}`));
                    });
                    if (activeSessions.length > 3) {
                        console.log(chalk.dim(`   ... and ${activeSessions.length - 3} more`));
                    }
                    console.log('');
                    const { createInterface } = await Promise.resolve().then(() => __importStar(require('readline/promises')));
                    const { stdin, stdout } = await Promise.resolve().then(() => __importStar(require('process')));
                    try {
                        const rl = createInterface({ input: stdin, output: stdout });
                        const answer = await rl.question(chalk.bold('End previous session(s) before starting new one? (y/n): '));
                        rl.close();
                        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                            console.log(chalk.dim('\n💡 Tip: Run "neurcode session end" to manage sessions, or continue to create a new session.\n'));
                        }
                    }
                    catch {
                        // If prompt fails, continue silently
                    }
                }
            }
            catch (error) {
                // Non-critical - continue if we can't check sessions
                if (process.env.DEBUG) {
                    console.log(chalk.dim('Could not check active sessions'));
                }
            }
        }
        // Step A: Get project knowledge (tech stack + architecture)
        let projectSummary;
        try {
            const projectKnowledge = await projectKnowledgeService.getProjectSummary(cwd);
            projectSummary = projectKnowledge.summary;
            if (process.env.DEBUG) {
                console.log(chalk.dim(`📊 Project context: ${projectSummary}`));
            }
        }
        catch (error) {
            // Non-critical - continue without project summary
            if (process.env.DEBUG) {
                console.warn(chalk.yellow(`⚠️  Could not load project knowledge: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
        }
        // Step C: Pass 1 - The Semantic Scout (select relevant files)
        console.log(chalk.dim('🔍 Semantic Scout: Selecting relevant files...'));
        let selectedFiles = [];
        let usedFallbackSelection = false;
        try {
            selectedFiles = await client.selectFiles(enhancedIntent, fileTree, projectSummary);
            // Handle empty selection (fallback to top 10 files)
            if (selectedFiles.length === 0) {
                console.log(chalk.yellow('⚠️  No files selected by Semantic Scout, using fallback (top 10 files)'));
                selectedFiles = fileTree.slice(0, 10);
                usedFallbackSelection = true;
            }
            console.log(chalk.green(`✅ Semantic Scout selected ${selectedFiles.length} file(s) from ${fileTree.length} total`));
            if (process.env.DEBUG) {
                console.log(chalk.dim(`Selected files: ${selectedFiles.join(', ')}`));
            }
        }
        catch (error) {
            // Fallback: use top 10 files if selection fails
            console.warn(chalk.yellow(`⚠️  File selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
            console.log(chalk.yellow('   Using fallback: top 10 files from tree'));
            selectedFiles = fileTree.slice(0, 10);
            usedFallbackSelection = true;
        }
        // Step D: Content Load - Verify selected files exist and are readable
        const validFiles = [];
        for (const filePath of selectedFiles) {
            const fullPath = (0, path_1.join)(cwd, filePath);
            try {
                if ((0, fs_1.existsSync)(fullPath)) {
                    // Verify file is readable
                    (0, fs_1.readFileSync)(fullPath, 'utf-8');
                    validFiles.push(filePath);
                }
                else {
                    if (process.env.DEBUG) {
                        console.warn(chalk.yellow(`⚠️  Selected file does not exist: ${filePath}`));
                    }
                }
            }
            catch (error) {
                if (process.env.DEBUG) {
                    console.warn(chalk.yellow(`⚠️  Cannot read selected file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`));
                }
            }
        }
        // Ensure we have at least some files
        let filesToUse = validFiles.length > 0 ? validFiles : fileTree.slice(0, 10);
        if (validFiles.length < selectedFiles.length) {
            console.log(chalk.yellow(`⚠️  ${selectedFiles.length - validFiles.length} selected file(s) could not be read, using ${filesToUse.length} valid file(s)`));
        }
        if (isReadOnlyAnalysis && filesToUse.length > 8) {
            filesToUse = filesToUse.slice(0, 8);
            console.log(chalk.dim(`🔎 Analysis mode: narrowed to ${filesToUse.length} top file(s)`));
        }
        coverageConfidence = buildPlanCoverageConfidence({
            fileTreeCount: fileTree.length,
            fileTreeCapped: fileTree.length >= planFileTreeMaxFiles,
            selectedByScout: selectedFiles.length,
            readableSelected: validFiles.length,
            filesUsedForGeneration: filesToUse.length,
            usedFallbackSelection,
            assetMap: assetMapForCoverage,
        });
        displayPlanCoverageConfidence(coverageConfidence);
        const minConfidenceScore = parseConfidenceScoreThreshold(process.env.NEURCODE_PLAN_MIN_CONFIDENCE_SCORE);
        if (minConfidenceScore !== null && coverageConfidence.score < minConfidenceScore) {
            const message = [
                `Context confidence score ${coverageConfidence.score}/100 is below required threshold ${minConfidenceScore}.`,
                'Increase file/asset-map coverage or relax NEURCODE_PLAN_MIN_CONFIDENCE_SCORE.',
            ].join(' ');
            if (options.json) {
                emitPlanJson({
                    success: false,
                    cached: false,
                    mode: intentMode,
                    planId: null,
                    sessionId: null,
                    projectId: finalProjectIdForGuard || null,
                    timestamp: new Date().toISOString(),
                    coverage: coverageConfidence,
                    message,
                });
            }
            console.error(chalk.red(`❌ ${message}`));
            process.exit(1);
        }
        // Step E: Pass 2 - The Architect (generate plan with selected files)
        console.log(chalk.dim('🤖 Generating plan with selected files...\n'));
        const response = await client.generatePlan(enhancedIntent, filesToUse, finalProjectId, ticketMetadata, projectSummary);
        if (orgId && finalProjectIdForGuard) {
            try {
                const refreshed = (0, brain_context_1.refreshBrainContextForFiles)(cwd, brainScope, filesToUse);
                (0, brain_context_1.recordBrainProgressEvent)(cwd, brainScope, {
                    type: 'plan',
                    planId: response.planId || undefined,
                    note: `selected=${filesToUse.length};indexed=${refreshed.indexed};removed=${refreshed.removed};complexity=${response.plan.estimatedComplexity || 'unknown'}`,
                });
            }
            catch {
                // Brain progression tracking should never block plan generation.
            }
        }
        const persistedPlanId = hasPersistedPlanId(response.planId);
        // Persist in local cache for instant repeat plans.
        if (persistedPlanId && shouldUseCache && orgId && finalProjectIdForGuard) {
            // Recompute repo fingerprint right before writing to cache so Neurcode-managed
            // housekeeping (e.g. `.neurcode/config.json`, `.gitignore` updates) doesn't
            // cause immediate cache misses on the next identical run.
            const finalGitFingerprint = (0, plan_cache_1.getGitRepoFingerprint)(cwd);
            const repo = finalGitFingerprint || (0, plan_cache_1.getFilesystemFingerprintFromTree)(fileTree, cwd);
            const promptHash = (0, plan_cache_1.computePromptHash)({
                intent: normalizedIntent,
                ticketRef,
                contextHash: staticContext.hash,
            });
            const key = (0, plan_cache_1.computePlanCacheKey)({
                schemaVersion: 2,
                orgId,
                projectId: finalProjectIdForGuard,
                repo,
                promptHash,
                policyVersionHash,
                neurcodeVersion,
            });
            (0, plan_cache_1.writeCachedPlan)(cwd, {
                key,
                input: {
                    schemaVersion: 2,
                    orgId,
                    projectId: finalProjectIdForGuard,
                    repo,
                    promptHash,
                    policyVersionHash,
                    neurcodeVersion,
                    intent: normalizedIntent,
                    ticketRef,
                    contextHash: staticContext.hash,
                },
                response,
            });
        }
        // Persist org+project scoped memory (multi-tenant safe, local-only).
        if (orgId && finalProjectIdForGuard) {
            (0, neurcode_context_1.appendPlanToOrgProjectMemory)(cwd, orgId, finalProjectIdForGuard, intent, response);
        }
        // Pre-flight snapshots: capture current state for MODIFY targets.
        const modifyFiles = response.plan.files.filter((f) => f.action === 'MODIFY');
        const snapshotMode = resolveSnapshotMode(options.snapshotMode);
        const snapshotMaxFiles = resolveSnapshotMaxFiles(snapshotMode, options.snapshotMaxFiles);
        const snapshotBudgetMs = resolveSnapshotBudgetMs(snapshotMode, options.snapshotBudgetMs);
        const snapshotMaxBytes = resolveSnapshotMaxBytes(snapshotMode);
        let snapshotSummary;
        if (isReadOnlyAnalysis) {
            console.log(chalk.dim('\n🔎 Analysis mode: skipping pre-flight file snapshots'));
            snapshotSummary = {
                mode: snapshotMode,
                attempted: 0,
                processed: 0,
                saved: 0,
                failed: 0,
                skippedUnchanged: 0,
                skippedMissing: 0,
                skippedLarge: 0,
                skippedBudget: 0,
                capped: 0,
                usedBatchApi: false,
                batchFallbackToSingle: false,
                durationMs: 0,
            };
        }
        else if (snapshotMode === 'off') {
            console.log(chalk.dim('\n⚡ Snapshot capture disabled (snapshot mode: off)'));
            snapshotSummary = {
                mode: snapshotMode,
                attempted: 0,
                processed: 0,
                saved: 0,
                failed: 0,
                skippedUnchanged: 0,
                skippedMissing: 0,
                skippedLarge: 0,
                skippedBudget: 0,
                capped: 0,
                usedBatchApi: false,
                batchFallbackToSingle: false,
                durationMs: 0,
            };
        }
        else if (modifyFiles.length > 0) {
            const snapshotStartedAt = Date.now();
            const snapshotCandidates = modifyFiles.slice(0, snapshotMaxFiles);
            const cappedCount = Math.max(0, modifyFiles.length - snapshotCandidates.length);
            const snapshotTimeoutMs = Math.max(1000, parsePositiveInt(process.env.NEURCODE_PLAN_SNAPSHOT_TIMEOUT_MS) ?? (snapshotMode === 'full' ? 15000 : 8000));
            const snapshotConcurrency = Math.min(16, Math.max(1, parsePositiveInt(process.env.NEURCODE_PLAN_SNAPSHOT_CONCURRENCY) ?? (snapshotMode === 'full' ? 8 : 6)));
            const snapshotBatchSize = resolveSnapshotBatchSize(snapshotMode);
            const snapshotBatchTimeoutMs = resolveSnapshotBatchTimeoutMs(snapshotTimeoutMs, snapshotMode);
            const deadline = snapshotBudgetMs > 0 ? Date.now() + snapshotBudgetMs : 0;
            const forceResnapshot = process.env.NEURCODE_PLAN_SNAPSHOT_FORCE === '1';
            console.log(chalk.dim(`\n📸 Capturing pre-flight snapshots for ${snapshotCandidates.length}/${modifyFiles.length} file(s)` +
                ` [mode=${snapshotMode}, batch=${snapshotBatchSize}, fallback-concurrency=${snapshotConcurrency}` +
                `${snapshotBudgetMs > 0 ? `, budget=${snapshotBudgetMs}ms` : ', budget=unbounded'}]...`));
            const withTimeout = async (promise, timeoutMs) => {
                return await Promise.race([
                    promise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error(`snapshot timeout after ${timeoutMs}ms`)), timeoutMs)),
                ]);
            };
            const manifest = loadSnapshotManifest(cwd);
            let manifestDirty = false;
            const preparedSnapshots = [];
            let snapshotsProcessed = 0;
            let snapshotsSaved = 0;
            let snapshotsFailed = 0;
            let snapshotsSkippedMissing = 0;
            let snapshotsSkippedUnchanged = 0;
            let snapshotsSkippedLarge = 0;
            let snapshotsSkippedBudget = 0;
            let usedBatchApi = false;
            let batchFallbackToSingle = false;
            for (const current of snapshotCandidates) {
                if (deadline > 0 && Date.now() >= deadline) {
                    snapshotsSkippedBudget = snapshotCandidates.length - snapshotsProcessed;
                    break;
                }
                snapshotsProcessed++;
                try {
                    const normalizedPath = toUnixPath(current.path);
                    const filePath = (0, path_1.resolve)(cwd, current.path);
                    if (!(0, fs_1.existsSync)(filePath)) {
                        snapshotsSkippedMissing++;
                        if (process.env.DEBUG) {
                            console.log(chalk.yellow(`   ⚠️  Skipping ${current.path} (file not found locally)`));
                        }
                        continue;
                    }
                    const fileContent = (0, fs_1.readFileSync)(filePath, 'utf-8');
                    const fileSize = Buffer.byteLength(fileContent, 'utf-8');
                    if (snapshotMaxBytes > 0 && fileSize > snapshotMaxBytes) {
                        snapshotsSkippedLarge++;
                        if (process.env.DEBUG) {
                            console.log(chalk.yellow(`   ⚠️  Skipping ${current.path} (size ${fileSize}B > ${snapshotMaxBytes}B)`));
                        }
                        continue;
                    }
                    const fileHash = computeSnapshotHash(fileContent);
                    const previous = manifest.entries[normalizedPath];
                    if (snapshotMode === 'auto' &&
                        !forceResnapshot &&
                        previous &&
                        previous.sha256 === fileHash &&
                        previous.size === fileSize) {
                        snapshotsSkippedUnchanged++;
                        continue;
                    }
                    preparedSnapshots.push({
                        path: current.path,
                        normalizedPath,
                        content: fileContent,
                        size: fileSize,
                        sha256: fileHash,
                    });
                }
                catch (error) {
                    snapshotsFailed++;
                    if (process.env.DEBUG) {
                        console.warn(chalk.yellow(`   ⚠️  Failed to prepare snapshot for ${current.path}: ${error instanceof Error ? error.message : 'Unknown error'}`));
                    }
                }
            }
            const reason = `Pre-Plan Snapshot for "${intent.trim()}"`;
            const markSnapshotSaved = (snapshot, snapshotAt) => {
                snapshotsSaved++;
                manifest.entries[snapshot.normalizedPath] = {
                    sha256: snapshot.sha256,
                    size: snapshot.size,
                    snapshotAt: snapshotAt || new Date().toISOString(),
                };
                manifestDirty = true;
            };
            let pendingFallbackSnapshots = [];
            if (preparedSnapshots.length > 0) {
                try {
                    usedBatchApi = true;
                    for (let idx = 0; idx < preparedSnapshots.length; idx += snapshotBatchSize) {
                        if (deadline > 0 && Date.now() >= deadline) {
                            const remaining = preparedSnapshots.length - idx;
                            snapshotsSkippedBudget += Math.max(0, remaining);
                            break;
                        }
                        const chunk = preparedSnapshots.slice(idx, idx + snapshotBatchSize);
                        const result = await withTimeout(client.saveFileVersionsBatch(chunk.map((snapshot) => ({
                            filePath: snapshot.path,
                            fileContent: snapshot.content,
                            changeType: 'modify',
                            linesAdded: 0,
                            linesRemoved: 0,
                        })), finalProjectId, reason), snapshotBatchTimeoutMs);
                        const chunkByPath = new Map();
                        for (const snapshot of chunk) {
                            chunkByPath.set(snapshot.path, snapshot);
                        }
                        for (const saved of result.saved || []) {
                            const prepared = chunkByPath.get(saved.filePath);
                            if (!prepared)
                                continue;
                            markSnapshotSaved(prepared, saved.version?.createdAt);
                            chunkByPath.delete(saved.filePath);
                        }
                        for (const failed of result.failed || []) {
                            if (chunkByPath.has(failed.filePath)) {
                                chunkByPath.delete(failed.filePath);
                            }
                            snapshotsFailed++;
                            if (process.env.DEBUG) {
                                console.warn(chalk.yellow(`   ⚠️  Failed to save snapshot for ${failed.filePath}: ${failed.error}`));
                            }
                        }
                        // Any residual paths were not explicitly reported by API; preserve via fallback.
                        if (chunkByPath.size > 0) {
                            pendingFallbackSnapshots.push(...chunkByPath.values());
                        }
                    }
                }
                catch (error) {
                    // Backward compatibility: old API versions won't have save-batch endpoint.
                    if (isBatchSnapshotEndpointUnsupported(error)) {
                        batchFallbackToSingle = true;
                        pendingFallbackSnapshots = [...preparedSnapshots];
                        if (process.env.DEBUG || !options.json) {
                            console.log(chalk.dim('   Batch snapshot endpoint unavailable; falling back to single-file snapshot uploads.'));
                        }
                    }
                    else {
                        snapshotsFailed += preparedSnapshots.length;
                        if (process.env.DEBUG) {
                            console.warn(chalk.yellow(`   ⚠️  Batch snapshot upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
                        }
                    }
                }
            }
            if (pendingFallbackSnapshots.length > 0) {
                let fallbackCursor = 0;
                const fallbackWorkers = Array.from({ length: Math.min(snapshotConcurrency, pendingFallbackSnapshots.length) }, async () => {
                    while (true) {
                        const index = fallbackCursor++;
                        if (index >= pendingFallbackSnapshots.length) {
                            return;
                        }
                        const snapshot = pendingFallbackSnapshots[index];
                        if (deadline > 0 && Date.now() >= deadline) {
                            snapshotsSkippedBudget++;
                            continue;
                        }
                        try {
                            await withTimeout(client.saveFileVersion(snapshot.path, snapshot.content, finalProjectId, reason, 'modify', 0, 0), snapshotTimeoutMs);
                            markSnapshotSaved(snapshot);
                        }
                        catch (error) {
                            snapshotsFailed++;
                            if (process.env.DEBUG) {
                                console.warn(chalk.yellow(`   ⚠️  Failed to save snapshot for ${snapshot.path}: ${error instanceof Error ? error.message : 'Unknown error'}`));
                            }
                        }
                    }
                });
                await Promise.all(fallbackWorkers);
            }
            if (manifestDirty) {
                try {
                    manifest.updatedAt = new Date().toISOString();
                    saveSnapshotManifest(cwd, manifest);
                }
                catch (manifestError) {
                    if (process.env.DEBUG) {
                        console.warn(chalk.yellow(`   ⚠️  Could not persist snapshot manifest: ${manifestError instanceof Error ? manifestError.message : 'Unknown error'}`));
                    }
                }
            }
            if (snapshotsSaved > 0) {
                console.log(chalk.green(`\n✅ ${snapshotsSaved} pre-flight snapshot(s) saved successfully`));
                console.log(chalk.dim('   You can revert these files using: neurcode revert <filePath> --to-version <version>'));
            }
            else if (snapshotsFailed > 0) {
                console.log(chalk.yellow(`\n⚠️  No snapshots were saved (${snapshotsFailed} failed)`));
                console.log(chalk.dim('   Plan will continue, but revert functionality may be limited'));
            }
            else {
                console.log(chalk.dim('\n   No new snapshots were required'));
            }
            if (snapshotsSkippedUnchanged > 0) {
                console.log(chalk.dim(`   ${snapshotsSkippedUnchanged} file(s) skipped (unchanged since last snapshot)`));
            }
            if (snapshotsSkippedMissing > 0) {
                console.log(chalk.dim(`   ${snapshotsSkippedMissing} file(s) skipped (not found locally)`));
            }
            if (snapshotsSkippedLarge > 0) {
                console.log(chalk.dim(`   ${snapshotsSkippedLarge} file(s) skipped (size limit)`));
            }
            if (cappedCount > 0) {
                console.log(chalk.dim(`   ${cappedCount} file(s) deferred by snapshot max-file cap (${snapshotMaxFiles})`));
            }
            if (snapshotsSkippedBudget > 0) {
                console.log(chalk.dim(`   ${snapshotsSkippedBudget} file(s) deferred by snapshot budget`));
            }
            if (usedBatchApi) {
                console.log(chalk.dim(`   Snapshot transport: batch${batchFallbackToSingle ? ' (with single-file fallback)' : ''}`));
            }
            console.log('');
            snapshotSummary = {
                mode: snapshotMode,
                attempted: snapshotCandidates.length,
                processed: snapshotsProcessed,
                saved: snapshotsSaved,
                failed: snapshotsFailed,
                skippedUnchanged: snapshotsSkippedUnchanged,
                skippedMissing: snapshotsSkippedMissing,
                skippedLarge: snapshotsSkippedLarge,
                skippedBudget: snapshotsSkippedBudget,
                capped: cappedCount,
                usedBatchApi,
                batchFallbackToSingle,
                durationMs: Date.now() - snapshotStartedAt,
            };
        }
        else {
            snapshotSummary = {
                mode: snapshotMode,
                attempted: 0,
                processed: 0,
                saved: 0,
                failed: 0,
                skippedUnchanged: 0,
                skippedMissing: 0,
                skippedLarge: 0,
                skippedBudget: 0,
                capped: 0,
                usedBatchApi: false,
                batchFallbackToSingle: false,
                durationMs: 0,
            };
        }
        // Step 3: Post-Generation Hallucination Check (DEEP SCAN)
        // Scan ALL plan content for phantom packages - not just summaries, but full proposed code
        let hasHallucinations = false;
        let skippedHallucinationScan = false;
        const allHallucinations = [];
        // Check tier for hallucination scanning (PRO feature)
        const { getUserTier } = await Promise.resolve().then(() => __importStar(require('../utils/tier')));
        const tier = await getUserTier();
        if (isReadOnlyAnalysis) {
            skippedHallucinationScan = true;
            console.log(chalk.dim('🔎 Analysis mode: skipping hallucination package scan'));
        }
        else if (tier === 'FREE') {
            console.log(chalk.yellow('\n🛡️  Hallucination Shield is a PRO feature.'));
            console.log(chalk.dim('   Upgrade at: https://www.neurcode.com/dashboard/purchase-plan\n'));
        }
        else {
            console.log(chalk.dim('🔍 Checking for AI hallucinations...'));
            // Collect ALL code content from the plan (suggestions, reasons, summaries)
            // This ensures we catch hallucinations in the full proposed code, not just summaries
            const allPlanContent = [];
            for (const file of response.plan.files) {
                // Add suggestion text (full proposed code blocks)
                if (file.suggestion) {
                    allPlanContent.push({
                        content: file.suggestion,
                        location: file.path,
                    });
                }
                // Also scan reason text (sometimes contains code examples)
                if (file.reason) {
                    allPlanContent.push({
                        content: file.reason,
                        location: file.path,
                    });
                }
            }
            // Also scan the plan summary for any code snippets
            if (response.plan.summary) {
                allPlanContent.push({
                    content: response.plan.summary,
                    location: 'plan_summary',
                });
            }
            // Scan all collected content for hallucinations
            for (const { content, location } of allPlanContent) {
                if (!content || content.trim().length === 0) {
                    continue;
                }
                const hallucinationResult = await securityGuard.scanForHallucinations(content, // Full content, not just summary
                location, cwd);
                if (hallucinationResult.hasHallucinations) {
                    hasHallucinations = true;
                    allHallucinations.push(...hallucinationResult.hallucinations.map(h => ({
                        packageName: h.packageName,
                        location: h.location,
                        importStatement: h.importStatement,
                    })));
                }
            }
        }
        // Display hallucination warnings BEFORE the plan (Verification Badge)
        if (hasHallucinations) {
            // Log ROI event for each hallucination detected (non-blocking)
            try {
                const finalProjectId = options.projectId || projectId || config.projectId;
                for (const hallucination of allHallucinations) {
                    (0, ROILogger_1.logROIEvent)('HALLUCINATION_BLOCKED', {
                        package_name: hallucination.packageName,
                        location: hallucination.location,
                        import_statement: hallucination.importStatement,
                    }, finalProjectId || null).catch(() => {
                        // Silently ignore - ROI logging should never block user workflows
                    });
                }
            }
            catch {
                // Silently ignore - ROI logging should never block user workflows
            }
            // Display high-contrast hallucination warnings with shield icon (BEFORE plan)
            console.log('\n');
            console.log(chalk.bold.red('╔════════════════════════════════════════════════════════════╗'));
            console.log(chalk.bold.red('║') + chalk.bold.white('  🛡️  SECURITY SHIELD: HALLUCINATION DETECTED  ') + chalk.bold.red('║'));
            console.log(chalk.bold.red('╚════════════════════════════════════════════════════════════╝'));
            console.log('');
            // Group hallucinations by package name for cleaner output
            const hallucinationsByPackage = new Map();
            for (const hallucination of allHallucinations) {
                if (!hallucinationsByPackage.has(hallucination.packageName)) {
                    hallucinationsByPackage.set(hallucination.packageName, []);
                }
                hallucinationsByPackage.get(hallucination.packageName).push({
                    location: hallucination.location,
                    importStatement: hallucination.importStatement,
                });
            }
            // Display each unique hallucinated package
            hallucinationsByPackage.forEach((occurrences, packageName) => {
                const shieldIcon = chalk.bold.red('🛡️');
                const criticalLabel = chalk.bold.red('CRITICAL:');
                const packageNameDisplay = chalk.bold.yellow(`'${packageName}'`);
                console.log(`${shieldIcon} ${chalk.bold.red('[Neurcode]')} ${criticalLabel} ${chalk.bold.white('Hallucination Blocked')}`);
                console.log(chalk.white(`   Attempted import of non-existent package ${packageNameDisplay} prevented.`));
                // Show all locations where this package was found
                if (occurrences.length === 1) {
                    console.log(chalk.dim(`   Location: ${occurrences[0].location}`));
                    console.log(chalk.dim(`   Statement: ${occurrences[0].importStatement}`));
                }
                else {
                    console.log(chalk.dim(`   Found in ${occurrences.length} location(s):`));
                    occurrences.forEach(occ => {
                        console.log(chalk.dim(`     • ${occ.location}: ${occ.importStatement}`));
                    });
                }
                console.log('');
            });
            if (allHallucinations.length > 1) {
                console.log(chalk.dim(`   Total: ${allHallucinations.length} hallucination(s) blocked across ${hallucinationsByPackage.size} unique package(s)\n`));
            }
            console.log(chalk.dim('💡 The plan may include references to packages that don\'t exist.'));
            console.log(chalk.dim('   Review the plan carefully before applying.\n'));
            console.log(chalk.bold.red('─'.repeat(60)));
            console.log('');
        }
        else {
            if (skippedHallucinationScan) {
                console.log(chalk.dim('🔎 Hallucination scan skipped (read-only analysis mode)'));
            }
            else {
                console.log(chalk.green('✅ No hallucinations detected'));
            }
        }
        if (!persistedPlanId) {
            const missingPlanMessage = 'Plan generated but failed to persist (planId missing). Cannot continue with prompt/apply/ship.';
            if (options.json) {
                emitPlanJson({
                    success: false,
                    cached: false,
                    mode: intentMode,
                    planId: null,
                    sessionId: response.sessionId || null,
                    projectId: finalProjectId || null,
                    timestamp: response.timestamp,
                    telemetry: response.telemetry,
                    snapshot: snapshotSummary,
                    coverage: coverageConfidence,
                    message: missingPlanMessage,
                    plan: response.plan,
                });
            }
            console.error(chalk.red(`\n❌ ${missingPlanMessage}`));
            process.exit(2);
        }
        // Display the plan (AFTER hallucination warnings)
        if (isReadOnlyAnalysis) {
            const writableTargets = response.plan.files.filter((file) => file.action !== 'BLOCK').length;
            console.log(chalk.dim(`🔎 Read-only query guidance: treat listed files as inspection targets (${writableTargets} target(s)).`));
        }
        displayPlan(response.plan);
        console.log(chalk.dim(`\nGenerated at: ${new Date(response.timestamp).toLocaleString()}`));
        // Display plan ID if available
        if (persistedPlanId) {
            console.log(chalk.bold.cyan(`\n📌 Plan ID: ${response.planId} (Saved)`));
            console.log(chalk.dim('   Run \'neurcode prompt \' to generate a Cursor/AI prompt. (Ready now)'));
        }
        // Save sessionId and planId to state file (.neurcode/config.json)
        try {
            if (persistedPlanId) {
                // Save active plan ID (primary) and lastPlanId (backward compatibility)
                (0, state_1.setActivePlanId)(response.planId);
                (0, state_1.setLastPlanGeneratedAt)(new Date().toISOString());
            }
            if (response.sessionId) {
                (0, state_1.setSessionId)(response.sessionId);
                console.log(chalk.dim(`   Session ID saved to .neurcode/config.json`));
            }
        }
        catch (stateError) {
            // Log warning but don't fail the command
            if (process.env.DEBUG) {
                console.warn(chalk.yellow(`⚠️  Could not save sessionId/planId to state: ${stateError instanceof Error ? stateError.message : 'Unknown error'}`));
            }
        }
        if (persistedPlanId) {
            try {
                const expectedFiles = response.plan.files
                    .filter((file) => file.action !== 'BLOCK')
                    .map((file) => file.path);
                const lockRead = (0, policy_packs_1.readPolicyLockFile)(cwd);
                const compiledPolicyRead = (0, policy_compiler_1.readCompiledPolicyArtifact)(cwd);
                const unsignedChangeContract = (0, change_contract_1.createChangeContract)({
                    planId: response.planId,
                    sessionId: response.sessionId || null,
                    projectId: finalProjectId || null,
                    intent,
                    expectedFiles,
                    planFiles: mapPlanFilesForChangeContract(response.plan.files),
                    expectedSymbols: (0, plan_symbols_1.mapPlanSymbolsForChangeContract)(response.plan),
                    options: resolveChangeContractOptionsFromEnv(),
                    policyLockFingerprint: lockRead.lock?.effective.fingerprint || null,
                    compiledPolicyFingerprint: compiledPolicyRead.artifact?.fingerprint || null,
                });
                const changeContract = (0, artifact_signature_1.signGovernanceArtifact)(unsignedChangeContract, (0, artifact_signature_1.resolveGovernanceArtifactSigningConfigFromEnv)());
                const path = (0, change_contract_1.writeChangeContract)(cwd, changeContract);
                generatedChangeContract = {
                    id: changeContract.contractId,
                    path,
                };
                if (!options.json) {
                    console.log(chalk.dim(`   Change contract refreshed: ${path}`));
                }
            }
            catch (changeContractError) {
                if (process.env.DEBUG) {
                    console.warn(chalk.yellow(`⚠️  Could not write change contract: ${changeContractError instanceof Error ? changeContractError.message : 'Unknown error'}`));
                }
            }
        }
        if (options.json) {
            emitPlanJson({
                success: true,
                cached: false,
                mode: intentMode,
                planId: response.planId,
                sessionId: response.sessionId || null,
                projectId: finalProjectId || null,
                changeContract: generatedChangeContract,
                timestamp: response.timestamp,
                telemetry: response.telemetry,
                snapshot: snapshotSummary,
                coverage: coverageConfidence,
                message: 'Plan generated and persisted',
                plan: response.plan,
            });
        }
        planSuccessForSlo = true;
        flushPlanSloEvent(0);
        process.removeListener('exit', onPlanProcessExit);
    }
    catch (error) {
        if (options.json) {
            emitPlanJson({
                success: false,
                cached: false,
                mode: 'implementation',
                planId: null,
                sessionId: null,
                projectId: options.projectId || null,
                timestamp: new Date().toISOString(),
                coverage: coverageConfidence,
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
        console.error(chalk.red('\n❌ Error generating plan:'));
        if (error instanceof Error) {
            console.error(chalk.red(error.message));
            if (error.message.includes('API request failed')) {
                console.log(chalk.dim('\n💡 Make sure:'));
                console.log(chalk.dim('  • Your API key is valid'));
                console.log(chalk.dim('  • The API URL is correct'));
                console.log(chalk.dim('  • You have network connectivity'));
            }
        }
        else {
            console.error(error);
        }
        process.exit(1);
    }
    finally {
        if (suppressHumanLogs) {
            console.log = originalConsoleLog;
            console.warn = originalConsoleWarn;
        }
    }
}
//# sourceMappingURL=plan.js.map