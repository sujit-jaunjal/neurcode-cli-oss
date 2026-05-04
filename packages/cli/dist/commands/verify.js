"use strict";
/**
 * Verify Command
 *
 * Compares current work (git diff) against an Architect Plan to measure adherence and detect bloat.
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
exports.verifyCommand = verifyCommand;
const child_process_1 = require("child_process");
const git_1 = require("../utils/git");
const diff_parser_1 = require("@neurcode-ai/diff-parser");
const policy_engine_1 = require("@neurcode-ai/policy-engine");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const contracts_1 = require("@neurcode-ai/contracts");
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const path_1 = require("path");
const fs_1 = require("fs");
const state_1 = require("../utils/state");
const ROILogger_1 = require("../utils/ROILogger");
const ignore_1 = require("../utils/ignore");
const project_root_1 = require("../utils/project-root");
const brain_context_1 = require("../utils/brain-context");
const scope_telemetry_1 = require("../utils/scope-telemetry");
const plan_sync_1 = require("../utils/plan-sync");
const intent_engine_1 = require("../intent-engine");
const policy_packs_1 = require("../utils/policy-packs");
const custom_policy_rules_1 = require("../utils/custom-policy-rules");
const policy_exceptions_1 = require("../utils/policy-exceptions");
const policy_governance_1 = require("../utils/policy-governance");
const policy_audit_1 = require("../utils/policy-audit");
const governance_1 = require("../utils/governance");
const policy_compiler_1 = require("../utils/policy-compiler");
const change_contract_1 = require("../utils/change-contract");
const diff_symbols_1 = require("../utils/diff-symbols");
const advisory_signals_1 = require("../utils/advisory-signals");
const runtime_guard_1 = require("../utils/runtime-guard");
const artifact_signature_1 = require("../utils/artifact-signature");
const policy_1 = require("@neurcode-ai/policy");
const ai_debt_budget_1 = require("../utils/ai-debt-budget");
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
    // Disable colors in CI environments for cleaner logs
    if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
        chalk.level = 0;
    }
}
catch {
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
;
function toArtifactSignatureSummary(status) {
    return {
        required: status.required,
        present: status.present,
        valid: status.valid,
        keyId: status.keyId,
        verifiedWithKeyId: status.verifiedWithKeyId,
        issues: [...status.issues],
    };
}
function resolveCliComponentVersion() {
    const explicitEnvVersion = process.env.NEURCODE_CLI_VERSION;
    if (explicitEnvVersion && explicitEnvVersion.trim()) {
        return explicitEnvVersion.trim();
    }
    try {
        const packagePath = (0, path_1.join)(__dirname, '../../package.json');
        const raw = (0, fs_1.readFileSync)(packagePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed.version === 'string' && parsed.version.trim()) {
            return parsed.version.trim();
        }
    }
    catch {
        // Ignore and fall back.
    }
    const npmContextVersion = process.env.npm_package_version;
    if (npmContextVersion
        && npmContextVersion.trim()
        && npmContextVersion.trim() !== '0.0.0') {
        return npmContextVersion.trim();
    }
    return '0.0.0';
}
const CLI_COMPONENT_VERSION = resolveCliComponentVersion();
function asCompatibilityRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
async function probeApiRuntimeCompatibility(apiUrl) {
    const normalizedApiUrl = apiUrl.replace(/\/$/, '');
    const healthUrl = `${normalizedApiUrl}/health`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        const response = await fetch(healthUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'neurcode-cli-verify/compat-probe',
            },
        });
        if (!response.ok) {
            return {
                healthUrl,
                apiVersion: null,
                status: 'warn',
                messages: [`Health endpoint returned status ${response.status}; skipping runtime compatibility handshake.`],
            };
        }
        const payload = (await response.json().catch(() => ({})));
        const compatibility = asCompatibilityRecord(payload.compatibility);
        const apiVersionFromHealth = typeof payload.version === 'string' && payload.version.trim()
            ? payload.version.trim()
            : null;
        if (!compatibility) {
            return {
                healthUrl,
                apiVersion: apiVersionFromHealth,
                status: 'warn',
                messages: ['API health payload is missing compatibility metadata.'],
            };
        }
        const contractId = typeof compatibility.contractId === 'string' ? compatibility.contractId.trim() : '';
        const runtimeContractVersion = typeof compatibility.runtimeContractVersion === 'string'
            ? compatibility.runtimeContractVersion.trim()
            : '';
        const cliJsonContractVersion = typeof compatibility.cliJsonContractVersion === 'string'
            ? compatibility.cliJsonContractVersion.trim()
            : '';
        const component = typeof compatibility.component === 'string' ? compatibility.component.trim() : '';
        const componentVersion = typeof compatibility.componentVersion === 'string'
            ? compatibility.componentVersion.trim()
            : '';
        const minimumPeerVersions = asCompatibilityRecord(compatibility.minimumPeerVersions) || {};
        const apiRequiresCli = typeof minimumPeerVersions.cli === 'string' && minimumPeerVersions.cli.trim()
            ? minimumPeerVersions.cli.trim()
            : undefined;
        const errors = [];
        if (contractId !== contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_ID) {
            errors.push(`API compatibility contractId mismatch (expected ${contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_ID}, got ${contractId || 'missing'}).`);
        }
        if (runtimeContractVersion !== contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_VERSION) {
            errors.push(`API runtimeContractVersion mismatch (expected ${contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_VERSION}, got ${runtimeContractVersion || 'missing'}).`);
        }
        if (cliJsonContractVersion !== contracts_1.CLI_JSON_CONTRACT_VERSION) {
            errors.push(`API cliJsonContractVersion mismatch (expected ${contracts_1.CLI_JSON_CONTRACT_VERSION}, got ${cliJsonContractVersion || 'missing'}).`);
        }
        if (component !== 'api') {
            errors.push(`API compatibility payload component must be "api" (received ${component || 'missing'}).`);
        }
        const resolvedApiVersion = componentVersion || apiVersionFromHealth;
        const minimumApiForCli = (0, contracts_1.getMinimumCompatiblePeerVersion)('cli', 'api');
        if (minimumApiForCli && resolvedApiVersion) {
            const cliRequiresApi = (0, contracts_1.isSemverAtLeast)(resolvedApiVersion, minimumApiForCli);
            if (cliRequiresApi === null) {
                errors.push(`Unable to compare API version "${resolvedApiVersion}" against required minimum "${minimumApiForCli}".`);
            }
            else if (!cliRequiresApi) {
                errors.push(`API version ${resolvedApiVersion} is below CLI required minimum ${minimumApiForCli}.`);
            }
        }
        if (apiRequiresCli) {
            const apiRequiresThisCli = (0, contracts_1.isSemverAtLeast)(CLI_COMPONENT_VERSION, apiRequiresCli);
            if (apiRequiresThisCli === null) {
                errors.push(`Unable to compare CLI version "${CLI_COMPONENT_VERSION}" against API required minimum "${apiRequiresCli}".`);
            }
            else if (!apiRequiresThisCli) {
                errors.push(`CLI version ${CLI_COMPONENT_VERSION} is below API required minimum ${apiRequiresCli}.`);
            }
        }
        if (errors.length > 0) {
            return {
                healthUrl,
                apiVersion: resolvedApiVersion || null,
                status: 'error',
                messages: errors,
            };
        }
        return {
            healthUrl,
            apiVersion: resolvedApiVersion || null,
            status: 'ok',
            messages: [],
        };
    }
    catch (error) {
        const message = error instanceof Error && error.name === 'AbortError'
            ? 'Health endpoint timed out after 5s.'
            : error instanceof Error
                ? error.message
                : 'Unknown error';
        return {
            healthUrl,
            apiVersion: null,
            status: 'warn',
            messages: [`Runtime compatibility probe failed: ${message}`],
        };
    }
    finally {
        clearTimeout(timeoutId);
    }
}
/**
 * Check if a file path should be excluded from verification analysis
 * Excludes internal/system files that should not count towards plan adherence
 */
