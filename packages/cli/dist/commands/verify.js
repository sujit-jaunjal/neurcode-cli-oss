"use strict";
/**
 * Verify Command
 *
 * Runs deterministic operational governance against the current diff:
 *   - Intent contract enforcement (approved scope + forbidden boundaries)
 *   - Structural rules (PY/SR/DS catalogues)
 *   - Drift narrative synthesis + governance posture rollup
 *   - Generated-code spillover + boundary classification
 *   - Replay continuity (canonical replay checksum, byte-stable per inputs)
 *
 * Emits a single canonical envelope plus a `runtimeCapabilities` declaration so
 * enterprise CI gates can assert what actually executed instead of inferring
 * from absent fields. The command is the verification step in the canonical
 * governance lifecycle; remediation is performed by an external AI assistant,
 * never by this command.
 *
 * See `docs/governance-vocabulary.md` for canonical terminology.
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
const runtime_state_1 = require("../utils/runtime-state");
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
const verify_guidance_1 = require("./verify-guidance");
const verify_output_1 = require("./verify-output");
const verify_render_1 = require("./verify-render");
const structural_rules_1 = require("../structural-rules");
const canonical_pipeline_1 = require("../governance/canonical-pipeline");
const canonical_invariants_1 = require("../governance/canonical-invariants");
const structural_on_diff_1 = require("../governance/structural-on-diff");
// NOTE: mergeStructuralIntoPolicyViolations is intentionally NOT imported.
// Structural violations flow exclusively through payload.structuralViolations
// into the canonical pipeline. Merging them into policyViolations caused
// duplicate GovernanceFinding objects (fixed in Phase 1 canonical graph hardening).
const telemetry_1 = require("@neurcode-ai/telemetry");
const pilot_metrics_1 = require("../utils/pilot-metrics");
const replay_custody_1 = require("../utils/replay-custody");
const runtime_guard_1 = require("../utils/runtime-guard");
const artifact_signature_1 = require("../utils/artifact-signature");
const policy_1 = require("@neurcode-ai/policy");
const active_engineering_context_1 = require("../utils/active-engineering-context");
const core_1 = require("@neurcode-ai/core");
const path_boundary_classifier_1 = require("../utils/path-boundary-classifier");
const import_edge_governance_1 = require("../utils/import-edge-governance");
const ai_debt_budget_1 = require("../utils/ai-debt-budget");
const verification_evidence_1 = require("../utils/verification-evidence");
const verify_runtime_stability_1 = require("../utils/verify-runtime-stability");
const policy_decision_1 = require("../utils/policy-decision");
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
/**
 * Structured CI explainability for `neurcode verify --ci` / `--policy-only` human output.
 * Keeps logs short — no JSON dumps — and separates merge-blocking vs advisory signals.
 */