const IGNORED_METADATA_FILE_PATTERN = /(^|\/)neurcode\.config\.json$/i;
const IGNORED_DIRECTORIES = ['.git/', 'node_modules/'];
const IGNORED_GOVERNANCE_ARTIFACT_PATTERNS = [
    /(^|\/)neurcode\.policy\.compiled\.json$/i,
    /(^|\/)neurcode\.policy\.audit\.log\.jsonl$/i,
    /(^|\/)neurcode\.policy\.lock\.json$/i,
    /(^|\/)neurcode\.policy\.governance\.json$/i,
    /(^|\/)neurcode\.policy\.exceptions\.json$/i,
    /(^|\/)neurcode\.policy\.json$/i,
    /(^|\/)neurcode\.rules\.json$/i,
];
function isExcludedFile(filePath) {
    // Normalize path separators (handle both / and \)
    const normalizedPath = filePath.replace(/\\/g, '/');
    // Ignore specific metadata files (these should never be scope/policy violations)
    if (IGNORED_METADATA_FILE_PATTERN.test(normalizedPath)) {
        return true;
    }
    // Ignore .neurcode internals at any nesting level (monorepo-safe)
    if (/(^|\/)\.neurcode\//.test(normalizedPath)) {
        return true;
    }
    // Ignore generated / governance artifacts written by Neurcode itself
    for (const pattern of IGNORED_GOVERNANCE_ARTIFACT_PATTERNS) {
        if (pattern.test(normalizedPath)) {
            return true;
        }
    }
    // Check if path starts with any excluded prefix
    const excludedPrefixes = [...IGNORED_DIRECTORIES];
    // Check prefixes
    for (const prefix of excludedPrefixes) {
        if (normalizedPath.startsWith(prefix)) {
            return true;
        }
    }
    // Check for .DS_Store file (macOS system file) - can appear at any directory level
    if (normalizedPath === '.DS_Store' || normalizedPath.endsWith('/.DS_Store')) {
        return true;
    }
    // Exclude common meta-configuration files (gitignore, npmignore, dockerignore, etc.)
    // These are project configuration files and shouldn't be part of scope checking
    const configFilePatterns = [
        /^\.gitignore$/,
        /\.gitignore$/,
        /^\.npmignore$/,
        /\.npmignore$/,
        /^\.dockerignore$/,
        /\.dockerignore$/,
        /^\.prettierignore$/,
        /\.prettierignore$/,
        /^\.eslintignore$/,
        /\.eslintignore$/,
    ];
    for (const pattern of configFilePatterns) {
        if (pattern.test(normalizedPath)) {
            return true;
        }
    }
    return false;
}
function toUnixPath(filePath) {
    return filePath.replace(/\\/g, '/');
}
function getUntrackedDiffFiles(projectRoot) {
    let output = '';
    try {
        output = (0, child_process_1.execSync)('git ls-files --others --exclude-standard', {
            cwd: projectRoot,
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024 * 10,
        });
    }
    catch {
        return [];
    }
    const untrackedPaths = output
        .split('\n')
        .map((line) => toUnixPath(line.trim()))
        .filter(Boolean)
        .filter((line) => !isExcludedFile(line));
    const result = [];
    for (const relativePath of untrackedPaths) {
        try {
            const fullPath = (0, path_1.join)(projectRoot, relativePath);
            const rawContent = (0, fs_1.readFileSync)(fullPath, 'utf-8');
            const lines = rawContent.length === 0 ? [] : rawContent.split('\n');
            if (lines.length > 0 && lines[lines.length - 1] === '') {
                lines.pop();
            }
            const addedLines = lines.map((line, idx) => ({
                type: 'added',
                content: line,
                lineNumber: idx + 1,
            }));
            result.push({
                path: relativePath,
                changeType: 'add',
                addedLines: addedLines.length,
                removedLines: 0,
                hunks: addedLines.length > 0 ? [{
                        oldStart: 0,
                        oldLines: 0,
                        newStart: 1,
                        newLines: addedLines.length,
                        lines: addedLines,
                    }] : [],
            });
        }
        catch {
            // Non-text or unreadable file; still include path for scope/adherence checks.
            result.push({
                path: relativePath,
                changeType: 'add',
                addedLines: 0,
                removedLines: 0,
                hunks: [],
            });
        }
    }
    return result;
}
function getRuntimeIgnoreSetFromEnv() {
    const raw = process.env.NEURCODE_VERIFY_IGNORE_PATHS;
    if (!raw || !raw.trim())
        return new Set();
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return new Set(parsed.map((item) => toUnixPath(String(item))));
        }
    }
    catch {
        // Fall through to comma-separated parsing.
    }
    return new Set(raw
        .split(',')
        .map((item) => toUnixPath(item.trim()))
        .filter(Boolean));
}
const INTENT_PROOF_CODE_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.mts',
    '.cts',
    '.py',
    '.java',
    '.go',
    '.rb',
    '.rs',
]);
const INTENT_PROOF_IGNORED_DIRECTORIES = new Set([
    '.git',
    '.hg',
    '.svn',
    '.neurcode',
    'node_modules',
    'vendor',
    'dist',
    'build',
    'out',
    'coverage',
    '.next',
    '.turbo',
    '.cache',
]);
function isIntentProofSourceFile(pathValue) {
    const lower = pathValue.toLowerCase();
    for (const extension of INTENT_PROOF_CODE_EXTENSIONS) {
        if (lower.endsWith(extension)) {
            return true;
        }
    }
    return false;
}
function dedupeDeterministicRules(rules) {
    const seen = new Set();
    const out = [];
    for (const rule of rules) {
        const key = [
            rule.id,
            rule.source,
            rule.statement,
            rule.matchToken,
            rule.evaluationMode || '',
            rule.evaluationScope || '',
            typeof rule.minMatchesPerFile === 'number' ? String(rule.minMatchesPerFile) : '',
            typeof rule.maxMatchesPerFile === 'number' ? String(rule.maxMatchesPerFile) : '',
            rule.pathIncludePatterns?.join('|') || '',
            rule.pathExcludePatterns?.join('|') || '',
        ].join('::');
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(rule);
    }
    return out;
}
function collectIntentProofFileContents(projectRoot, changedPaths, maxFiles, maxTotalBytes, maxPerFileBytes) {
    const fileContents = {};
    let scannedFiles = 0;
    let scannedBytes = 0;
    let truncated = false;
    const tryAddFile = (relativePath) => {
        if (!relativePath || fileContents[relativePath] !== undefined)
            return;
        if (!isIntentProofSourceFile(relativePath) || isExcludedFile(relativePath))
            return;
        if (scannedFiles >= maxFiles) {
            truncated = true;
            return;
        }
        const absolutePath = (0, path_1.join)(projectRoot, relativePath);
        if (!(0, fs_1.existsSync)(absolutePath))
            return;
        try {
            const stat = (0, fs_1.statSync)(absolutePath);
            if (!stat.isFile())
                return;
            if (stat.size > maxPerFileBytes)
                return;
            if (scannedBytes + stat.size > maxTotalBytes) {
                truncated = true;
                return;
            }
            const content = (0, fs_1.readFileSync)(absolutePath, 'utf-8');
            fileContents[relativePath] = content;
            scannedFiles += 1;
            scannedBytes += stat.size;
        }
        catch {
            // Non-text/unreadable: skip.
        }
    };
    for (const rawPath of changedPaths) {
        tryAddFile(toUnixPath(rawPath));
    }
    const stack = [projectRoot];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current)
            continue;
        let entries;
        try {
            entries = (0, fs_1.readdirSync)(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.name === '.' || entry.name === '..')
                continue;
            const absolutePath = (0, path_1.join)(current, entry.name);
            const relativePath = toUnixPath(absolutePath.slice(projectRoot.length + 1));
            if (entry.isDirectory()) {
                if (INTENT_PROOF_IGNORED_DIRECTORIES.has(entry.name))
                    continue;
                if (isExcludedFile(`${relativePath}/`))
                    continue;
                stack.push(absolutePath);
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            if (scannedFiles >= maxFiles) {
                truncated = true;
                break;
            }
            tryAddFile(relativePath);
        }
        if (truncated && scannedFiles >= maxFiles) {
            break;
        }
    }
    return {
        fileContents,
        scannedFiles,
        scannedBytes,
        truncated,
    };
}
async function buildEffectivePolicyRules(client, projectRoot, useDashboardPolicies) {
    const defaultPolicy = (0, policy_engine_1.createDefaultPolicy)();
    const customRules = [];
    const customPolicies = [];
    const installedPack = (0, policy_packs_1.getInstalledPolicyPackRules)(projectRoot);
    const policyPackRules = installedPack?.rules ? [...installedPack.rules] : [];
    if (useDashboardPolicies) {
        const loadedCustomPolicies = await client.getActiveCustomPolicies();
        for (const p of loadedCustomPolicies) {
            customPolicies.push(p);
            const r = (0, custom_policy_rules_1.customPolicyToRule)(p);
            if (r) {
                customRules.push(r);
            }
        }
    }
    return {
        allRules: [...defaultPolicy.rules, ...policyPackRules, ...customRules],
        customRules,
        customPolicies,
        policyPackRules,
        policyPack: installedPack,
        includeDashboardPolicies: useDashboardPolicies,
    };
}
function resolveCompiledPolicyMetadata(artifact, path) {
    if (!artifact || !path) {
        return null;
    }
    return {
        fingerprint: artifact.fingerprint,
        deterministicRuleCount: artifact.compilation.deterministicRuleCount,
        unmatchedStatements: artifact.compilation.unmatchedStatements.length,
        sourcePath: path,
        policyLockFingerprint: artifact.source.policyLockFingerprint,
    };
}
function buildCompiledPolicyFromEffectiveRules(input) {
    const policyStatements = [
        ...input.effectiveRules.customPolicies.map((policy) => policy.rule_text),
    ];
    return (0, policy_compiler_1.buildCompiledPolicyArtifact)({
        includeDashboardPolicies: input.effectiveRules.includeDashboardPolicies,
        policyLockPath: input.policyLockEvaluation.lockPath,
        policyLockFingerprint: input.policyLockEvaluation.lockPresent
            ? (0, policy_packs_1.readPolicyLockFile)(input.projectRoot).lock?.effective.fingerprint || null
            : null,
        policyPack: input.effectiveRules.policyPack
            ? {
                id: input.effectiveRules.policyPack.packId,
                name: input.effectiveRules.policyPack.packName,
                version: input.effectiveRules.policyPack.version,
            }
            : null,
        defaultRuleCount: (0, policy_engine_1.createDefaultPolicy)().rules.length,
        policyPackRuleCount: input.effectiveRules.policyPackRules.length,
        customRuleCount: input.effectiveRules.customRules.length,
        effectiveRuleCount: input.effectiveRules.allRules.length,
        intentConstraints: input.intentConstraints,
        policyRules: policyStatements,
    });
}
const POLICY_AUDIT_FILE = 'neurcode.policy.audit.log.jsonl';
function isEnabledFlag(value) {
    if (!value)
        return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
function createRuntimeGuardSummary(required, projectRoot, runtimeGuardPath) {
    return {
        required,
        path: (0, runtime_guard_1.resolveRuntimeGuardPath)(projectRoot, runtimeGuardPath),
        exists: false,
        valid: false,
        active: false,
        pass: !required,
        changedFiles: 0,
        outOfScopeFiles: [],
        constraintViolations: [],
        violations: [],
    };
}
function runtimeGuardViolationsToReport(summary) {
    if (!summary.required || summary.pass) {
        return [];
    }
    if (!summary.exists) {
        return [
            {
                file: summary.path,
                rule: 'runtime_guard_missing',
                severity: 'block',
                message: 'Runtime guard artifact is missing. Run `neurcode guard start` before verify.',
            },
        ];
    }
    if (!summary.valid) {
        return [
            {
                file: summary.path,
                rule: 'runtime_guard_invalid',
                severity: 'block',
                message: 'Runtime guard artifact is invalid. Regenerate with `neurcode guard start`.',
            },
        ];
    }
    return summary.violations.map((item) => ({
        file: item.file || summary.path,
        rule: `runtime_guard:${item.code.toLowerCase()}`,
        severity: 'block',
        message: item.message,
    }));
}
function asObjectRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
function asObjectArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => asObjectRecord(item))
        .filter((item) => item !== null);
}
function asBooleanFlag(value) {
    return typeof value === 'boolean' ? value : null;
}
function asNumberValue(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asStringValue(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
const EXPEDITE_FOLLOW_UP_CHECKLIST = [
    'Add validation back',
    'Move logic to proper layer',
    'Remove temporary code',
];
function containsAnyToken(value, tokens) {
    const normalized = value.toLowerCase();
    return tokens.some((token) => normalized.includes(token));
}
function isSecurityOrAuthViolation(fileRaw, policyRaw, messageRaw) {
    const combined = `${fileRaw} ${policyRaw} ${messageRaw}`.toLowerCase();
    return containsAnyToken(combined, [
        'auth',
        'authentication',
        'authorization',
        'security',
        'permission',
        'access control',
        'access_control',
        'token',
        'secret',
        'credential',
        'encryption',
        'encrypt',
        'decrypt',
        'csrf',
        'xss',
        'sql injection',
        'sqli',
        'insecure',
        'vulnerability',
    ]);
}
function isCriticalScopeBreach(fileRaw, messageRaw) {
    const combined = `${fileRaw} ${messageRaw}`.toLowerCase();
    return containsAnyToken(combined, [
        'auth',
        'security',
        'secret',
        'token',
        'credential',
        'permission',
        'infra/terraform',
        'terraform',
        'k8s',
        'helm',
        'migration',
        'database/migration',
        'policy',
        'contract',
    ]);
}
function resolveExpediteModeFromPayload(payload) {
    const explicit = asBooleanFlag(payload.expediteMode);
    if (explicit !== null) {
        return explicit;
    }
    const message = asStringValue(payload.message) || '';
    return containsAnyToken(message, ['hotfix', 'urgent', 'prod down', 'incident', 'expedite']);
}
function toVerifySeverity(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'critical' || normalized === 'block')
        return 'critical';
    if (normalized === 'high')
        return 'high';
    if (normalized === 'warn'
        || normalized === 'warning'
        || normalized === 'medium'
        || normalized === 'low') {
        return 'warning';
    }
    return 'info';
}
function toVerifyVerdict(value) {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (normalized === 'PASS' || normalized === 'WARN' || normalized === 'FAIL') {
        return normalized;
    }
    return 'FAIL';
}
function normalizeScopeIssueMessage(rawMessage) {
    const message = asStringValue(rawMessage);
    return message || 'File modified outside intended scope';
}
function pushVerifyIssue(target, seen, key, value) {
    if (seen.has(key))
        return;
    seen.add(key);
    target.push(value);
}
function dedupeTriageItems(items) {
    const seen = new Set();
    const output = [];
    for (const item of items) {
        const key = `${item.source}|${item.file.toLowerCase()}|${item.policy.toLowerCase()}|${item.message.toLowerCase()}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        output.push(item);
    }
    return output;
}
function toCanonicalVerifyOutput(payload) {
    const verdict = toVerifyVerdict(payload.verdict);
    const violations = [];
    const warnings = [];
    const scopeIssues = [];
    const seenViolations = new Set();
    const seenWarnings = new Set();
    const seenScopeIssues = new Set();
    const addScopeIssue = (fileRaw, messageRaw) => {
        const file = asStringValue(fileRaw) || 'unknown';
        const message = normalizeScopeIssueMessage(messageRaw);
        const key = file.toLowerCase();
        pushVerifyIssue(scopeIssues, seenScopeIssues, key, { file, message });
    };
    const addWarning = (fileRaw, messageRaw, policyRaw) => {
        const file = asStringValue(fileRaw) || 'unknown';
        const message = asStringValue(messageRaw) || 'Warning detected';
        const policy = asStringValue(policyRaw) || 'warning';
        const key = `${file.toLowerCase()}|${message.toLowerCase()}|${policy.toLowerCase()}`;
        pushVerifyIssue(warnings, seenWarnings, key, { file, message, policy });
    };
    const addViolation = (fileRaw, messageRaw, policyRaw, severityRaw) => {
        const file = asStringValue(fileRaw) || 'unknown';
        const message = asStringValue(messageRaw) || 'Policy violation detected';
        const policy = asStringValue(policyRaw) || 'unknown_policy';
        const severity = toVerifySeverity(severityRaw);
        const key = `${file.toLowerCase()}|${message.toLowerCase()}|${policy.toLowerCase()}|${severity}`;
        pushVerifyIssue(violations, seenViolations, key, { file, message, policy, severity });
    };
    const rawScopeIssues = Array.isArray(payload.scopeIssues) ? payload.scopeIssues : [];
    for (const item of rawScopeIssues) {
        const record = asObjectRecord(item);
        if (record) {
            addScopeIssue(record.file, record.message);
        }
        else {
            addScopeIssue(item, null);
        }
    }
    const rawBloatFiles = Array.isArray(payload.bloatFiles) ? payload.bloatFiles : [];
    for (const item of rawBloatFiles) {
        addScopeIssue(item, null);
    }
    const rawWarnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    for (const item of rawWarnings) {
        const record = asObjectRecord(item);
        if (record) {
            addWarning(record.file, record.message, record.policy ?? record.rule);
        }
        else if (typeof item === 'string') {
            addWarning('unknown', item, 'warning');
        }
    }
    const rawViolations = Array.isArray(payload.violations) ? payload.violations : [];
    for (const item of rawViolations) {
        const record = asObjectRecord(item);
        if (!record)
            continue;
        const file = record.file;
        const message = record.message;
        const policy = record.policy ?? record.rule;
        const severity = toVerifySeverity(record.severity);
        const combined = `${String(policy || '').toLowerCase()} ${String(message || '').toLowerCase()}`;
        const isScopeIssue = combined.includes('scope_guard')
            || combined.includes('scope')
            || combined.includes('outside the plan')
            || combined.includes('out of scope');
        if (isScopeIssue) {
            addScopeIssue(file, message);
            continue;
        }
        // Artifact presence/signature checks are advisory — they must never block a PR.
        // Real governance signal (policy violations, scope drift) should not be obscured
        // by infrastructure setup state.
        const policyStr = String(policy || '').toLowerCase();
        const isArtifactCheck = policyStr === 'deterministic_artifacts_required'
            || policyStr === 'signed_artifacts_required';
        if (isArtifactCheck) {
            addWarning(file, message, policy);
            continue;
        }
        if (severity === 'warning' || severity === 'info') {
            addWarning(file, message, policy);
            continue;
        }
        addViolation(file, message, policy, severity);
    }
    const payloadMessage = asStringValue(payload.message);
    if (payloadMessage
        && violations.length === 0
        && warnings.length === 0
        && scopeIssues.length === 0) {
        addWarning('unknown', payloadMessage, 'verify_result');
    }
    const summaryRecord = asObjectRecord(payload.summary);
    const fileSet = new Set();
    for (const violation of violations)
        fileSet.add(violation.file);
    for (const warning of warnings)
        fileSet.add(warning.file);
    for (const scopeIssue of scopeIssues)
        fileSet.add(scopeIssue.file);
    const totalFilesChanged = (() => {
        const fromSummary = summaryRecord ? asNumberValue(summaryRecord.totalFilesChanged) : null;
        if (fromSummary !== null)
            return Math.max(0, Math.floor(fromSummary));
        const blastRadius = asObjectRecord(payload.blastRadius);
        const fromBlastRadius = blastRadius ? asNumberValue(blastRadius.filesChanged) : null;
        if (fromBlastRadius !== null)
            return Math.max(0, Math.floor(fromBlastRadius));
        return fileSet.size;
    })();
    const driftScoreRaw = asNumberValue(payload.driftScore);
    const driftScore = driftScoreRaw === null
        ? undefined
        : Math.max(0, Math.min(100, Math.round(driftScoreRaw)));
    const expediteModeUsed = resolveExpediteModeFromPayload(payload);
    const scopeTriageItems = scopeIssues.map((item) => ({
        file: item.file,
        message: item.message,
        policy: 'scope_guard',
        severity: 'block',
        source: 'scope',
    }));
    const violationTriageItems = violations.map((item) => ({
        file: item.file,
        message: item.message,
        policy: item.policy,
        severity: item.severity,
        source: 'violation',
    }));
    const warningTriageItems = warnings.map((item) => ({
        file: item.file,
        message: item.message,
        policy: item.policy,
        severity: 'warning',
        source: 'warning',
    }));
    const defaultBlockingItems = dedupeTriageItems([
        ...scopeTriageItems,
        ...violationTriageItems.filter((item) => item.severity === 'critical' || item.severity === 'high'),
    ]);
    const defaultAdvisoryItems = dedupeTriageItems([
        ...warningTriageItems,
        ...violationTriageItems.filter((item) => item.severity === 'warning' || item.severity === 'info'),
    ]);
    const expediteBlockingItems = dedupeTriageItems([
        ...scopeTriageItems.filter((item) => isCriticalScopeBreach(item.file, item.message)),
        ...violationTriageItems.filter((item) => isSecurityOrAuthViolation(item.file, item.policy, item.message)),
        ...warningTriageItems
            .filter((item) => isSecurityOrAuthViolation(item.file, item.policy, item.message))
            .map((item) => ({
            ...item,
            source: 'violation',
        })),
    ]);
    const expediteItems = dedupeTriageItems([
        ...scopeTriageItems
            .filter((item) => !isCriticalScopeBreach(item.file, item.message))
            .map((item) => ({
            ...item,
            source: 'expedite',
        })),
        ...violationTriageItems
            .filter((item) => !isSecurityOrAuthViolation(item.file, item.policy, item.message))
            .map((item) => ({
            ...item,
            source: 'expedite',
        })),
        ...warningTriageItems
            .filter((item) => !isSecurityOrAuthViolation(item.file, item.policy, item.message))
            .map((item) => ({
            ...item,
            source: 'expedite',
        })),
    ]);
    // ── Intent issues and summary from engine ───────────────────────────────
    const rawIntentIssues = Array.isArray(payload.intentIssues) ? payload.intentIssues : [];
    const intentDomains = Array.isArray(payload.intentDomains) ? payload.intentDomains : [];
    const intentSummary = (payload.intentSummary ?? null);
    const rawFlowIssues = Array.isArray(payload.flowIssues) ? payload.flowIssues : [];
    const rawRegressions = Array.isArray(payload.regressions) ? payload.regressions : [];
    // High-severity intent issues become blocking; medium become advisory.
    const intentBlockingTriageItems = rawIntentIssues
        .filter((i) => i.severity === 'high')
        .map((i) => ({
        file: (i.files?.[0]) ?? 'intent-analysis',
        message: i.message,
        policy: i.rule,
        severity: 'high',
        source: 'violation',
    }));
    const intentAdvisoryTriageItems = rawIntentIssues
        .filter((i) => i.severity === 'medium')
        .map((i) => ({
        file: (i.files?.[0]) ?? 'intent-analysis',
        message: i.message,
        policy: i.rule,
        severity: 'warning',
        source: 'warning',
    }));
    // V5: flow issues — high → blocking, medium → advisory
    const flowBlockingTriageItems = rawFlowIssues
        .filter((i) => i.severity === 'high')
        .map((i) => ({
        file: (i.files?.[0]) ?? 'flow-analysis',
        message: i.message,
        policy: i.rule,
        severity: 'high',
        source: 'violation',
    }));
    const flowAdvisoryTriageItems = rawFlowIssues
        .filter((i) => i.severity === 'medium')
        .map((i) => ({
        file: (i.files?.[0]) ?? 'flow-analysis',
        message: i.message,
        policy: i.rule,
        severity: 'warning',
        source: 'warning',
    }));
    let blockingItems = expediteModeUsed ? expediteBlockingItems : defaultBlockingItems;
    let advisoryItems = expediteModeUsed ? expediteItems : defaultAdvisoryItems;
    if (intentBlockingTriageItems.length > 0) {
        blockingItems = dedupeTriageItems([...blockingItems, ...intentBlockingTriageItems]);
    }
    if (intentAdvisoryTriageItems.length > 0) {
        advisoryItems = dedupeTriageItems([...advisoryItems, ...intentAdvisoryTriageItems]);
    }
    if (flowBlockingTriageItems.length > 0) {
        blockingItems = dedupeTriageItems([...blockingItems, ...flowBlockingTriageItems]);
    }
    if (flowAdvisoryTriageItems.length > 0) {
        advisoryItems = dedupeTriageItems([...advisoryItems, ...flowAdvisoryTriageItems]);
    }
    // V6: regressions — always blocking
    const regressionBlockingTriageItems = rawRegressions.map((r) => ({
        file: 'regression-analysis',
        message: r.message,
        policy: r.rule,
        severity: 'high',
        source: 'violation',
    }));
    if (regressionBlockingTriageItems.length > 0) {
        blockingItems = dedupeTriageItems([...regressionBlockingTriageItems, ...blockingItems]);
    }
    const grade = verdict === 'PASS' ? 'A' : verdict === 'WARN' ? 'C' : 'F';
    return {
        grade,
        score: violations.length === 0 && warnings.length === 0 && scopeIssues.length === 0 ? 100 : 0,
        verdict,
        summary: {
            totalFilesChanged,
            totalViolations: violations.length,
            totalWarnings: warnings.length,
            totalScopeIssues: scopeIssues.length,
        },
        violations,
        warnings,
        scopeIssues,
        blockingCount: blockingItems.length,
        advisoryCount: advisoryItems.length,
        blockingItems,
        advisoryItems,
        intentIssues: rawIntentIssues,
        intentDomains,
        intentSummary,
        flowIssues: rawFlowIssues,
        regressions: rawRegressions,
        expediteModeUsed,
        expediteCount: expediteModeUsed ? expediteItems.length : 0,
        expediteItems: expediteModeUsed ? expediteItems : [],
        expediteFollowUpChecklist: expediteModeUsed ? [...EXPEDITE_FOLLOW_UP_CHECKLIST] : [],
        ...(expediteModeUsed ? { expediteNote: 'Expedite Mode used' } : {}),
        ...(typeof driftScore === 'number' ? { driftScore } : {}),
    };
}
function emitCanonicalVerifyJson(payload) {
    console.log(JSON.stringify(toCanonicalVerifyOutput(payload), null, 2));
}
function buildDeterministicLayerSummary(payload) {
    const verdict = asStringValue(payload.verdict) || 'UNKNOWN';
    const mode = asStringValue(payload.mode) || 'unknown';
    const policyOnly = payload.policyOnly === true;
    const scopeGuardPassed = asBooleanFlag(payload.scopeGuardPassed);
    const violations = asObjectArray(payload.violations);
    const policyViolations = violations.filter((entry) => {
        const rule = String(entry.rule || '').toLowerCase();
        return (!rule.includes('scope_guard')
            && !rule.includes('change_contract')
            && !rule.includes('runtime_guard')
            && !rule.includes('deterministic_artifacts_required')
            && !rule.includes('signed_artifacts_required'));
    });
    const policyBlocking = policyViolations.filter((entry) => String(entry.severity || '').toLowerCase() === 'block');
    const policyWarnings = policyViolations.filter((entry) => String(entry.severity || '').toLowerCase() === 'warn');
    const changeContract = asObjectRecord(payload.changeContract);
    const changeContractValid = asBooleanFlag(changeContract?.valid);
    const changeContractEnforced = changeContract?.enforced === true;
    const changeContractViolations = Array.isArray(changeContract?.violations)
        ? (changeContract?.violations).length
        : 0;
    const explicitContractViolations = violations.filter((entry) => {
        const rule = String(entry.rule || '').toLowerCase();
        return rule.includes('scope_guard') || rule.includes('change_contract');
    }).length;
    const runtimeGuard = asObjectRecord(payload.runtimeGuard);
    const runtimeGuardRequired = runtimeGuard?.required === true;
    const runtimeGuardPass = asBooleanFlag(runtimeGuard?.pass);
    const runtimeGuardViolations = Array.isArray(runtimeGuard?.violations)
        ? (runtimeGuard?.violations).length
        : violations.filter((entry) => String(entry.rule || '').toLowerCase().includes('runtime_guard')).length;
    const policyCompilation = asObjectRecord(payload.policyCompilation);
    const deterministicRuleCount = asNumberValue(policyCompilation?.deterministicRuleCount);
    const unmatchedStatements = asNumberValue(policyCompilation?.unmatchedStatements);
    let policyGateStatus = 'pass';
    if (policyBlocking.length > 0) {
        policyGateStatus = 'fail';
    }
    else if (policyWarnings.length > 0 || verdict === 'WARN') {
        policyGateStatus = 'warn';
    }
    let contractGateStatus = 'not_applicable';
    if (!policyOnly) {
        contractGateStatus = 'pass';
        if (changeContractEnforced
            && (changeContractValid === false || changeContractViolations > 0 || explicitContractViolations > 0 || scopeGuardPassed === false)) {
            contractGateStatus = 'fail';
        }
        else if (!changeContractEnforced && (changeContractViolations > 0 || explicitContractViolations > 0)) {
            contractGateStatus = 'warn';
        }
    }
    let runtimeGuardStatus = 'not_applicable';
    if (runtimeGuardRequired) {
        runtimeGuardStatus = runtimeGuardPass === false || runtimeGuardViolations > 0 ? 'fail' : 'pass';
    }
    else if (runtimeGuardViolations > 0) {
        runtimeGuardStatus = 'fail';
    }
    return {
        policyGate: {
            status: policyGateStatus,
            blockingViolations: policyBlocking.length,
            warningViolations: policyWarnings.length,
            deterministicRuleCount: deterministicRuleCount ?? null,
            unmatchedStatements: unmatchedStatements ?? null,
        },
        contractGate: {
            status: contractGateStatus,
            enforced: changeContractEnforced,
            valid: changeContractValid,
            violationCount: changeContractViolations + explicitContractViolations,
            mode,
        },
        runtimeGuardGate: {
            status: runtimeGuardStatus,
            required: runtimeGuardRequired,
            pass: runtimeGuardPass,
            violationCount: runtimeGuardViolations,
        },
    };
}
function toAiDebtSummary(evaluation) {
    return {
        mode: evaluation.mode,
        pass: evaluation.pass,
        score: evaluation.score,
        source: evaluation.source,
        metrics: {
            addedTodoFixme: evaluation.metrics.addedTodoFixme,
            addedConsoleLogs: evaluation.metrics.addedConsoleLogs,
            addedAnyTypes: evaluation.metrics.addedAnyTypes,
            largeFilesTouched: evaluation.metrics.largeFilesTouched,
            bloatFiles: evaluation.metrics.bloatFiles,
        },
        thresholds: {
            maxAddedTodoFixme: evaluation.thresholds.maxAddedTodoFixme,
            maxAddedConsoleLogs: evaluation.thresholds.maxAddedConsoleLogs,
            maxAddedAnyTypes: evaluation.thresholds.maxAddedAnyTypes,
            maxLargeFilesTouched: evaluation.thresholds.maxLargeFilesTouched,
            largeFileDeltaLines: evaluation.thresholds.largeFileDeltaLines,
            maxBloatFiles: evaluation.thresholds.maxBloatFiles,
        },
        violations: evaluation.violations.map((item) => ({
            code: item.code,
            metric: item.metric,
            observed: item.observed,
            budget: item.budget,
            message: item.message,
            ...(item.files && item.files.length > 0 ? { files: item.files } : {}),
        })),
    };
}
const ARCH_VIOLATION_CODES = new Set(['db_in_ui', 'missing_validation']);
function toAiDebtReportViolations(summary) {
    if (summary.mode === 'off' || summary.violations.length === 0) {
        return [];
    }
    const defaultSeverity = summary.mode === 'enforce' ? 'block' : 'warn';
    const result = [];
    for (const item of summary.violations) {
        // Architectural violations are always advisory (warn) — heuristic detection, not a hard block
        const severity = ARCH_VIOLATION_CODES.has(item.code) ? 'warn' : defaultSeverity;
        const rule = ARCH_VIOLATION_CODES.has(item.code) ? item.code : `ai_debt:${item.code}`;
        const files = item.files && item.files.length > 0 ? item.files : null;
        if (files) {
            for (const file of files) {
                result.push({ rule, file, severity, message: item.message });
            }
        }
        else {
            result.push({ rule, file: '.neurcode/ai-debt-budget.json', severity, message: item.message });
        }
    }
    return result;
}
function parseSigningKeyRing(raw) {
    if (!raw || !raw.trim()) {
        return {};
    }
    const out = {};
    for (const token of raw.split(/[,\n;]+/)) {
        const trimmed = token.trim();
        if (!trimmed)
            continue;
        const separator = trimmed.indexOf('=');
        if (separator <= 0)
            continue;
        const keyId = trimmed.slice(0, separator).trim();
        const key = trimmed.slice(separator + 1).trim();
        if (!keyId || !key)
            continue;
        out[keyId] = key;
    }
    return out;
}
function resolveGovernanceSigningConfig() {
    const artifactSigningConfig = (0, artifact_signature_1.resolveGovernanceArtifactSigningConfigFromEnv)();
    const signer = process.env.NEURCODE_GOVERNANCE_SIGNER || process.env.USER || 'neurcode-cli';
    return {
        signingKey: artifactSigningConfig.signingKey,
        signingKeyId: artifactSigningConfig.signingKeyId,
        signingKeys: artifactSigningConfig.signingKeys,
        signer,
    };
}
function isGitRepository(cwd) {
    try {
        const output = (0, child_process_1.execSync)('git rev-parse --is-inside-work-tree', {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 1024 * 1024,
        }).trim().toLowerCase();
        return output === 'true';
    }
    catch {
        return false;
    }
}
function resolveVerifyExpediteMode(projectRoot) {
    if (isEnabledFlag(process.env.NEURCODE_EXPEDITE_MODE) || isEnabledFlag(process.env.NEURCODE_MCP_EXPEDITE_MODE)) {
        return true;
    }
    const branchName = (0, git_1.detectCurrentGitBranch)(projectRoot) || process.env.GITHUB_REF_NAME || '';
    return containsAnyToken(branchName, ['hotfix', 'urgent', 'prod-down', 'prod_down', 'prod down', 'incident', 'expedite']);
}
function isSignedAiLogsRequired(orgGovernanceSettings) {
    const explicitRequirement = isEnabledFlag(process.env.NEURCODE_GOVERNANCE_REQUIRE_SIGNED_LOGS) ||
        isEnabledFlag(process.env.NEURCODE_AI_LOG_REQUIRE_SIGNED);
    if (explicitRequirement) {
        return true;
    }
    const honorOrgRequirement = isEnabledFlag(process.env.NEURCODE_GOVERNANCE_ENFORCE_ORG_SIGNED_LOG_REQUIREMENT);
    return honorOrgRequirement && orgGovernanceSettings?.requireSignedAiLogs === true;
}
function policyLockMismatchMessage(mismatches) {
    if (mismatches.length === 0) {
        return 'Policy lock baseline check failed';
    }
    return `Policy lock mismatch: ${mismatches.map((item) => `[${item.code}] ${item.message}`).join('; ')}`;
}
function toPolicyLockViolations(mismatches) {
    return mismatches.map((item) => ({
        file: 'neurcode.policy.lock.json',
        rule: `policy_lock:${item.code.toLowerCase()}`,
        severity: 'block',
        message: item.message,
    }));
}
function resolvePolicyDecisionFromViolations(violations) {
    let hasWarn = false;
    for (const violation of violations) {
        const severity = String(violation.severity || '').toLowerCase();
        if (severity === 'block') {
            return 'block';
        }
        if (severity === 'warn') {
            hasWarn = true;
        }
    }
    return hasWarn ? 'warn' : 'allow';
}
function explainExceptionEligibilityReason(reason) {
    switch (reason) {
        case 'reason_required':
            return 'exception reason does not meet governance minimum length';
        case 'duration_exceeds_max':
            return 'exception expiry window exceeds governance maximum duration';
        case 'approval_required':
            return 'exception exists but approvals are required';
        case 'critical_approvals_required':
            return 'critical rule exception requires additional independent approvals';
        case 'insufficient_approvals':
            return 'exception exists but approval threshold is not met';
        case 'self_approval_only':
            return 'exception only has requester self-approval';
        case 'approver_not_allowed':
            return 'exception approvals are from non-allowlisted approvers';
        default:
            return 'exception is inactive or expired';
    }
}
function resolveAuditIntegrityStatus(requireIntegrity, auditIntegrity) {
    const issues = [...auditIntegrity.issues];
    if (requireIntegrity && auditIntegrity.count === 0) {
        issues.push('audit chain has no events; commit neurcode.policy.audit.log.jsonl');
    }
    return {
        valid: issues.length === 0,
        issues,
    };
}
function describePolicyExceptionSource(mode) {
    switch (mode) {
        case 'org':
            return 'org control plane';
        case 'org_fallback_local':
            return 'local file fallback (org unavailable)';
        case 'local':
        default:
            return 'local file';
    }
}
function pickExceptionIdentity(userId, email, allowSet) {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    if (allowSet.size > 0) {
        if (normalizedEmail && allowSet.has(normalizedEmail.toLowerCase())) {
            return normalizedEmail;
        }
        if (normalizedUserId && allowSet.has(normalizedUserId.toLowerCase())) {
            return normalizedUserId;
        }
    }
    if (normalizedEmail)
        return normalizedEmail;
    if (normalizedUserId)
        return normalizedUserId;
    return 'unknown';
}
function mapOrgPolicyExceptionToLocalEntry(exception, allowSet) {
    const createdBy = pickExceptionIdentity(exception.createdBy, exception.requestedByEmail, allowSet);
    const requestedBy = pickExceptionIdentity(exception.requestedBy, exception.requestedByEmail, allowSet);
    return {
        id: exception.id,
        rulePattern: exception.rulePattern,
        filePattern: exception.filePattern,
        reason: exception.reason,
        ticket: exception.ticket,
        createdAt: exception.createdAt,
        createdBy,
        requestedBy,
        expiresAt: exception.expiresAt,
        severity: exception.severity,
        active: exception.active === true
            && exception.workflowState !== 'revoked'
            && exception.workflowState !== 'rejected',
        approvals: (exception.approvals || []).map((approval) => ({
            approver: pickExceptionIdentity(approval.approverUserId, approval.approverEmail, allowSet),
            approvedAt: approval.createdAt,
            comment: approval.note || null,
        })),
    };
}
async function resolveEffectivePolicyExceptions(input) {
    const localExceptions = (0, policy_exceptions_1.readPolicyExceptions)(input.projectRoot);
    if (!input.useOrgControlPlane) {
        return {
            mode: 'local',
            exceptions: localExceptions,
            localConfigured: localExceptions.length,
            orgConfigured: 0,
            warning: null,
        };
    }
    try {
        const orgExceptions = await input.client.listOrgPolicyExceptions({ limit: 250 });
        const allowSet = new Set((input.governance.exceptionApprovals.allowedApprovers || []).map((item) => item.toLowerCase()));
        const mapped = orgExceptions
            .map((entry) => mapOrgPolicyExceptionToLocalEntry(entry, allowSet))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        return {
            mode: 'org',
            exceptions: mapped,
            localConfigured: localExceptions.length,
            orgConfigured: mapped.length,
            warning: null,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            mode: 'org_fallback_local',
            exceptions: localExceptions,
            localConfigured: localExceptions.length,
            orgConfigured: 0,
            warning: `Org policy exceptions unavailable; falling back to local exceptions (${message})`,
        };
    }
}
async function recordVerificationIfRequested(options, config, payload) {
    if (!options.record) {
        return;
    }
    if (!config.apiKey) {
        if (!payload.jsonMode) {
            console.log(chalk.yellow('\n⚠️  --record flag requires API key'));
            console.log(chalk.dim('   Set NEURCODE_API_KEY environment variable or use --api-key flag'));
        }
        return;
    }
    await reportVerification(payload.grade, payload.violations, payload.verifyResult, config.apiKey, config.apiUrl || 'https://api.neurcode.com', payload.projectId, payload.jsonMode, payload.governance, payload.verificationSource);
}
/**
 * Execute policy-only verification (General Governance mode)
 * Returns the exit code to use
 */
async function executePolicyOnlyMode(options, diffFiles, ignoreFilter, projectRoot, config, client, source, scopeTelemetry, projectId, orgGovernanceSettings, aiLogSigningKey, aiLogSigningKeyId, aiLogSigningKeys, aiLogSigner, expediteModeEnabled, compiledPolicyArtifact, compiledPolicyMetadata, changeContractSummary) {
    const emitPolicyOnlyJson = (payload) => {
        emitCanonicalVerifyJson({
            ...payload,
            expediteMode: expediteModeEnabled,
        });
    };
    const policyOnlyVerificationSource = 'policy_only';
    const recordPolicyOnlyVerification = async (payload) => recordVerificationIfRequested(options, config, {
        ...payload,
        verificationSource: policyOnlyVerificationSource,
        verifyResult: {
            ...payload.verifyResult,
            verificationSource: policyOnlyVerificationSource,
        },
    });
    if (!options.json) {
        console.log(chalk.cyan('🛡️  General Governance mode (policy only, no plan linked)\n'));
    }
    const diffFilesForPolicy = diffFiles.filter((f) => !ignoreFilter(f.path));
    const expectedPolicyOnlyFiles = diffFilesForPolicy.map((file) => file.path);
    const signedLogsRequired = isSignedAiLogsRequired(orgGovernanceSettings);
    const governanceAnalysis = (0, governance_1.evaluateGovernance)({
        projectRoot,
        task: 'Policy-only verification',
        expectedFiles: expectedPolicyOnlyFiles,
        diffFiles: diffFilesForPolicy,
        contextCandidates: expectedPolicyOnlyFiles,
        orgGovernance: orgGovernanceSettings,
        requireSignedAiLogs: signedLogsRequired,
        signingKey: aiLogSigningKey,
        signingKeyId: aiLogSigningKeyId,
        signingKeys: aiLogSigningKeys,
        signer: aiLogSigner,
    });
    const governancePayload = buildGovernancePayload(governanceAnalysis, orgGovernanceSettings, {
        compiledPolicy: compiledPolicyMetadata,
        changeContract: changeContractSummary,
    });
    const contextPolicyViolations = governanceAnalysis.contextPolicy.violations.filter((item) => !ignoreFilter(item.file));
    if (signedLogsRequired && !governanceAnalysis.aiChangeLogIntegrity.valid) {
        const message = `AI change-log integrity check failed: ${governanceAnalysis.aiChangeLogIntegrity.issues.join('; ') || 'unknown issue'}`;
        if (options.json) {
            emitPolicyOnlyJson({
                grade: 'F',
                score: 0,
                verdict: 'FAIL',
                violations: [
                    {
                        file: '.neurcode/ai-change-log.json',
                        rule: 'ai_change_log_integrity',
                        severity: 'block',
                        message,
                    },
                ],
                message,
                scopeGuardPassed: false,
                bloatCount: 0,
                bloatFiles: [],
                plannedFilesModified: 0,
                totalPlannedFiles: 0,
                adherenceScore: 0,
                mode: 'policy_only',
                policyOnly: true,
                policyOnlySource: source,
                ...governancePayload,
            });
        }
        else {
            console.log(chalk.red('❌ AI change-log integrity validation failed (policy-only mode).'));
            console.log(chalk.red(`   ${message}`));
        }
        await recordPolicyOnlyVerification({
            grade: 'F',
            violations: [
                {
                    file: '.neurcode/ai-change-log.json',
                    rule: 'ai_change_log_integrity',
                    severity: 'block',
                    message,
                },
            ],
            verifyResult: {
                adherenceScore: 0,
                verdict: 'FAIL',
                bloatCount: 0,
                bloatFiles: [],
                message,
            },
            projectId,
            jsonMode: Boolean(options.json),
            governance: governancePayload,
        });
        return 2;
    }
    if (governanceAnalysis.governanceDecision.decision === 'block') {
        const message = governanceAnalysis.governanceDecision.summary
            || 'Governance decision matrix returned BLOCK.';
        const reasonCodes = governanceAnalysis.governanceDecision.reasonCodes || [];
        if (options.json) {
            emitPolicyOnlyJson({
                grade: 'F',
                score: 0,
                verdict: 'FAIL',
                violations: [
                    {
                        file: '.neurcode/ai-change-log.json',
                        rule: 'governance_decision_block',
                        severity: 'block',
                        message,
                    },
                ],
                message,
                scopeGuardPassed: false,
                bloatCount: 0,
                bloatFiles: [],
                plannedFilesModified: 0,
                totalPlannedFiles: 0,
                adherenceScore: 0,
                mode: 'policy_only',
                policyOnly: true,
                policyOnlySource: source,
                ...governancePayload,
            });
        }
        else {
            console.log(chalk.red('❌ Governance decision blocked this change set (policy-only mode).'));
            if (reasonCodes.length > 0) {
                console.log(chalk.red(`   Reasons: ${reasonCodes.join(', ')}`));
            }
            console.log(chalk.red(`   ${message}`));
        }
        await recordPolicyOnlyVerification({
            grade: 'F',
            violations: [
                {
                    file: '.neurcode/ai-change-log.json',
                    rule: 'governance_decision_block',
                    severity: 'block',
                    message,
                },
            ],
            verifyResult: {
                adherenceScore: 0,
                verdict: 'FAIL',
                bloatCount: 0,
                bloatFiles: [],
                message,
            },
            projectId,
            jsonMode: Boolean(options.json),
            governance: governancePayload,
        });
        return 2;
    }
    if (contextPolicyViolations.length > 0) {
        const message = `Context policy violation: ${contextPolicyViolations.map((item) => item.file).join(', ')}`;
        const contextPolicyViolationItems = contextPolicyViolations.map((item) => ({
            file: item.file,
            rule: `context_policy:${item.rule}`,
            severity: 'block',
            message: item.reason,
        }));
        if (options.json) {
            emitPolicyOnlyJson({
                grade: 'F',
                score: 0,
                verdict: 'FAIL',
                violations: contextPolicyViolationItems,
                message,
                scopeGuardPassed: false,
                bloatCount: 0,
                bloatFiles: [],
                plannedFilesModified: 0,
                totalPlannedFiles: 0,
                adherenceScore: 0,
                mode: 'policy_only',
                policyOnly: true,
                policyOnlySource: source,
                ...governancePayload,
            });
        }
        else {
            console.log(chalk.red('❌ Context policy violation detected (policy-only mode).'));
            contextPolicyViolations.forEach((item) => {
                console.log(chalk.red(`   • ${item.file}: ${item.reason}`));
            });
            console.log(chalk.dim(`\n${message}`));
        }
        await recordPolicyOnlyVerification({
            grade: 'F',
            violations: contextPolicyViolationItems,
            verifyResult: {
                adherenceScore: 0,
                verdict: 'FAIL',
                bloatCount: 0,
                bloatFiles: [],
                message,
            },
            projectId,
            jsonMode: Boolean(options.json),
            governance: governancePayload,
        });
        return 2;
    }
    let policyViolations = [];
    let policyDecision = 'allow';
    const requirePolicyLock = options.requirePolicyLock === true || isEnabledFlag(process.env.NEURCODE_VERIFY_REQUIRE_POLICY_LOCK);
    const skipPolicyLock = options.skipPolicyLock === true || isEnabledFlag(process.env.NEURCODE_VERIFY_SKIP_POLICY_LOCK);
    const lockRead = (0, policy_packs_1.readPolicyLockFile)(projectRoot);
    const includeDashboardPolicies = lockRead.lock
        ? lockRead.lock.customPolicies.mode === 'dashboard'
        : Boolean(config.apiKey);
    let effectiveRulesLoadError = null;
    let effectiveRules = {
        allRules: (0, policy_engine_1.createDefaultPolicy)().rules,
        customRules: [],
        customPolicies: [],
        policyPackRules: [],
        policyPack: null,
        includeDashboardPolicies,
    };
    try {
        effectiveRules = await buildEffectivePolicyRules(client, projectRoot, includeDashboardPolicies);
    }
    catch (error) {
        effectiveRulesLoadError = error instanceof Error ? error.message : 'Unknown error';
        const installedPack = (0, policy_packs_1.getInstalledPolicyPackRules)(projectRoot);
        const fallbackPolicyPackRules = installedPack?.rules ? [...installedPack.rules] : [];
        effectiveRules = {
            allRules: [...(0, policy_engine_1.createDefaultPolicy)().rules, ...fallbackPolicyPackRules],
            customRules: [],
            customPolicies: [],
            policyPackRules: fallbackPolicyPackRules,
            policyPack: installedPack,
            includeDashboardPolicies,
        };
        if (!options.json) {
            console.log(chalk.dim('   Could not load dashboard custom policies, using local/default policy rules only'));
        }
    }
    let policyLockEvaluation = {
        enforced: false,
        matched: true,
        lockPresent: lockRead.lock !== null,
        lockPath: lockRead.path,
        mismatches: [],
    };
    if (!skipPolicyLock) {
        const currentSnapshot = (0, policy_packs_1.buildPolicyStateSnapshot)({
            policyPack: effectiveRules.policyPack,
            policyPackRules: effectiveRules.policyPackRules,
            customPolicies: effectiveRules.customPolicies,
            customRules: effectiveRules.customRules,
            includeDashboardPolicies: effectiveRules.includeDashboardPolicies,
        });
        const lockValidation = (0, policy_packs_1.evaluatePolicyLock)(projectRoot, currentSnapshot, {
            requireLock: requirePolicyLock,
        });
        policyLockEvaluation = {
            enforced: lockValidation.enforced,
            matched: lockValidation.matched,
            lockPresent: lockValidation.lockPresent,
            lockPath: lockValidation.lockPath,
            mismatches: [...lockValidation.mismatches],
        };
        if (effectiveRulesLoadError && includeDashboardPolicies) {
            policyLockEvaluation.mismatches.unshift({
                code: 'POLICY_LOCK_CUSTOM_POLICIES_MISMATCH',
                message: `Failed to load dashboard custom policies: ${effectiveRulesLoadError}`,
            });
            policyLockEvaluation.matched = false;
        }
    }
    if (policyLockEvaluation.enforced && !policyLockEvaluation.matched) {
        const message = policyLockMismatchMessage(policyLockEvaluation.mismatches);
        const lockViolationItems = toPolicyLockViolations(policyLockEvaluation.mismatches);
        if (options.json) {
            emitPolicyOnlyJson({
                grade: 'F',
                score: 0,
                verdict: 'FAIL',
                violations: lockViolationItems,
                message,
                scopeGuardPassed: true,
                bloatCount: 0,
                bloatFiles: [],
                plannedFilesModified: 0,
                totalPlannedFiles: 0,
                adherenceScore: 0,
                mode: 'policy_only',
                policyOnly: true,
                policyOnlySource: source,
                ...governancePayload,
                policyLock: {
                    enforced: true,
                    matched: false,
                    path: policyLockEvaluation.lockPath,
                    mismatches: policyLockEvaluation.mismatches,
                },
            });
        }
        else {
            console.log(chalk.red('❌ Policy lock baseline mismatch.'));
            console.log(chalk.dim(`   Lock file: ${policyLockEvaluation.lockPath}`));
            policyLockEvaluation.mismatches.forEach((item) => {
                console.log(chalk.red(`   • [${item.code}] ${item.message}`));
            });
            console.log(chalk.dim('\n   If drift is intentional, regenerate baseline with `neurcode policy lock`.\n'));
        }
        await recordPolicyOnlyVerification({
            grade: 'F',
            violations: lockViolationItems,
            verifyResult: {
                adherenceScore: 0,
                verdict: 'FAIL',
                bloatCount: 0,
                bloatFiles: [],
                message,
            },
            projectId,
            jsonMode: Boolean(options.json),
            governance: governancePayload,
        });
        return 2;
    }
    if (!options.json && effectiveRules.customRules.length > 0) {
        console.log(chalk.dim(`   Evaluating ${effectiveRules.customRules.length} custom policy rule(s) from dashboard`));
    }
    if (!options.json && effectiveRules.policyPack && effectiveRules.policyPackRules.length > 0) {
        console.log(chalk.dim(`   Evaluating policy pack: ${effectiveRules.policyPack.packName} (${effectiveRules.policyPack.packId}@${effectiveRules.policyPack.version}, ${effectiveRules.policyPackRules.length} rule(s))`));
    }
    else if (!options.json && !effectiveRules.policyPack) {
        console.log(chalk.dim('   No policy pack installed — run `neurcode policy install <pack>` to add governance rules'));
    }
    const policyResult = (0, policy_engine_1.evaluateRules)(diffFilesForPolicy, effectiveRules.allRules);
    policyViolations = (policyResult.violations || []);
    policyViolations = policyViolations.filter((v) => !ignoreFilter(v.file));
    const compiledDeterministicRules = compiledPolicyArtifact
        ? (0, policy_compiler_1.hydrateCompiledPolicyRules)(compiledPolicyArtifact)
        : [];
    const compiledPolicyRuleStatements = compiledPolicyArtifact
        ? [...compiledPolicyArtifact.statements.policyRules]
        : [];
    if (compiledDeterministicRules.length > 0 || compiledPolicyRuleStatements.length > 0) {
        const fileContents = {};
        for (const file of diffFilesForPolicy) {
            const absolutePath = (0, path_1.join)(projectRoot, file.path);
            if (!(0, fs_1.existsSync)(absolutePath)) {
                continue;
            }
            try {
                fileContents[file.path] = (0, fs_1.readFileSync)(absolutePath, 'utf-8');
            }
            catch {
                // Best-effort: deterministic checks can still run against diff lines.
            }
        }
        const deterministicEvaluation = (0, governance_runtime_1.evaluatePlanVerification)({
            planFiles: diffFilesForPolicy.map((file) => ({
                path: file.path,
                action: 'MODIFY',
            })),
            changedFiles: diffFilesForPolicy,
            policyRules: compiledPolicyRuleStatements.length > 0 ? compiledPolicyRuleStatements : undefined,
            extraConstraintRules: compiledDeterministicRules.length > 0 ? compiledDeterministicRules : undefined,
            fileContents,
        });
        if (deterministicEvaluation.constraintViolations.length > 0) {
            const deterministicViolations = deterministicEvaluation.constraintViolations.map((message) => {
                const matchedFile = diffFilesForPolicy.find((file) => message.includes(file.path))?.path || '.neurcode/policy-compiled';
                return {
                    file: matchedFile,
                    rule: 'compiled_policy:deterministic_constraint',
                    severity: 'block',
                    message,
                };
            });
            policyViolations.push(...deterministicViolations);
        }
    }
    const localPolicyGovernance = (0, policy_governance_1.readPolicyGovernanceConfig)(projectRoot);
    const governance = (0, policy_governance_1.mergePolicyGovernanceWithOrgOverrides)(localPolicyGovernance, orgGovernanceSettings?.policyGovernance);
    const auditIntegrity = (0, policy_audit_1.verifyPolicyAuditIntegrity)(projectRoot);
    const auditIntegrityStatus = resolveAuditIntegrityStatus(governance.audit.requireIntegrity, auditIntegrity);
    const policyExceptionResolution = await resolveEffectivePolicyExceptions({
        client,
        projectRoot,
        useOrgControlPlane: Boolean(config.apiKey),
        governance,
    });
    if (policyExceptionResolution.warning && !options.json) {
        console.log(chalk.dim(`   ${policyExceptionResolution.warning}`));
    }
    const configuredPolicyExceptions = policyExceptionResolution.exceptions;
    const exceptionDecision = (0, policy_exceptions_1.applyPolicyExceptions)(policyViolations, configuredPolicyExceptions, {
        requireApproval: governance.exceptionApprovals.required,
        minApprovals: governance.exceptionApprovals.minApprovals,
        disallowSelfApproval: governance.exceptionApprovals.disallowSelfApproval,
        allowedApprovers: governance.exceptionApprovals.allowedApprovers,
        requireReason: governance.exceptionApprovals.requireReason,
        minReasonLength: governance.exceptionApprovals.minReasonLength,
        maxExpiryDays: governance.exceptionApprovals.maxExpiryDays,
        criticalRulePatterns: governance.exceptionApprovals.criticalRulePatterns,
        criticalMinApprovals: governance.exceptionApprovals.criticalMinApprovals,
    });
    const suppressedViolations = exceptionDecision.suppressedViolations.filter((item) => !ignoreFilter(item.file));
    const blockedViolations = exceptionDecision.blockedViolations
        .filter((item) => !ignoreFilter(item.file))
        .map((item) => ({
        file: item.file,
        rule: item.rule,
        severity: 'block',
        message: `Exception ${item.exceptionId} cannot be applied: ${explainExceptionEligibilityReason(item.eligibilityReason)}` +
            (item.requiredApprovals > 0
                ? ` (approvals ${item.effectiveApprovals}/${item.requiredApprovals}${item.critical ? ', critical rule gate' : ''})`
                : ''),
        ...(item.line != null ? { line: item.line } : {}),
    }));
    policyViolations = [
        ...exceptionDecision.remainingViolations.filter((item) => !ignoreFilter(item.file)),
        ...blockedViolations,
    ];
    if (governance.audit.requireIntegrity && !auditIntegrityStatus.valid) {
        policyViolations.push({
            file: POLICY_AUDIT_FILE,
            rule: 'policy_audit_integrity',
            severity: 'block',
            message: `Policy audit chain is invalid: ${auditIntegrityStatus.issues.join('; ') || 'unknown issue'}`,
        });
    }
    policyDecision = resolvePolicyDecisionFromViolations(policyViolations);
    const effectiveVerdict = policyDecision === 'block' ? 'FAIL' : policyDecision === 'warn' ? 'WARN' : 'PASS';
    const grade = effectiveVerdict === 'PASS' ? 'A' : effectiveVerdict === 'WARN' ? 'C' : 'F';
    const score = effectiveVerdict === 'PASS' ? 100 : effectiveVerdict === 'WARN' ? 50 : 0;
    const violationsOutput = policyViolations.map((v) => ({
        file: v.file,
        rule: v.rule,
        severity: v.severity,
        message: v.message,
        ...(v.line != null ? { startLine: v.line } : {}),
    }));
    const message = effectiveVerdict === 'PASS'
        ? '✅ Policy check passed (General Governance mode)'
        : policyViolations.length > 0
            ? `Policy violations: ${policyViolations.map((v) => `${v.file}: ${v.message || v.rule}`).join('; ')}`
            : 'Policy check completed';
    const policyExceptionsSummary = {
        sourceMode: policyExceptionResolution.mode,
        sourceWarning: policyExceptionResolution.warning,
        localConfigured: policyExceptionResolution.localConfigured,
        orgConfigured: policyExceptionResolution.orgConfigured,
        configured: configuredPolicyExceptions.length,
        active: exceptionDecision.activeExceptions.length,
        usable: exceptionDecision.usableExceptions.length,
        matched: exceptionDecision.matchedExceptionIds.length,
        suppressed: suppressedViolations.length,
        blocked: blockedViolations.length,
        matchedExceptionIds: exceptionDecision.matchedExceptionIds,
        suppressedViolations: suppressedViolations.map((item) => ({
            file: item.file,
            rule: item.rule,
            severity: item.severity,
            message: item.message,
            exceptionId: item.exceptionId,
            reason: item.reason,
            expiresAt: item.expiresAt,
            ...(item.line != null ? { startLine: item.line } : {}),
        })),
        blockedViolations: blockedViolations.map((item) => ({
            file: item.file,
            rule: item.rule,
            severity: item.severity,
            message: item.message,
            ...(item.line != null ? { startLine: item.line } : {}),
        })),
    };
    const policyGovernanceSummary = {
        exceptionApprovals: governance.exceptionApprovals,
        audit: {
            requireIntegrity: governance.audit.requireIntegrity,
            valid: auditIntegrityStatus.valid,
            issues: auditIntegrityStatus.issues,
            lastHash: auditIntegrity.lastHash,
            eventCount: auditIntegrity.count,
        },
    };
    if (options.json) {
        emitPolicyOnlyJson({
            grade,
            score,
            verdict: effectiveVerdict,
            violations: violationsOutput,
            message,
            scopeGuardPassed: true, // N/A in policy-only mode
            bloatCount: 0,
            bloatFiles: [],
            plannedFilesModified: 0,
            totalPlannedFiles: 0,
            adherenceScore: score,
            mode: 'policy_only',
            policyOnly: true,
            policyOnlySource: source,
            ...governancePayload,
            policyLock: {
                enforced: policyLockEvaluation.enforced,
                matched: policyLockEvaluation.matched,
                path: policyLockEvaluation.lockPath,
                mismatches: policyLockEvaluation.mismatches,
            },
            policyExceptions: policyExceptionsSummary,
            policyGovernance: policyGovernanceSummary,
            ...(effectiveRules.policyPack
                ? {
                    policyPack: {
                        id: effectiveRules.policyPack.packId,
                        name: effectiveRules.policyPack.packName,
                        version: effectiveRules.policyPack.version,
                        ruleCount: effectiveRules.policyPackRules.length,
                    },
                }
                : {}),
        });
    }
    else {
        if (effectiveVerdict === 'PASS') {
            console.log(chalk.green('✅ Policy check passed'));
        }
        else {
            console.log(chalk.red(`❌ Policy violations detected: ${policyViolations.length}`));
            policyViolations.forEach((v) => {
                console.log(chalk.red(`   • ${v.file}: ${v.message || v.rule}`));
            });
        }
        console.log(chalk.dim(`   Policy exceptions source: ${describePolicyExceptionSource(policyExceptionsSummary.sourceMode)}`));
        if (policyExceptionsSummary.suppressed > 0) {
            console.log(chalk.yellow(`   Policy exceptions applied: ${policyExceptionsSummary.suppressed}`));
        }
        if (policyExceptionsSummary.blocked > 0) {
            console.log(chalk.red(`   Policy exceptions blocked by approval governance: ${policyExceptionsSummary.blocked}`));
        }
        if (governance.audit.requireIntegrity && !auditIntegrityStatus.valid) {
            console.log(chalk.red('   Policy audit integrity check failed'));
        }
        displayGovernanceInsights(governanceAnalysis, { explain: options.explain });
        console.log(chalk.dim(`\n${message}`));
    }
    await recordPolicyOnlyVerification({
        grade,
        violations: violationsOutput,
        verifyResult: {
            adherenceScore: score,
            verdict: effectiveVerdict,
            bloatCount: 0,
            bloatFiles: [],
            message,
        },
        projectId,
        jsonMode: Boolean(options.json),
        governance: governancePayload,
    });
    return effectiveVerdict === 'FAIL' ? 2 : effectiveVerdict === 'WARN' ? 1 : 0;
}
async function verifyCommand(options) {
    try {
        const rootResolution = (0, project_root_1.resolveNeurcodeProjectRootWithTrace)(process.cwd());
        const projectRoot = rootResolution.projectRoot;
        const localPlanSync = (0, plan_sync_1.ensureLocalPlan)(projectRoot);
        const localPlanExpectedFiles = [...localPlanSync.expectedFiles];
        const expediteModeEnabled = resolveVerifyExpediteMode(projectRoot);
        const scopeTelemetry = (0, scope_telemetry_1.buildScopeTelemetryPayload)(rootResolution);
        const emitVerifyJson = (payload) => {
            emitCanonicalVerifyJson({
                ...payload,
                expediteMode: expediteModeEnabled,
                // Intent engine results injected so every code-path gets them.
                intentIssues: payload.intentIssues ?? intentEngineIssues,
                intentDomains: payload.intentDomains ?? intentEngineDomains,
                intentSummary: payload.intentSummary ?? intentEngineSummary,
                // V5: flow issues injected alongside intent issues
                flowIssues: payload.flowIssues ?? intentEngineFlowIssues,
                // V6: regressions always injected
                regressions: payload.regressions ?? intentEngineRegressions,
            });
        };
        if (!isGitRepository(projectRoot)) {
            const message = 'Verify requires a git repository. Initialize git (`git init`) or run this command inside an existing git project.';
            if (options.json) {
                emitVerifyJson({
                    grade: 'F',
                    score: 0,
                    verdict: 'FAIL',
                    violations: [
                        {
                            file: '.',
                            rule: 'git_repository_required',
                            severity: 'block',
                            message,
                        },
                    ],
                    adherenceScore: 0,
                    bloatCount: 0,
                    bloatFiles: [],
                    plannedFilesModified: 0,
                    totalPlannedFiles: 0,
                    message,
                    scopeGuardPassed: false,
                    mode: 'git_repository_required',
                    policyOnly: options.policyOnly === true,
                });
            }
            else {
                console.log(chalk.red('\n❌ Git Repository Required'));
                console.log(chalk.red(`   ${message}`));
                console.log(chalk.dim(`   Current path: ${projectRoot}`));
                console.log(chalk.dim('   Next step: git init && git add . && git commit -m "chore: baseline"\n'));
            }
            process.exit(1);
        }
        const enforceChangeContract = options.enforceChangeContract === true ||
            isEnabledFlag(process.env.NEURCODE_VERIFY_ENFORCE_CHANGE_CONTRACT);
        const explicitStrictArtifactMode = options.strictArtifacts === true ||
            isEnabledFlag(process.env.NEURCODE_VERIFY_STRICT_ARTIFACTS) ||
            isEnabledFlag(process.env.NEURCODE_ENTERPRISE_MODE);
        // Strict artifact mode is only engaged when explicitly requested.
        // Auto-enabling it in CI based on API key presence masked real violations
        // by blocking early on missing artifacts before policy checks could run.
        const strictArtifactMode = explicitStrictArtifactMode;
        const runtimeGuardArtifactPath = (0, runtime_guard_1.resolveRuntimeGuardPath)(projectRoot, options.runtimeGuard);
        const autoRuntimeGuardInStrict = strictArtifactMode
            && (0, fs_1.existsSync)(runtimeGuardArtifactPath)
            && !isEnabledFlag(process.env.NEURCODE_VERIFY_DISABLE_AUTO_RUNTIME_GUARD);
        const requireRuntimeGuard = options.requireRuntimeGuard === true
            || isEnabledFlag(process.env.NEURCODE_VERIFY_REQUIRE_RUNTIME_GUARD)
            || autoRuntimeGuardInStrict;
        const aiDebtConfig = (0, ai_debt_budget_1.resolveAiDebtBudgetConfig)(projectRoot, {
            strictDefault: strictArtifactMode || requireRuntimeGuard,
        });
        const signingConfig = resolveGovernanceSigningConfig();
        const aiLogSigningKey = signingConfig.signingKey;
        const aiLogSigningKeyId = signingConfig.signingKeyId;
        const aiLogSigningKeys = signingConfig.signingKeys;
        const aiLogSigner = signingConfig.signer;
        const hasSigningMaterial = Boolean(aiLogSigningKey) || Object.keys(aiLogSigningKeys).length > 0;
        const allowUnsignedArtifacts = isEnabledFlag(process.env.NEURCODE_VERIFY_ALLOW_UNSIGNED_ARTIFACTS)
            || isEnabledFlag(process.env.NEURCODE_VERIFY_DISABLE_SIGNED_ARTIFACTS);
        const requireSignedArtifacts = options.requireSignedArtifacts === true
            || isEnabledFlag(process.env.NEURCODE_VERIFY_REQUIRE_SIGNED_ARTIFACTS)
            || (!allowUnsignedArtifacts && strictArtifactMode && hasSigningMaterial);
        const changeContractRead = (0, change_contract_1.readChangeContract)(projectRoot, options.changeContract);
        const compiledPolicyRead = (0, policy_compiler_1.readCompiledPolicyArtifact)(projectRoot, options.compiledPolicy);
        let runtimeGuardSummary = createRuntimeGuardSummary(requireRuntimeGuard, projectRoot, options.runtimeGuard);
        let compiledPolicyMetadata = resolveCompiledPolicyMetadata(compiledPolicyRead.artifact, compiledPolicyRead.exists ? compiledPolicyRead.path : null);
        const compiledPolicySignatureStatus = compiledPolicyRead.artifact
            ? (0, artifact_signature_1.verifyGovernanceArtifactSignature)({
                artifact: compiledPolicyRead.artifact,
                requireSigned: requireSignedArtifacts,
                signingKey: aiLogSigningKey,
                signingKeyId: aiLogSigningKeyId,
                signingKeys: aiLogSigningKeys,
            })
            : null;
        if (compiledPolicyMetadata && compiledPolicySignatureStatus) {
            compiledPolicyMetadata.signature = toArtifactSignatureSummary(compiledPolicySignatureStatus);
        }
        const changeContractSignatureStatus = changeContractRead.contract
            ? (0, artifact_signature_1.verifyGovernanceArtifactSignature)({
                artifact: changeContractRead.contract,
                requireSigned: requireSignedArtifacts,
                signingKey: aiLogSigningKey,
                signingKeyId: aiLogSigningKeyId,
                signingKeys: aiLogSigningKeys,
            })
            : null;
        let changeContractSummary = {
            path: changeContractRead.path,
            exists: changeContractRead.exists,
            enforced: enforceChangeContract,
            valid: changeContractRead.contract ? null : changeContractRead.exists ? false : null,
            planId: changeContractRead.contract?.planId || null,
            contractId: changeContractRead.contract?.contractId || null,
            signature: changeContractSignatureStatus
                ? toArtifactSignatureSummary(changeContractSignatureStatus)
                : undefined,
            violations: changeContractRead.error
                ? [
                    {
                        code: 'CHANGE_CONTRACT_PARSE_ERROR',
                        message: changeContractRead.error,
                    },
                ]
                : [],
        };
        // Artifact presence warnings (advisory — missing artifacts fall back to runtime compilation).
        // These must never cause an early exit; real governance signal should always be evaluated.
        const artifactPresenceWarnings = [];
        if (strictArtifactMode) {
            if (!compiledPolicyRead.artifact) {
                artifactPresenceWarnings.push(compiledPolicyRead.error
                    ? `Compiled policy artifact invalid (${compiledPolicyRead.error})`
                    : `Compiled policy artifact missing (${compiledPolicyRead.path})`);
            }
            if (!changeContractRead.contract) {
                artifactPresenceWarnings.push(changeContractRead.error
                    ? `Change contract artifact invalid (${changeContractRead.error})`
                    : `Change contract artifact missing (${changeContractRead.path})`);
            }
            if (!options.json && artifactPresenceWarnings.length > 0) {
                console.log(chalk.yellow('\n⚠️  Deterministic artifact(s) unavailable — falling back to runtime compilation'));
                artifactPresenceWarnings.forEach((entry) => {
                    console.log(chalk.yellow(`   • ${entry}`));
                });
                console.log(chalk.dim('   Governance will continue using runtime compilation. Artifact checks are advisory.\n'));
            }
        }
        // Signature blocking distinguishes two cases:
        // - Artifact has a signature that is INVALID (present=true, valid=false): this is a tamper
        //   indicator and blocks when requireSignedArtifacts is set.
        // - Artifact has NO signature (present=false): this is an unsigned artifact; advisory only,
        //   never blocks — an unsigned artifact cannot be "tampered", only "not signed yet".
        if (strictArtifactMode) {
            const signatureBlockErrors = [];
            if (requireSignedArtifacts
                && compiledPolicySignatureStatus
                && compiledPolicySignatureStatus.present
                && !compiledPolicySignatureStatus.valid) {
                signatureBlockErrors.push(`Compiled policy artifact signature validation failed (${compiledPolicySignatureStatus.issues.join('; ') || 'unknown issue'})`);
            }
            if (requireSignedArtifacts
                && changeContractSignatureStatus
                && changeContractSignatureStatus.present
                && !changeContractSignatureStatus.valid) {
                signatureBlockErrors.push(`Change contract artifact signature validation failed (${changeContractSignatureStatus.issues.join('; ') || 'unknown issue'})`);
            }
            if (signatureBlockErrors.length > 0) {
                const message = `Signed artifact enforcement failed — tampered or invalid signatures detected.\n- ${signatureBlockErrors.join('\n- ')}`;
                if (options.json) {
                    emitVerifyJson({
                        grade: 'F',
                        score: 0,
                        verdict: 'FAIL',
                        violations: signatureBlockErrors.map((entry) => ({
                            file: entry.toLowerCase().includes('compiled policy') ? compiledPolicyRead.path : changeContractRead.path,
                            rule: 'signed_artifacts_required',
                            severity: 'block',
                            message: entry,
                        })),
                        adherenceScore: 0,
                        bloatCount: 0,
                        bloatFiles: [],
                        plannedFilesModified: 0,
                        totalPlannedFiles: 0,
                        message,
                        scopeGuardPassed: false,
                        mode: 'signed_artifacts_required',
                        policyOnly: options.policyOnly === true,
                        changeContract: changeContractSummary,
                        ...(compiledPolicyMetadata ? { policyCompilation: compiledPolicyMetadata } : {}),
                    });
                }
                else {
                    (0, scope_telemetry_1.printScopeTelemetry)(chalk, scopeTelemetry, { includeBlockedWarning: true });
                    console.log(chalk.red('\n⛔ Signed Artifact Validation Failed'));
                    signatureBlockErrors.forEach((entry) => {
                        console.log(chalk.red(`   • ${entry}`));
                    });
                    console.log(chalk.dim('\nRegenerate artifacts with valid signing keys: NEURCODE_GOVERNANCE_SIGNING_KEY or NEURCODE_GOVERNANCE_SIGNING_KEYS.\n'));
                }
                process.exit(2);
            }
            // Advisory notice when artifact has a signature but signing is not required in this context.
            if (!options.json) {
                if (compiledPolicySignatureStatus && !compiledPolicySignatureStatus.valid && !requireSignedArtifacts) {
                    console.log(chalk.yellow(`   ⚠️  Compiled policy signature could not be verified (${compiledPolicySignatureStatus.issues.join('; ') || 'key unavailable'}) — advisory only`));
                }
                if (changeContractSignatureStatus && !changeContractSignatureStatus.valid && !requireSignedArtifacts) {
                    console.log(chalk.yellow(`   ⚠️  Change contract signature could not be verified (${changeContractSignatureStatus.issues.join('; ') || 'key unavailable'}) — advisory only`));
                }
            }
        }
        if (!strictArtifactMode && requireSignedArtifacts) {
            // Non-strict mode with signing required: same signature gate applies.
            const signatureErrors = [];
            if (compiledPolicyRead.artifact && compiledPolicySignatureStatus && !compiledPolicySignatureStatus.valid) {
                signatureErrors.push(`Compiled policy artifact signature validation failed (${compiledPolicySignatureStatus.issues.join('; ') || 'unknown issue'})`);
            }
            if (changeContractRead.contract && changeContractSignatureStatus && !changeContractSignatureStatus.valid) {
                signatureErrors.push(`Change contract artifact signature validation failed (${changeContractSignatureStatus.issues.join('; ') || 'unknown issue'})`);
            }
            if (signatureErrors.length > 0) {
                const message = `Signed artifact enforcement failed.\n- ${signatureErrors.join('\n- ')}`;
                if (options.json) {
                    emitVerifyJson({
                        grade: 'F',
                        score: 0,
                        verdict: 'FAIL',
                        violations: signatureErrors.map((entry) => ({
                            file: entry.toLowerCase().includes('compiled policy') ? compiledPolicyRead.path : changeContractRead.path,
                            rule: 'signed_artifacts_required',
                            severity: 'block',
                            message: entry,
                        })),
                        adherenceScore: 0,
                        bloatCount: 0,
                        bloatFiles: [],
                        plannedFilesModified: 0,
                        totalPlannedFiles: 0,
                        message,
                        scopeGuardPassed: false,
                        mode: 'signed_artifacts_required',
                        policyOnly: options.policyOnly === true,
                        changeContract: changeContractSummary,
                        ...(compiledPolicyMetadata ? { policyCompilation: compiledPolicyMetadata } : {}),
                    });
                }
                else {
                    (0, scope_telemetry_1.printScopeTelemetry)(chalk, scopeTelemetry, { includeBlockedWarning: true });
                    console.log(chalk.red('\n⛔ Signed Artifact Requirements Failed'));
                    signatureErrors.forEach((entry) => console.log(chalk.red(`   • ${entry}`)));
                    console.log(chalk.dim('\nEnable signing keys via NEURCODE_GOVERNANCE_SIGNING_KEY or NEURCODE_GOVERNANCE_SIGNING_KEYS and regenerate artifacts.\n'));
                }
                process.exit(2);
            }
        }
        if (!options.json) {
            (0, scope_telemetry_1.printScopeTelemetry)(chalk, scopeTelemetry, {
                includeBlockedWarning: true,
            });
            if (compiledPolicyRead.error) {
                console.log(chalk.yellow(`   Compiled policy artifact unavailable (${compiledPolicyRead.error}); falling back to runtime compilation`));
            }
            else if (compiledPolicyRead.artifact) {
                console.log(chalk.dim(`   Compiled policy loaded: ${compiledPolicyRead.path} (${compiledPolicyRead.artifact.compilation.deterministicRuleCount} deterministic rules)`));
            }
            if (changeContractRead.error) {
                console.log(chalk.yellow(`   Change contract unavailable (${changeContractRead.error})`));
            }
            else if (changeContractRead.contract) {
                console.log(chalk.dim(`   Change contract loaded: ${changeContractRead.path}`));
            }
            if (compiledPolicySignatureStatus) {
                if (compiledPolicySignatureStatus.valid) {
                    console.log(chalk.dim(`   Compiled policy signature: valid${compiledPolicySignatureStatus.verifiedWithKeyId ? ` (key ${compiledPolicySignatureStatus.verifiedWithKeyId})` : ''}`));
                }
                else if (compiledPolicySignatureStatus.present || requireSignedArtifacts) {
                    console.log(chalk.yellow(`   Compiled policy signature: invalid (${compiledPolicySignatureStatus.issues.join('; ') || 'unknown issue'})`));
                }
            }
            if (changeContractSignatureStatus) {
                if (changeContractSignatureStatus.valid) {
                    console.log(chalk.dim(`   Change contract signature: valid${changeContractSignatureStatus.verifiedWithKeyId ? ` (key ${changeContractSignatureStatus.verifiedWithKeyId})` : ''}`));
                }
                else if (changeContractSignatureStatus.present || requireSignedArtifacts) {
                    console.log(chalk.yellow(`   Change contract signature: invalid (${changeContractSignatureStatus.issues.join('; ') || 'unknown issue'})`));
                }
            }
            if (autoRuntimeGuardInStrict && !options.requireRuntimeGuard && !isEnabledFlag(process.env.NEURCODE_VERIFY_REQUIRE_RUNTIME_GUARD)) {
                console.log(chalk.dim(`   Strict mode detected runtime guard artifact: auto-enforcing runtime guard (${runtimeGuardArtifactPath}).`));
            }
            if (requireSignedArtifacts) {
                console.log(chalk.dim('   Artifact signature enforcement: enabled (set NEURCODE_VERIFY_ALLOW_UNSIGNED_ARTIFACTS=1 to relax)'));
            }
        }
        // Load configuration
        const config = (0, config_1.loadConfig)();
        // 🛑 FORCE PRIORITY: Env Var > Config
        if (process.env.NEURCODE_API_KEY) {
            config.apiKey = process.env.NEURCODE_API_KEY;
        }
        // CLI flags override everything
        if (options.apiKey) {
            config.apiKey = options.apiKey;
        }
        // Fail-safe check: only require API key if --record is set, otherwise it's optional
        if (!config.apiKey && options.record) {
            config.apiKey = (0, config_1.requireApiKey)();
        }
        // Override API URL if provided via flag
        if (options.apiUrl) {
            config.apiUrl = options.apiUrl.replace(/\/$/, ''); // Remove trailing slash
        }
        else if (!config.apiUrl) {
            // Default to production API URL
            config.apiUrl = 'https://api.neurcode.com';
        }
        else {
            // Ensure no trailing slash
            config.apiUrl = config.apiUrl.replace(/\/$/, '');
        }
        const enforceCompatibilityHandshake = isEnabledFlag(process.env.NEURCODE_VERIFY_ENFORCE_COMPAT_HANDSHAKE)
            || strictArtifactMode
            || (process.env.CI === 'true' && Boolean(config.apiKey));
        if (config.apiKey && config.apiUrl) {
            const compatibilityProbe = await probeApiRuntimeCompatibility(config.apiUrl);
            if (compatibilityProbe.status !== 'ok' && enforceCompatibilityHandshake) {
                const failureMessages = compatibilityProbe.messages.length > 0
                    ? compatibilityProbe.messages
                    : ['Runtime compatibility handshake did not return a successful result.'];
                const message = `Runtime compatibility handshake failed against ${compatibilityProbe.healthUrl}.\n` +
                    failureMessages.map((entry) => `- ${entry}`).join('\n');
                if (options.json) {
                    emitVerifyJson({
                        grade: 'F',
                        score: 0,
                        verdict: 'FAIL',
                        violations: failureMessages.map((entry) => ({
                            file: 'runtime-compatibility',
                            rule: 'runtime_compatibility_handshake',
                            severity: 'block',
                            message: entry,
                        })),
                        adherenceScore: 0,
                        bloatCount: 0,
                        bloatFiles: [],
                        plannedFilesModified: 0,
                        totalPlannedFiles: 0,
                        message,
                        scopeGuardPassed: false,
                        mode: 'runtime_compatibility_failed',
                        policyOnly: options.policyOnly === true,
                        changeContract: changeContractSummary,
                        ...(compiledPolicyMetadata ? { policyCompilation: compiledPolicyMetadata } : {}),
                    });
                }
                else {
                    console.log(chalk.red('\n⛔ Runtime Compatibility Handshake Failed'));
                    failureMessages.forEach((entry) => {
                        console.log(chalk.red(`   • ${entry}`));
                    });
                    console.log(chalk.dim(`   Health endpoint: ${compatibilityProbe.healthUrl}`));
                    if (compatibilityProbe.apiVersion) {
                        console.log(chalk.dim(`   API version: ${compatibilityProbe.apiVersion}`));
                    }
                    console.log(chalk.dim(`   CLI version: ${CLI_COMPONENT_VERSION}`));
                    console.log(chalk.dim('   Upgrade/downgrade CLI, Action, or API to satisfy the runtime compatibility contract before running verify.\n'));
                }
                process.exit(2);
            }
            if (compatibilityProbe.status === 'error' && !options.json) {
                console.log(chalk.yellow('\n⚠️  Runtime compatibility mismatch detected (advisory mode).'));
                compatibilityProbe.messages.forEach((entry) => {
                    console.log(chalk.yellow(`   • ${entry}`));
                });
            }
            else if (compatibilityProbe.status === 'warn' && !options.json) {
                compatibilityProbe.messages.forEach((entry) => {
                    console.log(chalk.dim(`   ${entry}`));
                });
            }
            else if (compatibilityProbe.status === 'ok'
                && !options.json
                && isEnabledFlag(process.env.NEURCODE_VERIFY_VERBOSE_COMPAT_HANDSHAKE)) {
                console.log(chalk.dim(`   Runtime compatibility check passed (CLI ${CLI_COMPONENT_VERSION}, API ${compatibilityProbe.apiVersion || 'unknown'})`));
            }
        }
        // Explicitly load config file to get sessionId and lastSessionId
        const configPath = (0, path_1.join)(projectRoot, 'neurcode.config.json');
        let configData = {};
        if ((0, fs_1.existsSync)(configPath)) {
            try {
                const fileContent = (0, fs_1.readFileSync)(configPath, 'utf-8');
                configData = JSON.parse(fileContent);
            }
            catch (error) {
                // If parse fails, continue with empty configData
                if ((process.env.DEBUG || process.env.VERBOSE) && !options.json) {
                    console.log(chalk.dim(`Warning: Failed to parse config file at: ${configPath}`));
                }
            }
        }
        // Initialize API client
        const client = new api_client_1.ApiClient(config);
        const projectId = options.projectId || (0, state_1.getProjectId)() || config.projectId;
        const brainScope = {
            orgId: (0, state_1.getOrgId)(),
            projectId: projectId || null,
        };
        let orgGovernanceSettings = null;
        if (config.apiKey) {
            try {
                const remoteSettings = await client.getOrgGovernanceSettings();
                if (remoteSettings) {
                    orgGovernanceSettings = {
                        contextPolicy: (0, policy_1.normalizeContextPolicy)(remoteSettings.contextPolicy),
                        requireSignedAiLogs: remoteSettings.requireSignedAiLogs === true,
                        requireManualApproval: remoteSettings.requireManualApproval !== false,
                        minimumManualApprovals: Math.max(1, Math.min(5, Math.floor(remoteSettings.minimumManualApprovals || 1))),
                        ...(remoteSettings.policyGovernance && typeof remoteSettings.policyGovernance === 'object'
                            ? { policyGovernance: remoteSettings.policyGovernance }
                            : {}),
                        updatedAt: remoteSettings.updatedAt,
                    };
                }
            }
            catch (error) {
                if (!options.json) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.log(chalk.dim(`   Org governance settings unavailable, using local policy only (${message})`));
                }
            }
        }
        const signedLogsRequired = isSignedAiLogsRequired(orgGovernanceSettings);
        const recordVerifyEvent = (verdict, note, changedFiles, planId) => {
            if (!brainScope.orgId || !brainScope.projectId) {
                return;
            }
            try {
                let contextNote = note;
                if (Array.isArray(changedFiles) && changedFiles.length > 0) {
                    const refreshed = (0, brain_context_1.refreshBrainContextForFiles)(projectRoot, brainScope, changedFiles);
                    contextNote = `${contextNote};indexed=${refreshed.indexed};removed=${refreshed.removed};skipped=${refreshed.skipped}`;
                }
                (0, brain_context_1.recordBrainProgressEvent)(projectRoot, brainScope, {
                    type: 'verify',
                    planId,
                    verdict,
                    note: contextNote,
                });
            }
            catch {
                // Never block verify flow on Brain persistence failures.
            }
        };
        if (signedLogsRequired && !hasSigningMaterial) {
            const message = 'Signed AI change-logs are required but no signing key is configured. Set NEURCODE_GOVERNANCE_SIGNING_KEY or NEURCODE_GOVERNANCE_SIGNING_KEYS.';
            recordVerifyEvent('FAIL', 'missing_signing_key_material');
            if (options.json) {
                emitVerifyJson({
                    grade: 'F',
                    score: 0,
                    verdict: 'FAIL',
                    violations: [
                        {
                            file: '.neurcode/ai-change-log.json',
                            rule: 'ai_change_log_signing_required',
                            severity: 'block',
                            message,
                        },
                    ],
                    adherenceScore: 0,
                    bloatCount: 0,
                    bloatFiles: [],
                    plannedFilesModified: 0,
                    totalPlannedFiles: 0,
                    message,
                    scopeGuardPassed: false,
                    mode: 'plan_enforced',
                    policyOnly: false,
                });
            }
            else {
                console.log(chalk.red('\n⛔ Governance Signing Key Missing'));
                console.log(chalk.red(`   ${message}`));
                console.log(chalk.dim('   Recommended: set NEURCODE_GOVERNANCE_SIGNING_KEY_ID and key ring via NEURCODE_GOVERNANCE_SIGNING_KEYS.'));
            }
            await recordVerificationIfRequested(options, config, {
                grade: 'F',
                violations: [
                    {
                        file: '.neurcode/ai-change-log.json',
                        rule: 'ai_change_log_signing_required',
                        severity: 'block',
                        message,
                    },
                ],
                verifyResult: {
                    adherenceScore: 0,
                    verdict: 'FAIL',
                    bloatCount: 0,
                    bloatFiles: [],
                    message,
                },
                projectId: projectId || undefined,
                jsonMode: Boolean(options.json),
            });
            process.exit(2);
        }
        // Determine which diff to capture.
        let diffText;
        let diffContextLabel = '';
        if (options.staged) {
            diffText = (0, child_process_1.execSync)('git diff --cached', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
            diffContextLabel = 'staged changes';
        }
        else if (options.base) {
            diffText = (0, git_1.getDiffFromBase)(options.base);
            diffContextLabel = `working tree vs ${options.base}`;
        }
        else if (options.head) {
            diffText = (0, child_process_1.execSync)('git diff HEAD', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
            diffContextLabel = 'working tree vs HEAD';
        }
        else {
            // Default: resolve a PR-like base context first (origin/main or origin/master).
            // Fallback to staged diff when base context cannot be resolved.
            const defaultContext = (0, git_1.resolveDefaultDiffContext)(projectRoot);
            if (defaultContext.mode === 'base' && defaultContext.baseRef) {
                diffText = (0, git_1.getDiffFromBase)(defaultContext.baseRef);
                diffContextLabel = defaultContext.currentBranch
                    ? `${defaultContext.currentBranch} vs ${defaultContext.baseRef}`
                    : `working tree vs ${defaultContext.baseRef}`;
            }
            else {
                diffText = (0, child_process_1.execSync)('git diff --cached', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
                diffContextLabel = 'staged changes (fallback)';
            }
        }
        if (!options.json && diffContextLabel) {
            console.log(chalk.dim(`   Diff context: ${diffContextLabel}`));
        }
        const untrackedDiffFiles = getUntrackedDiffFiles(projectRoot);
        if (!diffText.trim() && untrackedDiffFiles.length === 0) {
            if (!options.json) {
                console.log(chalk.yellow('⚠️  No changes detected in current diff context.'));
                console.log(chalk.dim('   Tip: Ensure changes are staged or run against a base branch.'));
            }
            else {
                emitVerifyJson({
                    grade: 'F',
                    score: 0,
                    verdict: 'FAIL',
                    violations: [],
                    adherenceScore: 0,
                    bloatCount: 0,
                    bloatFiles: [],
                    plannedFilesModified: 0,
                    totalPlannedFiles: 0,
                    message: 'No changes detected in current diff context.',
                    scopeGuardPassed: false,
                });
            }
            recordVerifyEvent('NO_CHANGES', 'diff=empty');
            process.exit(0);
        }
        // Parse tracked/staged diff and merge untracked files so plan adherence
        // correctly counts newly created files before they are git-added.
        const parsedDiffFiles = diffText.trim() ? (0, diff_parser_1.parseDiff)(diffText) : [];
        const allDiffFiles = [...parsedDiffFiles];
        if (untrackedDiffFiles.length > 0) {
            const existing = new Set(allDiffFiles.map((f) => f.path));
            for (const file of untrackedDiffFiles) {
                if (!existing.has(file.path)) {
                    allDiffFiles.push(file);
                }
            }
        }
        // Filter out internal/system files before analysis
        // This prevents self-interference where the tool flags its own files as bloat
        const diffFiles = allDiffFiles.filter(file => {
            // Check both path and oldPath (for renames) against exclusion list
            const excludePath = isExcludedFile(file.path);
            const excludeOldPath = file.oldPath ? isExcludedFile(file.oldPath) : false;
            return !excludePath && !excludeOldPath;
        });
        const summary = (0, diff_parser_1.getDiffSummary)(diffFiles);
        if (diffFiles.length === 0) {
            if (!options.json) {
                console.log(chalk.yellow('⚠️  No changes detected in current diff context.'));
                console.log(chalk.dim('   Tip: Ensure changes are staged or run against a base branch.'));
            }
            else {
                emitVerifyJson({
                    grade: 'F',
                    score: 0,
                    verdict: 'FAIL',
                    violations: [],
                    adherenceScore: 0,
                    bloatCount: 0,
                    bloatFiles: [],
                    plannedFilesModified: 0,
                    totalPlannedFiles: 0,
                    message: 'No changes detected in current diff context.',
                    scopeGuardPassed: false,
                });
            }
            recordVerifyEvent('NO_CHANGES', 'diff_files=0');
            process.exit(0);
        }
        const ignoreFilter = (0, ignore_1.loadIgnore)(projectRoot);
        const runtimeIgnoreSet = getRuntimeIgnoreSetFromEnv();
        const shouldIgnore = (filePath) => {
            const normalized = toUnixPath(filePath || '');
            return ignoreFilter(normalized) || runtimeIgnoreSet.has(normalized);
        };
        if (requireRuntimeGuard) {
            const guardRead = (0, runtime_guard_1.readRuntimeGuardArtifact)(projectRoot, options.runtimeGuard);
            runtimeGuardSummary = {
                ...runtimeGuardSummary,
                path: guardRead.path,
                exists: guardRead.exists,
                valid: Boolean(guardRead.artifact),
            };
            if (!guardRead.artifact) {
                const message = guardRead.error
                    ? `Runtime guard artifact is invalid: ${guardRead.error}`
                    : 'Runtime guard artifact missing. Run `neurcode guard start` before verify.';
                runtimeGuardSummary = {
                    ...runtimeGuardSummary,
                    active: false,
                    pass: false,
                    violations: [
                        {
                            code: guardRead.error ? 'RUNTIME_GUARD_INACTIVE' : 'RUNTIME_GUARD_INACTIVE',
                            message,
                        },
                    ],
                };
                const runtimeGuardViolationItems = runtimeGuardViolationsToReport(runtimeGuardSummary);
                recordVerifyEvent('FAIL', 'runtime_guard_missing_or_invalid', diffFiles.map((f) => f.path));
                if (options.json) {
                    emitVerifyJson({
                        grade: 'F',
                        score: 0,
                        verdict: 'FAIL',
                        violations: runtimeGuardViolationItems,
                        adherenceScore: 0,
                        bloatCount: 0,
                        bloatFiles: [],
                        plannedFilesModified: 0,
                        totalPlannedFiles: 0,
                        message,
                        scopeGuardPassed: false,
                        mode: 'runtime_guard_required',
                        policyOnly: Boolean(options.policyOnly),
                        runtimeGuard: runtimeGuardSummary,
                    });
                }
                else {
                    console.log(chalk.red('\n⛔ Runtime Guard Required'));
                    console.log(chalk.red(`   ${message}`));
                    console.log(chalk.dim(`   Path: ${runtimeGuardSummary.path}`));
                    console.log(chalk.dim('   Start guard: neurcode guard start --strict\n'));
                }
                await recordVerificationIfRequested(options, config, {
                    grade: 'F',
                    violations: runtimeGuardViolationItems,
                    verifyResult: {
                        adherenceScore: 0,
                        verdict: 'FAIL',
                        bloatCount: 0,
                        bloatFiles: [],
                        message,
                    },
                    projectId: projectId || undefined,
                    jsonMode: Boolean(options.json),
                });
                process.exit(2);
            }
            const runtimeGuardEvaluation = (0, runtime_guard_1.evaluateRuntimeGuardArtifact)(guardRead.artifact, diffFiles.filter((file) => !shouldIgnore(file.path)));
            runtimeGuardSummary = {
                ...runtimeGuardSummary,
                active: guardRead.artifact.active,
                pass: runtimeGuardEvaluation.pass,
                changedFiles: runtimeGuardEvaluation.changedFiles.length,
                outOfScopeFiles: runtimeGuardEvaluation.outOfScopeFiles,
                constraintViolations: runtimeGuardEvaluation.constraintViolations,
                violations: runtimeGuardEvaluation.violations.map((item) => ({
                    code: item.code,
                    message: item.message,
                    ...(item.file ? { file: item.file } : {}),
                })),
            };
            const runtimeGuardUpdated = (0, runtime_guard_1.withRuntimeGuardCheckStats)(guardRead.artifact, {
                blocked: !runtimeGuardEvaluation.pass,
            });
            (0, runtime_guard_1.writeRuntimeGuardArtifact)(projectRoot, runtimeGuardUpdated, options.runtimeGuard);
            if (!runtimeGuardEvaluation.pass) {
                const message = runtimeGuardEvaluation.violations.length > 0
                    ? `Runtime guard blocked ${runtimeGuardEvaluation.violations.length} violation(s).`
                    : 'Runtime guard blocked verification.';
                const runtimeGuardViolationItems = runtimeGuardViolationsToReport(runtimeGuardSummary);
                recordVerifyEvent('FAIL', `runtime_guard_violations=${runtimeGuardEvaluation.violations.length}`, diffFiles.map((f) => f.path));
                if (options.json) {
                    emitVerifyJson({
                        grade: 'F',
                        score: 0,
                        verdict: 'FAIL',
                        violations: runtimeGuardViolationItems,
                        adherenceScore: 0,
                        bloatCount: runtimeGuardEvaluation.outOfScopeFiles.length,
                        bloatFiles: runtimeGuardEvaluation.outOfScopeFiles,
                        plannedFilesModified: runtimeGuardEvaluation.plannedFilesModified,
                        totalPlannedFiles: runtimeGuardEvaluation.totalPlannedFiles,
                        message,
                        scopeGuardPassed: false,
                        mode: 'runtime_guard_blocked',
                        policyOnly: Boolean(options.policyOnly),
                        runtimeGuard: runtimeGuardSummary,
                    });
                }
                else {
                    console.log(chalk.red('\n⛔ Runtime Guard Blocked Verification'));
                    runtimeGuardEvaluation.violations.forEach((item) => {
                        const file = item.file ? `${item.file}: ` : '';
                        console.log(chalk.red(`   • ${file}${item.message}`));
                    });
                    console.log(chalk.dim(`\n   Guard artifact: ${runtimeGuardSummary.path}\n`));
                }
                await recordVerificationIfRequested(options, config, {
                    grade: 'F',
                    violations: runtimeGuardViolationItems,
                    verifyResult: {
                        adherenceScore: runtimeGuardEvaluation.adherenceScore,
                        verdict: 'FAIL',
                        bloatCount: runtimeGuardEvaluation.outOfScopeFiles.length,
                        bloatFiles: runtimeGuardEvaluation.outOfScopeFiles,
                        message,
                    },
                    projectId: projectId || undefined,
                    jsonMode: Boolean(options.json),
                });
                process.exit(2);
            }
            if (!options.json) {
                console.log(chalk.dim(`   Runtime guard passed (${runtimeGuardSummary.changedFiles} changed file(s), ` +
                    `${runtimeGuardSummary.violations.length} violation(s))`));
            }
        }
        const baselineContextPolicyLocal = (0, policy_1.loadContextPolicy)(projectRoot);
        const baselineContextPolicy = orgGovernanceSettings?.contextPolicy
            ? (0, policy_1.mergeContextPolicies)(baselineContextPolicyLocal, orgGovernanceSettings.contextPolicy)
            : baselineContextPolicyLocal;
        const baselineContextPolicyEvaluation = (0, policy_1.evaluateContextPolicyForChanges)(diffFiles.map((file) => file.path), baselineContextPolicy, diffFiles.map((file) => file.path));
        const baselineContextViolations = baselineContextPolicyEvaluation.violations.filter((item) => !shouldIgnore(item.file));
        if (baselineContextViolations.length > 0) {
            const baselineGovernance = (0, governance_1.evaluateGovernance)({
                projectRoot,
                task: 'Context policy validation',
                expectedFiles: [],
                diffFiles,
                contextCandidates: diffFiles.map((file) => file.path),
                orgGovernance: orgGovernanceSettings,
                requireSignedAiLogs: signedLogsRequired,
                signingKey: aiLogSigningKey,
                signingKeyId: aiLogSigningKeyId,
                signingKeys: aiLogSigningKeys,
                signer: aiLogSigner,
            });
            const baselineGovernancePayload = buildGovernancePayload(baselineGovernance, orgGovernanceSettings, {
                changeContract: changeContractSummary,
                compiledPolicy: compiledPolicyMetadata,
            });
            const message = `Context access policy violation: ${baselineContextViolations.map((item) => item.file).join(', ')}`;
            const baselineContextViolationItems = baselineContextViolations.map((item) => ({
                file: item.file,
                rule: `context_policy:${item.rule}`,
                severity: 'block',
                message: item.reason,
            }));
            recordVerifyEvent('FAIL', `context_policy_violations=${baselineContextViolations.length}`, diffFiles.map((f) => f.path));
            if (options.json) {
                emitVerifyJson({
                    grade: 'F',
                    score: 0,
                    verdict: 'FAIL',
                    violations: baselineContextViolationItems,
                    adherenceScore: 0,
                    bloatCount: 0,
                    bloatFiles: [],
                    plannedFilesModified: 0,
                    totalPlannedFiles: 0,
                    message,
                    scopeGuardPassed: false,
                    ...baselineGovernancePayload,
                    mode: 'policy_violation',
                    policyOnly: false,
                });
            }
            else {
                console.log(chalk.red('\n⛔ Context Policy Violation'));
                baselineContextViolations.forEach((item) => {
                    console.log(chalk.red(`   • ${item.file}: ${item.reason}`));
                });
                console.log(chalk.dim(`\nRisk level: ${baselineGovernance.blastRadius.riskScore.toUpperCase()}`));
                console.log(chalk.red('\nAction blocked.\n'));
            }
            await recordVerificationIfRequested(options, config, {
                grade: 'F',
                violations: baselineContextViolationItems,
                verifyResult: {
                    adherenceScore: 0,
                    verdict: 'FAIL',
                    bloatCount: 0,
                    bloatFiles: [],
                    message,
                },
                projectId: projectId || undefined,
                jsonMode: Boolean(options.json),
                governance: baselineGovernancePayload,
            });
            process.exit(2);
        }
        if (!options.json) {
            console.log(chalk.cyan('\n📊 Analyzing change set...'));
            console.log(chalk.dim(`   Found ${summary.totalFiles} file(s) changed`));
            console.log(chalk.dim(`   ${summary.totalAdded} lines added, ${summary.totalRemoved} lines removed\n`));
            if (options.demo) {
                console.log(chalk.dim('   Demo mode enabled: showing extra context while keeping drift output short and grouped.\n'));
            }
        }
        const runPolicyOnlyModeAndExit = async (source) => {
            const exitCode = await executePolicyOnlyMode(options, diffFiles, shouldIgnore, projectRoot, config, client, source, scopeTelemetry, projectId || undefined, orgGovernanceSettings, aiLogSigningKey, aiLogSigningKeyId, aiLogSigningKeys, aiLogSigner, expediteModeEnabled, compiledPolicyRead.artifact, compiledPolicyMetadata, changeContractSummary);
            const changedFiles = diffFiles.map((f) => f.path);
            const verdict = exitCode === 2 ? 'FAIL' : exitCode === 1 ? 'WARN' : 'PASS';
            recordVerifyEvent(verdict, `policy_only_source=${source};exit=${exitCode}`, changedFiles);
            process.exit(exitCode);
        };
        // ============================================
        // --policy-only: General Governance (policy only, no plan enforcement)
        // ============================================
        if (options.policyOnly) {
            await runPolicyOnlyModeAndExit('explicit');
        }
        const requirePlan = options.requirePlan === true
            || process.env.NEURCODE_VERIFY_REQUIRE_PLAN === '1'
            || strictArtifactMode;
        let useLocalPlanSync = false;
        // Get planId: Priority 1: options flag, Priority 2: state file (.neurcode/config.json), Priority 3: legacy config
        let planId = options.planId;
        if (!planId) {
            // Try to get planId from state file (.neurcode/config.json) - this is the canonical source
            const activePlanId = (0, state_1.getActivePlanId)();
            if (activePlanId) {
                planId = activePlanId;
                if (!options.json) {
                    console.log(chalk.dim(`   Using active plan from state: ${activePlanId.substring(0, 8)}...`));
                    // Optional check: Warn if plan is older than 24 hours
                    const lastPlanGeneratedAt = (0, state_1.getLastPlanGeneratedAt)();
                    if (lastPlanGeneratedAt) {
                        const planAge = Date.now() - new Date(lastPlanGeneratedAt).getTime();
                        const hoursSinceGeneration = planAge / (1000 * 60 * 60);
                        if (hoursSinceGeneration > 24) {
                            console.log(chalk.yellow(`   ⚠️  Warning: This plan was generated ${Math.round(hoursSinceGeneration)} hours ago`));
                            console.log(chalk.yellow(`   You may be verifying against an old plan. Consider running 'neurcode plan' to generate a new one.`));
                        }
                    }
                }
            }
            else {
                // Fallback: Try legacy config file (neurcode.config.json) for backward compatibility
                if (configData.lastPlanId && typeof configData.lastPlanId === 'string') {
                    planId = configData.lastPlanId;
                    if (!options.json) {
                        console.log(chalk.dim(`   Using plan from legacy config: ${configData.lastPlanId.substring(0, 8)}...`));
                        console.log(chalk.yellow(`   ⚠️  Consider running 'neurcode plan' to update state file`));
                    }
                }
            }
        }
        if (planId === 'local-plan-sync' && localPlanExpectedFiles.length > 0) {
            useLocalPlanSync = true;
            if (!options.json) {
                console.log(chalk.dim(`   Using Plan Sync from .neurcode/plan.json (${localPlanExpectedFiles.length} expected file(s))`));
            }
        }
        if (!planId && localPlanExpectedFiles.length > 0) {
            planId = 'local-plan-sync';
            useLocalPlanSync = true;
            if (!options.json) {
                console.log(chalk.dim(`   Using Plan Sync from .neurcode/plan.json (${localPlanExpectedFiles.length} expected file(s))`));
            }
        }
        // If no planId found, either enforce strict requirement or fall back to policy-only mode.
        if (!planId) {
            if (requirePlan) {
                const changedFiles = diffFiles.map((f) => f.path);
                const message = 'Plan ID is required in strict mode. Run "neurcode plan" first or pass --plan-id.';
                recordVerifyEvent('FAIL', 'missing_plan_id;require_plan=true', changedFiles);
                if (options.json) {
                    emitVerifyJson({
                        grade: 'F',
                        score: 0,
                        verdict: 'FAIL',
                        violations: [],
                        adherenceScore: 0,
                        bloatCount: 0,
                        bloatFiles: [],
                        plannedFilesModified: 0,
                        totalPlannedFiles: 0,
                        message,
                        scopeGuardPassed: false,
                        mode: 'plan_required',
                        policyOnly: false,
                    });
                }
                else {
                    console.log(chalk.red('❌ Plan ID is required in strict mode.'));
                    console.log(chalk.dim('   Run "neurcode plan" first or pass --plan-id <id>.'));
                    console.log(chalk.dim('   Use --policy-only only when intentionally running general governance checks.'));
                }
                await recordVerificationIfRequested(options, config, {
                    grade: 'F',
                    violations: [],
                    verifyResult: {
                        adherenceScore: 0,
                        verdict: 'FAIL',
                        bloatCount: 0,
                        bloatFiles: [],
                        message,
                    },
                    projectId: projectId || undefined,
                    jsonMode: Boolean(options.json),
                });
                process.exit(1);
            }
            let autoContractPath = null;
            if (!changeContractRead.contract && !strictArtifactMode) {
                try {
                    const fallbackPlanId = `advisory_${Date.now()}`;
                    const advisoryContract = buildMinimalAdvisoryContractFromDiff(diffFiles, fallbackPlanId);
                    autoContractPath = (0, change_contract_1.writeChangeContract)(projectRoot, advisoryContract, options.changeContract);
                    changeContractSummary = {
                        path: autoContractPath,
                        exists: true,
                        enforced: false,
                        valid: true,
                        planId: advisoryContract.planId,
                        contractId: advisoryContract.contractId,
                        coverage: {
                            expectedFiles: advisoryContract.expectedFiles.length,
                            changedFiles: diffFiles.length,
                            outOfContractFiles: 0,
                            missingExpectedFiles: 0,
                            blockedFilesTouched: 0,
                            actionMismatches: 0,
                            expectedSymbols: advisoryContract.expectedSymbols?.length || 0,
                            changedSymbols: 0,
                            missingExpectedSymbols: 0,
                            blockedSymbolsTouched: 0,
                            symbolActionMismatches: 0,
                            symbolRenameMatches: 0,
                            toleratedUnexpectedFiles: 0,
                            toleratedMissingExpectedSymbols: 0,
                        },
                        signature: changeContractSummary.signature,
                        violations: [],
                    };
                }
                catch {
                    autoContractPath = null;
                }
            }
            const message = 'No plan linked yet. Ran advisory verification for quick first-run experience. ' +
                'Use `neurcode plan` and `neurcode contract import --auto-detect --write-change-contract` for full enforcement.';
            const advisorySignals = (0, advisory_signals_1.evaluateAdvisorySignals)({
                diffFiles,
                summary,
            });
            const advisoryWarnCount = advisorySignals.filter((item) => item.severity === 'warn').length;
            const advisoryVerdict = advisoryWarnCount > 0 ? 'WARN' : 'PASS';
            const advisoryGrade = advisoryWarnCount > 0 ? 'C' : 'B';
            const advisoryScore = advisoryWarnCount > 0 ? 60 : 70;
            const advisoryViolations = advisorySignals.map((item) => ({
                file: item.files[0] || '.',
                rule: `advisory:${item.code.toLowerCase()}`,
                severity: item.severity === 'warn' ? 'warn' : 'allow',
                message: `${item.title}: ${item.detail}`,
            }));
            recordVerifyEvent(advisoryVerdict, `advisory_missing_plan;signals=${advisorySignals.length};warn=${advisoryWarnCount}`, diffFiles.map((f) => f.path));
            if (options.json) {
                emitVerifyJson({
                    grade: advisoryGrade,
                    score: advisoryScore,
                    verdict: advisoryVerdict,
                    violations: advisoryViolations,
                    adherenceScore: advisoryScore,
                    bloatCount: 0,
                    bloatFiles: [],
                    plannedFilesModified: 0,
                    totalPlannedFiles: 0,
                    message,
                    scopeGuardPassed: true,
                    mode: 'advisory_missing_plan',
                    advisoryMode: true,
                    advisorySignals,
                    policyOnly: true,
                    policyOnlySource: 'fallback_missing_plan',
                    ...(autoContractPath
                        ? {
                            changeContract: {
                                ...changeContractSummary,
                                path: autoContractPath,
                            },
                        }
                        : {
                            changeContract: changeContractSummary,
                        }),
                });
            }
            else {
                printFirstRunAdvisoryMessage(options.demo === true);
                printAdvisorySignals(advisorySignals, options.demo === true);
                if (autoContractPath) {
                    console.log(chalk.green(`✅ Auto-generated minimal advisory contract: ${autoContractPath}`));
                }
                else if (!changeContractRead.contract) {
                    console.log(chalk.yellow('⚠️  Could not auto-generate advisory contract; continuing without contract.'));
                }
                console.log(chalk.dim('Next steps: neurcode plan "<intent>"'));
                console.log(chalk.dim('            neurcode contract import --auto-detect --write-change-contract'));
                console.log(chalk.dim(`\nSummary: ${message}\n`));
            }
            process.exit(0);
        }
        if (!planId) {
            throw new Error('Plan ID resolution failed unexpectedly');
        }
        const finalPlanId = planId;
        // ============================================
        // STRICT SCOPE GUARD - Deterministic Check
        // ============================================
        if (!options.json) {
            console.log(chalk.cyan('🔒 Checking scope guard...'));
        }
        // Track if scope guard passed - this takes priority over AI grading
        let scopeGuardPassed = false;
        let scopeGuardExpediteBypass = false;
        let governanceResult = null;
        let planFilesForVerification = [];
        let intentConstraintsForVerification;
        let intentEngineIssues = [];
        let intentEngineDomains = [];
        let intentEngineSummary = null;
        let intentEngineFlowIssues = [];
        let intentEngineRegressions = [];
        try {
            // Step A: Get Modified Files (already have from diffFiles)
            const modifiedFiles = diffFiles.map(f => f.path);
            // Step B: Resolve plan scope from remote plan or local Plan Sync.
            let originalIntent = '';
            let governanceTask = 'Plan verification';
            let planFiles = [];
            let planDependencies = [];
            let remotePlanSessionId = null;
            if (useLocalPlanSync) {
                const localIntent = (localPlanSync.intent || '').trim();
                const localConstraintText = localPlanSync.constraints.length > 0
                    ? localPlanSync.constraints.join('; ')
                    : '';
                planFiles = [...localPlanExpectedFiles];
                originalIntent = localIntent || localConstraintText;
                governanceTask = localIntent
                    ? `Local Plan Sync: ${localIntent}`
                    : 'Local Plan Sync verification';
                if (!options.json) {
                    console.log(chalk.dim(`   Plan Sync scope loaded: ${planFiles.length} file(s)`));
                }
            }
            else {
                const planData = await client.getPlan(finalPlanId);
                // Extract original intent from plan (for constraint checking)
                originalIntent = planData.intent || '';
                const planTitle = typeof planData.content.title === 'string'
                    ? planData.content.title?.trim()
                    : '';
                const planSummary = typeof planData.content.summary === 'string' ? planData.content.summary.trim() : '';
                governanceTask = planTitle || planSummary || originalIntent || 'Plan verification';
                // Get approved files from plan (only files with action CREATE or MODIFY)
                planFiles = planData.content.files
                    .filter((f) => f.action === 'CREATE' || f.action === 'MODIFY')
                    .map((f) => f.path);
                planDependencies = Array.isArray(planData.content.dependencies)
                    ? planData.content.dependencies.filter((item) => typeof item === 'string')
                    : [];
                remotePlanSessionId = planData.sessionId || null;
            }
            planFilesForVerification = [...new Set([...planFiles, ...localPlanExpectedFiles])];
            intentConstraintsForVerification = originalIntent || undefined;
            // ── Intent-Aware Engine ─────────────────────────────────────────────
            // Run once we have both diffFiles and the resolved intent text.
            // Stored in outer scope so all emitCanonicalVerifyJson call sites can
            // include the result in their payloads without repeating the computation.
            if (intentConstraintsForVerification && diffFiles.length > 0) {
                try {
                    const engineResult = (0, intent_engine_1.runIntentEngine)(intentConstraintsForVerification, diffFiles, projectRoot);
                    intentEngineIssues = engineResult.intentIssues;
                    intentEngineDomains = engineResult.checkedDomains;
                    intentEngineSummary = engineResult.intentSummary;
                    intentEngineFlowIssues = engineResult.flowIssues;
                    intentEngineRegressions = engineResult.regressions;
                }
                catch {
                    // Non-fatal: intent engine errors must never break verification
                }
            }
            governanceResult = (0, governance_1.evaluateGovernance)({
                projectRoot,
                task: governanceTask,
                expectedFiles: planFilesForVerification,
                expectedDependencies: planDependencies,
                diffFiles,
                contextCandidates: planFilesForVerification,
                orgGovernance: orgGovernanceSettings,
                requireSignedAiLogs: signedLogsRequired,
                signingKey: aiLogSigningKey,
                signingKeyId: aiLogSigningKeyId,
                signingKeys: aiLogSigningKeys,
                signer: aiLogSigner,
            });
            // Get sessionId from state file (.neurcode/state.json) first, then fallback to config
            // Fallback to sessionId from plan if not in state/config
            // This is the session_id string needed to fetch the session
            let sessionIdString = (0, state_1.getSessionId)() || configData.sessionId || configData.lastSessionId || null;
            // Fallback: Use sessionId from plan if not in config
            if (!sessionIdString && remotePlanSessionId) {
                sessionIdString = remotePlanSessionId;
                if ((process.env.DEBUG || process.env.VERBOSE) && !options.json) {
                    console.log(chalk.dim(`   Using sessionId from plan: ${sessionIdString.substring(0, 8)}...`));
                }
            }
            // Debug logging
            if ((process.env.DEBUG || process.env.VERBOSE) && !options.json) {
                console.log(chalk.dim(`   Config path: ${configPath}`));
                console.log(chalk.dim(`   Config fields: ${Object.keys(configData).join(', ')}`));
                console.log(chalk.dim(`   SessionId from config: ${sessionIdString ? sessionIdString.substring(0, 8) + '...' : 'not found'}`));
            }
            // Get allowed files from session
            let allowedFiles = [];
            if (sessionIdString) {
                try {
                    const sessionData = await client.getSession(sessionIdString);
                    allowedFiles = sessionData.session.allowedFiles || [];
                }
                catch (sessionError) {
                    // If session fetch fails, log warning but continue
                    // This is expected if sessionId is not set in config
                    if (!options.json) {
                        console.log(chalk.dim(`   Note: Session data not available (sessionId not in config)`));
                        console.log(chalk.dim('   Scope guard will only check plan files'));
                    }
                }
            }
            else {
                if (!options.json) {
                    console.log(chalk.dim(`   Note: No sessionId found in config`));
                    console.log(chalk.dim('   Scope guard will only check plan files'));
                }
            }
            // Step C: The Intersection Logic
            const approvedSet = new Set([...planFilesForVerification, ...allowedFiles]);
            const violations = modifiedFiles.filter(f => !approvedSet.has(f));
            const filteredViolations = violations.filter((p) => !shouldIgnore(p));
            // Step D: The Block (only report scope violations for non-ignored files)
            if (filteredViolations.length > 0) {
                const criticalScopeViolations = expediteModeEnabled
                    ? filteredViolations.filter((file) => isCriticalScopeBreach(file, 'File modified outside the plan'))
                    : filteredViolations;
                const expediteScopeViolations = expediteModeEnabled
                    ? filteredViolations.filter((file) => !criticalScopeViolations.includes(file))
                    : [];
                const shouldBlockForScope = !expediteModeEnabled || criticalScopeViolations.length > 0;
                const aiDebtSummaryForScope = toAiDebtSummary((0, ai_debt_budget_1.evaluateAiDebtBudget)({
                    diffFiles,
                    bloatCount: filteredViolations.length,
                    config: aiDebtConfig,
                }));
                recordVerifyEvent(shouldBlockForScope ? 'FAIL' : 'WARN', `${shouldBlockForScope ? 'scope_violation' : 'scope_expedite'}=${filteredViolations.length}`, modifiedFiles, finalPlanId);
                const scopeViolationItems = filteredViolations.map((file) => ({
                    file,
                    rule: 'scope_guard',
                    severity: 'block',
                    message: 'File modified outside the plan',
                }));
                const aiDebtViolationItems = toAiDebtReportViolations(aiDebtSummaryForScope);
                const scopeViolationReportItems = [
                    ...scopeViolationItems,
                    ...aiDebtViolationItems,
                ];
                const scopeViolationMessage = shouldBlockForScope
                    ? `Scope violation: ${criticalScopeViolations.length} critical file(s) modified outside the plan`
                    : `Expedite scope warning: ${expediteScopeViolations.length} non-critical file(s) modified outside the plan`;
                if (shouldBlockForScope && options.json) {
                    // Output JSON for scope violation BEFORE exit. Must include violations for GitHub Action annotations.
                    const jsonOutput = {
                        grade: 'F',
                        score: 0,
                        verdict: 'FAIL',
                        violations: scopeViolationReportItems,
                        adherenceScore: 0,
                        bloatCount: filteredViolations.length,
                        bloatFiles: filteredViolations,
                        plannedFilesModified: 0,
                        totalPlannedFiles: planFilesForVerification.length,
                        message: scopeViolationMessage,
                        scopeGuardPassed: false,
                        mode: 'plan_enforced',
                        policyOnly: false,
                        aiDebt: aiDebtSummaryForScope,
                        intentIssues: intentEngineIssues,
                        intentDomains: intentEngineDomains,
                        intentSummary: intentEngineSummary,
                        ...(expediteModeEnabled ? { expediteMode: true } : {}),
                        ...(governanceResult
                            ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                                changeContract: changeContractSummary,
                                compiledPolicy: compiledPolicyMetadata,
                                aiDebt: aiDebtSummaryForScope,
                            })
                            : {}),
                    };
                    // CRITICAL: Print JSON first, then exit
                    emitVerifyJson(jsonOutput);
                    await recordVerificationIfRequested(options, config, {
                        grade: 'F',
                        violations: scopeViolationReportItems,
                        verifyResult: {
                            adherenceScore: 0,
                            verdict: 'FAIL',
                            bloatCount: filteredViolations.length,
                            bloatFiles: filteredViolations,
                            message: scopeViolationMessage,
                        },
                        projectId: projectId || undefined,
                        jsonMode: true,
                        governance: governanceResult
                            ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                                changeContract: changeContractSummary,
                                compiledPolicy: compiledPolicyMetadata,
                                aiDebt: aiDebtSummaryForScope,
                            })
                            : undefined,
                    });
                    process.exit(1);
                }
                else if (shouldBlockForScope) {
                    // Human-readable output only when NOT in json mode
                    console.log(chalk.red('\n⛔ SCOPE VIOLATION'));
                    console.log(chalk.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
                    console.log(chalk.red('The following files were modified but are not in the plan:'));
                    console.log('');
                    criticalScopeViolations.forEach(file => {
                        console.log(chalk.red(`   • ${file}`));
                    });
                    if (expediteModeEnabled && expediteScopeViolations.length > 0) {
                        console.log('');
                        console.log(chalk.yellow('Non-critical scope files (can be followed up under expedite mode):'));
                        expediteScopeViolations.forEach((file) => {
                            console.log(chalk.yellow(`   • ${file}`));
                        });
                    }
                    console.log('');
                    console.log(chalk.yellow('To unblock these files, run:'));
                    criticalScopeViolations.forEach(file => {
                        console.log(chalk.dim(`   neurcode allow ${file}`));
                    });
                    if (aiDebtSummaryForScope.mode !== 'off') {
                        console.log('');
                        const header = aiDebtSummaryForScope.mode === 'enforce'
                            ? aiDebtSummaryForScope.pass
                                ? chalk.green('AI Debt Budget: PASS')
                                : chalk.red('AI Debt Budget: BLOCK')
                            : chalk.yellow('AI Debt Budget: ADVISORY');
                        console.log(header);
                        console.log(chalk.dim(`   Score: ${aiDebtSummaryForScope.score} | TODO/FIXME +${aiDebtSummaryForScope.metrics.addedTodoFixme} | ` +
                            `console.log +${aiDebtSummaryForScope.metrics.addedConsoleLogs} | any +${aiDebtSummaryForScope.metrics.addedAnyTypes} | ` +
                            `large files ${aiDebtSummaryForScope.metrics.largeFilesTouched} | bloat ${aiDebtSummaryForScope.metrics.bloatFiles}`));
                        if (aiDebtSummaryForScope.violations.length > 0) {
                            aiDebtSummaryForScope.violations.forEach((item) => {
                                const color = aiDebtSummaryForScope.mode === 'enforce' ? chalk.red : chalk.yellow;
                                console.log(color(`   • ${item.message}`));
                            });
                        }
                    }
                    if (governanceResult) {
                        displayGovernanceInsights(governanceResult, { explain: options.explain });
                    }
                    // ── Intent Status in scope-violation path ──────────────────────
                    if (intentEngineSummary) {
                        const s = intentEngineSummary;
                        const domainLabel = s.domain.charAt(0).toUpperCase() + s.domain.slice(1);
                        const confColor = s.confidence === 'HIGH' ? chalk.green : s.confidence === 'MEDIUM' ? chalk.yellow : chalk.red;
                        const wCovPct = s.weightedCoverage != null ? Math.round(s.weightedCoverage * 100) : s.coveragePct;
                        const filled = Math.round((wCovPct / 100) * 20);
                        const bar = chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(20 - filled));
                        const sysStatus = s.status;
                        const statusLabel = sysStatus === 'CRITICAL' ? chalk.bold.red('[CRITICAL]') : sysStatus === 'AT RISK' ? chalk.bold.yellow('[AT RISK]') : chalk.bold.green('[SECURE]');
                        console.log(chalk.bold('\n━━━ INTENT STATUS ━━━━━━━━━━━━━━━━━━━━━━'));
                        console.log(`  ${statusLabel} ${chalk.bold(`${domainLabel} Implementation:`)} ${bar} ${chalk.bold(`${wCovPct}%`)} (weighted)`);
                        console.log(`  Confidence: ${confColor(s.confidence)}`);
                        const critMissing = s.criticalMissing ?? [];
                        const otherMissing = s.missing.filter((k) => !critMissing.includes(k));
                        if (critMissing.length > 0) {
                            console.log(`  ${chalk.bold.red('Critical missing:')}`);
                            critMissing.forEach((k) => { const label = k.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); console.log(chalk.red(`    ✗ ${label}`)); });
                        }
                        if (otherMissing.length > 0) {
                            console.log(`  ${chalk.bold.yellow('Missing:')}`);
                            otherMissing.forEach((k) => { const label = k.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); console.log(chalk.yellow(`    • ${label}`)); });
                        }
                        if (critMissing.length === 0 && otherMissing.length === 0) {
                            console.log(`  Missing: ${chalk.green('none — all components detected')}`);
                        }
                        console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
                    }
                    if (intentEngineRegressions.length > 0) {
                        console.log(chalk.bold.red('\n━━━ REGRESSION ANALYSIS ━━━━━━━━━━━━━━━━━'));
                        intentEngineRegressions.forEach((reg) => {
                            const icon = reg.type === 'coverage-regression' ? '📉' : reg.type === 'critical-regression' ? '🔴' : reg.type === 'flow-regression' ? '⛓' : '⚠';
                            console.log(`  ${chalk.red('[REGRESSION]')} ${icon} ${reg.message}`);
                        });
                        console.log(chalk.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
                    }
                    console.log('');
                    await recordVerificationIfRequested(options, config, {
                        grade: 'F',
                        violations: scopeViolationReportItems,
                        verifyResult: {
                            adherenceScore: 0,
                            verdict: 'FAIL',
                            bloatCount: filteredViolations.length,
                            bloatFiles: filteredViolations,
                            message: scopeViolationMessage,
                        },
                        projectId: projectId || undefined,
                        jsonMode: false,
                        governance: governanceResult
                            ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                                changeContract: changeContractSummary,
                                compiledPolicy: compiledPolicyMetadata,
                                aiDebt: aiDebtSummaryForScope,
                            })
                            : undefined,
                    });
                    process.exit(1);
                }
                else {
                    scopeGuardExpediteBypass = true;
                    if (!options.json) {
                        console.log(chalk.yellow('\n⚠️  Expedite scope relaxation applied (non-critical scope only).'));
                        expediteScopeViolations.forEach((file) => {
                            console.log(chalk.yellow(`   • ${file}`));
                        });
                        console.log(chalk.dim('   Follow-up checklist:'));
                        EXPEDITE_FOLLOW_UP_CHECKLIST.forEach((item) => {
                            console.log(chalk.dim(`   - ${item}`));
                        });
                        console.log(chalk.dim('   Note: Expedite Mode used\n'));
                    }
                }
            }
            // Scope guard passed - all files are approved or allowed
            scopeGuardPassed = true;
            if (!options.json) {
                if (scopeGuardExpediteBypass) {
                    console.log(chalk.green('✅ Scope guard passed with expedite relaxation for non-critical scope changes'));
                }
                else {
                    console.log(chalk.green('✅ All modified files are approved or allowed'));
                }
                console.log('');
            }
        }
        catch (scopeError) {
            // If scope guard check fails, log error but continue to AI verification
            // This ensures the feature doesn't break existing workflows
            if (!options.json) {
                console.log(chalk.yellow(`   ⚠️  Scope guard check failed: ${scopeError instanceof Error ? scopeError.message : 'Unknown error'}`));
                console.log(chalk.dim('   Continuing with AI verification...'));
                console.log('');
            }
        }
        const requirePolicyLock = options.requirePolicyLock === true || isEnabledFlag(process.env.NEURCODE_VERIFY_REQUIRE_POLICY_LOCK);
        const skipPolicyLock = options.skipPolicyLock === true || isEnabledFlag(process.env.NEURCODE_VERIFY_SKIP_POLICY_LOCK);
        const lockRead = (0, policy_packs_1.readPolicyLockFile)(projectRoot);
        const useDashboardPolicies = lockRead.lock
            ? lockRead.lock.customPolicies.mode === 'dashboard'
            : Boolean(config.apiKey);
        let effectiveRulesLoadError = null;
        let effectiveRules = {
            allRules: (0, policy_engine_1.createDefaultPolicy)().rules,
            customRules: [],
            customPolicies: [],
            policyPackRules: [],
            policyPack: null,
            includeDashboardPolicies: useDashboardPolicies,
        };
        try {
            effectiveRules = await buildEffectivePolicyRules(client, projectRoot, useDashboardPolicies);
        }
        catch (error) {
            effectiveRulesLoadError = error instanceof Error ? error.message : 'Unknown error';
            const installedPack = (0, policy_packs_1.getInstalledPolicyPackRules)(projectRoot);
            const fallbackPolicyPackRules = installedPack?.rules ? [...installedPack.rules] : [];
            effectiveRules = {
                allRules: [...(0, policy_engine_1.createDefaultPolicy)().rules, ...fallbackPolicyPackRules],
                customRules: [],
                customPolicies: [],
                policyPackRules: fallbackPolicyPackRules,
                policyPack: installedPack,
                includeDashboardPolicies: useDashboardPolicies,
            };
            if (!options.json) {
                console.log(chalk.dim('   Could not load dashboard custom policies, continuing with local/default rules only'));
            }
        }
        let policyLockEvaluation = {
            enforced: false,
            matched: true,
            lockPresent: lockRead.lock !== null,
            lockPath: lockRead.path,
            mismatches: [],
        };
        if (!skipPolicyLock) {
            const currentSnapshot = (0, policy_packs_1.buildPolicyStateSnapshot)({
                policyPack: effectiveRules.policyPack,
                policyPackRules: effectiveRules.policyPackRules,
                customPolicies: effectiveRules.customPolicies,
                customRules: effectiveRules.customRules,
                includeDashboardPolicies: effectiveRules.includeDashboardPolicies,
            });
            const lockValidation = (0, policy_packs_1.evaluatePolicyLock)(projectRoot, currentSnapshot, {
                requireLock: requirePolicyLock,
            });
            policyLockEvaluation = {
                enforced: lockValidation.enforced,
                matched: lockValidation.matched,
                lockPresent: lockValidation.lockPresent,
                lockPath: lockValidation.lockPath,
                mismatches: [...lockValidation.mismatches],
            };
            if (effectiveRulesLoadError && useDashboardPolicies) {
                policyLockEvaluation.mismatches.unshift({
                    code: 'POLICY_LOCK_CUSTOM_POLICIES_MISMATCH',
                    message: `Failed to load dashboard custom policies: ${effectiveRulesLoadError}`,
                });
                policyLockEvaluation.matched = false;
            }
            if (policyLockEvaluation.enforced && !policyLockEvaluation.matched) {
                const message = policyLockMismatchMessage(policyLockEvaluation.mismatches);
                const lockViolationItems = toPolicyLockViolations(policyLockEvaluation.mismatches);
                recordVerifyEvent('FAIL', 'policy_lock_mismatch', diffFiles.map((f) => f.path), finalPlanId);
                if (options.json) {
                    emitVerifyJson({
                        grade: 'F',
                        score: 0,
                        verdict: 'FAIL',
                        violations: lockViolationItems,
                        adherenceScore: 0,
                        bloatCount: 0,
                        bloatFiles: [],
                        plannedFilesModified: 0,
                        totalPlannedFiles: 0,
                        message,
                        scopeGuardPassed,
                        mode: 'plan_enforced',
                        policyOnly: false,
                        changeContract: changeContractSummary,
                        ...(compiledPolicyMetadata ? { policyCompilation: compiledPolicyMetadata } : {}),
                        ...(governanceResult
                            ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                                changeContract: changeContractSummary,
                                compiledPolicy: compiledPolicyMetadata,
                            })
                            : {}),
                        policyLock: {
                            enforced: true,
                            matched: false,
                            path: policyLockEvaluation.lockPath,
                            mismatches: policyLockEvaluation.mismatches,
                        },
                    });
                }
                else {
                    console.log(chalk.red('\n❌ Policy lock baseline mismatch'));
                    console.log(chalk.dim(`   Lock file: ${policyLockEvaluation.lockPath}`));
                    policyLockEvaluation.mismatches.forEach((item) => {
                        console.log(chalk.red(`   • [${item.code}] ${item.message}`));
                    });
                    console.log(chalk.dim('\n   If this drift is intentional, regenerate baseline with `neurcode policy lock`.\n'));
                }
                await recordVerificationIfRequested(options, config, {
                    grade: 'F',
                    violations: lockViolationItems,
                    verifyResult: {
                        adherenceScore: 0,
                        verdict: 'FAIL',
                        bloatCount: 0,
                        bloatFiles: [],
                        message,
                    },
                    projectId: projectId || undefined,
                    jsonMode: Boolean(options.json),
                    governance: governanceResult
                        ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                            changeContract: changeContractSummary,
                            compiledPolicy: compiledPolicyMetadata,
                        })
                        : undefined,
                });
                process.exit(2);
            }
        }
        let effectiveCompiledPolicy = compiledPolicyRead.artifact;
        if (!effectiveCompiledPolicy) {
            effectiveCompiledPolicy = buildCompiledPolicyFromEffectiveRules({
                projectRoot,
                policyLockEvaluation,
                effectiveRules,
                intentConstraints: intentConstraintsForVerification,
            });
            compiledPolicyMetadata = resolveCompiledPolicyMetadata(effectiveCompiledPolicy, (0, policy_compiler_1.resolveCompiledPolicyPath)(projectRoot, options.compiledPolicy));
        }
        const hydratedCompiledPolicyRules = effectiveCompiledPolicy
            ? (0, policy_compiler_1.hydrateCompiledPolicyRules)(effectiveCompiledPolicy)
            : [];
        const deterministicPolicyRules = effectiveCompiledPolicy
            ? [...effectiveCompiledPolicy.statements.policyRules]
            : effectiveRules.customPolicies
                .map((policy) => policy.rule_text)
                .filter((ruleText) => typeof ruleText === 'string' && ruleText.trim().length > 0);
        if (effectiveCompiledPolicy?.source.policyLockFingerprint &&
            policyLockEvaluation.lockPresent &&
            effectiveCompiledPolicy.source.policyLockFingerprint !== (0, policy_packs_1.readPolicyLockFile)(projectRoot).lock?.effective.fingerprint) {
            if (!options.json) {
                console.log(chalk.yellow('   Compiled policy lock fingerprint differs from current lock; runtime checks will continue with latest lock state'));
            }
        }
        // Check user tier - Policy Compliance and A-F Grading are PRO features
        const localPolicyGovernance = (0, policy_governance_1.readPolicyGovernanceConfig)(projectRoot);
        const governance = (0, policy_governance_1.mergePolicyGovernanceWithOrgOverrides)(localPolicyGovernance, orgGovernanceSettings?.policyGovernance);
        if (!options.json && orgGovernanceSettings?.policyGovernance) {
            console.log(chalk.dim('   Org policy governance controls active: local config merged with org-level enforcement floor'));
        }
        const auditIntegrity = (0, policy_audit_1.verifyPolicyAuditIntegrity)(projectRoot);
        const auditIntegrityStatus = resolveAuditIntegrityStatus(governance.audit.requireIntegrity, auditIntegrity);
        const { getUserTier } = await Promise.resolve().then(() => __importStar(require('../utils/tier')));
        const tier = await getUserTier();
        if (tier === 'FREE') {
            // FREE users get basic file-change summary only
            if (!options.json) {
                console.log(chalk.cyan('\n📊 File Change Summary\n'));
                console.log('━'.repeat(50));
                console.log(`   Files changed: ${summary.totalFiles}`);
                console.log(`   Lines added: ${summary.totalAdded}`);
                console.log(`   Lines removed: ${summary.totalRemoved}`);
                console.log('━'.repeat(50));
                console.log(chalk.yellow('\n📊 Upgrade to PRO for Automated Policy Verification and A-F Grading.'));
                console.log(chalk.dim('   Upgrade at: https://www.neurcode.com/dashboard/purchase-plan\n'));
            }
            else {
                emitVerifyJson({
                    grade: 'N/A',
                    score: 0,
                    verdict: 'INFO',
                    violations: [],
                    adherenceScore: 0,
                    bloatCount: 0,
                    bloatFiles: [],
                    plannedFilesModified: 0,
                    totalPlannedFiles: 0,
                    message: 'Basic file change summary (PRO required for policy verification)',
                    scopeGuardPassed: false,
                    mode: 'plan_enforced',
                    policyOnly: false,
                    tier: 'FREE',
                    changeContract: changeContractSummary,
                    ...(compiledPolicyMetadata ? { policyCompilation: compiledPolicyMetadata } : {}),
                    ...(governanceResult
                        ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                            changeContract: changeContractSummary,
                            compiledPolicy: compiledPolicyMetadata,
                        })
                        : {}),
                    policyLock: {
                        enforced: policyLockEvaluation.enforced,
                        matched: policyLockEvaluation.matched,
                        path: policyLockEvaluation.lockPath,
                        mismatches: policyLockEvaluation.mismatches,
                    },
                    policyGovernance: {
                        exceptionApprovals: governance.exceptionApprovals,
                        audit: {
                            requireIntegrity: governance.audit.requireIntegrity,
                            valid: auditIntegrityStatus.valid,
                            issues: auditIntegrityStatus.issues,
                            lastHash: auditIntegrity.lastHash,
                            eventCount: auditIntegrity.count,
                        },
                    },
                });
            }
            process.exit(0);
        }
        let policyViolations = [];
        let policyDecision = 'allow';
        const diffFilesForPolicy = diffFiles.filter((f) => !shouldIgnore(f.path));
        const policyResult = (0, policy_engine_1.evaluateRules)(diffFilesForPolicy, effectiveRules.allRules);
        policyViolations = policyResult.violations.filter((v) => !shouldIgnore(v.file));
        const policyExceptionResolution = await resolveEffectivePolicyExceptions({
            client,
            projectRoot,
            useOrgControlPlane: Boolean(config.apiKey),
            governance,
        });
        if (policyExceptionResolution.warning && !options.json) {
            console.log(chalk.dim(`   ${policyExceptionResolution.warning}`));
        }
        const configuredPolicyExceptions = policyExceptionResolution.exceptions;
        const exceptionDecision = (0, policy_exceptions_1.applyPolicyExceptions)(policyViolations, configuredPolicyExceptions, {
            requireApproval: governance.exceptionApprovals.required,
            minApprovals: governance.exceptionApprovals.minApprovals,
            disallowSelfApproval: governance.exceptionApprovals.disallowSelfApproval,
            allowedApprovers: governance.exceptionApprovals.allowedApprovers,
            requireReason: governance.exceptionApprovals.requireReason,
            minReasonLength: governance.exceptionApprovals.minReasonLength,
            maxExpiryDays: governance.exceptionApprovals.maxExpiryDays,
            criticalRulePatterns: governance.exceptionApprovals.criticalRulePatterns,
            criticalMinApprovals: governance.exceptionApprovals.criticalMinApprovals,
        });
        const suppressedPolicyViolations = exceptionDecision.suppressedViolations.filter((item) => !shouldIgnore(item.file));
        const blockedPolicyViolations = exceptionDecision.blockedViolations
            .filter((item) => !shouldIgnore(item.file))
            .map((item) => ({
            file: item.file,
            rule: item.rule,
            severity: 'block',
            message: `Exception ${item.exceptionId} cannot be applied: ${explainExceptionEligibilityReason(item.eligibilityReason)}` +
                (item.requiredApprovals > 0
                    ? ` (approvals ${item.effectiveApprovals}/${item.requiredApprovals}${item.critical ? ', critical rule gate' : ''})`
                    : ''),
            ...(item.line != null ? { line: item.line } : {}),
        }));
        policyViolations = [
            ...exceptionDecision.remainingViolations.filter((item) => !shouldIgnore(item.file)),
            ...blockedPolicyViolations,
        ];
        if (governance.audit.requireIntegrity && !auditIntegrityStatus.valid) {
            policyViolations.push({
                file: POLICY_AUDIT_FILE,
                rule: 'policy_audit_integrity',
                severity: 'block',
                message: `Policy audit chain is invalid: ${auditIntegrityStatus.issues.join('; ') || 'unknown issue'}`,
            });
        }
        policyDecision = resolvePolicyDecisionFromViolations(policyViolations);
        const policyExceptionsSummary = {
            sourceMode: policyExceptionResolution.mode,
            sourceWarning: policyExceptionResolution.warning,
            localConfigured: policyExceptionResolution.localConfigured,
            orgConfigured: policyExceptionResolution.orgConfigured,
            configured: configuredPolicyExceptions.length,
            active: exceptionDecision.activeExceptions.length,
            usable: exceptionDecision.usableExceptions.length,
            matched: exceptionDecision.matchedExceptionIds.length,
            suppressed: suppressedPolicyViolations.length,
            blocked: blockedPolicyViolations.length,
            matchedExceptionIds: exceptionDecision.matchedExceptionIds,
            suppressedViolations: suppressedPolicyViolations.map((item) => ({
                file: item.file,
                rule: item.rule,
                severity: item.severity,
                message: item.message,
                exceptionId: item.exceptionId,
                reason: item.reason,
                expiresAt: item.expiresAt,
                ...(item.line != null ? { startLine: item.line } : {}),
            })),
            blockedViolations: blockedPolicyViolations.map((item) => ({
                file: item.file,
                rule: item.rule,
                severity: item.severity,
                message: item.message,
                ...(item.line != null ? { startLine: item.line } : {}),
            })),
        };
        const policyGovernanceSummary = {
            exceptionApprovals: governance.exceptionApprovals,
            audit: {
                requireIntegrity: governance.audit.requireIntegrity,
                valid: auditIntegrityStatus.valid,
                issues: auditIntegrityStatus.issues,
                lastHash: auditIntegrity.lastHash,
                eventCount: auditIntegrity.count,
            },
        };
        let intentProofSummary = {
            enabled: false,
            pass: true,
            checkedRules: 0,
            repoScopedRules: 0,
            signatureDriftRules: 0,
            scannedFiles: 0,
            scannedBytes: 0,
            truncated: false,
            violations: [],
        };
        if (!options.json && effectiveRules.customRules.length > 0) {
            console.log(chalk.dim(`   Evaluating ${effectiveRules.customRules.length} custom policy rule(s) from dashboard`));
        }
        if (!options.json && effectiveRules.policyPack && effectiveRules.policyPackRules.length > 0) {
            console.log(chalk.dim(`   Evaluating policy pack: ${effectiveRules.policyPack.packName} (${effectiveRules.policyPack.packId}@${effectiveRules.policyPack.version}, ${effectiveRules.policyPackRules.length} rule(s))`));
        }
        else if (!options.json && !effectiveRules.policyPack) {
            console.log(chalk.dim('   No policy pack installed — run `neurcode policy install <pack>` to add governance rules'));
        }
        // Prepare diff stats and changed files for API
        const diffStats = {
            totalAdded: summary.totalAdded,
            totalRemoved: summary.totalRemoved,
            totalFiles: summary.totalFiles,
        };
        // Map diffFiles to include full hunks for visual diff rendering
        const changedFiles = diffFiles.map(file => ({
            path: file.path,
            oldPath: file.oldPath,
            changeType: file.changeType,
            added: file.addedLines,
            removed: file.removedLines,
            hunks: file.hunks.map(hunk => ({
                oldStart: hunk.oldStart,
                oldLines: hunk.oldLines,
                newStart: hunk.newStart,
                newLines: hunk.newLines,
                lines: hunk.lines.map(line => ({
                    type: line.type,
                    content: line.content,
                    lineNumber: line.lineNumber,
                })),
            })),
        }));
        const changedSymbols = (0, diff_symbols_1.extractDeclaredSymbolsFromDiff)(diffFiles);
        const compiledIntentProof = (0, governance_runtime_1.compileDeterministicConstraints)({
            intentConstraints: intentConstraintsForVerification,
            policyRules: deterministicPolicyRules,
        });
        const proofRules = dedupeDeterministicRules([
            ...compiledIntentProof.rules,
            ...hydratedCompiledPolicyRules,
        ].filter((rule) => rule.evaluationScope === 'repo'
            || rule.evaluationMode === 'signature_delta'));
        if (proofRules.length > 0) {
            const repoScopedRules = proofRules.filter((rule) => rule.evaluationScope === 'repo');
            const signatureDriftRules = proofRules.filter((rule) => rule.evaluationMode === 'signature_delta');
            const maxProofFiles = Math.max(100, Math.floor(Number(process.env.NEURCODE_INTENT_PROOF_MAX_FILES || 2500)));
            const maxProofBytes = Math.max(1024 * 1024, Math.floor(Number(process.env.NEURCODE_INTENT_PROOF_MAX_BYTES || (32 * 1024 * 1024))));
            const maxProofPerFileBytes = Math.max(4096, Math.floor(Number(process.env.NEURCODE_INTENT_PROOF_MAX_FILE_BYTES || (768 * 1024))));
            let proofContents;
            let proofScannedFiles = 0;
            let proofScannedBytes = 0;
            let proofTruncated = false;
            if (repoScopedRules.length > 0) {
                const scan = collectIntentProofFileContents(projectRoot, changedFiles.map((file) => file.path), maxProofFiles, maxProofBytes, maxProofPerFileBytes);
                proofContents = scan.fileContents;
                proofScannedFiles = scan.scannedFiles;
                proofScannedBytes = scan.scannedBytes;
                proofTruncated = scan.truncated;
            }
            const proofEvaluation = (0, governance_runtime_1.evaluatePlanVerification)({
                planFiles: planFilesForVerification.map((path) => ({
                    path,
                    action: 'MODIFY',
                })),
                changedFiles,
                diffStats,
                extraConstraintRules: proofRules,
                fileContents: proofContents,
            });
            intentProofSummary = {
                enabled: true,
                pass: proofEvaluation.constraintViolations.length === 0,
                checkedRules: proofRules.length,
                repoScopedRules: repoScopedRules.length,
                signatureDriftRules: signatureDriftRules.length,
                scannedFiles: proofScannedFiles,
                scannedBytes: proofScannedBytes,
                truncated: proofTruncated,
                violations: [...proofEvaluation.constraintViolations],
            };
            if (proofEvaluation.constraintViolations.length > 0) {
                const intentProofPolicyViolations = proofEvaluation.constraintViolations.map((violation) => ({
                    file: '.neurcode/intent-proof',
                    rule: 'intent_proof',
                    severity: 'block',
                    message: violation,
                }));
                policyViolations.push(...intentProofPolicyViolations);
                policyDecision = resolvePolicyDecisionFromViolations(policyViolations);
            }
            if (!options.json) {
                if (intentProofSummary.pass) {
                    console.log(chalk.dim(`   Intent proof checks passed (${intentProofSummary.checkedRules} rule(s)` +
                        `${intentProofSummary.repoScopedRules > 0 ? `, repo scan ${intentProofSummary.scannedFiles} file(s)` : ''})`));
                }
                else {
                    console.log(chalk.red(`   Intent proof checks failed (${intentProofSummary.violations.length} violation(s), ${intentProofSummary.checkedRules} rule(s))`));
                }
            }
        }
        const changeContractEvaluation = changeContractRead.contract
            ? (0, change_contract_1.evaluateChangeContract)(changeContractRead.contract, {
                planId: finalPlanId,
                changedFiles: changedFiles.map((file) => file.path),
                changedFileEntries: changedFiles.map((file) => ({
                    path: file.path,
                    changeType: file.changeType,
                })),
                changedSymbols: changedSymbols.map((symbol) => ({
                    name: symbol.name,
                    type: symbol.type,
                    action: symbol.action,
                    file: symbol.file,
                })),
                policyLockFingerprint: (0, policy_packs_1.readPolicyLockFile)(projectRoot).lock?.effective.fingerprint || null,
                compiledPolicyFingerprint: effectiveCompiledPolicy?.fingerprint || null,
            })
            : null;
        if (changeContractEvaluation) {
            changeContractSummary = {
                path: changeContractRead.path,
                exists: true,
                enforced: enforceChangeContract,
                valid: changeContractEvaluation.valid,
                planId: changeContractRead.contract?.planId || null,
                contractId: changeContractRead.contract?.contractId || null,
                signature: changeContractSummary.signature,
                coverage: changeContractEvaluation.coverage,
                violations: changeContractEvaluation.violations.map((item) => ({
                    code: item.code,
                    message: item.message,
                    file: item.file,
                    symbol: item.symbol,
                    symbolType: item.symbolType,
                    expected: item.expected,
                    actual: item.actual,
                })),
            };
            if (!changeContractEvaluation.valid && enforceChangeContract) {
                const violations = changeContractEvaluation.violations.map((item) => ({
                    file: item.file || '.neurcode/change-contract.json',
                    rule: `change_contract:${item.code.toLowerCase()}`,
                    severity: 'block',
                    message: item.message,
                }));
                const message = `Implementation deviates from intended contract (` +
                    `${changeContractEvaluation.violations.length} violation(s)).`;
                if (options.json) {
                    emitVerifyJson({
                        grade: 'F',
                        score: 0,
                        verdict: 'FAIL',
                        violations,
                        adherenceScore: 0,
                        bloatCount: 0,
                        bloatFiles: [],
                        plannedFilesModified: 0,
                        totalPlannedFiles: 0,
                        message,
                        scopeGuardPassed: false,
                        mode: 'plan_enforced',
                        policyOnly: false,
                        changeContract: changeContractSummary,
                        ...(compiledPolicyMetadata ? { policyCompilation: compiledPolicyMetadata } : {}),
                    });
                }
                else {
                    displayChangeContractDrift(changeContractSummary, { advisory: false });
                }
                await recordVerificationIfRequested(options, config, {
                    grade: 'F',
                    violations,
                    verifyResult: {
                        adherenceScore: 0,
                        verdict: 'FAIL',
                        bloatCount: 0,
                        bloatFiles: [],
                        message,
                    },
                    projectId: projectId || undefined,
                    jsonMode: Boolean(options.json),
                    governance: governanceResult
                        ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                            changeContract: changeContractSummary,
                            compiledPolicy: compiledPolicyMetadata,
                        })
                        : undefined,
                });
                process.exit(2);
            }
            else if (!changeContractEvaluation.valid && !options.json) {
                displayChangeContractDrift(changeContractSummary, { advisory: true });
            }
        }
        // Call verify API (or deterministic local evaluation for Plan Sync scope mode)
        if (!options.json) {
            if (useLocalPlanSync) {
                console.log(chalk.dim('   Using local Plan Sync deterministic verification (no API plan lookup).\n'));
            }
            else {
                console.log(chalk.dim('   Sending to Neurcode API...\n'));
                if (options.asyncMode) {
                    console.log(chalk.dim('   Queue-backed verification enabled (async job mode).'));
                }
            }
        }
        try {
            const runLocalDeterministicVerification = () => {
                const localFileContents = {};
                for (const file of changedFiles) {
                    const absolutePath = (0, path_1.join)(projectRoot, file.path);
                    if (!(0, fs_1.existsSync)(absolutePath)) {
                        continue;
                    }
                    try {
                        localFileContents[file.path] = (0, fs_1.readFileSync)(absolutePath, 'utf-8');
                    }
                    catch {
                        // Best effort only; fallback can still run on diff-only context.
                    }
                }
                const localEvaluation = (0, governance_runtime_1.evaluatePlanVerification)({
                    planFiles: planFilesForVerification.map((path) => ({
                        path,
                        action: 'MODIFY',
                    })),
                    changedFiles,
                    diffStats,
                    intentConstraints: intentConstraintsForVerification,
                    policyRules: deterministicPolicyRules,
                    extraConstraintRules: hydratedCompiledPolicyRules.length > 0 ? hydratedCompiledPolicyRules : undefined,
                    fileContents: localFileContents,
                });
                return {
                    verificationId: `local-fallback-${Date.now()}`,
                    adherenceScore: localEvaluation.adherenceScore,
                    bloatCount: localEvaluation.bloatCount,
                    bloatFiles: localEvaluation.bloatFiles,
                    plannedFilesModified: localEvaluation.plannedFilesModified,
                    totalPlannedFiles: localEvaluation.totalPlannedFiles,
                    verdict: localEvaluation.verdict,
                    diffSummary: localEvaluation.diffSummary,
                    message: localEvaluation.message,
                };
            };
            let verifySource = 'api';
            let verifyResult;
            if (useLocalPlanSync) {
                verifySource = 'local_fallback';
                verifyResult = runLocalDeterministicVerification();
            }
            else {
                try {
                    verifyResult = await client.verifyPlan(finalPlanId, diffStats, changedFiles, projectId, intentConstraintsForVerification, deterministicPolicyRules, 'api', compiledPolicyMetadata, {
                        async: options.asyncMode === true,
                        pollIntervalMs: Number.isFinite(options.verifyJobPollMs) ? options.verifyJobPollMs : undefined,
                        timeoutMs: Number.isFinite(options.verifyJobTimeoutMs) ? options.verifyJobTimeoutMs : undefined,
                        idempotencyKey: options.verifyIdempotencyKey,
                        maxAttempts: Number.isFinite(options.verifyJobMaxAttempts) ? options.verifyJobMaxAttempts : undefined,
                    });
                }
                catch (verifyApiError) {
                    if (planFilesForVerification.length === 0) {
                        throw verifyApiError;
                    }
                    verifySource = 'local_fallback';
                    if (!options.json) {
                        const fallbackReason = verifyApiError instanceof Error ? verifyApiError.message : String(verifyApiError);
                        console.log(chalk.yellow('⚠️  Verify API unavailable, using local deterministic fallback.'));
                        console.log(chalk.dim(`   Reason: ${fallbackReason}`));
                    }
                    verifyResult = runLocalDeterministicVerification();
                }
            }
            const aiDebtEvaluation = (0, ai_debt_budget_1.evaluateAiDebtBudget)({
                diffFiles,
                bloatCount: verifyResult.bloatCount,
                config: aiDebtConfig,
            });
            const aiDebtSummary = toAiDebtSummary(aiDebtEvaluation);
            const aiDebtHardBlock = aiDebtSummary.mode === 'enforce' && aiDebtSummary.violations.length > 0;
            // Apply custom policy verdict: block from dashboard overrides API verdict
            const policyBlock = policyDecision === 'block' && policyViolations.length > 0;
            const governanceDecisionBlock = governanceResult?.governanceDecision?.decision === 'block';
            const governanceIntegrityBlock = signedLogsRequired && governanceResult ? governanceResult.aiChangeLogIntegrity.valid !== true : false;
            const governanceHardBlock = governanceDecisionBlock || governanceIntegrityBlock;
            const effectiveVerdict = policyBlock || governanceHardBlock || aiDebtHardBlock
                ? 'FAIL'
                : verifyResult.verdict;
            const policyMessageBase = policyBlock
                ? `Custom policy violations: ${policyViolations.map(v => `${v.file}: ${v.message || v.rule}`).join('; ')}. ${verifyResult.message}`
                : verifyResult.message;
            const governanceBlockReason = governanceIntegrityBlock
                ? `AI change-log integrity failed: ${governanceResult?.aiChangeLogIntegrity?.issues?.join('; ') || 'unknown issue'}`
                : governanceDecisionBlock
                    ? governanceResult?.governanceDecision?.summary || 'Governance decision matrix returned BLOCK.'
                    : null;
            const aiDebtBlockReason = aiDebtHardBlock
                ? `AI debt budget exceeded: ${aiDebtSummary.violations.map((item) => item.message).join(' ')}`
                : null;
            const effectiveMessage = (policyExceptionsSummary.suppressed > 0
                ? `${policyMessageBase} Policy exceptions suppressed ${policyExceptionsSummary.suppressed} violation(s).`
                : policyMessageBase) + (governanceBlockReason ? ` ${governanceBlockReason}` : '') + (aiDebtBlockReason ? ` ${aiDebtBlockReason}` : '');
            // Calculate grade from effective verdict and score
            // CRITICAL: 0/0 planned files = 'F' (Incomplete), not 'B'
            // Bloat automatically drops grade by at least one letter
            let grade;
            // Special case: If no planned files were modified and total planned files is 0, it's incomplete (F)
            if (verifyResult.totalPlannedFiles === 0 && verifyResult.plannedFilesModified === 0) {
                grade = 'F';
            }
            else if (effectiveVerdict === 'PASS') {
                grade = 'A';
                // Log ROI event for PASS verification (Grade A) - non-blocking
                try {
                    (0, ROILogger_1.logROIEvent)('VERIFY_PASS', {
                        planId: finalPlanId,
                        adherenceScore: verifyResult.adherenceScore,
                        plannedFilesModified: verifyResult.plannedFilesModified,
                        totalPlannedFiles: verifyResult.totalPlannedFiles,
                    }, projectId || null).catch(() => {
                        // Silently ignore - ROI logging should never block user workflows
                    });
                }
                catch {
                    // Silently ignore - ROI logging should never block user workflows
                }
            }
            else if (effectiveVerdict === 'WARN') {
                // Base grade calculation
                let baseGrade = verifyResult.adherenceScore >= 70 ? 'B' : verifyResult.adherenceScore >= 50 ? 'C' : 'D';
                // Bloat drops grade by one letter (B -> C, C -> D, D -> F)
                if (verifyResult.bloatCount > 0) {
                    if (baseGrade === 'B')
                        baseGrade = 'C';
                    else if (baseGrade === 'C')
                        baseGrade = 'D';
                    else if (baseGrade === 'D')
                        baseGrade = 'F';
                }
                grade = baseGrade;
            }
            else {
                grade = 'F';
            }
            const changedPathsForBrain = diffFiles
                .flatMap((file) => [file.path, file.oldPath])
                .filter((value) => Boolean(value));
            recordVerifyEvent(effectiveVerdict, `adherence=${verifyResult.adherenceScore};bloat=${verifyResult.bloatCount};scopeGuard=${scopeGuardPassed ? 1 : 0};policy=${policyDecision};policyExceptions=${policyExceptionsSummary.suppressed};aiDebt=${aiDebtSummary.score}`, changedPathsForBrain, finalPlanId);
            const shouldForceGovernancePass = scopeGuardPassed &&
                !policyBlock &&
                !governanceHardBlock &&
                !aiDebtHardBlock &&
                (effectiveVerdict === 'PASS' ||
                    ((verifyResult.verdict === 'FAIL' || verifyResult.verdict === 'WARN') &&
                        policyViolations.length === 0 &&
                        verifyResult.bloatCount > 0));
            // If JSON output requested, output JSON and exit
            if (options.json) {
                const filteredBloatFiles = (verifyResult.bloatFiles || []).filter((f) => !shouldIgnore(f));
                const scopeViolations = filteredBloatFiles.map((file) => ({
                    file,
                    rule: 'scope_guard',
                    severity: 'block',
                    message: 'File modified outside the plan',
                }));
                const policyViolationItems = policyViolations.map((v) => ({
                    file: v.file,
                    rule: v.rule,
                    severity: v.severity,
                    message: v.message,
                    ...(v.line != null ? { startLine: v.line } : {}),
                }));
                const aiDebtViolationItems = toAiDebtReportViolations(aiDebtSummary);
                const violations = [...scopeViolations, ...policyViolationItems, ...aiDebtViolationItems];
                const jsonOutput = {
                    grade,
                    score: verifyResult.adherenceScore,
                    verdict: effectiveVerdict,
                    violations,
                    message: effectiveMessage,
                    adherenceScore: verifyResult.adherenceScore,
                    scopeGuardPassed,
                    bloatCount: filteredBloatFiles.length,
                    bloatFiles: filteredBloatFiles,
                    plannedFilesModified: verifyResult.plannedFilesModified,
                    totalPlannedFiles: verifyResult.totalPlannedFiles,
                    verificationSource: verifySource,
                    mode: 'plan_enforced',
                    policyOnly: false,
                    aiDebt: aiDebtSummary,
                    changeContract: changeContractSummary,
                    ...(compiledPolicyMetadata ? { policyCompilation: compiledPolicyMetadata } : {}),
                    ...(governanceResult
                        ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                            changeContract: changeContractSummary,
                            compiledPolicy: compiledPolicyMetadata,
                            aiDebt: aiDebtSummary,
                        })
                        : {}),
                    policyLock: {
                        enforced: policyLockEvaluation.enforced,
                        matched: policyLockEvaluation.matched,
                        path: policyLockEvaluation.lockPath,
                        mismatches: policyLockEvaluation.mismatches,
                    },
                    policyExceptions: policyExceptionsSummary,
                    policyGovernance: policyGovernanceSummary,
                    intentProof: intentProofSummary,
                    ...(runtimeGuardSummary.required ? { runtimeGuard: runtimeGuardSummary } : {}),
                    ...(policyViolations.length > 0 && { policyDecision }),
                    ...(effectiveRules.policyPack
                        ? {
                            policyPack: {
                                id: effectiveRules.policyPack.packId,
                                name: effectiveRules.policyPack.packName,
                                version: effectiveRules.policyPack.version,
                                ruleCount: effectiveRules.policyPackRules.length,
                            },
                        }
                        : {}),
                };
                emitVerifyJson(jsonOutput);
                await recordVerificationIfRequested(options, config, {
                    grade,
                    violations: violations,
                    verifyResult: {
                        adherenceScore: verifyResult.adherenceScore,
                        verdict: effectiveVerdict,
                        bloatCount: filteredBloatFiles.length,
                        bloatFiles: filteredBloatFiles,
                        message: effectiveMessage,
                        verificationSource: verifySource,
                    },
                    projectId: projectId || undefined,
                    jsonMode: true,
                    verificationSource: verifySource,
                    governance: governanceResult
                        ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                            changeContract: changeContractSummary,
                            compiledPolicy: compiledPolicyMetadata,
                            aiDebt: aiDebtSummary,
                        })
                        : undefined,
                });
                // Exit based on effective verdict (same logic as below)
                if (shouldForceGovernancePass) {
                    process.exit(0);
                }
                if (effectiveVerdict === 'FAIL') {
                    process.exit(2);
                }
                else if (effectiveVerdict === 'WARN') {
                    process.exit(1);
                }
                else {
                    process.exit(0);
                }
            }
            // Display results (only if not in json mode; exclude ignored paths from bloat)
            if (!options.json) {
                const displayBloatFiles = (verifyResult.bloatFiles || []).filter((f) => !shouldIgnore(f));
                displayVerifyResults({
                    ...verifyResult,
                    verdict: effectiveVerdict,
                    message: effectiveMessage,
                    bloatFiles: displayBloatFiles,
                    bloatCount: displayBloatFiles.length,
                }, policyViolations, expediteModeEnabled, intentEngineIssues, intentEngineSummary, intentEngineFlowIssues, intentEngineRegressions);
                if (governanceResult) {
                    displayGovernanceInsights(governanceResult, { explain: options.explain });
                }
                if (aiDebtSummary.mode !== 'off') {
                    const header = aiDebtSummary.mode === 'enforce'
                        ? aiDebtSummary.pass
                            ? chalk.green('\nAI Debt Budget: PASS')
                            : chalk.red('\nAI Debt Budget: BLOCK')
                        : chalk.yellow('\nAI Debt Budget: ADVISORY');
                    console.log(header);
                    console.log(chalk.dim(`   Score: ${aiDebtSummary.score} | TODO/FIXME +${aiDebtSummary.metrics.addedTodoFixme} | ` +
                        `console.log +${aiDebtSummary.metrics.addedConsoleLogs} | any +${aiDebtSummary.metrics.addedAnyTypes} | ` +
                        `large files ${aiDebtSummary.metrics.largeFilesTouched} | bloat ${aiDebtSummary.metrics.bloatFiles}`));
                    if (aiDebtSummary.violations.length > 0) {
                        aiDebtSummary.violations.forEach((item) => {
                            const color = aiDebtSummary.mode === 'enforce' ? chalk.red : chalk.yellow;
                            console.log(color(`   • ${item.message}`));
                        });
                    }
                }
                console.log(chalk.dim(`\n   Policy exceptions source: ${describePolicyExceptionSource(policyExceptionsSummary.sourceMode)}`));
                if (policyExceptionsSummary.suppressed > 0) {
                    console.log(chalk.yellow(`\n⚠️  Policy exceptions applied: ${policyExceptionsSummary.suppressed}`));
                    if (policyExceptionsSummary.matchedExceptionIds.length > 0) {
                        console.log(chalk.dim(`   Exception IDs: ${policyExceptionsSummary.matchedExceptionIds.join(', ')}`));
                    }
                }
                if (policyExceptionsSummary.blocked > 0) {
                    console.log(chalk.red(`\n⛔ Policy exceptions blocked by approval governance: ${policyExceptionsSummary.blocked}`));
                    const sample = policyExceptionsSummary.blockedViolations.slice(0, 5);
                    sample.forEach((item) => {
                        console.log(chalk.red(`   • ${item.file}: ${item.message || item.rule}`));
                    });
                }
                if (governance.audit.requireIntegrity && !auditIntegrityStatus.valid) {
                    console.log(chalk.red('\n⛔ Policy audit integrity enforcement is enabled and chain verification failed.'));
                    auditIntegrityStatus.issues.slice(0, 5).forEach((issue) => {
                        console.log(chalk.red(`   • ${issue}`));
                    });
                }
                if (runtimeGuardSummary.required) {
                    console.log(chalk.dim(`\n   Runtime guard: ${runtimeGuardSummary.pass ? 'pass' : 'block'} (${runtimeGuardSummary.path})`));
                }
                if (intentProofSummary.enabled) {
                    const proofHeader = intentProofSummary.pass
                        ? chalk.dim(`   Intent proof: pass (${intentProofSummary.checkedRules} rule(s)` +
                            `${intentProofSummary.repoScopedRules > 0 ? `, scanned ${intentProofSummary.scannedFiles} file(s)` : ''})`)
                        : chalk.red(`\n⛔ Intent proof enforcement: ${intentProofSummary.violations.length} violation(s) ` +
                            `(${intentProofSummary.checkedRules} rule(s))`);
                    console.log(`\n${proofHeader}`);
                    if (!intentProofSummary.pass) {
                        intentProofSummary.violations.slice(0, 5).forEach((issue) => {
                            console.log(chalk.red(`   • ${issue}`));
                        });
                        if (intentProofSummary.violations.length > 5) {
                            console.log(chalk.dim(`   ... ${intentProofSummary.violations.length - 5} more violation(s)`));
                        }
                    }
                    else if (intentProofSummary.truncated) {
                        console.log(chalk.dim('   Intent proof repo scan reached configured file/byte limit (truncated).'));
                    }
                }
            }
            // Report to Neurcode Cloud if --record flag is set
            const filteredBloatForReport = (verifyResult.bloatFiles || []).filter((f) => !shouldIgnore(f));
            const reportViolations = [
                ...filteredBloatForReport.map((file) => ({
                    rule: 'scope_guard',
                    file: file,
                    severity: 'block',
                    message: 'File modified outside the plan',
                })),
                ...policyViolations.map((v) => ({
                    rule: v.rule,
                    file: v.file,
                    severity: v.severity,
                    message: v.message,
                })),
                ...toAiDebtReportViolations(aiDebtSummary),
            ];
            await recordVerificationIfRequested(options, config, {
                grade,
                violations: reportViolations,
                verifyResult: {
                    adherenceScore: verifyResult.adherenceScore,
                    verdict: effectiveVerdict,
                    bloatCount: filteredBloatForReport.length,
                    bloatFiles: filteredBloatForReport,
                    message: effectiveMessage,
                    verificationSource: verifySource,
                },
                projectId: projectId || undefined,
                jsonMode: false,
                verificationSource: verifySource,
                governance: governanceResult
                    ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                        changeContract: changeContractSummary,
                        compiledPolicy: compiledPolicyMetadata,
                        aiDebt: aiDebtSummary,
                    })
                    : undefined,
            });
            // Governance override: keep PASS only when scope guard passes and failure is due
            // to server-side bloat mismatch (allowed files unknown to verify API).
            if (shouldForceGovernancePass) {
                if ((verifyResult.verdict === 'FAIL' || verifyResult.verdict === 'WARN') && policyViolations.length === 0) {
                    if (!options.json) {
                        console.log(chalk.yellow('\n⚠️  Plan deviation allowed'));
                        console.log(chalk.dim('   Some files were modified outside the plan, but they were explicitly allowed.'));
                        console.log(chalk.dim('   Governance check passed - proceeding with exit code 0.\n'));
                    }
                }
                if (!options.json && policyExceptionsSummary.suppressed > 0) {
                    console.log(chalk.yellow(`   Policy exceptions applied: ${policyExceptionsSummary.suppressed}`));
                }
                process.exit(0);
            }
            // If scope guard didn't pass (or failed to check) or policy blocked, use effective verdict
            // Exit with appropriate code based on AI verification and custom policies
            if (effectiveVerdict === 'FAIL') {
                process.exit(2);
            }
            else if (effectiveVerdict === 'WARN') {
                process.exit(1);
            }
            else {
                process.exit(0);
            }
        }
        catch (error) {
            const changedFiles = diffFiles
                .flatMap((file) => [file.path, file.oldPath])
                .filter((value) => Boolean(value));
            recordVerifyEvent('FAIL', `verify_api_error=${error instanceof Error ? error.message : 'unknown'}`, changedFiles, finalPlanId);
            if (options.json) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                emitVerifyJson({
                    grade: 'F',
                    score: 0,
                    verdict: 'FAIL',
                    violations: [],
                    adherenceScore: 0,
                    bloatCount: 0,
                    bloatFiles: [],
                    plannedFilesModified: 0,
                    totalPlannedFiles: 0,
                    message: `Error: ${errorMessage}`,
                    scopeGuardPassed: false,
                });
            }
            else {
                console.error(chalk.red('\n❌ Verification failed before completion.'));
                if (diffFiles.length > 0) {
                    console.log(chalk.dim(`   Partial context captured: ${diffFiles.length} changed file(s) in diff.`));
                }
                if (error instanceof Error) {
                    if (error.message.includes('404') || error.message.includes('not found')) {
                        console.error(chalk.red(`❌ Error: Plan not found`));
                        console.log(chalk.dim(`   Plan ID: ${planId}`));
                        console.log(chalk.dim('   Make sure the planId is correct and belongs to your organization'));
                    }
                    else {
                        console.error(chalk.red(`❌ Error: ${error.message}`));
                    }
                }
                else {
                    console.error(chalk.red('❌ Error:', error));
                }
            }
            process.exit(1);
        }
    }
    catch (error) {
        if (options.json) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            emitCanonicalVerifyJson({
                verdict: 'FAIL',
                summary: {
                    totalFilesChanged: 0,
                    totalViolations: 0,
                    totalWarnings: 1,
                    totalScopeIssues: 0,
                },
                violations: [],
                warnings: [
                    {
                        file: 'unknown',
                        message: `Unexpected error: ${errorMessage}`,
                        policy: 'verify_runtime',
                    },
                ],
                scopeIssues: [],
            });
        }
        else {
            console.error(chalk.red('\n❌ Unexpected error:'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
                if (error.message.includes('not a git repository')) {
                    console.error(chalk.dim('   This command must be run in a git repository'));
                }
            }
            else {
                console.error(error);
            }
        }
        process.exit(1);
    }
}
/**
 * Collect CI context from environment variables and git
 */
function collectCIContext() {
    const context = {};
    // Try GitHub Actions environment variables first
    if (process.env.GITHUB_SHA) {
        context.commitSha = process.env.GITHUB_SHA;
    }
    else {
        // Fallback to git rev-parse HEAD
        try {
            context.commitSha = (0, child_process_1.execSync)('git rev-parse HEAD', {
                maxBuffer: 1024 * 1024 * 1024,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore'],
            }).trim();
        }
        catch {
            // Not a git repo or HEAD not available
        }
    }
    // Try GitHub Actions branch
    if (process.env.GITHUB_REF_NAME) {
        context.branch = process.env.GITHUB_REF_NAME;
    }
    else if (process.env.GITHUB_REF) {
        // GITHUB_REF is like refs/heads/main or refs/tags/v1.0.0
        const refMatch = process.env.GITHUB_REF.match(/^refs\/(?:heads|tags)\/(.+)$/);
        if (refMatch) {
            context.branch = refMatch[1];
        }
    }
    else {
        // Fallback to git branch --show-current
        try {
            context.branch = (0, child_process_1.execSync)('git branch --show-current', {
                maxBuffer: 1024 * 1024 * 1024,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore'],
            }).trim();
        }
        catch {
            // Not a git repo or branch command failed
        }
    }
    // Try GitHub Actions repository
    if (process.env.GITHUB_REPOSITORY) {
        // GITHUB_REPOSITORY is like "owner/repo"
        context.repoUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}`;
    }
    else {
        // Fallback to git config --get remote.origin.url
        try {
            const gitUrl = (0, child_process_1.execSync)('git config --get remote.origin.url', {
                maxBuffer: 1024 * 1024 * 1024,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore'],
            }).trim();
            // Normalize git URL
            if (gitUrl) {
                // Convert SSH to HTTPS if needed
                if (gitUrl.startsWith('git@')) {
                    // git@github.com:owner/repo.git -> https://github.com/owner/repo
                    const sshMatch = gitUrl.match(/git@([^:]+):(.+)/);
                    if (sshMatch) {
                        context.repoUrl = `https://${sshMatch[1]}/${sshMatch[2].replace(/\.git$/, '')}`;
                    }
                    else {
                        context.repoUrl = gitUrl.replace(/\.git$/, '');
                    }
                }
                else {
                    context.repoUrl = gitUrl.replace(/\.git$/, '');
                }
            }
        }
        catch {
            // Not a git repo or no remote configured
        }
    }
    // Try GitHub Actions workflow run ID
    if (process.env.GITHUB_RUN_ID) {
        context.workflowRunId = process.env.GITHUB_RUN_ID;
    }
    return context;
}
const REPORT_MAX_ARRAY_ITEMS = 120;
const REPORT_MAX_STRING_LENGTH = 4000;
const REPORT_MAX_OBJECT_DEPTH = 6;
function compactReportValue(value, depth = 0, seen = new WeakSet()) {
    if (value == null) {
        return value;
    }
    if (typeof value === 'string') {
        return value.length > REPORT_MAX_STRING_LENGTH
            ? `${value.slice(0, REPORT_MAX_STRING_LENGTH)}...[truncated]`
            : value;
    }
    if (typeof value !== 'object') {
        return value;
    }
    if (depth >= REPORT_MAX_OBJECT_DEPTH) {
        return '[truncated]';
    }
    if (Array.isArray(value)) {
        const items = value.slice(0, REPORT_MAX_ARRAY_ITEMS).map((item) => compactReportValue(item, depth + 1, seen));
        if (value.length > REPORT_MAX_ARRAY_ITEMS) {
            items.push(`[truncated ${value.length - REPORT_MAX_ARRAY_ITEMS} item(s)]`);
        }
        return items;
    }
    if (seen.has(value)) {
        return '[circular]';
    }
    seen.add(value);
    const compacted = {};
    for (const [key, nestedValue] of Object.entries(value)) {
        compacted[key] = compactReportValue(nestedValue, depth + 1, seen);
    }
    return compacted;
}
function buildCompactVerificationPayload(payload) {
    const compactViolations = payload.violations.slice(0, REPORT_MAX_ARRAY_ITEMS);
    if (payload.violations.length > REPORT_MAX_ARRAY_ITEMS) {
        compactViolations.push({
            rule: 'report_payload_compaction',
            file: '__meta__',
            severity: 'warn',
            message: `Truncated ${payload.violations.length - REPORT_MAX_ARRAY_ITEMS} additional violation(s) for upload`,
        });
    }
    return {
        ...payload,
        violations: compactViolations,
        bloatFiles: payload.bloatFiles.slice(0, REPORT_MAX_ARRAY_ITEMS),
        message: payload.message.length > REPORT_MAX_STRING_LENGTH
            ? `${payload.message.slice(0, REPORT_MAX_STRING_LENGTH)}...[truncated]`
            : payload.message,
        governance: payload.governance
            ? compactReportValue(payload.governance)
            : undefined,
    };
}
/**
 * Report verification results to Neurcode Cloud
 */
async function reportVerification(grade, violations, verifyResult, apiKey, apiUrl, projectId, jsonMode, governance, verificationSource) {
    try {
        const ciContext = collectCIContext();
        const payload = {
            grade: grade.toUpperCase(),
            violations: violations || [],
            adherenceScore: verifyResult.adherenceScore,
            verdict: verifyResult.verdict,
            bloatCount: verifyResult.bloatCount,
            bloatFiles: verifyResult.bloatFiles,
            message: verifyResult.message,
            repoUrl: ciContext.repoUrl,
            commitSha: ciContext.commitSha,
            branch: ciContext.branch,
            workflowRunId: ciContext.workflowRunId,
            projectId,
            governance,
            verificationSource: verificationSource || verifyResult.verificationSource || 'api',
        };
        const postPayload = async (requestPayload) => fetch(`${apiUrl}/api/v1/action/verifications`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestPayload),
        });
        let response = await postPayload(payload);
        let compactedUpload = false;
        if (response.status === 413) {
            response = await postPayload(buildCompactVerificationPayload(payload));
            compactedUpload = true;
        }
        if (!response.ok) {
            const errorText = await response.text();
            const compactError = errorText.replace(/\s+/g, ' ').trim().slice(0, 400);
            throw new Error(`HTTP ${response.status}: ${compactError}`);
        }
        let result = {};
        try {
            result = (await response.json());
        }
        catch {
            // Some proxies may return empty success bodies; treat as recorded.
        }
        // Only log if not in json mode to avoid polluting stdout
        if (!jsonMode) {
            const suffix = compactedUpload ? ' (compact payload)' : '';
            console.log(chalk.dim(`\n✅ Verification result reported to Neurcode Cloud (ID: ${result.id || 'ok'})${suffix}`));
        }
    }
    catch (error) {
        // Log warning but don't crash - verification should still work
        // Only log if not in json mode to avoid polluting stdout
        if (jsonMode === undefined || !jsonMode) {
            console.log(chalk.yellow(`\n⚠️  Failed to upload report to Neurcode Cloud: ${error instanceof Error ? error.message : 'Unknown error'}`));
            console.log(chalk.dim('   Verification completed successfully, but results were not recorded.'));
        }
    }
}
function buildGovernancePayload(governance, orgGovernanceSettings, options) {
    return {
        contextPolicy: governance.contextPolicy,
        blastRadius: governance.blastRadius,
        suspiciousChange: governance.suspiciousChange,
        changeJustification: governance.changeJustification,
        governanceDecision: governance.governanceDecision,
        aiChangeLog: {
            path: governance.aiChangeLogPath,
            auditPath: governance.aiChangeLogAuditPath,
            integrity: governance.aiChangeLogIntegrity,
        },
        policySources: governance.policySources,
        orgGovernance: orgGovernanceSettings
            ? {
                requireSignedAiLogs: orgGovernanceSettings.requireSignedAiLogs,
                requireManualApproval: orgGovernanceSettings.requireManualApproval,
                minimumManualApprovals: orgGovernanceSettings.minimumManualApprovals,
                ...(orgGovernanceSettings.policyGovernance
                    ? { policyGovernance: orgGovernanceSettings.policyGovernance }
                    : {}),
                updatedAt: orgGovernanceSettings.updatedAt || null,
            }
            : null,
        ...(options?.compiledPolicy ? { policyCompilation: options.compiledPolicy } : {}),
        ...(options?.changeContract ? { changeContract: options.changeContract } : {}),
        ...(options?.aiDebt ? { aiDebt: options.aiDebt } : {}),
    };
}
function displayGovernanceInsights(governance, options = {}) {
    const maxUnexpectedFiles = options.maxUnexpectedFiles ?? 20;
    const decision = governance.governanceDecision;
    console.log(chalk.bold.white('\nBlast Radius:'));
    console.log(chalk.dim(`   Files touched: ${governance.blastRadius.filesChanged}`));
    console.log(chalk.dim(`   Functions impacted: ${governance.blastRadius.functionsAffected}`));
    console.log(chalk.dim(`   Modules impacted: ${governance.blastRadius.modulesAffected.join(', ') || 'none'}`));
    if (governance.blastRadius.dependenciesAdded.length > 0) {
        console.log(chalk.dim(`   Dependencies added: ${governance.blastRadius.dependenciesAdded.join(', ')}`));
    }
    console.log(chalk.dim(`   Risk level: ${governance.blastRadius.riskScore.toUpperCase()}`));
    console.log(chalk.dim(`   Governance decision: ${decision.decision.toUpperCase().replace('_', ' ')} | Avg relevance: ${decision.averageRelevanceScore}`));
    console.log(chalk.dim(`   Policy source: ${governance.policySources.mode}${governance.policySources.orgPolicy ? ' (org + local)' : ' (local)'}`));
    console.log(governance.aiChangeLogIntegrity.valid
        ? chalk.dim(`   AI change-log integrity: valid (${governance.aiChangeLogIntegrity.signed ? 'signed' : 'unsigned'})`)
        : chalk.red(`   AI change-log integrity: invalid (${governance.aiChangeLogIntegrity.issues.join('; ') || 'unknown'})`));
    if (governance.aiChangeLogIntegrity.signed) {
        const keyId = typeof governance.aiChangeLogIntegrity.keyId === 'string'
            ? governance.aiChangeLogIntegrity.keyId
            : null;
        const verifiedWithKeyId = typeof governance.aiChangeLogIntegrity.verifiedWithKeyId === 'string'
            ? governance.aiChangeLogIntegrity.verifiedWithKeyId
            : null;
        if (keyId || verifiedWithKeyId) {
            console.log(chalk.dim(`   Signing key: ${keyId || 'n/a'}${verifiedWithKeyId ? ` (verified via ${verifiedWithKeyId})` : ''}`));
        }
    }
    if (governance.suspiciousChange.flagged) {
        console.log(chalk.red('\nSuspicious Change Detected'));
        console.log(chalk.red(`   Plan expected files: ${governance.suspiciousChange.expectedFiles} | AI modified files: ${governance.suspiciousChange.actualFiles}`));
        governance.suspiciousChange.unexpectedFiles.slice(0, maxUnexpectedFiles).forEach((filePath) => {
            console.log(chalk.red(`   • ${filePath}`));
        });
        console.log(chalk.red(`   Confidence: ${governance.suspiciousChange.confidence}`));
    }
    if (decision.lowRelevanceFiles.length > 0) {
        console.log(chalk.yellow('\nLow Relevance Files'));
        decision.lowRelevanceFiles.slice(0, 10).forEach((item) => {
            console.log(chalk.yellow(`   • ${item.file} (score ${item.relevanceScore}, ${item.planLink.replace('_', ' ')})`));
        });
    }
    if (options.explain) {
        console.log(chalk.bold.white('\nAI Change Justification:'));
        console.log(chalk.dim(`   Task: ${governance.changeJustification.task}`));
        governance.changeJustification.changes.forEach((item) => {
            const relevance = typeof item.relevanceScore === 'number' ? ` [score ${item.relevanceScore}]` : '';
            console.log(chalk.dim(`   • ${item.file} — ${item.reason}${relevance}`));
        });
    }
}
function displayChangeContractDrift(summary, options = { advisory: false }) {
    const groups = (0, change_contract_1.groupChangeContractViolations)(summary.violations.map((item) => ({
        code: item.code,
        message: item.message,
        ...(item.file ? { file: item.file } : {}),
        ...(item.symbol ? { symbol: item.symbol } : {}),
        ...(item.symbolType ? { symbolType: item.symbolType } : {}),
        ...(item.expected ? { expected: item.expected } : {}),
        ...(item.actual ? { actual: item.actual } : {}),
    })));
    if (groups.length === 0)
        return;
    const maxItemsPerGroup = options.maxItemsPerGroup ?? 12;
    const header = options.advisory
        ? chalk.yellow('\nWARN ⚠️  Change contract drift detected')
        : chalk.red('\nFAIL ❌  Change contract enforcement failed');
    console.log(header);
    for (const group of groups) {
        console.log(chalk.white(`\n${group.title}:`));
        group.items.slice(0, maxItemsPerGroup).forEach((entry) => {
            console.log(`  - ${entry}`);
        });
        if (group.items.length > maxItemsPerGroup) {
            console.log(chalk.dim(`  - ... ${group.items.length - maxItemsPerGroup} more`));
        }
        console.log(chalk.dim(`  Why it matters: ${group.impact}`));
    }
    console.log(chalk.dim('\nSummary:'));
    console.log(chalk.dim('Implementation deviates from intended contract.'));
    console.log(chalk.dim(`Contract path: ${summary.path}`));
}
/**
 * Display verification results in a formatted report card
 */