function logCiPolicyOnlyOutcomeExplainability(params) {
    if (!params.ciModeEnabled || params.json) {
        return;
    }
    const modeLine = params.source === 'ci'
        ? '`verify --ci` uses deterministic local governance (compiled/custom policy + structural rules). Remote plan-verify API is not used.'
        : '`--policy-only` — local policy + structural governance without plan adherence.';
    const sev = (s) => String(s || '').toLowerCase();
    const sBlock = params.structuralViolations.filter((v) => v.severity === 'BLOCKING').length;
    const sAdv = params.structuralViolations.length - sBlock;
    const pBlock = params.policyViolations.filter((v) => sev(v.severity) === 'block').length;
    const pWarn = params.policyViolations.filter((v) => sev(v.severity) === 'warn').length;
    if (params.verdict === 'PASS') {
        console.log(chalk.dim('\n── CI verify contract ──'));
        console.log(chalk.dim(`   ${modeLine}`));
        console.log(chalk.dim('   Exit 0: no blocking severities. Replay checksum (JSON) anchors structural findings for audit parity.'));
        return;
    }
    console.log(chalk.bold.red('\n── CI failure explainability ──'));
    console.log(chalk.dim(`   ${modeLine}`));
    console.log(chalk.red(`   Merge-blocking rows: structural BLOCKING ${sBlock}; policy/custom severity=block ${pBlock}`));
    console.log(chalk.yellow(`   Non-blocking (warn/advisory-class): structural advisory ${sAdv}; policy warn ${pWarn} — does not fail CI unless your gate maps warns to failure`));
    console.log(chalk.dim('   Offline / structural-only: set NEURCODE_VERIFY_LOCAL_ONLY=1 or `--local-only` to skip API compatibility probes (AST gates still run).'));
    if (params.replayChecksum) {
        console.log(chalk.dim(`   Structural replay checksum: ${params.replayChecksum.slice(0, 16)}… · mode ${params.replayMode ?? 'local-structural'}`));
    }
    console.log(chalk.dim('   Next: resolve BLOCKING first → `neurcode remediate-export` (optional) → re-run `neurcode verify --ci`.\n'));
}
function driftSeverityToPolicySeverity(severity) {
    return severity === 'critical' || severity === 'high' ? 'block' : 'warn';
}
function driftGateToPolicySeverity(gate, fallbackSeverity) {
    if (gate === 'policy-blocker' || gate === 'rollout-blocker' || gate === 'architecture-blocker') {
        return 'block';
    }
    if (gate === 'review-blocker' || gate === 'advisory') {
        return 'warn';
    }
    return driftSeverityToPolicySeverity(fallbackSeverity);
}
function driftFindingsToVerificationViolations(drift) {
    if (!drift || !Array.isArray(drift.findings)) {
        return [];
    }
    if (Array.isArray(drift.narratives) && drift.narratives.length > 0) {
        return drift.narratives.map((narrative) => ({
            file: narrative.affectedFiles[0]
                || narrative.affectedModules[0]
                || narrative.affectedServices[0]
                || '.neurcode/intent-pack.json',
            rule: `drift_narrative:${narrative.category}`,
            severity: driftGateToPolicySeverity(drift.riskSynthesis?.governanceGate, narrative.severity),
            message: narrative.summary,
        }));
    }
    return drift.findings.map((finding) => ({
        file: finding.file || finding.module || finding.service || '.neurcode/intent-pack.json',
        rule: `drift_intelligence:${finding.category}`,
        severity: driftGateToPolicySeverity(finding.governanceGate, finding.severity),
        message: finding.priority
            ? `${finding.message} (${finding.priority}; ${finding.governanceGate || 'review-blocker'})`
            : finding.message,
    }));
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
    return (0, verify_output_1.containsAnyToken)(branchName, ['hotfix', 'urgent', 'prod-down', 'prod_down', 'prod down', 'incident', 'expedite']);
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
async function executePolicyOnlyMode(options, diffFiles, ignoreFilter, projectRoot, config, client, source, ciModeEnabled, scopeTelemetry, projectId, orgGovernanceSettings, aiLogSigningKey, aiLogSigningKeyId, aiLogSigningKeys, aiLogSigner, expediteModeEnabled, compiledPolicyArtifact, compiledPolicyMetadata, changeContractSummary, onCanonicalEmit) {
    const emitPolicyOnlyJson = (payload, onEmit) => {
        (0, verify_output_1.emitCanonicalVerifyJson)({
            ...payload,
            ciMode: payload.ciMode ?? ciModeEnabled,
            expediteMode: expediteModeEnabled,
        }, (canonical) => {
            onEmit?.(canonical);
            onCanonicalEmit?.(canonical);
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
    const activeEngineeringContext = (0, active_engineering_context_1.loadActiveEngineeringContext)(projectRoot);
    const governanceAnalysis = (0, governance_1.evaluateGovernance)({
        projectRoot,
        task: 'Policy-only verification',
        expectedFiles: expectedPolicyOnlyFiles,
        diffFiles: diffFilesForPolicy,
        contextCandidates: activeEngineeringContext
            ? activeEngineeringContext.contextPack.selectedFiles.map((item) => item.path)
            : expectedPolicyOnlyFiles,
        orgGovernance: orgGovernanceSettings,
        requireSignedAiLogs: signedLogsRequired,
        signingKey: aiLogSigningKey,
        signingKeyId: aiLogSigningKeyId,
        signingKeys: aiLogSigningKeys,
        signer: aiLogSigner,
        activeEngineeringContext,
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
        const driftViolations = driftFindingsToVerificationViolations(governanceAnalysis.driftIntelligence)
            .filter((item) => !ignoreFilter(item.file));
        const governanceBlockViolations = [
            {
                file: '.neurcode/ai-change-log.json',
                rule: 'governance_decision_block',
                severity: 'block',
                message,
            },
            ...driftViolations,
        ];
        if (options.json) {
            emitPolicyOnlyJson({
                grade: 'F',
                score: 0,
                verdict: 'FAIL',
                violations: governanceBlockViolations,
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
            violations: governanceBlockViolations,
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
    if (governanceAnalysis.driftIntelligence) {
        const driftViolations = driftFindingsToVerificationViolations(governanceAnalysis.driftIntelligence);
        policyViolations.push(...driftViolations.filter((item) => !ignoreFilter(item.file)));
    }
    const policyOnlyStructural = (0, structural_on_diff_1.runStructuralOnDiffFiles)(projectRoot, diffFilesForPolicy);
    // Structural violations are passed to the canonical pipeline via payload.structuralViolations
    // (see line ~2584). Do NOT merge them into policyViolations — that would create structural:*
    // duplicates that contaminate the canonical finding graph.
    policyDecision = (0, policy_decision_1.resolvePolicyDecisionFromViolations)(policyViolations);
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
    // Phase 4: Compute replay checksum from structural findings so replayChecksum
    // is populated in --policy-only and --local-only CI/daemonless modes.
    // This closes the N/A gap identified in the Apache Airflow benchmark.
    const policyOnlyStructuralFindings = policyOnlyStructural.violations.map(canonical_pipeline_1.findingFromStructural);
    const policyOnlyReplayChecksum = (0, canonical_invariants_1.computeCanonicalFindingChecksum)(policyOnlyStructuralFindings);
    const policyOnlyPayload = {
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
        structuralViolations: policyOnlyStructural.violations,
        structuralRulesApplied: policyOnlyStructural.rulesApplied,
        structuralSuppressedCount: policyOnlyStructural.suppressedCount,
        mode: 'policy_only',
        policyOnly: true,
        policyOnlySource: source,
        replayChecksum: policyOnlyReplayChecksum,
        replayMode: 'local-structural',
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
    };
    const policyOnlyReplayCustody = (0, replay_custody_1.captureVerifyReplayCustody)({
        projectRoot,
        diffContext: `${options.base || 'HEAD'} vs working tree`,
        filesAnalyzed: diffFiles.length,
        planId: null,
        verificationSource: policyOnlyVerificationSource,
        policyLockFingerprint: (0, policy_packs_1.readPolicyLockFile)(projectRoot).lock?.effective.fingerprint || null,
        compiledPolicyFingerprint: compiledPolicyArtifact?.fingerprint || null,
        ruleIds: policyOnlyStructural.rulesApplied,
        blockingCount: policyViolations.filter((v) => v.severity === 'block').length
            + policyOnlyStructural.violations.filter((v) => v.severity === 'BLOCKING').length,
        advisoryCount: policyViolations.filter((v) => v.severity !== 'block').length
            + policyOnlyStructural.violations.filter((v) => v.severity !== 'BLOCKING').length,
        suppressedCount: policyOnlyStructural.suppressedCount,
        structuralBlockingCount: policyOnlyStructural.violations.filter((v) => v.severity === 'BLOCKING').length,
        structuralAdvisoryCount: policyOnlyStructural.violations.filter((v) => v.severity !== 'BLOCKING').length,
        deterministicSignals: policyOnlyStructural.violations.filter((v) => v.determinism === 'deterministic-structural').length,
        heuristicSignals: policyOnlyStructural.violations.filter((v) => v.determinism === 'heuristic-advisory').length,
        overallTrustScore: policyOnlyStructural.violations.length > 0
            ? Math.round((policyOnlyStructural.violations.filter((v) => v.determinism === 'deterministic-structural').length / policyOnlyStructural.violations.length) * 100)
            : 100,
        verdict: effectiveVerdict,
        governanceDecision: governanceAnalysis.governanceDecision.summary || 'policy-only',
        actor: ciModeEnabled ? 'ci-runner' : 'local-user',
        source: ciModeEnabled ? 'ci' : 'cli',
        replayChecksum: policyOnlyReplayChecksum,
    });
    if (options.json) {
        emitPolicyOnlyJson(policyOnlyPayload, (canonical) => {
            (0, replay_custody_1.applyReplayCustodyToCanonicalOutput)(canonical, policyOnlyReplayCustody);
        });
    }
    else {
        const policyOnlyCanonical = (0, verify_output_1.toCanonicalVerifyOutput)((0, canonical_pipeline_1.attachCanonicalGovernance)({
            ...policyOnlyPayload,
            ciMode: ciModeEnabled,
            expediteMode: expediteModeEnabled,
        }));
        (0, replay_custody_1.applyReplayCustodyToCanonicalOutput)(policyOnlyCanonical, policyOnlyReplayCustody);
        onCanonicalEmit?.(policyOnlyCanonical);
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
        (0, verify_render_1.displayGovernanceInsights)(chalk, governanceAnalysis, { explain: options.explain });
        console.log(chalk.dim(`\n${message}`));
        logCiPolicyOnlyOutcomeExplainability({
            ciModeEnabled,
            json: Boolean(options.json),
            verdict: effectiveVerdict,
            source,
            structuralViolations: policyOnlyStructural.violations,
            policyViolations,
            replayChecksum: policyOnlyReplayChecksum,
            replayMode: 'local-structural',
        });
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
    let exitWithEvidenceFromTry = null;
    try {
        const rootResolution = (0, project_root_1.resolveNeurcodeProjectRootWithTrace)(process.cwd());
        const projectRoot = rootResolution.projectRoot;
        const localPlanSync = (0, plan_sync_1.ensureLocalPlan)(projectRoot);
        const localPlanExpectedFiles = [...localPlanSync.expectedFiles];
        const expediteModeEnabled = resolveVerifyExpediteMode(projectRoot);
        const scopeTelemetry = (0, scope_telemetry_1.buildScopeTelemetryPayload)(rootResolution);
        const ciModeEnabled = options.ci === true || isEnabledFlag(process.env.NEURCODE_VERIFY_CI);
        const evidenceEnabled = options.evidence === true || isEnabledFlag(process.env.NEURCODE_VERIFY_EVIDENCE);
        const verifyStartedAtMs = Date.now();
        const evidenceCiContext = collectCIContext();
        /** Set when provenance is written (human path); JSON early-exit may leave null. */
        let lastProvenanceRunId = null;
        let lastCanonicalOutput = null;
        let lastEvidenceFallbackOutput = null;
        let evidenceFinalizeAttempted = false;
        const custodySource = ciModeEnabled ? 'ci' : 'cli';
        const custodyActor = ciModeEnabled ? 'ci-runner' : 'local-user';
        // ── Phase 1 Runtime Stability: create context early so all subsystems share it ──
        // Structural governance is NEVER gated by this context — it always runs.
        const runtimeCtx = (0, verify_runtime_stability_1.createVerifyRuntimeContext)(ciModeEnabled);
        // Large repo detection: sets largeRepoMode and emits cache-build recommendation.
        (0, verify_runtime_stability_1.applyLargeRepoProtection)(runtimeCtx, projectRoot);
        // Initial memory pressure check at entry.
        (0, verify_runtime_stability_1.applyMemoryPressureDegradation)(runtimeCtx);
        if (ciModeEnabled) {
            options.policyOnly = true;
            options.requirePlan = false;
            options.record = false;
            options.asyncMode = false;
        }
        const captureEvidencePayload = (payload) => {
            const enrichedPayload = (0, canonical_pipeline_1.attachCanonicalGovernance)(payload);
            lastEvidenceFallbackOutput = enrichedPayload;
            lastCanonicalOutput = (0, verify_output_1.toCanonicalVerifyOutput)(enrichedPayload);
        };
        const applyCapturedReplayCustody = (canonical, custody) => {
            if (!canonical || !custody) {
                return;
            }
            (0, replay_custody_1.applyReplayCustodyToCanonicalOutput)(canonical, custody);
            lastProvenanceRunId = custody.provenanceRecord?.runId ?? lastProvenanceRunId;
        };
        const finalizeEvidence = (exitCode) => {
            if (!evidenceEnabled || evidenceFinalizeAttempted) {
                return;
            }
            evidenceFinalizeAttempted = true;
            try {
                const artifactPath = (0, verification_evidence_1.writeVerificationEvidence)({
                    enabled: evidenceEnabled,
                    projectRoot,
                    startedAtMs: verifyStartedAtMs,
                    exitCode,
                    ciMode: ciModeEnabled,
                    deterministicMode: ciModeEnabled || options.policyOnly === true,
                    evidenceDir: options.evidenceDir,
                    canonicalOutput: lastCanonicalOutput,
                    fallbackOutput: lastEvidenceFallbackOutput,
                    ciContext: evidenceCiContext,
                    runtimeMetadata: {
                        cliJsonContractVersion: contracts_1.CLI_JSON_CONTRACT_VERSION,
                        runtimeCompatibilityContractVersion: contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_VERSION,
                        componentVersion: CLI_COMPONENT_VERSION,
                        nodeVersion: process.version,
                        platform: process.platform,
                        arch: process.arch,
                        command: 'verify',
                    },
                });
                if (artifactPath && !options.json) {
                    console.log(chalk.dim(`\n   Verification evidence: ${artifactPath}`));
                }
            }
            catch (error) {
                if (!options.json) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.log(chalk.yellow(`\n⚠️  Failed to write verification evidence artifact: ${message}`));
                }
            }
            // Mirror the canonical envelope into `.neurcode/last-verify-output.json`
            // so downstream commands (`remediate-export`, `replay --html`) can pick
            // up the latest run without the user threading paths through stdout
            // redirection. Closes deep-OSS validation §5.8.
            try {
                if (lastCanonicalOutput) {
                    const verifyOutputPath = require('path').resolve(projectRoot, '.neurcode/last-verify-output.json');
                    require('fs').mkdirSync(require('path').dirname(verifyOutputPath), { recursive: true });
                    require('fs').writeFileSync(verifyOutputPath, `${JSON.stringify(lastCanonicalOutput, null, 2)}\n`, 'utf-8');
                }
            }
            catch {
                // Persisting the canonical output is best-effort; never block exit.
            }
        };
        const exitWithEvidence = (exitCode) => {
            finalizeEvidence(exitCode);
            try {
                (0, telemetry_1.appendVerifyCompletedFromCanonical)(projectRoot, lastCanonicalOutput, lastProvenanceRunId);
            }
            catch {
                // calibration must never affect exit
            }
            process.exit(exitCode);
        };
        exitWithEvidenceFromTry = exitWithEvidence;
        // Hoisted so emitVerifyJson (called on every early-exit path) can reference
        // these via closure without hitting the temporal dead zone.
        let intentEngineIssues = [];
        let intentEngineDomains = [];
        let intentEngineSummary = null;
        let intentEngineFlowIssues = [];
        let intentEngineRegressions = [];
        // Structural rule engine results — AST-level deterministic violations
        let structuralViolations = [];
        let structuralRulesApplied = [];
        let structuralSuppressedCount = 0;
        const emitVerifyJson = (payload, onEmit) => {
            // Check memory pressure immediately before emission (may have changed during long verify)
            (0, verify_runtime_stability_1.applyMemoryPressureDegradation)(runtimeCtx);
            const runtimeStabilityReport = (0, verify_runtime_stability_1.buildVerifyRuntimeReport)(runtimeCtx);
            const enrichedPayload = {
                ...payload,
                ciMode: payload.ciMode ?? ciModeEnabled,
                expediteMode: expediteModeEnabled,
                // Intent engine results injected so every code-path gets them.
                intentIssues: payload.intentIssues ?? intentEngineIssues,
                intentDomains: payload.intentDomains ?? intentEngineDomains,
                intentSummary: payload.intentSummary ?? intentEngineSummary,
                // V5: flow issues injected alongside intent issues
                flowIssues: payload.flowIssues ?? intentEngineFlowIssues,
                // V6: regressions always injected
                regressions: payload.regressions ?? intentEngineRegressions,
                structuralViolations: payload.structuralViolations ?? structuralViolations,
                structuralRulesApplied: payload.structuralRulesApplied ?? structuralRulesApplied,
                structuralSuppressedCount: payload.structuralSuppressedCount ?? structuralSuppressedCount,
                // Runtime stability transparency — always present
                runtimeStabilityReport,
            };
            lastEvidenceFallbackOutput = enrichedPayload;
            (0, verify_output_1.emitCanonicalVerifyJson)(enrichedPayload, (canonical) => {
                lastCanonicalOutput = canonical;
                onEmit?.(lastCanonicalOutput);
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
            exitWithEvidence(1);
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
                exitWithEvidence(2);
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
                exitWithEvidence(2);
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
        if (ciModeEnabled) {
            // CI mode enforces deterministic local verification and must not depend on
            // runtime compatibility handshakes or org-level remote settings.
            config.apiKey = undefined;
            if (!options.json) {
                console.log(chalk.dim('   CI mode: deterministic local verification enabled (policy-only, non-interactive).'));
            }
        }
        // NEURCODE_VERIFY_LOCAL_ONLY=1 or --local-only: skip API entirely, run structural-only
        const localOnlyMode = isEnabledFlag(process.env.NEURCODE_VERIFY_LOCAL_ONLY)
            || options.localOnly === true;
        const enforceCompatibilityHandshake = !localOnlyMode
            && (isEnabledFlag(process.env.NEURCODE_VERIFY_ENFORCE_COMPAT_HANDSHAKE)
                || strictArtifactMode
                || (process.env.CI === 'true' && Boolean(config.apiKey)));
        if (!localOnlyMode && config.apiKey && config.apiUrl) {
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
                        offlineFallbackHint: 'Run with NEURCODE_VERIFY_LOCAL_ONLY=1 or --local-only for offline structural verification.',
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
                    console.log(chalk.dim('   Tip: Use --local-only to run offline deterministic structural verification without the API.\n'));
                }
                exitWithEvidence(2);
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
                    // Runtime stability: skip brain context refresh if semantic layer is degraded
                    // (memory pressure or time pressure). Structural verification is unaffected.
                    if ((0, verify_runtime_stability_1.shouldSkipSemanticLayer)(runtimeCtx)) {
                        contextNote = `${contextNote};semantic_skipped=runtime_pressure`;
                        if (!ciModeEnabled && runtimeCtx.degradationReasons.length > 0) {
                            console.log(chalk.yellow(`\n⚠️  Brain context refresh skipped: ${runtimeCtx.degradationReasons[runtimeCtx.degradationReasons.length - 1]}`));
                            console.log(chalk.dim('   Deterministic structural governance continues unaffected.\n'));
                        }
                    }
                    else {
                        const refreshed = (0, brain_context_1.refreshBrainContextForFiles)(projectRoot, brainScope, changedFiles);
                        contextNote = `${contextNote};indexed=${refreshed.indexed};removed=${refreshed.removed};skipped=${refreshed.skipped}`;
                    }
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
            exitWithEvidence(2);
        }
        // Determine which diff to capture.
        let diffText;
        let diffContextLabel = '';
        // Operational lifecycle guardrail: when the diff context requires a
        // HEAD reference but the repo has no initial commit yet, surface
        // structured guidance instead of leaking raw git stderr. (See
        // docs/ux/lifecycle-state-audit.md §"no-head-commit".)
        if (options.head || options.staged || !options.base) {
            const lifecycleState = (0, runtime_state_1.detectRuntimeState)(projectRoot);
            if (lifecycleState.isGitRepo && !lifecycleState.hasHeadCommit) {
                const exitCode = (0, runtime_state_1.renderRuntimeStateGuidance)('no-head-commit', lifecycleState, { commandLabel: 'neurcode verify' });
                process.exit(exitCode);
            }
        }
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
                // Surface runtime capabilities even on the empty-diff path so
                // CI gates that assert `runtimeCapabilities.intentRuntime` etc.
                // never receive a payload that omits the envelope. The intent
                // runtime is reported as `inactive` here regardless of whether
                // an intent-pack exists — there are no findings to govern.
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
                    runtimeCapabilities: {
                        schemaVersion: 'neurcode.runtime-capabilities.v1',
                        executionPath: localOnlyMode ? 'local-only' : 'unresolved',
                        intentRuntime: 'inactive',
                        intentContractSource: 'none',
                        intentRuntimeRequired: options.requireIntentRuntime === true || isEnabledFlag(process.env.NEURCODE_REQUIRE_INTENT_RUNTIME),
                        intentRuntimeRequirementSatisfied: true,
                        driftIntelligence: 'inactive',
                        scopeGuard: 'unenforced',
                        forbiddenBoundaryEnforcement: 'unenforced',
                        generatedCodeGovernance: 'pattern-deterministic',
                        structuralRules: 'inactive',
                        replayDeterminism: 'enforced',
                        apiContractStatus: localOnlyMode ? 'offline' : 'unresolved',
                        observedScopeCategories: [],
                        observedBoundaryTypes: [],
                        noChangesDetected: true,
                    },
                });
            }
            recordVerifyEvent('NO_CHANGES', 'diff=empty');
            exitWithEvidence(0);
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
        // This prevents self-interference where the tool flags its own files as bloat.
        // Two layers:
        //   1. `isExcludedFile` — built-in policy/governance artifact patterns
        //   2. `.neurcodeignore` — per-repo user patterns (closes dogfooding gap
        //      where OSS-clone working trees and scratch dirs were showing up as
        //      out-of-scope noise in self-governance runs)
        const ignoreFilterAllPaths = (0, ignore_1.loadIgnore)(projectRoot);
        const diffFiles = allDiffFiles.filter(file => {
            // Check both path and oldPath (for renames) against exclusion list
            const excludePath = isExcludedFile(file.path) || ignoreFilterAllPaths(file.path);
            const excludeOldPath = file.oldPath ? (isExcludedFile(file.oldPath) || ignoreFilterAllPaths(file.oldPath)) : false;
            return !excludePath && !excludeOldPath;
        });
        // ── Local-only mode (Part 8): run structural analysis and exit, no API calls ──
        // Triggered by NEURCODE_VERIFY_LOCAL_ONLY=1 or --local-only.
        // Deterministic structural governance MUST work offline, with zero API dependency.
        if (localOnlyMode) {
            if (!options.json) {
                console.log(chalk.cyan('\n🔍 Local-only mode: deterministic intent-runtime verification (no API required)...'));
            }
            const localStructural = (0, structural_on_diff_1.runStructuralOnDiffFiles)(projectRoot, diffFiles);
            const localStructuralFindings = localStructural.violations.map(canonical_pipeline_1.findingFromStructural);
            const blockingViolations = localStructural.violations.filter((v) => v.severity === 'BLOCKING');
            const advisoryViolations = localStructural.violations.filter((v) => v.severity !== 'BLOCKING');
            // ─── Intent-runtime activation (deterministic, offline) ──────────────────
            // When an intent-pack is present in `.neurcode/intent-pack.json` the local
            // verify path now activates the full governance runtime: scope checks,
            // forbidden-boundary enforcement, drift narratives and posture synthesis.
            // Companion artefacts (context-pack, repository-graph, session-runtime)
            // are deterministically synthesised when they are absent so the runtime
            // does NOT silently collapse into structural-only mode.
            let localActiveContext = null;
            let localGovernanceResult = null;
            const localScopeIssues = [];
            let localImportEdgeResult = null;
            try {
                localActiveContext = (0, active_engineering_context_1.loadOrSynthesizeEngineeringContext)(projectRoot);
            }
            catch (err) {
                if (!options.json && (process.env.DEBUG || process.env.VERBOSE)) {
                    console.log(chalk.dim(`   [intent-runtime] context load skipped: ${err.message}`));
                }
            }
            if (localActiveContext) {
                try {
                    localGovernanceResult = (0, governance_1.evaluateGovernance)({
                        projectRoot,
                        task: localActiveContext.intentPack.intent.normalized,
                        expectedFiles: localActiveContext.intentPack.approvedScope.files,
                        expectedDependencies: localActiveContext.intentPack.expectedDependencies,
                        diffFiles,
                        contextCandidates: localActiveContext.contextPack.selectedFiles.map((f) => f.path),
                        activeEngineeringContext: localActiveContext,
                    });
                    // Deterministic scope-guard intersection against intent-pack approvedScope
                    // PLUS explicit forbiddenBoundaries. Drift intelligence already flags
                    // narrative-level drift; this surfaces direct path violations as
                    // first-class scope issues regardless of drift heuristics.
                    const intent = localActiveContext.intentPack;
                    const approvedFileSet = new Set(intent.approvedScope.files.map(core_1.normalizeRepoPath));
                    const approvedModulePaths = intent.approvedScope.modules.map(core_1.normalizeRepoPath);
                    const approvedServicePaths = intent.approvedScope.services.map(core_1.normalizeRepoPath);
                    const matchesPrefix = (file, prefixes) => prefixes.some((p) => p && (file === p || file.startsWith(`${p}/`)));
                    const changedNormalized = diffFiles
                        .map((f) => (0, core_1.normalizeRepoPath)(f.path))
                        .filter((p) => Boolean(p));
                    const isAllowedBoundaryType = (value) => value === 'sensitive' || value === 'infra' || value === 'ci' ||
                        value === 'dependency-manifest' || value === 'service' || value === 'module' ||
                        value === 'generated-code' || value === 'unspecified';
                    // First pass: explicit forbidden boundaries always surface (even if
                    // they also happen to be inside an approved module).
                    for (const boundary of intent.forbiddenBoundaries) {
                        const boundaryPath = (0, core_1.normalizeRepoPath)(boundary.path);
                        if (!boundaryPath)
                            continue;
                        for (const file of changedNormalized) {
                            if (file === boundaryPath || file.startsWith(`${boundaryPath}/`)) {
                                if (boundary.policy === 'allowed')
                                    continue;
                                const alreadyFlagged = localScopeIssues.some((s) => s.file === file && s.boundaryType === boundary.type);
                                if (alreadyFlagged)
                                    continue;
                                const boundaryType = isAllowedBoundaryType(boundary.type) ? boundary.type : 'unspecified';
                                localScopeIssues.push({
                                    file,
                                    message: `Forbidden boundary touched (${boundary.type}, policy=${boundary.policy}): ${boundary.reason}`,
                                    policy: boundary.policy === 'forbidden' ? 'forbidden' : 'review-required',
                                    boundaryType,
                                });
                            }
                        }
                    }
                    // Second pass: out-of-scope files (not in approved file/module/service set).
                    // Only run if any approvedScope dimension is non-empty — empty scope means
                    // intent-pack is in observation mode and we should not synthesise FPs.
                    // When a file falls outside scope, we additionally classify it against
                    // well-known path patterns (generated-code, infra, CI, dependency-manifest)
                    // so reviewers see WHY the boundary matters, not just THAT it was breached.
                    const hasApprovedScope = approvedFileSet.size > 0 || approvedModulePaths.length > 0 || approvedServicePaths.length > 0;
                    if (hasApprovedScope) {
                        for (const file of changedNormalized) {
                            if (approvedFileSet.has(file))
                                continue;
                            if (matchesPrefix(file, approvedModulePaths))
                                continue;
                            if (matchesPrefix(file, approvedServicePaths))
                                continue;
                            if (localScopeIssues.some((s) => s.file === file))
                                continue;
                            const classification = (0, path_boundary_classifier_1.classifyPathBoundary)(file);
                            if (classification) {
                                // generated-code is a stronger signal than plain out-of-scope:
                                // generated files should not be hand-edited regardless of
                                // approval status.
                                if (classification.category === 'generated-code') {
                                    localScopeIssues.push({
                                        file,
                                        message: `Generated-code edit outside approved scope (${classification.reason}). Regenerate from source or update the intent-pack to declare this surface.`,
                                        policy: 'generated-code',
                                        boundaryType: 'generated-code',
                                    });
                                    continue;
                                }
                                const boundaryType = isAllowedBoundaryType(classification.category) ? classification.category : 'unspecified';
                                localScopeIssues.push({
                                    file,
                                    message: `File modified outside the declared intent scope (${classification.category}: ${classification.reason}).`,
                                    policy: 'out-of-scope',
                                    boundaryType,
                                });
                                continue;
                            }
                            localScopeIssues.push({
                                file,
                                message: 'File modified outside the declared intent scope.',
                                policy: 'out-of-scope',
                            });
                        }
                    }
                    else {
                        // Observation mode (no approved scope): only surface generated-code
                        // edits, because those are usually wrong regardless of intent.
                        for (const file of changedNormalized) {
                            if (localScopeIssues.some((s) => s.file === file))
                                continue;
                            const classification = (0, path_boundary_classifier_1.classifyPathBoundary)(file);
                            if (classification?.category === 'generated-code') {
                                localScopeIssues.push({
                                    file,
                                    message: `Generated-code edit detected (${classification.reason}). Regenerate from source.`,
                                    policy: 'generated-code',
                                    boundaryType: 'generated-code',
                                });
                            }
                        }
                    }
                    // ─── Import-edge governance ──────────────────────────────────────
                    // Deterministic import-edge classifier: even when every touched
                    // path is in-scope, an `import` statement that crosses a
                    // forbidden boundary surfaces as a scope issue. Closes the
                    // semantic blind spot documented in
                    // docs/validation/2026-05-17-deep-oss/.
                    try {
                        localImportEdgeResult = (0, import_edge_governance_1.evaluateImportEdgeGovernance)({
                            diffFiles,
                            projectRoot,
                            intent: {
                                approvedScope: {
                                    files: intent.approvedScope.files,
                                    modules: intent.approvedScope.modules,
                                    services: intent.approvedScope.services,
                                },
                                forbiddenBoundaries: intent.forbiddenBoundaries.map((b) => ({
                                    type: b.type,
                                    path: b.path,
                                    policy: b.policy,
                                    reason: b.reason,
                                })),
                            },
                        });
                        for (const finding of localImportEdgeResult.findings) {
                            // Avoid double-flagging when the same source file already has
                            // a path-touch issue for the same boundary; import-edge is
                            // additive metadata in that case.
                            const dupe = localScopeIssues.some((s) => s.file === finding.sourceFile
                                && s.importEdge
                                && s.importEdge.importTarget === finding.importTarget
                                && s.importEdge.resolvedBoundary === finding.resolvedBoundary);
                            if (dupe)
                                continue;
                            localScopeIssues.push({
                                file: finding.sourceFile,
                                message: `Import-edge crosses ${finding.boundaryType} boundary (policy=${finding.policy}): \`${finding.importTarget}\` resolves to \`${finding.resolvedTargetPath}\` inside \`${finding.resolvedBoundary}\`. ${finding.reason}`,
                                policy: finding.policy,
                                boundaryType: finding.boundaryType,
                                importEdge: {
                                    sourceFile: finding.sourceFile,
                                    sourceLine: finding.sourceLine,
                                    importTarget: finding.importTarget,
                                    resolvedTargetPath: finding.resolvedTargetPath,
                                    resolvedBoundary: finding.resolvedBoundary,
                                    edgeKind: finding.edgeKind,
                                    language: finding.language,
                                    deterministic: true,
                                    replayStable: true,
                                },
                            });
                        }
                    }
                    catch (importErr) {
                        if (!options.json && (process.env.DEBUG || process.env.VERBOSE)) {
                            console.log(chalk.dim(`   [intent-runtime] import-edge governance skipped: ${importErr.message}`));
                        }
                    }
                }
                catch (err) {
                    if (!options.json && (process.env.DEBUG || process.env.VERBOSE)) {
                        console.log(chalk.dim(`   [intent-runtime] governance evaluation skipped: ${err.message}`));
                    }
                }
            }
            const blockingScopeCount = localScopeIssues.filter((s) => s.policy === 'forbidden' || s.policy === 'out-of-scope' || s.policy === 'generated-code').length;
            const advisoryScopeCount = localScopeIssues.filter((s) => s.policy === 'review-required').length;
            const intentRuntimeActive = Boolean(localGovernanceResult);
            const localScopeGuardPassed = blockingScopeCount === 0;
            // `--require-intent-runtime` (or NEURCODE_REQUIRE_INTENT_RUNTIME=1) makes
            // silent downgrade into a hard failure. Without this flag the runtime
            // gracefully degrades to structural-only when no intent contract exists;
            // with it, enterprise CI gates can assert intent governance was applied.
            const requireIntentRuntimeFlag = options.requireIntentRuntime === true || isEnabledFlag(process.env.NEURCODE_REQUIRE_INTENT_RUNTIME);
            const intentRuntimeRequirementFailed = requireIntentRuntimeFlag && !intentRuntimeActive;
            const localVerdict = blockingViolations.length > 0 || blockingScopeCount > 0 || intentRuntimeRequirementFailed ? 'FAIL' : 'PASS';
            const localGrade = localVerdict === 'FAIL' ? 'F' : 'B';
            const localScore = localVerdict === 'FAIL' ? 0 : 70;
            const scopeViolationRows = localScopeIssues
                .filter((s) => s.policy === 'forbidden' || s.policy === 'out-of-scope' || s.policy === 'generated-code')
                .map((s) => ({
                file: s.file,
                rule: 'scope_guard',
                severity: 'block',
                message: s.message,
            }));
            const scopeWarningRows = localScopeIssues
                .filter((s) => s.policy === 'review-required')
                .map((s) => ({
                file: s.file,
                rule: 'scope_guard',
                severity: 'warn',
                message: s.message,
            }));
            // Surface the intent-runtime requirement failure as a first-class
            // governance row so CI logs, dashboards, and PR comments all see the
            // same explanation. The row sits next to scope_guard rows so it shares
            // their treatment (block, blocking-count, exit code).
            const intentRuntimeRequirementRows = intentRuntimeRequirementFailed
                ? [{
                        file: '.neurcode/intent-pack.json',
                        rule: 'intent_runtime_required',
                        severity: 'block',
                        message: 'Intent-governed runtime required (--require-intent-runtime / NEURCODE_REQUIRE_INTENT_RUNTIME=1) but no `.neurcode/intent-pack.json` was found or it could not be synthesised. Either author an intent pack (`neurcode start`) or drop the requirement to allow structural-only verification.',
                    }]
                : [];
            const localPayload = {
                grade: localGrade,
                score: localScore,
                verdict: localVerdict,
                violations: [
                    ...localStructural.violations.map((v) => ({
                        file: v.filePath,
                        rule: v.ruleId,
                        severity: v.severity === 'BLOCKING' ? 'block' : 'warn',
                        message: `${v.ruleName}: ${v.evidence.slice(0, 120)}`,
                    })),
                    ...scopeViolationRows,
                    ...scopeWarningRows,
                    ...intentRuntimeRequirementRows,
                ],
                adherenceScore: localScore,
                bloatCount: blockingScopeCount,
                bloatFiles: scopeViolationRows.map((r) => r.file),
                plannedFilesModified: 0,
                totalPlannedFiles: 0,
                message: intentRuntimeRequirementFailed
                    ? 'Intent-runtime requirement failed: no `.neurcode/intent-pack.json` available to activate scope + forbidden-boundary enforcement.'
                    : (intentRuntimeActive
                        ? `Local intent-runtime verification: ${localStructural.violations.length} structural finding(s), ${blockingViolations.length} blocking; ${blockingScopeCount} scope violation(s), ${advisoryScopeCount} advisory boundary issue(s).`
                        : `Local-only structural verification: ${localStructural.violations.length} finding(s), ${blockingViolations.length} blocking.`),
                scopeGuardPassed: localScopeGuardPassed,
                scopeIssues: localScopeIssues.map((s) => ({
                    file: s.file,
                    message: s.message,
                    policy: s.policy,
                    boundaryType: s.boundaryType,
                    ...(s.importEdge ? { importEdge: s.importEdge } : {}),
                })),
                mode: intentRuntimeActive ? 'local_intent_runtime' : 'local_only_structural',
                policyOnly: true,
                // NOTE: this is the structural-only checksum. When the canonical
                // envelope is attached below, `governanceVerification.replayChecksum`
                // becomes the authoritative hash over the merged finding set
                // (structural + drift + scope). The top-level `replayChecksum` is
                // rewritten post-attach so enterprise CI sees a single canonical
                // hash for the activated runtime.
                replayChecksum: (0, canonical_invariants_1.computeCanonicalFindingChecksum)(localStructuralFindings),
                replayMode: intentRuntimeActive ? 'local-intent-runtime' : 'local-structural',
                structuralViolations: localStructural.violations,
                structuralBlockingCount: blockingViolations.length,
                structuralRulesApplied: localStructural.rulesApplied,
                changeContract: changeContractSummary,
                // driftIntelligence drives intentGovernance summary + drift findings
                // inside attachCanonicalGovernance.
                driftIntelligence: localGovernanceResult?.driftIntelligence ?? null,
                engineeringContext: localGovernanceResult?.engineeringContext ?? null,
                intentRuntime: localActiveContext
                    ? {
                        active: true,
                        synthesized: Boolean(localActiveContext.synthesized),
                        intentPackId: localActiveContext.intentPack.intentPackId,
                        contextPackId: localActiveContext.contextPack.contextPackId,
                        repositoryGraphId: localActiveContext.repositoryGraph.graphId,
                        warnings: localActiveContext.warnings,
                    }
                    : { active: false, synthesized: false, intentPackId: null, contextPackId: null, repositoryGraphId: null, warnings: [] },
                // Machine-readable capability declaration for enterprise CI. Every
                // field is "what actually executed", not "what we wished happened".
                // CI gates that need a specific guarantee (e.g. intent-runtime active,
                // generated-code governance active) can assert against this envelope
                // rather than inferring from absence of fields. See
                // docs/validation/2026-05-16-activated/activation-report-2026-05-16.md
                // §6 for the rationale.
                runtimeCapabilities: {
                    schemaVersion: 'neurcode.runtime-capabilities.v1',
                    executionPath: 'local-only',
                    intentRuntime: intentRuntimeActive
                        ? (localActiveContext?.synthesized ? 'active-synthesized' : 'active-authored')
                        : 'inactive',
                    intentContractSource: localActiveContext
                        ? (localActiveContext.synthesized ? 'intent-pack-only' : 'full-bundle')
                        : 'none',
                    // Reflect whether the caller required intent runtime to be active.
                    // Mirrors how `requireRuntimeGuard` is surfaced; lets dashboards
                    // distinguish "intent runtime inactive by choice" from
                    // "intent runtime inactive against caller policy".
                    intentRuntimeRequired: requireIntentRuntimeFlag,
                    intentRuntimeRequirementSatisfied: !intentRuntimeRequirementFailed,
                    driftIntelligence: localGovernanceResult?.driftIntelligence ? 'active' : 'inactive',
                    scopeGuard: intentRuntimeActive ? 'enforced' : 'unenforced',
                    forbiddenBoundaryEnforcement: intentRuntimeActive ? 'enforced' : 'unenforced',
                    generatedCodeGovernance: 'pattern-deterministic',
                    // Import-edge governance is enforced whenever the intent runtime
                    // is active. Pattern-deterministic (regex over diff additions +
                    // path classifier), no AST, no probability.
                    importEdgeGovernance: intentRuntimeActive ? 'pattern-deterministic' : 'inactive',
                    structuralRules: 'active',
                    replayDeterminism: 'enforced',
                    apiContractStatus: 'offline',
                    // Counts of categories observed in THIS run (not capacity).
                    observedScopeCategories: Array.from(new Set(localScopeIssues.map((s) => s.policy))).sort(),
                    observedBoundaryTypes: Array.from(new Set(localScopeIssues
                        .map((s) => s.boundaryType)
                        .filter((b) => Boolean(b)))).sort(),
                    // Import-edge observability — counts only, plus a sorted list of
                    // observed boundary types from the edge pass. Helpful for CI gates
                    // that want to assert "this run had ≥0 edges analysed".
                    importEdgesAnalyzed: localImportEdgeResult?.edgeCount ?? 0,
                    importEdgeBlockingFindings: localImportEdgeResult?.blockingFindingCount ?? 0,
                    importEdgeAdvisoryFindings: localImportEdgeResult?.advisoryFindingCount ?? 0,
                    observedImportEdgeBoundaryTypes: localImportEdgeResult?.observedBoundaryTypes ?? [],
                },
            };
            // Run the canonical pipeline once so we can extract the merged-finding
            // replayChecksum (structural + drift + scope) and back-write it to the
            // top-level payload + custody envelope. This keeps a single authoritative
            // hash visible at every replay surface when the intent runtime is active.
            const enrichedLocalPayload = (0, canonical_pipeline_1.attachCanonicalGovernance)(localPayload);
            const envelopeReplayChecksum = (() => {
                const env = enrichedLocalPayload.governanceVerification;
                return env && typeof env.replayChecksum === 'string' ? env.replayChecksum : localPayload.replayChecksum;
            })();
            enrichedLocalPayload.replayChecksum = envelopeReplayChecksum;
            localPayload.replayChecksum = envelopeReplayChecksum;
            captureEvidencePayload(enrichedLocalPayload);
            const localReplayCustody = (0, replay_custody_1.captureVerifyReplayCustody)({
                projectRoot,
                diffContext: `${options.base || 'HEAD'} vs working tree`,
                filesAnalyzed: diffFiles.length,
                planId: null,
                verificationSource: intentRuntimeActive ? 'local_intent_runtime' : 'local_only_structural',
                policyLockFingerprint: null,
                compiledPolicyFingerprint: null,
                ruleIds: localStructural.rulesApplied,
                blockingCount: blockingViolations.length + blockingScopeCount,
                advisoryCount: advisoryViolations.length + advisoryScopeCount,
                suppressedCount: localStructural.suppressedCount,
                structuralBlockingCount: blockingViolations.length,
                structuralAdvisoryCount: advisoryViolations.length,
                deterministicSignals: localStructural.violations.filter((v) => v.determinism === 'deterministic-structural').length,
                heuristicSignals: localStructural.violations.filter((v) => v.determinism === 'heuristic-advisory').length,
                overallTrustScore: localStructural.violations.length > 0
                    ? Math.round((localStructural.violations.filter((v) => v.determinism === 'deterministic-structural').length / localStructural.violations.length) * 100)
                    : 100,
                verdict: localVerdict,
                governanceDecision: intentRuntimeActive
                    ? `local intent-runtime verification${localActiveContext?.synthesized ? ' (synthesised context)' : ''}`
                    : 'local deterministic structural verification',
                actor: custodyActor,
                source: custodySource,
                replayChecksum: envelopeReplayChecksum,
            });
            applyCapturedReplayCustody(lastCanonicalOutput, localReplayCustody);
            if (options.json) {
                (0, verify_output_1.emitCanonicalVerifyJson)(localPayload, (canonical) => {
                    applyCapturedReplayCustody(canonical, localReplayCustody);
                    lastCanonicalOutput = canonical;
                });
            }
            else {
                if (localStructural.violations.length === 0 && localScopeIssues.length === 0) {
                    console.log(chalk.green(intentRuntimeActive
                        ? '\n✅ No structural or scope violations found (intent-runtime active, local-only).'
                        : '\n✅ No structural violations found (local-only mode).'));
                }
                else {
                    localStructural.violations.forEach((v) => {
                        const prefix = v.severity === 'BLOCKING' ? chalk.red('  ⛔ BLOCKING') : chalk.yellow('  ⚠  ADVISORY');
                        console.log(`${prefix}  ${v.ruleId} — ${v.filePath}:${v.line}`);
                        console.log(chalk.dim(`     ${v.ruleName}`));
                        console.log(chalk.dim(`     ${v.evidence.slice(0, 100)}`));
                    });
                    for (const issue of localScopeIssues) {
                        const prefix = issue.policy === 'forbidden' || issue.policy === 'out-of-scope'
                            ? chalk.red('  ⛔ SCOPE   ')
                            : chalk.yellow('  ⚠  SCOPE  ');
                        console.log(`${prefix} ${issue.file}`);
                        console.log(chalk.dim(`     ${issue.message}`));
                    }
                }
                const modeLabel = intentRuntimeActive
                    ? (localActiveContext?.synthesized ? 'Local intent-runtime (synthesised context)' : 'Local intent-runtime')
                    : 'Local-only structural';
                console.log(chalk.dim(`\n[${modeLabel}] ${localStructural.violations.length} structural finding(s), ` +
                    `${blockingViolations.length} blocking; ${localScopeIssues.length} scope issue(s), ${blockingScopeCount} blocking.\n`));
                // Governance posture banner: surface gate + rollout trust prominently
                // when the intent runtime is active so the most-glanced terminal line
                // reflects the canonical governance lifecycle, not just verify counts.
                if (intentRuntimeActive && localGovernanceResult?.driftIntelligence) {
                    const drift = localGovernanceResult.driftIntelligence;
                    const gate = drift.riskSynthesis?.governanceGate || drift.governancePosture?.governanceGate;
                    const rolloutTrust = drift.riskSynthesis?.rolloutTrust || drift.governancePosture?.rolloutTrust;
                    if (gate || rolloutTrust) {
                        const gateLabel = gate ? `gate=${chalk.bold(gate)}` : 'gate=advisory';
                        const trustLabel = rolloutTrust ? `rollout-trust=${chalk.bold(rolloutTrust)}` : 'rollout-trust=rollout-safe';
                        console.log(chalk.dim(`   Governance posture: ${gateLabel} · ${trustLabel}\n`));
                    }
                }
                console.log(chalk.dim(`   Replay: same commit + same flags + same intent-pack → same canonical checksum.\n` +
                    `   Replay checksum: ${envelopeReplayChecksum.slice(0, 16)}…\n` +
                    (intentRuntimeActive
                        ? '   Intent governance: ACTIVE (offline). Add full intent-runtime artefacts for richer semantic narratives.\n'
                        : '   Intent governance: INACTIVE. Add `.neurcode/intent-pack.json` to activate scope + forbidden-boundary enforcement locally.\n')));
            }
            recordVerifyEvent(localVerdict, intentRuntimeActive
                ? `local_intent_runtime;structural=${localStructural.violations.length};scope=${localScopeIssues.length}`
                : `local_only;structural=${localStructural.violations.length}`, diffFiles.map((f) => f.path));
            exitWithEvidence(localVerdict === 'FAIL' ? 2 : 0);
        }
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
            exitWithEvidence(0);
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
                return exitWithEvidence(2);
            }
            const runtimeGuardArtifact = guardRead.artifact;
            const runtimeGuardEvaluation = (0, runtime_guard_1.evaluateRuntimeGuardArtifact)(runtimeGuardArtifact, diffFiles.filter((file) => !shouldIgnore(file.path)));
            runtimeGuardSummary = {
                ...runtimeGuardSummary,
                active: runtimeGuardArtifact.active,
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
            const runtimeGuardUpdated = (0, runtime_guard_1.withRuntimeGuardCheckStats)(runtimeGuardArtifact, {
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
                exitWithEvidence(2);
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
            exitWithEvidence(2);
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
            const exitCode = await executePolicyOnlyMode(options, diffFiles, shouldIgnore, projectRoot, config, client, source, ciModeEnabled, scopeTelemetry, projectId || undefined, orgGovernanceSettings, aiLogSigningKey, aiLogSigningKeyId, aiLogSigningKeys, aiLogSigner, expediteModeEnabled, compiledPolicyRead.artifact, compiledPolicyMetadata, changeContractSummary, (canonical) => {
                lastCanonicalOutput = canonical;
            });
            const changedFiles = diffFiles.map((f) => f.path);
            const verdict = exitCode === 2 ? 'FAIL' : exitCode === 1 ? 'WARN' : 'PASS';
            recordVerifyEvent(verdict, `policy_only_source=${source};exit=${exitCode}`, changedFiles);
            exitWithEvidence(exitCode);
        };
        // ============================================
        // --policy-only: General Governance (policy only, no plan enforcement)
        // ============================================
        if (options.policyOnly) {
            await runPolicyOnlyModeAndExit(ciModeEnabled ? 'ci' : 'explicit');
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
                exitWithEvidence(1);
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
                            serviceBoundaryBreaches: 0,
                            infraBoundaryBreaches: 0,
                            dependencyBoundaryBreaches: 0,
                            sensitiveBoundaryBreaches: 0,
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
            // Runtime stability: skip advisory signals if advisory layer is degraded.
            // Structural rules always run regardless.
            const advisorySignals = (0, verify_runtime_stability_1.shouldSkipAdvisoryLayer)(runtimeCtx)
                ? []
                : (0, advisory_signals_1.evaluateAdvisorySignals)({ diffFiles, summary });
            if ((0, verify_runtime_stability_1.shouldSkipAdvisoryLayer)(runtimeCtx) && !options.json) {
                console.log(chalk.dim('   Advisory signals skipped (runtime pressure — structural governance unaffected).'));
            }
            const advisoryWarnCount = advisorySignals.filter((item) => item.severity === 'warn').length;
            // ── Advisory-first: always run structural rules, downgrade scope issues to advisory ──
            // Structural rules are deterministic and local — they MUST always run regardless of plan.
            let advisoryStructuralViolations = [];
            let advisoryStructuralBlockingCount = 0;
            try {
                if (!options.json) {
                    console.log(chalk.cyan('🔍 Running deterministic structural analysis (advisory mode — no plan)...'));
                }
                const structuralResult = (0, structural_on_diff_1.runStructuralOnDiffFiles)(projectRoot, diffFiles);
                advisoryStructuralViolations = structuralResult.violations;
                // In advisory mode (no plan), BLOCKING structural violations are downgraded to advisory warnings.
                // They are still surfaced — engineers must review them — but they do not block the verify exit.
                advisoryStructuralBlockingCount = structuralResult.violations.filter((v) => v.severity === 'BLOCKING').length;
                if (!options.json && advisoryStructuralViolations.length > 0) {
                    console.log(chalk.yellow(`\n⚠  Structural findings (advisory — link a plan to enable enforcement):`));
                    advisoryStructuralViolations.forEach((v) => {
                        const prefix = v.severity === 'BLOCKING' ? chalk.yellow('  ⚠ BLOCKING (advisory)') : chalk.dim('  ℹ ADVISORY');
                        console.log(`${prefix}  ${v.ruleId} — ${v.filePath}:${v.line}`);
                        console.log(chalk.dim(`     ${v.ruleName}`));
                        console.log(chalk.dim(`     ${v.evidence.slice(0, 100)}`));
                    });
                    console.log(chalk.dim(`\n  To enforce these findings: run \`neurcode plan "<intent>"\` to link a plan.\n`));
                }
            }
            catch {
                // Structural engine failure must never block advisory verify
            }
            const advisoryVerdict = advisoryWarnCount > 0 || advisoryStructuralBlockingCount > 0 ? 'WARN' : 'PASS';
            const advisoryGrade = advisoryWarnCount > 0 || advisoryStructuralBlockingCount > 0 ? 'C' : 'B';
            const advisoryScore = advisoryWarnCount > 0 || advisoryStructuralBlockingCount > 0 ? 60 : 70;
            const advisoryViolations = [
                ...advisorySignals.map((item) => ({
                    file: item.files[0] || '.',
                    rule: `advisory:${item.code.toLowerCase()}`,
                    severity: item.severity === 'warn' ? 'warn' : 'allow',
                    message: `${item.title}: ${item.detail}`,
                })),
                ...advisoryStructuralViolations.map((v) => ({
                    file: v.filePath,
                    rule: `structural-advisory:${v.ruleId.toLowerCase()}`,
                    severity: 'warn',
                    message: `${v.ruleId} ${v.ruleName}: ${v.evidence.slice(0, 100)} (advisory — link plan to enforce)`,
                })),
            ];
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
                    structuralViolations: advisoryStructuralViolations,
                    structuralBlockingCount: advisoryStructuralBlockingCount,
                    structuralNote: advisoryStructuralBlockingCount > 0
                        ? `${advisoryStructuralBlockingCount} structural finding(s) surfaced in advisory mode. Link a plan to enforce.`
                        : undefined,
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
                (0, verify_guidance_1.printFirstRunAdvisoryMessage)(chalk, options.demo === true);
                (0, verify_guidance_1.printAdvisorySignals)(chalk, advisorySignals, options.demo === true);
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
            exitWithEvidence(0);
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
        try {
            // Step A: Get Modified Files (already have from diffFiles)
            const modifiedFiles = diffFiles.map(f => f.path);
            // Step B: Resolve plan scope from remote plan or local Plan Sync.
            let originalIntent = '';
            let governanceTask = 'Plan verification';
            let planFiles = [];
            let planDependencies = [];
            let remotePlanSessionId = null;
            const activeEngineeringContext = (0, active_engineering_context_1.loadActiveEngineeringContext)(projectRoot);
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
            if (activeEngineeringContext) {
                if (activeEngineeringContext.intentPack.approvedScope.files.length > 0) {
                    planFilesForVerification = [...activeEngineeringContext.intentPack.approvedScope.files];
                }
                if (activeEngineeringContext.intentPack.intent.normalized) {
                    intentConstraintsForVerification = activeEngineeringContext.intentPack.intent.normalized;
                    governanceTask = activeEngineeringContext.intentPack.intent.normalized;
                }
                planDependencies = [...new Set([
                        ...planDependencies,
                        ...activeEngineeringContext.intentPack.expectedDependencies,
                    ])];
                if (!options.json) {
                    console.log(chalk.dim(`   Intent runtime loaded: ${activeEngineeringContext.sessionRuntime.sessionId} ` +
                        `(${planFilesForVerification.length} approved file(s), ` +
                        `${activeEngineeringContext.contextPack.selectedFiles.length} context file(s))`));
                    activeEngineeringContext.warnings.slice(0, 3).forEach((warning) => {
                        console.log(chalk.yellow(`   Context warning: ${warning}`));
                    });
                }
            }
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
            // ── Structural Rule Engine ──────────────────────────────────────────────
            // AST-level deterministic analysis against changed files.
            // Reads file contents from disk; never throws — errors are isolated per file.
            if (diffFiles.length > 0) {
                try {
                    const structuralEngine = (0, structural_rules_1.createDefaultStructuralRuleEngine)();
                    const filesToAnalyze = [];
                    for (const df of diffFiles) {
                        const absPath = (0, path_1.join)(projectRoot, df.path);
                        if ((0, fs_1.existsSync)(absPath)) {
                            try {
                                const sourceText = (0, fs_1.readFileSync)(absPath, 'utf-8');
                                filesToAnalyze.push({ filePath: df.path, sourceText });
                            }
                            catch {
                                // Skip unreadable files
                            }
                        }
                    }
                    if (filesToAnalyze.length > 0) {
                        const structuralResult = structuralEngine.analyze(filesToAnalyze);
                        structuralViolations = structuralResult.violations;
                        structuralRulesApplied = structuralResult.rulesApplied;
                        structuralSuppressedCount = structuralResult.suppressedCount;
                    }
                }
                catch {
                    // Non-fatal: structural engine errors must never break verification
                }
            }
            governanceResult = (0, governance_1.evaluateGovernance)({
                projectRoot,
                task: governanceTask,
                expectedFiles: planFilesForVerification,
                expectedDependencies: planDependencies,
                diffFiles,
                contextCandidates: activeEngineeringContext
                    ? activeEngineeringContext.contextPack.selectedFiles.map((item) => item.path)
                    : planFilesForVerification,
                orgGovernance: orgGovernanceSettings,
                requireSignedAiLogs: signedLogsRequired,
                signingKey: aiLogSigningKey,
                signingKeyId: aiLogSigningKeyId,
                signingKeys: aiLogSigningKeys,
                signer: aiLogSigner,
                activeEngineeringContext,
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
            const approvedSet = new Set([
                ...planFilesForVerification,
                ...allowedFiles,
                ...(governanceResult.engineeringContext?.approvedScope?.files || []),
            ]);
            const violations = modifiedFiles.filter(f => !approvedSet.has(f));
            const filteredViolations = violations.filter((p) => !shouldIgnore(p));
            // Step D: The Block (only report scope violations for non-ignored files)
            if (filteredViolations.length > 0) {
                const criticalScopeViolations = expediteModeEnabled
                    ? filteredViolations.filter((file) => (0, verify_output_1.isCriticalScopeBreach)(file, 'File modified outside the plan'))
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
                    exitWithEvidence(1);
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
                        (0, verify_render_1.displayGovernanceInsights)(chalk, governanceResult, { explain: options.explain });
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
                    exitWithEvidence(1);
                }
                else {
                    scopeGuardExpediteBypass = true;
                    if (!options.json) {
                        console.log(chalk.yellow('\n⚠️  Expedite scope relaxation applied (non-critical scope only).'));
                        expediteScopeViolations.forEach((file) => {
                            console.log(chalk.yellow(`   • ${file}`));
                        });
                        console.log(chalk.dim('   Follow-up checklist:'));
                        verify_output_1.EXPEDITE_FOLLOW_UP_CHECKLIST.forEach((item) => {
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
                exitWithEvidence(2);
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
            exitWithEvidence(0);
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
        if (governanceResult?.driftIntelligence) {
            const driftViolations = driftFindingsToVerificationViolations(governanceResult.driftIntelligence);
            policyViolations.push(...driftViolations.filter((item) => !shouldIgnore(item.file)));
        }
        // Structural violations are passed to the canonical pipeline via payload.structuralViolations
        // (see line ~5281). Do NOT merge them into policyViolations — that would create structural:*
        // duplicates that contaminate the canonical finding graph.
        policyDecision = (0, policy_decision_1.resolvePolicyDecisionFromViolations)(policyViolations);
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
                policyDecision = (0, policy_decision_1.resolvePolicyDecisionFromViolations)(policyViolations);
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
                    (0, verify_render_1.displayChangeContractDrift)(chalk, changeContractSummary, { advisory: false });
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
                exitWithEvidence(2);
            }
            else if (!changeContractEvaluation.valid && !options.json) {
                (0, verify_render_1.displayChangeContractDrift)(chalk, changeContractSummary, { advisory: true });
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
            const governancePayload = governanceResult
                ? buildGovernancePayload(governanceResult, orgGovernanceSettings, {
                    changeContract: changeContractSummary,
                    compiledPolicy: compiledPolicyMetadata,
                    aiDebt: aiDebtSummary,
                })
                : undefined;
            const verifyEvidencePayload = {
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
                structuralViolations,
                structuralRulesApplied,
                structuralSuppressedCount,
                mode: 'plan_enforced',
                policyOnly: false,
                aiDebt: aiDebtSummary,
                changeContract: changeContractSummary,
                ...(compiledPolicyMetadata ? { policyCompilation: compiledPolicyMetadata } : {}),
                ...(governancePayload || {}),
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
            captureEvidencePayload(verifyEvidencePayload);
            const canonicalReplayChecksum = (() => {
                const direct = lastCanonicalOutput?.['replayChecksum'];
                if (typeof direct === 'string') {
                    return direct;
                }
                const envelope = lastCanonicalOutput?.['governanceVerification'] ?? undefined;
                return typeof envelope?.replayChecksum === 'string' ? envelope.replayChecksum : null;
            })();
            const structuralBlocking = structuralViolations.filter(v => v.severity === 'BLOCKING').length;
            const structuralAdvisory = structuralViolations.filter(v => v.severity === 'ADVISORY').length;
            const deterministicSigs = structuralViolations.filter(v => v.determinism === 'deterministic-structural').length;
            const heuristicSigs = structuralViolations.filter(v => v.determinism === 'heuristic-advisory').length;
            const trustScore = structuralViolations.length > 0
                ? Math.round((deterministicSigs / structuralViolations.length) * 100)
                : 100;
            const mainReplayCustody = (0, replay_custody_1.captureVerifyReplayCustody)({
                projectRoot,
                diffContext: `${options.base || 'HEAD'} vs working tree`,
                filesAnalyzed: diffFiles.length,
                planId: finalPlanId || null,
                verificationSource: verifySource,
                policyLockFingerprint: (0, policy_packs_1.readPolicyLockFile)(projectRoot).lock?.effective.fingerprint || null,
                compiledPolicyFingerprint: effectiveCompiledPolicy?.fingerprint || null,
                ruleIds: structuralRulesApplied,
                blockingCount: policyViolations.filter((v) => v.severity === 'block').length + structuralBlocking,
                advisoryCount: policyViolations.filter((v) => v.severity !== 'block').length + structuralAdvisory,
                suppressedCount: structuralSuppressedCount,
                structuralBlockingCount: structuralBlocking,
                structuralAdvisoryCount: structuralAdvisory,
                deterministicSignals: deterministicSigs,
                heuristicSignals: heuristicSigs,
                overallTrustScore: trustScore,
                verdict: effectiveVerdict,
                governanceDecision: governanceResult?.governanceDecision?.summary || 'automatic',
                actor: custodyActor,
                source: custodySource,
                replayChecksum: canonicalReplayChecksum,
            });
            applyCapturedReplayCustody(lastCanonicalOutput, mainReplayCustody);
            // If JSON output requested, output JSON and exit
            if (options.json) {
                emitVerifyJson(verifyEvidencePayload, (canonical) => {
                    applyCapturedReplayCustody(canonical, mainReplayCustody);
                });
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
                    governance: governancePayload,
                });
                // Exit based on effective verdict (same logic as below)
                if (shouldForceGovernancePass) {
                    exitWithEvidence(0);
                }
                if (effectiveVerdict === 'FAIL') {
                    exitWithEvidence(2);
                }
                else if (effectiveVerdict === 'WARN') {
                    exitWithEvidence(1);
                }
                else {
                    exitWithEvidence(0);
                }
            }
            // Display results (only if not in json mode; exclude ignored paths from bloat)
            if (!options.json) {
                const displayBloatFiles = (verifyResult.bloatFiles || []).filter((f) => !shouldIgnore(f));
                (0, verify_render_1.displayVerifyResults)(chalk, {
                    ...verifyResult,
                    verdict: effectiveVerdict,
                    message: effectiveMessage,
                    bloatFiles: displayBloatFiles,
                    bloatCount: displayBloatFiles.length,
                }, policyViolations, expediteModeEnabled, intentEngineIssues, intentEngineSummary, intentEngineFlowIssues, intentEngineRegressions, structuralViolations);
                if (governanceResult) {
                    (0, verify_render_1.displayGovernanceInsights)(chalk, governanceResult, { explain: options.explain });
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
                console.log(chalk.dim('\n── Verification contract (this run) ──'));
                console.log(chalk.dim(`   Verify source: ${verifySource === 'local_fallback'
                    ? 'local deterministic fallback (verify API unavailable)'
                    : 'verify API'}`));
                console.log(chalk.dim(`   Structural findings: ${structuralViolations.length} ` +
                    `(${structuralViolations.filter((v) => v.severity === 'BLOCKING').length} blocking, ` +
                    `${structuralViolations.filter((v) => v.severity !== 'BLOCKING').length} advisory)`));
                console.log(chalk.dim('   Merge gates follow rule severity + policy: blocking structural findings are reproducible on this tree.'));
                console.log(chalk.dim('   Evidence trail: see `.neurcode/` on success (provenance, telemetry) — use `neurcode replay` / dashboard for audit parity.'));
            }
            // ── Governance Provenance Chain + Pilot Metrics ───────────────────────
            // Best-effort: never throws, never changes the verification outcome.
            try {
                lastProvenanceRunId = mainReplayCustody.provenanceRecord?.runId ?? lastProvenanceRunId;
                // Tally per-rule counts for pilot metrics
                const ruleCounts = {};
                for (const v of structuralViolations) {
                    ruleCounts[v.ruleId] = (ruleCounts[v.ruleId] ?? 0) + 1;
                }
                (0, pilot_metrics_1.recordVerifyRun)(projectRoot, {
                    planCount: 0,
                    verifyCount: 1,
                    passCount: effectiveVerdict === 'PASS' ? 1 : 0,
                    failCount: effectiveVerdict === 'FAIL' ? 1 : 0,
                    blockingCaught: mainReplayCustody.provenanceRecord?.blockingCount ?? (policyViolations.filter((v) => v.severity === 'block').length + structuralBlocking),
                    advisoryCaught: mainReplayCustody.provenanceRecord?.advisoryCount ?? (policyViolations.filter((v) => v.severity !== 'block').length + structuralAdvisory),
                    suppressions: structuralSuppressedCount,
                    structuralCaught: structuralViolations.length,
                    aiDebtDelta: aiDebtSummary?.score ?? 0,
                    ruleCounts,
                });
            }
            catch {
                // Never break verification
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
                exitWithEvidence(0);
            }
            // If scope guard didn't pass (or failed to check) or policy blocked, use effective verdict
            // Exit with appropriate code based on AI verification and custom policies
            if (effectiveVerdict === 'FAIL') {
                exitWithEvidence(2);
            }
            else if (effectiveVerdict === 'WARN') {
                exitWithEvidence(1);
            }
            else {
                exitWithEvidence(0);
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
            exitWithEvidence(1);
        }
    }
    catch (error) {
        if (options.json) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            (0, verify_output_1.emitCanonicalVerifyJson)({
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
        if (exitWithEvidenceFromTry) {
            exitWithEvidenceFromTry(1);
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
        engineeringContext: governance.engineeringContext,
        driftIntelligence: governance.driftIntelligence,
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