function displayVerifyResults(result, policyViolations, expediteModeUsed = false, intentIssuesForDisplay = [], intentSummaryForDisplay = null, flowIssuesForDisplay = [], regressionsForDisplay = []) {
    // ── Header ────────────────────────────────────────────────────────────────
    const headerLabel = result.verdict === 'PASS'
        ? chalk.bold.green('\n✅ VERIFICATION PASSED')
        : result.verdict === 'WARN'
            ? chalk.bold.yellow('\n⚠️  VERIFICATION PASSED WITH WARNINGS')
            : chalk.bold.red('\n❌ VERIFICATION FAILED');
    console.log(headerLabel);
    // ── Intent Status block ──────────────────────────────────────────────────
    if (intentSummaryForDisplay) {
        const s = intentSummaryForDisplay;
        const domainLabel = s.domain.charAt(0).toUpperCase() + s.domain.slice(1);
        const confColor = s.confidence === 'HIGH'
            ? chalk.green
            : s.confidence === 'MEDIUM'
                ? chalk.yellow
                : chalk.red;
        // V4: weighted coverage bar
        const wCovPct = s.weightedCoverage != null
            ? Math.round(s.weightedCoverage * 100)
            : s.coveragePct;
        const barWidth = 20;
        const filled = Math.round((wCovPct / 100) * barWidth);
        const bar = chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(barWidth - filled));
        // V4: system status label
        const sysStatus = s.status;
        const statusLabel = sysStatus === 'CRITICAL'
            ? chalk.bold.red('[CRITICAL]')
            : sysStatus === 'AT RISK'
                ? chalk.bold.yellow('[AT RISK]')
                : chalk.bold.green('[SECURE]');
        console.log(chalk.bold('\n━━━ INTENT STATUS ━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(`  ${statusLabel} ${chalk.bold(`${domainLabel} Implementation:`)} ${bar} ${chalk.bold(`${wCovPct}%`)} (weighted)`);
        console.log(`  Confidence: ${confColor(s.confidence)}`);
        if (s.foundList.length > 0) {
            const foundLabels = s.foundList
                .map((k) => k.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
                .slice(0, 4);
            console.log(`  Found:   ${chalk.green(foundLabels.join(', '))}${s.foundList.length > 4 ? chalk.dim(` +${s.foundList.length - 4} more`) : ''}`);
        }
        // V4: show critical missing and non-critical missing separately
        const critMissing = s.criticalMissing ?? [];
        const otherMissing = s.missing.filter((k) => !critMissing.includes(k));
        if (critMissing.length > 0) {
            console.log(`  ${chalk.bold.red('Critical missing:')}`);
            critMissing.forEach((k) => {
                const label = k.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                console.log(chalk.red(`    ✗ ${label}`));
            });
        }
        if (otherMissing.length > 0) {
            console.log(`  ${chalk.bold.yellow('Missing:')}`);
            otherMissing.forEach((k) => {
                const label = k.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                console.log(chalk.yellow(`    • ${label}`));
            });
        }
        if (critMissing.length === 0 && otherMissing.length === 0) {
            console.log(`  Missing: ${chalk.green('none — all components detected')}`);
        }
        console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    }
    // ── Triage items ──────────────────────────────────────────────────────────
    const maxBlockingItems = 20;
    const maxAdvisoryItems = 8;
    const maxExpediteItems = 12;
    const policyItems = policyViolations || [];
    const isBlockingSeverity = (severityRaw) => {
        const normalized = String(severityRaw || '').toLowerCase();
        return normalized === 'block' || normalized === 'critical' || normalized === 'high';
    };
    const scopeItems = result.bloatFiles.map((file) => ({
        file,
        message: 'File modified outside intended scope',
        policy: 'scope_guard',
    }));
    const policyTriageItems = policyItems.map((item) => ({
        file: item.file,
        message: item.message || item.rule,
        policy: item.rule || 'policy_violation',
        severity: item.severity,
    }));
    let blockingItems = [
        ...scopeItems.map((item) => ({
            file: item.file,
            message: item.message,
        })),
        ...policyTriageItems
            .filter((item) => isBlockingSeverity(item.severity))
            .map((item) => ({
            file: item.file,
            message: item.message,
        })),
    ];
    let advisoryItems = policyTriageItems
        .filter((item) => !isBlockingSeverity(item.severity))
        .map((item) => ({
        file: item.file,
        message: item.message,
    }));
    let expediteItems = [];
    if (expediteModeUsed) {
        blockingItems = [
            ...scopeItems
                .filter((item) => isCriticalScopeBreach(item.file, item.message))
                .map((item) => ({ file: item.file, message: item.message })),
            ...policyTriageItems
                .filter((item) => isSecurityOrAuthViolation(item.file, item.policy, item.message))
                .map((item) => ({ file: item.file, message: item.message })),
        ];
        expediteItems = [
            ...scopeItems
                .filter((item) => !isCriticalScopeBreach(item.file, item.message))
                .map((item) => ({ file: item.file, message: item.message })),
            ...policyTriageItems
                .filter((item) => !isSecurityOrAuthViolation(item.file, item.policy, item.message))
                .map((item) => ({ file: item.file, message: item.message })),
        ];
        advisoryItems = [];
    }
    // ── Counts ────────────────────────────────────────────────────────────────
    console.log(blockingItems.length > 0
        ? chalk.red(`Blocking Issues: ${blockingItems.length}`)
        : chalk.dim('Blocking Issues: 0'));
    if (expediteModeUsed) {
        console.log(chalk.yellow(`Expedite Issues: ${expediteItems.length}`));
    }
    else {
        console.log(advisoryItems.length > 0
            ? chalk.yellow(`Advisory Issues: ${advisoryItems.length}`)
            : chalk.dim('Advisory Issues: 0'));
    }
    console.log(chalk.dim(`Plan adherence: ${result.plannedFilesModified}/${result.totalPlannedFiles} files (${result.adherenceScore}%)`));
    // ── Top issues ────────────────────────────────────────────────────────────
    const topIssues = [
        ...blockingItems,
        ...(expediteModeUsed ? expediteItems : advisoryItems),
    ].slice(0, 2);
    if (topIssues.length > 0) {
        console.log(chalk.bold('\nTop Issues:'));
        topIssues.forEach((item, i) => {
            console.log(`  ${i + 1}. ${item.message} → ${chalk.cyan(item.file)}`);
        });
    }
    // ── Detailed lists ────────────────────────────────────────────────────────
    if (blockingItems.length > 0) {
        console.log(chalk.red(`\nBLOCKING (${blockingItems.length})`));
        blockingItems.slice(0, maxBlockingItems).forEach((item) => {
            console.log(`  - ${item.file}: ${item.message}`);
        });
        if (blockingItems.length > maxBlockingItems) {
            console.log(chalk.dim(`  - ... ${blockingItems.length - maxBlockingItems} more`));
        }
    }
    if (advisoryItems.length > 0) {
        console.log(chalk.yellow(`\nADVISORY (${advisoryItems.length})`));
        advisoryItems.slice(0, maxAdvisoryItems).forEach((item) => {
            console.log(`  - ${item.file}: ${item.message}`);
        });
        if (advisoryItems.length > maxAdvisoryItems) {
            console.log(chalk.dim(`  - ... ${advisoryItems.length - maxAdvisoryItems} more (summarized)`));
        }
    }
    if (expediteModeUsed && expediteItems.length > 0) {
        console.log(chalk.yellow(`\nEXPEDITE (requires follow-up) (${expediteItems.length})`));
        expediteItems.slice(0, maxExpediteItems).forEach((item) => {
            console.log(`  - ${item.file}: ${item.message}`);
        });
        if (expediteItems.length > maxExpediteItems) {
            console.log(chalk.dim(`  - ... ${expediteItems.length - maxExpediteItems} more (summarized)`));
        }
        console.log(chalk.dim('  Follow-up checklist:'));
        EXPEDITE_FOLLOW_UP_CHECKLIST.forEach((checkItem) => {
            console.log(chalk.dim(`  - ${checkItem}`));
        });
        console.log(chalk.dim('  Note: Expedite Mode used'));
    }
    // ── Intent issues ─────────────────────────────────────────────────────────
    if (intentIssuesForDisplay.length > 0) {
        console.log(chalk.magenta(`\nINTENT ISSUES (${intentIssuesForDisplay.length})`));
        intentIssuesForDisplay.forEach((issue) => {
            const label = issue.severity === 'high' ? chalk.red('[HIGH]') : chalk.yellow('[MEDIUM]');
            const typeLabel = issue.type === 'missing' ? 'Missing' : issue.type === 'misplaced' ? 'Misplaced' : 'Partial';
            console.log(`  ${label} ${typeLabel}: ${issue.message}`);
        });
    }
    // ── Flow Validation ───────────────────────────────────────────────────────
    if (flowIssuesForDisplay.length > 0) {
        console.log(chalk.bold('\n━━━ FLOW VALIDATION ━━━━━━━━━━━━━━━━━━━━━'));
        flowIssuesForDisplay.forEach((issue) => {
            const label = issue.severity === 'high' ? chalk.red('[HIGH]') : chalk.yellow('[MEDIUM]');
            const typeIcon = issue.type === 'missing-flow' ? '⛓' : issue.type === 'misplaced-flow' ? '⚠' : '⊘';
            console.log(`  ${label} ${typeIcon} ${issue.message}`);
            if (issue.files && issue.files.length > 0) {
                const display = issue.files.slice(0, 3);
                console.log(chalk.dim(`      → ${display.join(', ')}${issue.files.length > 3 ? ` +${issue.files.length - 3} more` : ''}`));
            }
        });
        console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    }
    // ── Regression Analysis ───────────────────────────────────────────────────
    if (regressionsForDisplay.length > 0) {
        console.log(chalk.bold.red('\n━━━ REGRESSION ANALYSIS ━━━━━━━━━━━━━━━━━'));
        regressionsForDisplay.forEach((reg) => {
            const icon = reg.type === 'coverage-regression' ? '📉' :
                reg.type === 'critical-regression' ? '🔴' :
                    reg.type === 'flow-regression' ? '⛓' : '⚠';
            console.log(`  ${chalk.red('[REGRESSION]')} ${icon} ${reg.message}`);
        });
        console.log(chalk.bold.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    }
    const hasAnyIssue = blockingItems.length > 0 ||
        advisoryItems.length > 0 ||
        expediteItems.length > 0 ||
        intentIssuesForDisplay.length > 0 ||
        flowIssuesForDisplay.length > 0 ||
        regressionsForDisplay.length > 0;
    if (!hasAnyIssue) {
        console.log(chalk.green('\nNo issues detected.'));
    }
    // ── Next step ─────────────────────────────────────────────────────────────
    if (hasAnyIssue) {
        console.log(chalk.bold('\nNext step:'));
        console.log(`  ${chalk.cyan('neurcode fix')}`);
        console.log(chalk.dim('  or: neurcode fix --apply-safe  (auto-apply high-confidence patches)'));
    }
    console.log(chalk.dim(`\nDetails: ${result.message}\n`));
}
function printFirstRunAdvisoryMessage(demoMode) {
    console.log(chalk.cyan('\nNeurcode first-run advisory mode'));
    console.log(chalk.dim('Neurcode checks if your AI-generated code matches your intended plan.'));
    console.log(chalk.dim('To get full enforcement:'));
    console.log(chalk.dim('1. Define a plan'));
    console.log(chalk.dim('2. Generate a contract'));
    console.log(chalk.dim('Running in advisory mode for now.\n'));
    if (demoMode) {
        console.log(chalk.dim('Demo mode: this run is intentionally non-blocking to make evaluation easy.'));
    }
}
function printAdvisorySignals(signals, demoMode) {
    if (signals.length === 0) {
        if (demoMode) {
            console.log(chalk.dim('No high-signal advisory findings detected for this diff.'));
        }
        return;
    }
    console.log(chalk.yellow('\nAdvisory findings (non-blocking):'));
    for (const signal of signals) {
        const severityLabel = signal.severity === 'warn' ? chalk.yellow('[warn]') : chalk.dim('[info]');
        console.log(`${severityLabel} ${signal.title}`);
        console.log(chalk.dim(`  ${signal.detail}`));
        signal.files.forEach((file) => {
            console.log(chalk.dim(`  - ${file}`));
        });
    }
}
function buildMinimalAdvisoryContractFromDiff(diffFiles, fallbackPlanId) {
    const expectedFiles = [...new Set(diffFiles.map((file) => toUnixPath(file.path)).filter(Boolean))];
    const planFiles = expectedFiles.map((path) => {
        const entry = diffFiles.find((file) => toUnixPath(file.path) === path);
        const changeType = entry?.changeType;
        const action = changeType === 'add' ? 'CREATE' : 'MODIFY';
        return {
            path,
            action: action,
            reason: 'Auto-generated advisory baseline from current diff',
        };
    });
    return (0, change_contract_1.createChangeContract)({
        planId: fallbackPlanId,
        intent: 'Advisory baseline generated from current repository diff',
        expectedFiles,
        planFiles,
        options: {
            enforceExpectedFiles: false,
            enforceActionMatching: false,
            enforceExpectedSymbols: false,
            enforceSymbolActionMatching: false,
        },
    });
}
//# sourceMappingURL=verify.js.map