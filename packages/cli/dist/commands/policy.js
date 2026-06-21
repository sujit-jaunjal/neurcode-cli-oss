"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.policyCommand = policyCommand;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const brain_1 = require("@neurcode-ai/brain");
const policy_engine_1 = require("@neurcode-ai/policy-engine");
const project_root_1 = require("../utils/project-root");
const config_1 = require("../config");
const api_client_1 = require("../api-client");
const custom_policy_rules_1 = require("../utils/custom-policy-rules");
const policy_exceptions_1 = require("../utils/policy-exceptions");
const policy_governance_1 = require("../utils/policy-governance");
const policy_audit_1 = require("../utils/policy-audit");
const policy_packs_1 = require("../utils/policy-packs");
const policy_compiler_1 = require("../utils/policy-compiler");
const artifact_signature_1 = require("../utils/artifact-signature");
const proposed_change_analysis_1 = require("../utils/proposed-change-analysis");
const repo_intelligence_v2_1 = require("../utils/repo-intelligence-v2");
const v0_governance_1 = require("../utils/v0-governance");
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
    };
}
function toJsonPack(pack) {
    return {
        id: pack.id,
        name: pack.name,
        description: pack.description,
        version: pack.version,
        tags: [...pack.tags],
        ruleCount: Array.isArray(pack.rules) ? pack.rules.length : 0,
    };
}
const BOOTSTRAP_INTENT_BY_PACK = {
    fintech: 'No payment bypass, no secret literals, and no unsafe migration shortcuts.',
    hipaa: 'No PHI leakage in logs, no auth bypass, and no plaintext sensitive data handling.',
    soc2: 'No auth bypass, no secret literals, and no CI/workflow integrity regressions.',
    'startup-fast': 'No secret literals, no unsafe debug backdoors, and keep changes scoped.',
    node: 'No auth bypass, no secret literals, and no unsafe child_process shell execution.',
    python: 'No credential leakage, no unsafe eval/exec patterns, and protect dependency boundaries.',
    java: 'No auth bypass, no credential literals, and no insecure security-configuration drift.',
    frontend: 'No client-side secret leakage, no unsafe DOM injection, and no auth-route bypass.',
};
function loadPolicyRuntimeConfig() {
    const config = (0, config_1.loadConfig)();
    if (process.env.NEURCODE_API_KEY) {
        config.apiKey = process.env.NEURCODE_API_KEY;
    }
    if (process.env.NEURCODE_API_URL) {
        config.apiUrl = process.env.NEURCODE_API_URL.replace(/\/$/, '');
    }
    else if (config.apiUrl) {
        config.apiUrl = config.apiUrl.replace(/\/$/, '');
    }
    return config;
}
function resolveExpiresAt(input) {
    if (input.expiresAt && input.expiresAt.trim()) {
        return new Date(input.expiresAt.trim()).toISOString();
    }
    if (Number.isFinite(input.expiresInDays) && input.expiresInDays > 0) {
        const ms = input.expiresInDays * 24 * 60 * 60 * 1000;
        return new Date(Date.now() + ms).toISOString();
    }
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}
function resolveActor(explicit) {
    if (explicit && explicit.trim())
        return explicit.trim();
    return process.env.NEURCODE_ACTOR || process.env.GITHUB_ACTOR || process.env.USER || 'unknown';
}
function validateExceptionWindowByGovernance(expiresAt, maxExpiryDays) {
    const expiryMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiryMs)) {
        throw new Error('expiresAt must be a valid ISO datetime');
    }
    const maxWindowMs = Math.max(1, maxExpiryDays) * 24 * 60 * 60 * 1000;
    if (expiryMs - Date.now() > maxWindowMs) {
        throw new Error(`exception expiry exceeds governance max window (${maxExpiryDays} days)`);
    }
}
function normalizeListLimit(value, fallback, min, max) {
    if (!Number.isFinite(value))
        return fallback;
    return Math.max(min, Math.min(max, Math.floor(Number(value))));
}
const STRUCTURAL_POLICY_DEFAULT_PATH = '.neurcode/structural-policy-v2.json';
function resolveStructuralPolicyPath(cwd, input) {
    const selected = input?.trim() || STRUCTURAL_POLICY_DEFAULT_PATH;
    return (0, node_path_1.isAbsolute)(selected) ? selected : (0, node_path_1.join)(cwd, selected);
}
function readJsonValue(path) {
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(path, 'utf8'));
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSON in ${path}: ${detail}`);
    }
}
function normalizeRepositoryPath(cwd, input) {
    const absolutePath = (0, node_path_1.isAbsolute)(input) ? (0, node_path_1.resolve)(input) : (0, node_path_1.resolve)(cwd, input);
    const relativePath = (0, node_path_1.relative)(cwd, absolutePath).replace(/\\/g, '/');
    if (!relativePath || relativePath === '..' || relativePath.startsWith('../')) {
        throw new Error(`Path is outside repository root: ${input}`);
    }
    return { relativePath, absolutePath };
}
function structuralExitCode(verdict) {
    if (verdict === 'block')
        return 2;
    if (verdict === 'not_evaluated')
        return 3;
    return 0;
}
function structuralStatements(value, previous) {
    return [...previous, value];
}
async function evaluateStructuralPolicyPath(input) {
    const target = normalizeRepositoryPath(input.cwd, input.targetPath);
    let graph = (0, brain_1.readRepositoryGraph)(input.cwd);
    let freshness = await (0, brain_1.repositoryGraphStatus)(input.cwd);
    if (input.index !== false && (!graph || freshness.state !== 'fresh')) {
        graph = (await (0, brain_1.indexRepositoryGraph)({ repoRoot: input.cwd })).graph;
        freshness = graph.freshness;
    }
    else if (graph) {
        graph = { ...graph, freshness };
    }
    const operation = input.operation
        ?? ((0, node_fs_1.existsSync)(target.absolutePath) ? 'update' : 'create');
    let proposedSource = null;
    let sourceKind = 'not_available';
    if (!input.pathOnly && operation !== 'delete') {
        const contentPath = input.contentFile
            ? ((0, node_path_1.isAbsolute)(input.contentFile) ? input.contentFile : (0, node_path_1.resolve)(input.cwd, input.contentFile))
            : target.absolutePath;
        if ((0, node_fs_1.existsSync)(contentPath)) {
            proposedSource = (0, node_fs_1.readFileSync)(contentPath, 'utf8');
            sourceKind = input.contentFile ? 'write_content' : 'post_write_disk_read';
        }
    }
    const analysis = (0, proposed_change_analysis_1.analyzeProposedChange)({
        repoRoot: input.cwd,
        filePath: target.relativePath,
        proposedSource,
        sourceKind,
        adapterId: 'neurcode-cli',
        timing: sourceKind === 'post_write_disk_read' ? 'after_write' : 'before_write',
        sessionId: null,
        planRevision: null,
    });
    analysis.envelope.target.operation = operation;
    const approvalsValue = input.approvalsFile
        ? readJsonValue((0, node_path_1.isAbsolute)(input.approvalsFile) ? input.approvalsFile : (0, node_path_1.resolve)(input.cwd, input.approvalsFile))
        : [];
    if (!Array.isArray(approvalsValue))
        throw new Error('Approvals file must contain a JSON array.');
    const approvals = approvalsValue
        .filter((value) => Boolean(value)
        && typeof value === 'object'
        && typeof value.path === 'string'
        && Array.isArray(value.owners)
        && typeof value.approvedBy === 'string')
        .map((value) => ({
        path: value.path,
        owners: value.owners.filter((owner) => typeof owner === 'string'),
        approvedBy: value.approvedBy,
    }));
    const repoIntelligence = await (0, repo_intelligence_v2_1.evaluateLocalRepoIntelligenceV2)({
        repoRoot: input.cwd,
        change: analysis.envelope,
        approvals,
        policyPath: input.artifactPath,
    });
    if (!repoIntelligence.policyConfigured) {
        throw new Error(`Structural policy artifact is missing or invalid: ${repoIntelligence.policyPath}. ` +
            'Run `neurcode policy structural-compile`.');
    }
    return {
        artifactPath: resolveStructuralPolicyPath(input.cwd, input.artifactPath),
        graphId: repoIntelligence.evidence.graph.graphId,
        envelope: analysis.envelope,
        evaluation: repoIntelligence.evaluation,
        evidence: repoIntelligence.evidence,
    };
}
async function resolveCustomPolicies(client, includeDashboardPolicies, requireDashboardPolicies) {
    if (!includeDashboardPolicies) {
        return {
            includeDashboardPolicies: false,
            customPolicies: [],
        };
    }
    try {
        const customPolicies = await client.getActiveCustomPolicies();
        return {
            includeDashboardPolicies: true,
            customPolicies,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (requireDashboardPolicies) {
            throw new Error(`Failed to load dashboard custom policies: ${message}`);
        }
        return {
            includeDashboardPolicies: false,
            customPolicies: [],
            dashboardWarning: `Dashboard policies unavailable (${message}); continuing without dashboard rules.`,
        };
    }
}
function policyCommand(program) {
    const policy = program
        .command('policy')
        .description('Install and manage enterprise policy packs (fintech, hipaa, soc2, startup-fast, node, python, java, frontend)');
    policy
        .command('list')
        .description('List available policy packs')
        .option('--json', 'Output as JSON')
        .action((options) => {
        const packs = (0, policy_packs_1.listPolicyPacks)().map((pack) => toJsonPack(pack));
        if (options.json) {
            console.log(JSON.stringify({ packs }, null, 2));
            return;
        }
        console.log(chalk.bold('\n📦 Available Policy Packs\n'));
        packs.forEach((pack) => {
            console.log(chalk.cyan(`• ${pack.id}`) + chalk.dim(` (${pack.version})`));
            console.log(`  ${pack.name}`);
            console.log(chalk.dim(`  ${pack.description}`));
            console.log(chalk.dim(`  Rules: ${pack.ruleCount} | Tags: ${pack.tags.join(', ')}`));
            console.log('');
        });
        console.log(chalk.dim('Install a pack with: neurcode policy install <pack-id>'));
        console.log(chalk.dim('Example: neurcode policy install soc2\n'));
    });
    policy
        .command('status')
        .description('Show currently installed policy pack for this repository')
        .option('--json', 'Output as JSON')
        .action((options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const installed = (0, policy_packs_1.readInstalledPolicyPack)(cwd);
        if (options.json) {
            console.log(JSON.stringify({
                installed: installed
                    ? {
                        packId: installed.packId,
                        packName: installed.packName,
                        version: installed.version,
                        installedAt: installed.installedAt,
                        tags: installed.tags,
                        ruleCount: installed.rules.length,
                    }
                    : null,
            }, null, 2));
            return;
        }
        if (!installed) {
            console.log(chalk.yellow('\n⚠️  No policy pack installed for this repository.\n'));
            console.log(chalk.dim('Run: neurcode policy list'));
            console.log(chalk.dim('Then: neurcode policy install <pack-id>\n'));
            return;
        }
        console.log(chalk.bold('\n🛡️  Active Policy Pack\n'));
        console.log(chalk.cyan(`Pack: ${installed.packName}`));
        console.log(chalk.dim(`ID: ${installed.packId}`));
        console.log(chalk.dim(`Version: ${installed.version}`));
        console.log(chalk.dim(`Installed: ${installed.installedAt}`));
        console.log(chalk.dim(`Rules: ${installed.rules.length}`));
        console.log(chalk.dim(`Tags: ${installed.tags.join(', ') || '(none)'}\n`));
    });
    policy
        .command('install')
        .description('Install a policy pack for this repository')
        .argument('<pack-id>', 'Policy pack ID (run `neurcode policy list` for all available stacks)')
        .option('--force', 'Replace any existing installed policy pack')
        .option('--json', 'Output as JSON')
        .action((packId, options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        try {
            const installed = (0, policy_packs_1.installPolicyPack)(cwd, packId, options.force === true);
            if (options.json) {
                console.log(JSON.stringify({
                    installed: {
                        packId: installed.packId,
                        packName: installed.packName,
                        version: installed.version,
                        installedAt: installed.installedAt,
                        tags: installed.tags,
                        ruleCount: installed.rules.length,
                    },
                }, null, 2));
                return;
            }
            console.log(chalk.green('\n✅ Policy pack installed\n'));
            console.log(chalk.cyan(`Pack: ${installed.packName}`) + chalk.dim(` (${installed.packId}@${installed.version})`));
            console.log(chalk.dim(`Rules activated: ${installed.rules.length}`));
            console.log(chalk.dim('\nNext: run `neurcode verify --policy-only` or `neurcode verify` to enforce these rules.\n'));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json) {
                console.log(JSON.stringify({ error: message }, null, 2));
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ ${message}\n`));
            process.exit(1);
        }
    });
    policy
        .command('bootstrap')
        .description('Install a stack policy pack and generate lock + compiled artifact in one deterministic step')
        .argument('<pack-id>', 'Policy pack ID')
        .option('--force', 'Replace any existing installed policy pack')
        .option('--intent <text>', 'Optional deterministic intent constraints for compilation')
        .option('--include-dashboard', 'Include dashboard custom policies in lock + compile')
        .option('--require-dashboard', 'Fail if dashboard custom policies cannot be loaded')
        .option('--require-deterministic-match', 'Fail if any intent statement cannot be compiled into deterministic enforcement rules')
        .option('--output <path>', 'Output file path (default: neurcode.policy.compiled.json)')
        .option('--json', 'Output as JSON')
        .action(async (packId, options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const config = loadPolicyRuntimeConfig();
        const client = new api_client_1.ApiClient(config);
        try {
            const installed = (0, policy_packs_1.installPolicyPack)(cwd, packId, options.force === true);
            const includeDashboard = options.includeDashboard === true;
            const customPolicyResolution = await resolveCustomPolicies(client, includeDashboard, options.requireDashboard === true);
            const customRules = customPolicyResolution.includeDashboardPolicies
                ? (0, custom_policy_rules_1.mapActiveCustomPoliciesToRules)(customPolicyResolution.customPolicies)
                : [];
            const snapshot = (0, policy_packs_1.buildPolicyStateSnapshot)({
                policyPack: (0, policy_packs_1.getInstalledPolicyPackRules)(cwd),
                policyPackRules: installed.rules,
                customPolicies: customPolicyResolution.customPolicies,
                customRules,
                includeDashboardPolicies: customPolicyResolution.includeDashboardPolicies,
            });
            const lockPath = (0, policy_packs_1.writePolicyLockFile)(cwd, snapshot);
            const resolvedIntent = (options.intent && options.intent.trim())
                || BOOTSTRAP_INTENT_BY_PACK[installed.packId]
                || '';
            const compiledUnsigned = (0, policy_compiler_1.buildCompiledPolicyArtifact)({
                includeDashboardPolicies: customPolicyResolution.includeDashboardPolicies,
                policyLockPath: (0, policy_packs_1.getPolicyLockPath)(cwd),
                policyLockFingerprint: snapshot.effective.fingerprint,
                policyPack: {
                    id: installed.packId,
                    name: installed.packName,
                    version: installed.version,
                },
                defaultRuleCount: snapshot.defaultRules.count,
                policyPackRuleCount: installed.rules.length,
                customRuleCount: customRules.length,
                effectiveRuleCount: snapshot.effective.ruleCount,
                intentConstraints: resolvedIntent,
                policyRules: customPolicyResolution.customPolicies.map((policy) => policy.rule_text),
            });
            const artifactSigningConfig = (0, artifact_signature_1.resolveGovernanceArtifactSigningConfigFromEnv)();
            const compiled = (0, artifact_signature_1.signGovernanceArtifact)(compiledUnsigned, artifactSigningConfig);
            if (options.requireDeterministicMatch === true
                && compiled.compilation.unmatchedStatements.length > 0) {
                throw new Error(`Deterministic policy compilation blocked: ${compiled.compilation.unmatchedStatements.length} intent statement(s) could not be converted into enforceable rules.`);
            }
            const artifactPath = (0, policy_compiler_1.writeCompiledPolicyArtifact)(cwd, compiled, options.output);
            if (options.json) {
                console.log(JSON.stringify({
                    bootstrap: {
                        packId: installed.packId,
                        packName: installed.packName,
                        version: installed.version,
                        lockPath,
                        compiledPolicyPath: artifactPath,
                        dashboardMode: compiled.source.includeDashboardPolicies ? 'dashboard' : 'disabled',
                        deterministicRuleCount: compiled.compilation.deterministicRuleCount,
                        unmatchedStatements: compiled.compilation.unmatchedStatements,
                        effectiveRuleCount: snapshot.effective.ruleCount,
                    },
                    warning: customPolicyResolution.dashboardWarning || null,
                }, null, 2));
                return;
            }
            console.log(chalk.green('\n✅ Policy bootstrap complete\n'));
            console.log(chalk.cyan(`Pack: ${installed.packName}`) + chalk.dim(` (${installed.packId}@${installed.version})`));
            console.log(chalk.dim(`Lock baseline: ${lockPath}`));
            console.log(chalk.dim(`Compiled artifact: ${artifactPath}`));
            console.log(chalk.dim(`Effective rules: ${snapshot.effective.ruleCount}`));
            console.log(chalk.dim(`Deterministic compiled rules: ${compiled.compilation.deterministicRuleCount}`));
            console.log(chalk.dim(`Unmatched intent statements: ${compiled.compilation.unmatchedStatements.length}`));
            if (customPolicyResolution.dashboardWarning) {
                console.log(chalk.yellow(`\n⚠️  ${customPolicyResolution.dashboardWarning}`));
            }
            console.log(chalk.dim('\nNext: run `neurcode verify --record --compiled-policy neurcode.policy.compiled.json --enforce-change-contract --strict-artifacts`.\n'));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json) {
                console.log(JSON.stringify({ error: message }, null, 2));
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ ${message}\n`));
            process.exit(1);
        }
    });
    policy
        .command('uninstall')
        .description('Remove the installed policy pack from this repository')
        .option('--json', 'Output as JSON')
        .action((options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const removed = (0, policy_packs_1.uninstallPolicyPack)(cwd);
        if (options.json) {
            console.log(JSON.stringify({ removed }, null, 2));
            return;
        }
        if (!removed) {
            console.log(chalk.yellow('\n⚠️  No policy pack was installed.\n'));
            return;
        }
        console.log(chalk.green('\n✅ Policy pack removed for this repository.\n'));
    });
    policy
        .command('lock')
        .description('Generate or update committed policy lock baseline (neurcode.policy.lock.json)')
        .option('--no-dashboard', 'Exclude dashboard custom policies from the lock baseline')
        .option('--require-dashboard', 'Fail if dashboard custom policies cannot be loaded')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const config = loadPolicyRuntimeConfig();
        const client = new api_client_1.ApiClient(config);
        const includeDashboard = options.dashboard !== false;
        try {
            const customPolicyResolution = await resolveCustomPolicies(client, includeDashboard, options.requireDashboard === true);
            const installedPack = (0, policy_packs_1.getInstalledPolicyPackRules)(cwd);
            const customRules = customPolicyResolution.includeDashboardPolicies
                ? (0, custom_policy_rules_1.mapActiveCustomPoliciesToRules)(customPolicyResolution.customPolicies)
                : [];
            const snapshot = (0, policy_packs_1.buildPolicyStateSnapshot)({
                policyPack: installedPack,
                policyPackRules: installedPack?.rules || [],
                customPolicies: customPolicyResolution.customPolicies,
                customRules,
                includeDashboardPolicies: customPolicyResolution.includeDashboardPolicies,
            });
            const lockPath = (0, policy_packs_1.writePolicyLockFile)(cwd, snapshot);
            try {
                (0, policy_audit_1.appendPolicyAuditEvent)(cwd, {
                    actor: resolveActor(),
                    action: 'policy_lock_written',
                    entityType: 'policy_lock',
                    entityId: 'neurcode.policy.lock.json',
                    metadata: {
                        policyPack: snapshot.policyPack ? `${snapshot.policyPack.id}@${snapshot.policyPack.version}` : 'none',
                        mode: snapshot.customPolicies.mode,
                        effectiveRuleCount: snapshot.effective.ruleCount,
                    },
                });
            }
            catch {
                // Non-blocking audit write.
            }
            if (options.json) {
                console.log(JSON.stringify({
                    lock: {
                        path: lockPath,
                        generatedAt: snapshot.generatedAt,
                        mode: snapshot.customPolicies.mode,
                        effectiveRuleCount: snapshot.effective.ruleCount,
                        effectiveFingerprint: snapshot.effective.fingerprint,
                        policyPack: snapshot.policyPack
                            ? {
                                id: snapshot.policyPack.id,
                                version: snapshot.policyPack.version,
                                ruleCount: snapshot.policyPack.ruleCount,
                            }
                            : null,
                        customPolicyCount: snapshot.customPolicies.count,
                    },
                    warning: customPolicyResolution.dashboardWarning || null,
                }, null, 2));
                return;
            }
            console.log(chalk.green('\n✅ Policy lock baseline updated\n'));
            console.log(chalk.cyan(`Path: ${lockPath}`));
            console.log(chalk.dim(`Effective policy fingerprint: ${snapshot.effective.fingerprint}`));
            console.log(chalk.dim(`Policy pack: ${snapshot.policyPack ? `${snapshot.policyPack.id}@${snapshot.policyPack.version}` : 'none'}`));
            console.log(chalk.dim(`Dashboard policies: ${snapshot.customPolicies.mode} (${snapshot.customPolicies.count})`));
            if (customPolicyResolution.dashboardWarning) {
                console.log(chalk.yellow(`\n⚠️  ${customPolicyResolution.dashboardWarning}`));
            }
            console.log(chalk.dim('Commit this lock file so CI can enforce deterministic policy baselines.'));
            console.log(chalk.dim('\nRun `neurcode policy check --require-lock` in CI to enforce this baseline.\n'));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json) {
                console.log(JSON.stringify({ error: message }, null, 2));
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ ${message}\n`));
            process.exit(1);
        }
    });
    policy
        .command('check')
        .description('Validate current policy state against committed policy lock baseline')
        .option('--require-lock', 'Fail if neurcode.policy.lock.json is missing')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const lockRead = (0, policy_packs_1.readPolicyLockFile)(cwd);
        const lockMode = lockRead.lock?.customPolicies.mode;
        const includeDashboardPolicies = lockMode === 'dashboard';
        const config = loadPolicyRuntimeConfig();
        const client = new api_client_1.ApiClient(config);
        let customPolicies = [];
        let dashboardError = null;
        if (includeDashboardPolicies) {
            try {
                customPolicies = await client.getActiveCustomPolicies();
            }
            catch (error) {
                dashboardError = error instanceof Error ? error.message : 'Unknown error';
            }
        }
        const customRules = includeDashboardPolicies ? (0, custom_policy_rules_1.mapActiveCustomPoliciesToRules)(customPolicies) : [];
        const installedPack = (0, policy_packs_1.getInstalledPolicyPackRules)(cwd);
        const currentSnapshot = (0, policy_packs_1.buildPolicyStateSnapshot)({
            policyPack: installedPack,
            policyPackRules: installedPack?.rules || [],
            customPolicies,
            customRules,
            includeDashboardPolicies,
        });
        const validation = (0, policy_packs_1.evaluatePolicyLock)(cwd, currentSnapshot, {
            requireLock: options.requireLock === true,
        });
        if (dashboardError) {
            validation.mismatches.unshift({
                code: 'POLICY_LOCK_CUSTOM_POLICIES_MISMATCH',
                message: `Failed to load dashboard custom policies while checking lock: ${dashboardError}`,
            });
        }
        const pass = (!validation.enforced || validation.matched) && !dashboardError;
        if (options.json) {
            console.log(JSON.stringify({
                pass,
                enforced: validation.enforced,
                lockPath: validation.lockPath,
                lockPresent: validation.lockPresent,
                mismatches: validation.mismatches,
                effectiveRuleCount: currentSnapshot.effective.ruleCount,
                effectiveFingerprint: currentSnapshot.effective.fingerprint,
            }, null, 2));
            process.exit(pass ? 0 : 1);
        }
        if (pass) {
            if (validation.enforced) {
                console.log(chalk.green('\n✅ Policy lock check passed.\n'));
                console.log(chalk.dim(`Lock: ${validation.lockPath}`));
                console.log(chalk.dim(`Fingerprint: ${currentSnapshot.effective.fingerprint}\n`));
            }
            else {
                console.log(chalk.yellow('\n⚠️  No policy lock found. Nothing to enforce.\n'));
                console.log(chalk.dim(`Expected path: ${(0, policy_packs_1.getPolicyLockPath)(cwd)}`));
                console.log(chalk.dim('Generate baseline: neurcode policy lock\n'));
            }
        }
        else {
            console.log(chalk.red('\n❌ Policy lock mismatch detected.\n'));
            validation.mismatches.forEach((item) => {
                console.log(chalk.red(`• [${item.code}] ${item.message}`));
                if (item.expected || item.actual) {
                    console.log(chalk.dim(`  expected: ${item.expected || '(none)'}`));
                    console.log(chalk.dim(`  actual:   ${item.actual || '(none)'}`));
                }
            });
            console.log(chalk.dim('\nIf this policy drift is intentional, refresh baseline: neurcode policy lock\n'));
        }
        process.exit(pass ? 0 : 1);
    });
    policy
        .command('duplicate-mode [mode]')
        .description('Inspect or set deterministic duplicate-symbol enforcement: off | warn | block')
        .option('--json', 'Output stable machine-readable JSON')
        .action((mode, options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        try {
            if (mode !== undefined && !['off', 'warn', 'block'].includes(mode)) {
                throw new Error('Invalid duplicate mode. Use one of: off, warn, block.');
            }
            const updated = mode
                ? (0, v0_governance_1.setRepoSymbolDuplicateMode)(cwd, mode)
                : null;
            const config = (0, v0_governance_1.readRuntimeGovernanceConfig)(cwd);
            if (config.error)
                throw new Error(`Invalid governance configuration: ${config.error}`);
            const profile = (0, v0_governance_1.ensureFreshGovernanceProfile)(cwd).profile;
            const payload = {
                ok: true,
                repoSymbolDuplicateMode: profile.runtimeConfig.repoSymbolDuplicateMode,
                source: config.exists ? 'governance_config' : 'default',
                configPath: config.path,
                profilePath: (0, node_path_1.join)(cwd, '.neurcode', 'profile.json'),
                profileHash: profile.profileHash,
                updated: Boolean(updated),
            };
            if (options.json)
                console.log(JSON.stringify(payload, null, 2));
            else {
                console.log(chalk.bold('\n🛡️  Duplicate Symbol Policy\n'));
                console.log(chalk.dim(`Effective mode: ${payload.repoSymbolDuplicateMode}`));
                console.log(chalk.dim(`Source:         ${payload.source}`));
                console.log(chalk.dim(`Config:         ${payload.configPath}`));
                console.log(chalk.dim('Evidence:       exact source-free symbol name/language facts only; semantic resemblance never blocks.'));
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json)
                console.log(JSON.stringify({ ok: false, error: message, exitCode: 1 }, null, 2));
            else
                console.error(chalk.red(`\n❌ ${message}\n`));
            process.exitCode = 1;
        }
    });
    policy
        .command('structural-compile')
        .description('Compile bounded Repository Policy V2 rules into a deterministic source-free artifact')
        .option('--input <path>', 'JSON file containing organizationRules, repositoryRules, and naturalLanguageStatements')
        .option('--statement <text>', 'Add a bounded natural-language statement', structuralStatements, [])
        .option('--output <path>', `Output artifact (default: ${STRUCTURAL_POLICY_DEFAULT_PATH})`)
        .option('--require-deterministic', 'Fail when any statement is advisory, not evaluated, or rejected')
        .option('--json', 'Output stable machine-readable JSON')
        .action((options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        try {
            const fromFile = options.input
                ? readJsonValue((0, node_path_1.isAbsolute)(options.input) ? options.input : (0, node_path_1.resolve)(cwd, options.input))
                : {};
            if (!fromFile || typeof fromFile !== 'object' || Array.isArray(fromFile)) {
                throw new Error('Structural policy input must be a JSON object.');
            }
            const parsed = fromFile;
            const naturalLanguageStatements = [
                ...(Array.isArray(parsed.naturalLanguageStatements)
                    ? parsed.naturalLanguageStatements.filter((value) => typeof value === 'string')
                    : []),
                ...(options.statement ?? []),
            ];
            const compilation = (0, policy_engine_1.compileStructuralPolicies)({
                organizationRules: Array.isArray(parsed.organizationRules) ? parsed.organizationRules : [],
                repositoryRules: Array.isArray(parsed.repositoryRules) ? parsed.repositoryRules : [],
                naturalLanguageStatements,
            });
            const artifact = (0, policy_engine_1.createStructuralPolicyArtifact)(compilation);
            const outputPath = resolveStructuralPolicyPath(cwd, options.output);
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(outputPath), { recursive: true });
            (0, node_fs_1.writeFileSync)(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            const incomplete = compilation.advisory.length
                + compilation.notEvaluated.length
                + compilation.rejected.length;
            const exitCode = compilation.rejected.length > 0
                || (options.requireDeterministic && incomplete > 0)
                ? 4
                : 0;
            const payload = {
                ok: exitCode === 0,
                path: outputPath,
                artifact,
                counts: {
                    compiled: compilation.compiled.length,
                    advisory: compilation.advisory.length,
                    notEvaluated: compilation.notEvaluated.length,
                    rejected: compilation.rejected.length,
                },
                exitCode,
            };
            if (options.json) {
                console.log(JSON.stringify(payload, null, 2));
            }
            else {
                console.log(chalk.bold('\n🛡️  Structural Policy V2 Compilation\n'));
                console.log(chalk.dim(`Artifact:       ${outputPath}`));
                console.log(chalk.dim(`Compiled:       ${payload.counts.compiled}`));
                console.log(chalk.dim(`Advisory:       ${payload.counts.advisory}`));
                console.log(chalk.dim(`Not evaluated:  ${payload.counts.notEvaluated}`));
                console.log(chalk.dim(`Rejected:       ${payload.counts.rejected}`));
                for (const rule of compilation.compiled) {
                    console.log(chalk.dim(`  ${rule.ruleId} · ${rule.family} · ${rule.mode}`));
                }
            }
            process.exitCode = exitCode;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json)
                console.log(JSON.stringify({ ok: false, error: message, exitCode: 1 }, null, 2));
            else
                console.error(chalk.red(`\n❌ ${message}\n`));
            process.exitCode = 1;
        }
    });
    policy
        .command('structural-test <path>')
        .alias('check-change')
        .description('Evaluate a proposed or current local file against Structural Policy V2')
        .option('--artifact <path>', `Compiled artifact (default: ${STRUCTURAL_POLICY_DEFAULT_PATH})`)
        .option('--content-file <path>', 'Local proposed content file; raw content is parsed locally and not retained')
        .option('--operation <type>', 'create | update | delete | rename')
        .option('--path-only', 'Evaluate the honest path-only host case without proposed content')
        .option('--approvals <path>', 'JSON array of exact source-free approvals')
        .option('--no-index', 'Do not create or refresh Repository Graph V2')
        .option('--json', 'Output stable machine-readable JSON')
        .action(async (path, options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        try {
            const result = await evaluateStructuralPolicyPath({
                cwd,
                targetPath: path,
                artifactPath: options.artifact,
                contentFile: options.contentFile,
                operation: options.operation,
                pathOnly: options.pathOnly,
                index: options.index,
                approvalsFile: options.approvals,
            });
            const exitCode = structuralExitCode(result.evaluation.verdict);
            const payload = { ok: exitCode === 0, ...result, exitCode };
            if (options.json) {
                console.log(JSON.stringify(payload, null, 2));
            }
            else {
                console.log(chalk.bold('\n🛡️  Structural Policy V2 Test\n'));
                console.log(chalk.dim(`Path:          ${result.envelope.target.path}`));
                console.log(chalk.dim(`Verdict:       ${result.evaluation.verdict}`));
                console.log(chalk.dim(`Truth:         ${result.evaluation.truth}`));
                console.log(chalk.dim(`Host timing:   ${result.envelope.host.capability} / ${result.envelope.host.timing}`));
                console.log(chalk.dim(`Evidence:      ${result.envelope.content.availabilityReason}`));
                console.log(chalk.dim('Enforcement:   explicit CLI evaluation; observed result, not a hard host pre-write gate'));
                console.log(chalk.dim(`Evaluated:     ${result.evaluation.evaluatedRuleIds.length}`));
                console.log(chalk.dim(`Not evaluated: ${result.evaluation.notEvaluatedRuleIds.length}`));
                console.log(chalk.dim(`Advisory:      ${result.evidence.advisory.length} (never blocking)`));
                result.evaluation.findings.forEach((item) => {
                    console.log(chalk.yellow(`  [${item.verdict}] ${item.ruleId}: ${item.explanation}`));
                    console.log(chalk.dim(`    ${item.remediation}`));
                });
            }
            process.exitCode = exitCode;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json)
                console.log(JSON.stringify({ ok: false, error: message, exitCode: 1 }, null, 2));
            else
                console.error(chalk.red(`\n❌ ${message}\n`));
            process.exitCode = 1;
        }
    });
    policy
        .command('structural-explain <path>')
        .description('Explain matched facts, deterministic rules, verdicts, and remediation for a path')
        .option('--artifact <path>', `Compiled artifact (default: ${STRUCTURAL_POLICY_DEFAULT_PATH})`)
        .option('--content-file <path>', 'Local proposed content file')
        .option('--operation <type>', 'create | update | delete | rename')
        .option('--path-only', 'Explain the path-only not-evaluated boundary')
        .option('--approvals <path>', 'JSON array of exact source-free approvals')
        .option('--no-index', 'Do not create or refresh Repository Graph V2')
        .option('--json', 'Output stable machine-readable JSON')
        .action(async (path, options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        try {
            const result = await evaluateStructuralPolicyPath({
                cwd,
                targetPath: path,
                artifactPath: options.artifact,
                contentFile: options.contentFile,
                operation: options.operation,
                pathOnly: options.pathOnly,
                index: options.index,
                approvalsFile: options.approvals,
            });
            const exitCode = structuralExitCode(result.evaluation.verdict);
            if (options.json) {
                console.log(JSON.stringify({ ok: exitCode === 0, ...result, exitCode }, null, 2));
            }
            else {
                console.log(chalk.bold(`\n🛡️  Structural Policy V2 Explain: ${result.envelope.target.path}\n`));
                console.log(chalk.dim(`Classification: ${result.evaluation.truth}`));
                console.log(chalk.dim(`Verdict:        ${result.evaluation.verdict}`));
                console.log(chalk.dim(`Graph:          ${result.graphId ?? 'not available'} (${result.evaluation.graphFreshness.state})`));
                console.log(chalk.dim(`Evidence:       ${result.envelope.content.availabilityReason}`));
                console.log(chalk.dim('Enforcement:    explicit CLI evaluation; observed result, not a hard host pre-write gate'));
                if (result.evaluation.findings.length === 0) {
                    console.log(chalk.dim(result.evaluation.verdict === 'not_evaluated'
                        ? 'Required facts were unavailable; no deterministic pass is claimed.'
                        : 'No deterministic structural violations matched.'));
                }
                for (const item of result.evaluation.findings) {
                    console.log(chalk.yellow(`\n${item.ruleId} · ${item.family} · ${item.verdict}`));
                    console.log(`  ${item.explanation}`);
                    console.log(chalk.dim(`  Matched facts: ${item.matchedFacts.map((fact) => fact.factId).join(', ')}`));
                    console.log(chalk.dim(`  Remediation: ${item.remediation}`));
                }
                if (result.evaluation.notEvaluatedRuleIds.length > 0) {
                    console.log(chalk.dim(`\nNot evaluated rules: ${result.evaluation.notEvaluatedRuleIds.join(', ')}`));
                }
            }
            process.exitCode = exitCode;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json)
                console.log(JSON.stringify({ ok: false, error: message, exitCode: 1 }, null, 2));
            else
                console.error(chalk.red(`\n❌ ${message}\n`));
            process.exitCode = 1;
        }
    });
    policy
        .command('compile')
        .description('Compile deterministic policy constraints into a committed artifact')
        .option('--intent <text>', 'Optional intent constraints to compile alongside policy rules')
        .option('--no-dashboard', 'Exclude dashboard custom policies from compiled artifact')
        .option('--require-dashboard', 'Fail if dashboard custom policies cannot be loaded')
        .option('--require-deterministic-match', 'Fail if any intent statement cannot be compiled into deterministic enforcement rules')
        .option('--output <path>', 'Output file path (default: neurcode.policy.compiled.json)')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const config = loadPolicyRuntimeConfig();
        const client = new api_client_1.ApiClient(config);
        const includeDashboard = options.dashboard !== false;
        try {
            const customPolicyResolution = await resolveCustomPolicies(client, includeDashboard, options.requireDashboard === true);
            const installedPack = (0, policy_packs_1.getInstalledPolicyPackRules)(cwd);
            const customRules = customPolicyResolution.includeDashboardPolicies
                ? (0, custom_policy_rules_1.mapActiveCustomPoliciesToRules)(customPolicyResolution.customPolicies)
                : [];
            const snapshot = (0, policy_packs_1.buildPolicyStateSnapshot)({
                policyPack: installedPack,
                policyPackRules: installedPack?.rules || [],
                customPolicies: customPolicyResolution.customPolicies,
                customRules,
                includeDashboardPolicies: customPolicyResolution.includeDashboardPolicies,
            });
            const compiledUnsigned = (0, policy_compiler_1.buildCompiledPolicyArtifact)({
                includeDashboardPolicies: customPolicyResolution.includeDashboardPolicies,
                policyLockPath: (0, policy_packs_1.getPolicyLockPath)(cwd),
                policyLockFingerprint: snapshot.effective.fingerprint,
                policyPack: installedPack
                    ? {
                        id: installedPack.packId,
                        name: installedPack.packName,
                        version: installedPack.version,
                    }
                    : null,
                defaultRuleCount: snapshot.defaultRules.count,
                policyPackRuleCount: installedPack?.rules.length || 0,
                customRuleCount: customRules.length,
                effectiveRuleCount: snapshot.effective.ruleCount,
                intentConstraints: options.intent,
                policyRules: customPolicyResolution.customPolicies.map((policy) => policy.rule_text),
            });
            const artifactSigningConfig = (0, artifact_signature_1.resolveGovernanceArtifactSigningConfigFromEnv)();
            const compiled = (0, artifact_signature_1.signGovernanceArtifact)(compiledUnsigned, artifactSigningConfig);
            if (options.requireDeterministicMatch === true
                && compiled.compilation.unmatchedStatements.length > 0) {
                const unmatchedError = new Error(`Deterministic policy compilation blocked: ${compiled.compilation.unmatchedStatements.length} intent statement(s) could not be converted into enforceable rules.`);
                unmatchedError.code = 'POLICY_COMPILE_UNMATCHED_INTENT';
                unmatchedError.unmatchedStatements = [
                    ...compiled.compilation.unmatchedStatements,
                ];
                unmatchedError.deterministicRuleCount =
                    compiled.compilation.deterministicRuleCount;
                throw unmatchedError;
            }
            const outputPath = (0, policy_compiler_1.writeCompiledPolicyArtifact)(cwd, compiled, options.output);
            const readBack = (0, policy_compiler_1.readCompiledPolicyArtifact)(cwd, options.output);
            try {
                (0, policy_audit_1.appendPolicyAuditEvent)(cwd, {
                    actor: resolveActor(),
                    action: 'policy_compiled',
                    entityType: 'policy_compiled_artifact',
                    entityId: outputPath,
                    metadata: {
                        fingerprint: compiled.fingerprint,
                        deterministicRuleCount: compiled.compilation.deterministicRuleCount,
                        unmatchedStatements: compiled.compilation.unmatchedStatements.length,
                        dashboardMode: compiled.source.includeDashboardPolicies ? 'dashboard' : 'disabled',
                        signaturePresent: Boolean(compiled.signature && compiled.signature.value),
                        signatureKeyId: compiled.signature?.keyId || null,
                    },
                });
            }
            catch {
                // Non-blocking audit write.
            }
            if (options.json) {
                console.log(JSON.stringify({
                    artifact: compiled,
                    path: outputPath,
                    resolvedPath: (0, policy_compiler_1.resolveCompiledPolicyPath)(cwd, options.output),
                    verified: readBack.artifact !== null,
                    warning: customPolicyResolution.dashboardWarning || null,
                }, null, 2));
                return;
            }
            console.log(chalk.green('\n✅ Policy compilation complete\n'));
            console.log(chalk.cyan(`Path: ${outputPath}`));
            console.log(chalk.dim(`Fingerprint: ${compiled.fingerprint}`));
            console.log(chalk.dim(`Deterministic rules: ${compiled.compilation.deterministicRuleCount}`));
            console.log(chalk.dim(`Unmatched statements: ${compiled.compilation.unmatchedStatements.length}`));
            if (compiled.signature?.value) {
                console.log(chalk.dim(`Artifact signature: signed (${compiled.signature.keyId ? `key ${compiled.signature.keyId}` : 'inline key'})`));
            }
            else {
                console.log(chalk.dim('Artifact signature: unsigned (set NEURCODE_GOVERNANCE_SIGNING_KEY to sign artifacts)'));
            }
            console.log(chalk.dim(`Policy source: ${compiled.source.includeDashboardPolicies ? 'dashboard + local packs' : 'local packs only'}`));
            if (customPolicyResolution.dashboardWarning) {
                console.log(chalk.yellow(`\n⚠️  ${customPolicyResolution.dashboardWarning}`));
            }
            console.log(chalk.dim('Run `neurcode verify --enforce-change-contract` to enforce this compiled contract.\n'));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json) {
                const payload = { error: message };
                if (error && typeof error === 'object') {
                    const maybeCode = error.code;
                    const maybeUnmatched = error.unmatchedStatements;
                    const maybeRuleCount = error.deterministicRuleCount;
                    if (typeof maybeCode === 'string') {
                        payload.code = maybeCode;
                    }
                    if (Array.isArray(maybeUnmatched)) {
                        payload.unmatchedStatements = maybeUnmatched.filter((item) => typeof item === 'string');
                    }
                    if (typeof maybeRuleCount === 'number' && Number.isFinite(maybeRuleCount)) {
                        payload.deterministicRuleCount = maybeRuleCount;
                    }
                }
                console.log(JSON.stringify(payload, null, 2));
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ ${message}\n`));
            process.exit(1);
        }
    });
    const governance = policy
        .command('governance')
        .description('Configure exception approval and policy audit governance');
    governance
        .command('status')
        .description('Show policy governance settings for this repository')
        .option('--org', 'Fetch centralized organization governance settings from Neurcode Cloud')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        if (options.org) {
            try {
                const config = loadPolicyRuntimeConfig();
                const client = new api_client_1.ApiClient(config);
                const settings = await client.getOrgGovernanceSettings();
                if (!settings) {
                    throw new Error('Organization governance settings not found');
                }
                const policyGovernance = settings.policyGovernance || null;
                if (options.json) {
                    console.log(JSON.stringify({
                        source: 'org',
                        settings,
                    }, null, 2));
                    return;
                }
                console.log(chalk.bold('\n🏢 Org Policy Governance\n'));
                console.log(chalk.dim('Source: Neurcode Cloud (/api/v1/org/governance/settings)'));
                if (!policyGovernance) {
                    console.log(chalk.yellow('No org-level policy governance configured.\n'));
                    return;
                }
                console.log(chalk.dim(`Exception approvals required: ${policyGovernance.exceptionApprovals?.required ? 'yes' : 'no'}`));
                console.log(chalk.dim(`Minimum approvals: ${policyGovernance.exceptionApprovals?.minApprovals ?? 1}`));
                console.log(chalk.dim(`Disallow self approval: ${policyGovernance.exceptionApprovals?.disallowSelfApproval !== false ? 'yes' : 'no'}`));
                console.log(chalk.dim(`Reason required: ${policyGovernance.exceptionApprovals?.requireReason !== false ? 'yes' : 'no'}`));
                console.log(chalk.dim(`Minimum reason length: ${policyGovernance.exceptionApprovals?.minReasonLength ?? 12}`));
                console.log(chalk.dim(`Maximum exception window (days): ${policyGovernance.exceptionApprovals?.maxExpiryDays ?? 30}`));
                console.log(chalk.dim(`Allowed approvers: ${Array.isArray(policyGovernance.exceptionApprovals?.allowedApprovers)
                    && policyGovernance.exceptionApprovals.allowedApprovers.length > 0
                    ? policyGovernance.exceptionApprovals.allowedApprovers.join(', ')
                    : '(any)'}`));
                console.log(chalk.dim(`Critical rule patterns: ${Array.isArray(policyGovernance.exceptionApprovals?.criticalRulePatterns)
                    && policyGovernance.exceptionApprovals.criticalRulePatterns.length > 0
                    ? policyGovernance.exceptionApprovals.criticalRulePatterns.join(', ')
                    : '(none)'}`));
                console.log(chalk.dim(`Critical minimum approvals: ${policyGovernance.exceptionApprovals?.criticalMinApprovals ?? 2}`));
                console.log(chalk.dim(`Require audit integrity: ${policyGovernance.audit?.requireIntegrity ? 'yes' : 'no'}`));
                console.log(chalk.dim(`Updated at: ${settings.updatedAt || '(unknown)'}`));
                console.log('');
                return;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                if (options.json) {
                    console.log(JSON.stringify({ error: message }, null, 2));
                    process.exit(1);
                }
                console.error(chalk.red(`\n❌ ${message}\n`));
                process.exit(1);
            }
        }
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const config = (0, policy_governance_1.readPolicyGovernanceConfig)(cwd);
        if (options.json) {
            console.log(JSON.stringify({
                path: (0, policy_governance_1.getPolicyGovernancePath)(cwd),
                config,
            }, null, 2));
            return;
        }
        console.log(chalk.bold('\n🏛️  Policy Governance\n'));
        console.log(chalk.dim(`Path: ${(0, policy_governance_1.getPolicyGovernancePath)(cwd)}`));
        console.log(chalk.dim(`Exception approvals required: ${config.exceptionApprovals.required ? 'yes' : 'no'}`));
        console.log(chalk.dim(`Minimum approvals: ${config.exceptionApprovals.minApprovals}`));
        console.log(chalk.dim(`Disallow self approval: ${config.exceptionApprovals.disallowSelfApproval ? 'yes' : 'no'}`));
        console.log(chalk.dim(`Reason required: ${config.exceptionApprovals.requireReason ? 'yes' : 'no'}`));
        console.log(chalk.dim(`Minimum reason length: ${config.exceptionApprovals.minReasonLength}`));
        console.log(chalk.dim(`Maximum exception window (days): ${config.exceptionApprovals.maxExpiryDays}`));
        console.log(chalk.dim(`Allowed approvers: ${config.exceptionApprovals.allowedApprovers.length > 0 ? config.exceptionApprovals.allowedApprovers.join(', ') : '(any)'}`));
        console.log(chalk.dim(`Critical rule patterns: ${config.exceptionApprovals.criticalRulePatterns.length > 0 ? config.exceptionApprovals.criticalRulePatterns.join(', ') : '(none)'}`));
        console.log(chalk.dim(`Critical minimum approvals: ${config.exceptionApprovals.criticalMinApprovals}`));
        console.log(chalk.dim(`Require audit integrity: ${config.audit.requireIntegrity ? 'yes' : 'no'}`));
        console.log('');
    });
    governance
        .command('set')
        .description('Update policy governance settings')
        .option('--org', 'Update centralized organization governance settings in Neurcode Cloud')
        .option('--require-approval', 'Require approvals before exceptions become effective')
        .option('--no-require-approval', 'Do not require approvals for exceptions')
        .option('--min-approvals <n>', 'Minimum approvals required when approval mode is enabled', (value) => parseInt(value, 10))
        .option('--allow-self-approval', 'Allow requester to approve their own exception')
        .option('--restrict-approvers <csv>', 'Comma-separated allow-list of approver identities')
        .option('--clear-approvers', 'Clear approver allow-list (allow any approver)')
        .option('--require-reason', 'Require non-trivial exception reason text')
        .option('--no-require-reason', 'Do not enforce minimum reason text length')
        .option('--min-reason-length <n>', 'Minimum exception reason length (default: 12)', (value) => parseInt(value, 10))
        .option('--max-expiry-days <n>', 'Maximum exception expiry window in days (default: 30)', (value) => parseInt(value, 10))
        .option('--critical-rules <csv>', 'Comma-separated critical rule patterns requiring elevated approvals')
        .option('--clear-critical-rules', 'Clear critical rule patterns')
        .option('--critical-min-approvals <n>', 'Minimum approvals for critical rule exceptions (default: 2)', (value) => parseInt(value, 10))
        .option('--require-audit-integrity', 'Fail verify if policy audit chain integrity is broken')
        .option('--no-require-audit-integrity', 'Do not enforce policy audit integrity in verify')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const hasRestrictApprovers = typeof options.restrictApprovers === 'string';
        const hasCriticalRules = typeof options.criticalRules === 'string';
        const parsedApprovers = options.clearApprovers
            ? []
            : hasRestrictApprovers
                ? options.restrictApprovers
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                : undefined;
        const parsedCriticalRules = options.clearCriticalRules
            ? []
            : hasCriticalRules
                ? options.criticalRules
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                : undefined;
        if (options.org) {
            try {
                const exceptionApprovalsPatch = {};
                if (typeof options.requireApproval === 'boolean') {
                    exceptionApprovalsPatch.required = options.requireApproval;
                }
                if (Number.isFinite(options.minApprovals)) {
                    exceptionApprovalsPatch.minApprovals = options.minApprovals;
                }
                if (typeof options.allowSelfApproval === 'boolean') {
                    exceptionApprovalsPatch.disallowSelfApproval = !options.allowSelfApproval;
                }
                if (parsedApprovers) {
                    exceptionApprovalsPatch.allowedApprovers = parsedApprovers;
                }
                if (typeof options.requireReason === 'boolean') {
                    exceptionApprovalsPatch.requireReason = options.requireReason;
                }
                if (Number.isFinite(options.minReasonLength)) {
                    exceptionApprovalsPatch.minReasonLength = options.minReasonLength;
                }
                if (Number.isFinite(options.maxExpiryDays)) {
                    exceptionApprovalsPatch.maxExpiryDays = options.maxExpiryDays;
                }
                if (parsedCriticalRules) {
                    exceptionApprovalsPatch.criticalRulePatterns = parsedCriticalRules;
                }
                if (Number.isFinite(options.criticalMinApprovals)) {
                    exceptionApprovalsPatch.criticalMinApprovals = options.criticalMinApprovals;
                }
                const auditPatch = {};
                if (typeof options.requireAuditIntegrity === 'boolean') {
                    auditPatch.requireIntegrity = options.requireAuditIntegrity;
                }
                const policyGovernancePatch = {};
                if (Object.keys(exceptionApprovalsPatch).length > 0) {
                    policyGovernancePatch.exceptionApprovals = exceptionApprovalsPatch;
                }
                if (Object.keys(auditPatch).length > 0) {
                    policyGovernancePatch.audit = auditPatch;
                }
                const config = loadPolicyRuntimeConfig();
                const client = new api_client_1.ApiClient(config);
                const settings = await client.updateOrgGovernanceSettings({
                    policyGovernance: policyGovernancePatch,
                });
                if (!settings) {
                    throw new Error('Failed to update org governance settings');
                }
                const next = settings.policyGovernance;
                if (options.json) {
                    console.log(JSON.stringify({
                        source: 'org',
                        settings,
                    }, null, 2));
                    return;
                }
                console.log(chalk.green('\n✅ Organization policy governance updated.\n'));
                console.log(chalk.dim('Source: Neurcode Cloud (/api/v1/org/governance/settings)'));
                if (!next) {
                    console.log(chalk.yellow('No org-level policy governance payload returned.\n'));
                    return;
                }
                console.log(chalk.dim(`Approval required: ${next.exceptionApprovals?.required ? 'yes' : 'no'}`));
                console.log(chalk.dim(`Min approvals: ${next.exceptionApprovals?.minApprovals ?? 1}`));
                console.log(chalk.dim(`Disallow self approval: ${next.exceptionApprovals?.disallowSelfApproval !== false ? 'yes' : 'no'}`));
                console.log(chalk.dim(`Reason required: ${next.exceptionApprovals?.requireReason !== false ? 'yes' : 'no'}`));
                console.log(chalk.dim(`Min reason length: ${next.exceptionApprovals?.minReasonLength ?? 12}`));
                console.log(chalk.dim(`Max expiry days: ${next.exceptionApprovals?.maxExpiryDays ?? 30}`));
                console.log(chalk.dim(`Critical min approvals: ${next.exceptionApprovals?.criticalMinApprovals ?? 2}`));
                console.log(chalk.dim(`Critical rule patterns: ${Array.isArray(next.exceptionApprovals?.criticalRulePatterns)
                    && next.exceptionApprovals.criticalRulePatterns.length > 0
                    ? next.exceptionApprovals.criticalRulePatterns.join(', ')
                    : '(none)'}`));
                console.log(chalk.dim(`Require audit integrity: ${next.audit?.requireIntegrity ? 'yes' : 'no'}`));
                console.log(chalk.dim(`Updated at: ${settings.updatedAt || '(unknown)'}`));
                console.log('');
                return;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                if (options.json) {
                    console.log(JSON.stringify({ error: message }, null, 2));
                    process.exit(1);
                }
                console.error(chalk.red(`\n❌ ${message}\n`));
                process.exit(1);
            }
        }
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        try {
            const next = (0, policy_governance_1.updatePolicyGovernanceConfig)(cwd, {
                required: typeof options.requireApproval === 'boolean' ? options.requireApproval : undefined,
                minApprovals: Number.isFinite(options.minApprovals) ? options.minApprovals : undefined,
                disallowSelfApproval: typeof options.allowSelfApproval === 'boolean' ? !options.allowSelfApproval : undefined,
                allowedApprovers: parsedApprovers,
                requireReason: typeof options.requireReason === 'boolean' ? options.requireReason : undefined,
                minReasonLength: Number.isFinite(options.minReasonLength) ? options.minReasonLength : undefined,
                maxExpiryDays: Number.isFinite(options.maxExpiryDays) ? options.maxExpiryDays : undefined,
                criticalRulePatterns: parsedCriticalRules,
                criticalMinApprovals: Number.isFinite(options.criticalMinApprovals) ? options.criticalMinApprovals : undefined,
                requireAuditIntegrity: typeof options.requireAuditIntegrity === 'boolean' ? options.requireAuditIntegrity : undefined,
            });
            try {
                (0, policy_audit_1.appendPolicyAuditEvent)(cwd, {
                    actor: resolveActor(),
                    action: 'governance_updated',
                    entityType: 'policy_governance',
                    entityId: 'neurcode.policy.governance.json',
                    metadata: {
                        requireApproval: next.exceptionApprovals.required,
                        minApprovals: next.exceptionApprovals.minApprovals,
                        disallowSelfApproval: next.exceptionApprovals.disallowSelfApproval,
                        allowedApprovers: next.exceptionApprovals.allowedApprovers,
                        requireReason: next.exceptionApprovals.requireReason,
                        minReasonLength: next.exceptionApprovals.minReasonLength,
                        maxExpiryDays: next.exceptionApprovals.maxExpiryDays,
                        criticalRulePatterns: next.exceptionApprovals.criticalRulePatterns,
                        criticalMinApprovals: next.exceptionApprovals.criticalMinApprovals,
                        requireAuditIntegrity: next.audit.requireIntegrity,
                    },
                });
            }
            catch {
                // Non-blocking audit write.
            }
            if (options.json) {
                console.log(JSON.stringify({ path: (0, policy_governance_1.getPolicyGovernancePath)(cwd), config: next }, null, 2));
                return;
            }
            console.log(chalk.green('\n✅ Policy governance updated.\n'));
            console.log(chalk.dim(`Path: ${(0, policy_governance_1.getPolicyGovernancePath)(cwd)}`));
            console.log(chalk.dim(`Approval required: ${next.exceptionApprovals.required ? 'yes' : 'no'}`));
            console.log(chalk.dim(`Min approvals: ${next.exceptionApprovals.minApprovals}`));
            console.log(chalk.dim(`Disallow self approval: ${next.exceptionApprovals.disallowSelfApproval ? 'yes' : 'no'}`));
            console.log(chalk.dim(`Reason required: ${next.exceptionApprovals.requireReason ? 'yes' : 'no'}`));
            console.log(chalk.dim(`Min reason length: ${next.exceptionApprovals.minReasonLength}`));
            console.log(chalk.dim(`Max expiry days: ${next.exceptionApprovals.maxExpiryDays}`));
            console.log(chalk.dim(`Critical min approvals: ${next.exceptionApprovals.criticalMinApprovals}`));
            console.log(chalk.dim(`Critical rule patterns: ${next.exceptionApprovals.criticalRulePatterns.length > 0 ? next.exceptionApprovals.criticalRulePatterns.join(', ') : '(none)'}`));
            console.log(chalk.dim(`Require audit integrity: ${next.audit.requireIntegrity ? 'yes' : 'no'}`));
            console.log(chalk.dim('Commit governance + audit files so CI can enforce approval and integrity rules.'));
            console.log('');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json) {
                console.log(JSON.stringify({ error: message }, null, 2));
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ ${message}\n`));
            process.exit(1);
        }
    });
    const audit = policy
        .command('audit')
        .description('Inspect policy audit chain integrity');
    audit
        .command('verify')
        .description('Verify append-only policy audit chain integrity')
        .option('--json', 'Output as JSON')
        .action((options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const result = (0, policy_audit_1.verifyPolicyAuditIntegrity)(cwd);
        if (options.json) {
            console.log(JSON.stringify({
                path: (0, policy_audit_1.getPolicyAuditPath)(cwd),
                ...result,
            }, null, 2));
            process.exit(result.valid ? 0 : 1);
        }
        if (result.valid) {
            console.log(chalk.green('\n✅ Policy audit chain is valid.\n'));
            console.log(chalk.dim(`Path: ${(0, policy_audit_1.getPolicyAuditPath)(cwd)}`));
            console.log(chalk.dim(`Events: ${result.count}`));
            console.log(chalk.dim(`Last hash: ${result.lastHash || '(none)'}\n`));
            process.exit(0);
        }
        console.log(chalk.red('\n❌ Policy audit chain integrity check failed.\n'));
        console.log(chalk.dim(`Path: ${(0, policy_audit_1.getPolicyAuditPath)(cwd)}`));
        result.issues.forEach((issue) => console.log(chalk.red(`• ${issue}`)));
        console.log('');
        process.exit(1);
    });
    const exception = policy
        .command('exception')
        .description('Manage time-bound policy exceptions (audited allow-list)');
    exception
        .command('list')
        .description('List policy exceptions for this repository')
        .option('--org', 'List centralized organization policy exceptions from Neurcode Cloud')
        .option('--all', 'Include inactive/expired exceptions')
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        if (options.org) {
            try {
                const config = loadPolicyRuntimeConfig();
                const client = new api_client_1.ApiClient(config);
                const exceptions = await client.listOrgPolicyExceptions({ limit: 250 });
                const items = options.all
                    ? exceptions
                    : exceptions.filter((entry) => entry.effectiveState !== 'revoked' && entry.effectiveState !== 'expired');
                if (options.json) {
                    console.log(JSON.stringify({
                        source: 'org',
                        total: exceptions.length,
                        exceptions: items,
                    }, null, 2));
                    return;
                }
                if (items.length === 0) {
                    console.log(chalk.yellow('\n⚠️  No organization policy exceptions found.\n'));
                    console.log(chalk.dim('Add one: neurcode policy exception add --org --rule <pattern> --file <glob> --reason "<why>"\n'));
                    return;
                }
                console.log(chalk.bold('\n🏢 Org Policy Exceptions\n'));
                items.forEach((entry) => {
                    console.log(chalk.cyan(`• ${entry.id}`));
                    console.log(chalk.dim(`  state=${entry.effectiveState} workflow=${entry.workflowState}`));
                    console.log(chalk.dim(`  rule=${entry.rulePattern} file=${entry.filePattern}`));
                    console.log(chalk.dim(`  expires=${entry.expiresAt} active=${entry.active ? 'yes' : 'no'}`));
                    console.log(chalk.dim(`  approvals=${entry.approvalCount}` +
                        `${entry.requiredApprovals > 0 ? ` required=${entry.requiredApprovals}` : ''}` +
                        `${entry.critical ? ' critical=yes' : ''}`));
                    console.log(chalk.dim(`  reason=${entry.reason}`));
                    if (entry.ticket) {
                        console.log(chalk.dim(`  ticket=${entry.ticket}`));
                    }
                    console.log('');
                });
                console.log(chalk.dim('Source: Neurcode Cloud (/api/v1/org/policy-exceptions)\n'));
                return;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                if (options.json) {
                    console.log(JSON.stringify({ error: message }, null, 2));
                    process.exit(1);
                }
                console.error(chalk.red(`\n❌ ${message}\n`));
                process.exit(1);
            }
        }
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const data = (0, policy_exceptions_1.listPolicyExceptions)(cwd);
        const governance = (0, policy_governance_1.readPolicyGovernanceConfig)(cwd);
        const allowedApprovers = new Set(governance.exceptionApprovals.allowedApprovers.map((item) => item.toLowerCase()));
        const withStatus = data.all.map((entry) => {
            const unexpired = new Date(entry.expiresAt).getTime() > Date.now();
            let effectiveApprovals = entry.approvals;
            if (governance.exceptionApprovals.disallowSelfApproval) {
                const requested = (entry.requestedBy || entry.createdBy || '').toLowerCase();
                effectiveApprovals = effectiveApprovals.filter((item) => item.approver.toLowerCase() !== requested);
            }
            if (allowedApprovers.size > 0) {
                effectiveApprovals = effectiveApprovals.filter((item) => allowedApprovers.has(item.approver.toLowerCase()));
            }
            const requiredApprovalResolution = (0, policy_governance_1.resolveRequiredApprovalsForRule)(entry.rulePattern, governance);
            const requiredApprovals = governance.exceptionApprovals.required
                ? requiredApprovalResolution.requiredApprovals
                : 0;
            const reasonValid = !governance.exceptionApprovals.requireReason
                || (entry.reason || '').trim().length >= governance.exceptionApprovals.minReasonLength;
            const status = !entry.active || !unexpired
                ? 'inactive'
                : !reasonValid
                    ? 'invalid_reason'
                    : !governance.exceptionApprovals.required
                        ? 'active'
                        : effectiveApprovals.length >= requiredApprovals
                            ? 'approved'
                            : 'pending';
            return {
                ...entry,
                status,
                effectiveApprovals: effectiveApprovals.length,
                requiredApprovals,
                criticalRule: requiredApprovalResolution.critical,
            };
        });
        const items = options.all ? withStatus : withStatus.filter((entry) => entry.status !== 'inactive');
        if (options.json) {
            console.log(JSON.stringify({
                path: (0, policy_exceptions_1.getPolicyExceptionsPath)(cwd),
                governance,
                total: data.all.length,
                active: data.active.length,
                expired: data.expired.length,
                exceptions: items,
            }, null, 2));
            return;
        }
        if (items.length === 0) {
            console.log(chalk.yellow('\n⚠️  No policy exceptions found.\n'));
            console.log(chalk.dim('Add one: neurcode policy exception add --rule <pattern> --file <glob> --reason "<why>"\n'));
            return;
        }
        console.log(chalk.bold('\n🧾 Policy Exceptions\n'));
        items.forEach((entry) => {
            console.log(chalk.cyan(`• ${entry.id}`));
            console.log(chalk.dim(`  status=${entry.status || (entry.active ? 'active' : 'inactive')}`));
            console.log(chalk.dim(`  rule=${entry.rulePattern} file=${entry.filePattern}`));
            console.log(chalk.dim(`  expires=${entry.expiresAt} active=${entry.active ? 'yes' : 'no'}`));
            console.log(chalk.dim(`  approvals=${entry.approvals.length}` +
                `${typeof entry.effectiveApprovals === 'number' ? ` (effective=${entry.effectiveApprovals})` : ''}` +
                `${typeof entry.requiredApprovals === 'number' && entry.requiredApprovals > 0 ? ` required=${entry.requiredApprovals}` : ''}` +
                `${entry.criticalRule ? ' critical=yes' : ''}`));
            console.log(chalk.dim(`  reason=${entry.reason}`));
            console.log(chalk.dim(`  requestedBy=${entry.requestedBy || entry.createdBy || 'unknown'}`));
            if (entry.ticket) {
                console.log(chalk.dim(`  ticket=${entry.ticket}`));
            }
            console.log('');
        });
        if (!options.all && data.expired.length > 0) {
            console.log(chalk.dim(`(${data.expired.length} expired/inactive hidden; use --all)`));
        }
        console.log('');
    });
    exception
        .command('add')
        .description('Add a policy exception entry')
        .option('--org', 'Create centralized organization policy exception in Neurcode Cloud')
        .requiredOption('--rule <pattern>', 'Rule pattern (exact, wildcard, or /regex/)')
        .requiredOption('--file <pattern>', 'File pattern (exact, wildcard, or /regex/)')
        .requiredOption('--reason <text>', 'Business justification for this exception')
        .option('--ticket <id>', 'Ticket or approval reference (e.g. SEC-123)')
        .option('--severity <level>', 'Optional severity scope: allow|warn|block')
        .option('--expires-at <iso>', 'Expiry timestamp in ISO-8601')
        .option('--expires-in-days <n>', 'Expiry offset in days (default: 30)', (value) => parseInt(value, 10))
        .option('--json', 'Output as JSON')
        .action(async (options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        try {
            const severity = options.severity === 'allow' || options.severity === 'warn' || options.severity === 'block'
                ? options.severity
                : undefined;
            if (options.severity && !severity) {
                throw new Error('severity must be one of: allow, warn, block');
            }
            const expiresAt = resolveExpiresAt({
                expiresAt: options.expiresAt,
                expiresInDays: options.expiresInDays,
            });
            if (options.org) {
                const config = loadPolicyRuntimeConfig();
                const client = new api_client_1.ApiClient(config);
                const created = await client.createOrgPolicyException({
                    rulePattern: options.rule,
                    filePattern: options.file,
                    reason: options.reason,
                    ticket: options.ticket,
                    severity,
                    expiresAt,
                });
                if (options.json) {
                    console.log(JSON.stringify({
                        source: 'org',
                        exception: created,
                    }, null, 2));
                    return;
                }
                console.log(chalk.green('\n✅ Organization policy exception created\n'));
                console.log(chalk.cyan(`ID: ${created.id}`));
                console.log(chalk.dim(`State: ${created.effectiveState}`));
                console.log(chalk.dim(`Rule: ${created.rulePattern}`));
                console.log(chalk.dim(`File: ${created.filePattern}`));
                console.log(chalk.dim(`Expires: ${created.expiresAt}`));
                console.log(chalk.dim(`Approvals: ${created.approvalCount}/${created.requiredApprovals}`));
                if (created.ticket) {
                    console.log(chalk.dim(`Ticket: ${created.ticket}`));
                }
                console.log(chalk.dim('Source: Neurcode Cloud (/api/v1/org/policy-exceptions)\n'));
                return;
            }
            const governance = (0, policy_governance_1.readPolicyGovernanceConfig)(cwd);
            if (governance.exceptionApprovals.requireReason
                && options.reason.trim().length < governance.exceptionApprovals.minReasonLength) {
                throw new Error(`reason must be at least ${governance.exceptionApprovals.minReasonLength} characters (governance policy)`);
            }
            validateExceptionWindowByGovernance(expiresAt, governance.exceptionApprovals.maxExpiryDays);
            const createdBy = resolveActor();
            const created = (0, policy_exceptions_1.addPolicyException)(cwd, {
                rulePattern: options.rule,
                filePattern: options.file,
                reason: options.reason,
                ticket: options.ticket,
                severity,
                expiresAt,
                createdBy,
                requestedBy: createdBy,
            });
            const approvalResolution = (0, policy_governance_1.resolveRequiredApprovalsForRule)(created.rulePattern, governance);
            try {
                (0, policy_audit_1.appendPolicyAuditEvent)(cwd, {
                    actor: createdBy,
                    action: 'exception_added',
                    entityType: 'policy_exception',
                    entityId: created.id,
                    metadata: {
                        rulePattern: created.rulePattern,
                        filePattern: created.filePattern,
                        expiresAt: created.expiresAt,
                        requireApproval: governance.exceptionApprovals.required,
                        requiredApprovals: governance.exceptionApprovals.required
                            ? approvalResolution.requiredApprovals
                            : 0,
                        criticalRule: approvalResolution.critical,
                    },
                });
            }
            catch {
                // Non-blocking audit write.
            }
            if (options.json) {
                console.log(JSON.stringify({
                    created,
                    path: (0, policy_exceptions_1.getPolicyExceptionsPath)(cwd),
                    requiresApproval: governance.exceptionApprovals.required,
                    requiredApprovals: governance.exceptionApprovals.required
                        ? approvalResolution.requiredApprovals
                        : 0,
                    criticalRule: approvalResolution.critical,
                }, null, 2));
                return;
            }
            console.log(chalk.green('\n✅ Policy exception added\n'));
            console.log(chalk.cyan(`ID: ${created.id}`));
            console.log(chalk.dim(`Rule: ${created.rulePattern}`));
            console.log(chalk.dim(`File: ${created.filePattern}`));
            console.log(chalk.dim(`Expires: ${created.expiresAt}`));
            console.log(chalk.dim(`Reason: ${created.reason}`));
            if (governance.exceptionApprovals.required) {
                const requiredApprovals = approvalResolution.requiredApprovals;
                console.log(chalk.yellow(`Approval required: ${requiredApprovals} approver(s) before this exception is active${approvalResolution.critical ? ' (critical rule gate)' : ''}.`));
            }
            if (created.ticket) {
                console.log(chalk.dim(`Ticket: ${created.ticket}`));
            }
            console.log(chalk.dim('\nAudit tip: commit policy exception changes with approval context.\n'));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json) {
                console.log(JSON.stringify({ error: message }, null, 2));
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ ${message}\n`));
            process.exit(1);
        }
    });
    exception
        .command('approve')
        .description('Approve a policy exception by ID')
        .argument('<id>', 'Exception ID to approve')
        .option('--org', 'Approve centralized organization policy exception in Neurcode Cloud')
        .option('--by <actor>', 'Approver identity (defaults to NEURCODE_ACTOR/GITHUB_ACTOR/USER)')
        .option('--comment <text>', 'Approval comment')
        .option('--json', 'Output as JSON')
        .action(async (id, options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const approver = resolveActor(options.by);
        try {
            if (options.org) {
                if (options.by) {
                    throw new Error('--by is not supported with --org (identity comes from authenticated Neurcode user)');
                }
                const config = loadPolicyRuntimeConfig();
                const client = new api_client_1.ApiClient(config);
                const updated = await client.approveOrgPolicyException(String(id).trim(), {
                    note: options.comment,
                });
                if (options.json) {
                    console.log(JSON.stringify({
                        source: 'org',
                        approved: true,
                        exception: updated,
                    }, null, 2));
                    return;
                }
                console.log(chalk.green('\n✅ Organization policy exception approval recorded.\n'));
                console.log(chalk.dim(`ID: ${updated.id}`));
                console.log(chalk.dim(`State: ${updated.effectiveState}`));
                console.log(chalk.dim(`Approvals: ${updated.approvalCount}/${updated.requiredApprovals}`));
                console.log(chalk.dim('Source: Neurcode Cloud (/api/v1/org/policy-exceptions)\n'));
                return;
            }
            const governance = (0, policy_governance_1.readPolicyGovernanceConfig)(cwd);
            const target = (0, policy_exceptions_1.listPolicyExceptions)(cwd).all.find((entry) => entry.id === String(id).trim());
            if (!target) {
                if (options.json) {
                    console.log(JSON.stringify({ error: 'Exception not found' }, null, 2));
                    process.exit(1);
                }
                console.log(chalk.yellow('\n⚠️  Exception not found.\n'));
                process.exit(1);
            }
            const normalizedApprover = approver.toLowerCase();
            const requestedBy = (target.requestedBy || target.createdBy || '').toLowerCase();
            if (governance.exceptionApprovals.disallowSelfApproval && requestedBy && normalizedApprover === requestedBy) {
                throw new Error('self-approval is disallowed by governance policy');
            }
            if (governance.exceptionApprovals.allowedApprovers.length > 0
                && !governance.exceptionApprovals.allowedApprovers.map((item) => item.toLowerCase()).includes(normalizedApprover)) {
                throw new Error('approver is not in governance allow-list');
            }
            const updated = (0, policy_exceptions_1.approvePolicyException)(cwd, String(id).trim(), {
                approver,
                comment: options.comment,
            });
            if (!updated) {
                if (options.json) {
                    console.log(JSON.stringify({ error: 'Exception not found' }, null, 2));
                    process.exit(1);
                }
                console.log(chalk.yellow('\n⚠️  Exception not found.\n'));
                process.exit(1);
            }
            const requiredApprovalResolution = (0, policy_governance_1.resolveRequiredApprovalsForRule)(updated.rulePattern, governance);
            const acceptedApprovals = updated.approvals.filter((item) => {
                const actor = item.approver.toLowerCase();
                if (governance.exceptionApprovals.allowedApprovers.length > 0
                    && !governance.exceptionApprovals.allowedApprovers.map((entry) => entry.toLowerCase()).includes(actor)) {
                    return false;
                }
                if (governance.exceptionApprovals.disallowSelfApproval && requestedBy && actor === requestedBy) {
                    return false;
                }
                return true;
            });
            const effectiveApprovals = acceptedApprovals.length;
            try {
                (0, policy_audit_1.appendPolicyAuditEvent)(cwd, {
                    actor: approver,
                    action: 'exception_approved',
                    entityType: 'policy_exception',
                    entityId: updated.id,
                    metadata: {
                        comment: options.comment || null,
                        approvals: updated.approvals.length,
                        effectiveApprovals,
                        requiredApprovals: requiredApprovalResolution.requiredApprovals,
                        criticalRule: requiredApprovalResolution.critical,
                    },
                });
            }
            catch {
                // Non-blocking audit write.
            }
            if (options.json) {
                console.log(JSON.stringify({
                    approved: true,
                    exception: updated,
                    effectiveApprovals,
                    requiredApprovals: requiredApprovalResolution.requiredApprovals,
                    approvalSatisfied: !governance.exceptionApprovals.required
                        || effectiveApprovals >= requiredApprovalResolution.requiredApprovals,
                    criticalRule: requiredApprovalResolution.critical,
                }, null, 2));
                return;
            }
            console.log(chalk.green('\n✅ Policy exception approval recorded.\n'));
            console.log(chalk.dim(`ID: ${updated.id}`));
            console.log(chalk.dim(`Approvals: ${updated.approvals.length} (effective=${effectiveApprovals})`));
            if (governance.exceptionApprovals.required) {
                console.log(chalk.dim(`Required approvals: ${requiredApprovalResolution.requiredApprovals}${requiredApprovalResolution.critical ? ' (critical rule gate)' : ''}`));
            }
            console.log(chalk.dim(`Approver: ${approver}`));
            console.log('');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json) {
                console.log(JSON.stringify({ error: message }, null, 2));
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ ${message}\n`));
            process.exit(1);
        }
    });
    exception
        .command('reject')
        .description('Reject a pending organization policy exception by ID')
        .argument('<id>', 'Exception ID to reject')
        .requiredOption('--reason <text>', 'Reason for rejecting this exception')
        .option('--org', 'Reject centralized organization policy exception in Neurcode Cloud')
        .option('--json', 'Output as JSON')
        .action(async (id, options) => {
        if (!options.org) {
            const message = '`policy exception reject` is only supported for --org exceptions. Use `policy exception remove` for local exceptions.';
            if (options.json) {
                console.log(JSON.stringify({ error: message }, null, 2));
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ ${message}\n`));
            process.exit(1);
        }
        const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
        if (!reason) {
            const message = '--reason is required';
            if (options.json) {
                console.log(JSON.stringify({ error: message }, null, 2));
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ ${message}\n`));
            process.exit(1);
        }
        try {
            const config = loadPolicyRuntimeConfig();
            const client = new api_client_1.ApiClient(config);
            const updated = await client.rejectOrgPolicyException(String(id).trim(), { reason });
            if (options.json) {
                console.log(JSON.stringify({
                    source: 'org',
                    rejected: true,
                    exception: updated,
                }, null, 2));
                return;
            }
            console.log(chalk.green('\n✅ Organization policy exception rejected.\n'));
            console.log(chalk.dim(`ID: ${updated.id}`));
            console.log(chalk.dim(`State: ${updated.effectiveState}`));
            if (updated.rejectionReason) {
                console.log(chalk.dim(`Reason: ${updated.rejectionReason}`));
            }
            console.log(chalk.dim('Source: Neurcode Cloud (/api/v1/org/policy-exceptions)\n'));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.json) {
                console.log(JSON.stringify({ error: message }, null, 2));
                process.exit(1);
            }
            console.error(chalk.red(`\n❌ ${message}\n`));
            process.exit(1);
        }
    });
    exception
        .command('events')
        .description('Show policy exception audit events')
        .argument('<id>', 'Exception ID')
        .option('--org', 'Read centralized organization policy exception events from Neurcode Cloud')
        .option('--limit <n>', 'Maximum events to return (default: 30)', (value) => parseInt(value, 10))
        .option('--json', 'Output as JSON')
        .action(async (id, options) => {
        const exceptionId = String(id).trim();
        const limit = normalizeListLimit(options.limit, 30, 1, 300);
        if (options.org) {
            try {
                const config = loadPolicyRuntimeConfig();
                const client = new api_client_1.ApiClient(config);
                const events = await client.listOrgPolicyExceptionEvents(exceptionId, limit);
                if (options.json) {
                    console.log(JSON.stringify({
                        source: 'org',
                        exceptionId,
                        total: events.length,
                        events,
                    }, null, 2));
                    return;
                }
                if (events.length === 0) {
                    console.log(chalk.yellow('\n⚠️  No organization exception events found.\n'));
                    return;
                }
                console.log(chalk.bold('\n🧾 Organization Exception Events\n'));
                events.forEach((event) => {
                    const actor = event.actorEmail ||
                        [event.actorFirstName, event.actorLastName].filter(Boolean).join(' ').trim() ||
                        event.actorUserId ||
                        'unknown';
                    console.log(chalk.cyan(`• ${event.createdAt}  ${event.action}`));
                    console.log(chalk.dim(`  actor=${actor}`));
                    if (event.note) {
                        console.log(chalk.dim(`  note=${event.note}`));
                    }
                    console.log(chalk.dim(`  eventId=${event.id}`));
                    console.log('');
                });
                console.log(chalk.dim('Source: Neurcode Cloud (/api/v1/org/policy-exceptions/:id/events)\n'));
                return;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                if (options.json) {
                    console.log(JSON.stringify({ error: message }, null, 2));
                    process.exit(1);
                }
                console.error(chalk.red(`\n❌ ${message}\n`));
                process.exit(1);
            }
        }
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const events = (0, policy_audit_1.readPolicyAuditEvents)(cwd)
            .filter((event) => event.entityType === 'policy_exception' && event.entityId === exceptionId)
            .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
            .slice(0, limit);
        if (options.json) {
            console.log(JSON.stringify({
                source: 'local',
                exceptionId,
                total: events.length,
                events,
                path: (0, policy_audit_1.getPolicyAuditPath)(cwd),
            }, null, 2));
            return;
        }
        if (events.length === 0) {
            console.log(chalk.yellow('\n⚠️  No local exception audit events found.\n'));
            return;
        }
        console.log(chalk.bold('\n🧾 Local Exception Events\n'));
        events.forEach((event) => {
            console.log(chalk.cyan(`• ${event.timestamp}  ${event.action}`));
            console.log(chalk.dim(`  actor=${event.actor}`));
            if (event.metadata && Object.keys(event.metadata).length > 0) {
                console.log(chalk.dim(`  metadata=${JSON.stringify(event.metadata)}`));
            }
            console.log(chalk.dim(`  hash=${event.hash.slice(0, 12)}...`));
            console.log('');
        });
        console.log(chalk.dim(`Source: ${(0, policy_audit_1.getPolicyAuditPath)(cwd)}\n`));
    });
    exception
        .command('remove')
        .description('Deactivate a policy exception by ID')
        .argument('<id>', 'Exception ID to deactivate')
        .option('--org', 'Revoke centralized organization policy exception in Neurcode Cloud')
        .option('--json', 'Output as JSON')
        .action(async (id, options) => {
        if (options.org) {
            try {
                const config = loadPolicyRuntimeConfig();
                const client = new api_client_1.ApiClient(config);
                const updated = await client.revokeOrgPolicyException(String(id).trim());
                if (options.json) {
                    console.log(JSON.stringify({
                        source: 'org',
                        removed: true,
                        exception: updated,
                    }, null, 2));
                    return;
                }
                console.log(chalk.green('\n✅ Organization policy exception revoked.\n'));
                console.log(chalk.dim(`ID: ${updated.id}`));
                console.log(chalk.dim(`State: ${updated.effectiveState}`));
                console.log(chalk.dim('Source: Neurcode Cloud (/api/v1/org/policy-exceptions)\n'));
                return;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                if (options.json) {
                    console.log(JSON.stringify({ error: message }, null, 2));
                    process.exit(1);
                }
                console.error(chalk.red(`\n❌ ${message}\n`));
                process.exit(1);
            }
        }
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const removed = (0, policy_exceptions_1.revokePolicyException)(cwd, String(id).trim());
        if (removed) {
            try {
                (0, policy_audit_1.appendPolicyAuditEvent)(cwd, {
                    actor: resolveActor(),
                    action: 'exception_revoked',
                    entityType: 'policy_exception',
                    entityId: String(id).trim(),
                    metadata: {},
                });
            }
            catch {
                // Non-blocking audit write.
            }
        }
        if (options.json) {
            console.log(JSON.stringify({ removed }, null, 2));
            process.exit(removed ? 0 : 1);
        }
        if (!removed) {
            console.log(chalk.yellow('\n⚠️  Exception not found or already inactive.\n'));
            process.exit(1);
        }
        console.log(chalk.green('\n✅ Policy exception deactivated.\n'));
    });
    exception
        .command('prune')
        .description('Prune expired/inactive policy exceptions')
        .option('--json', 'Output as JSON')
        .action((options) => {
        const cwd = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const result = (0, policy_exceptions_1.pruneExpiredPolicyExceptions)(cwd);
        if (result.removed > 0) {
            try {
                (0, policy_audit_1.appendPolicyAuditEvent)(cwd, {
                    actor: resolveActor(),
                    action: 'exception_pruned',
                    entityType: 'policy_exception',
                    entityId: null,
                    metadata: {
                        removed: result.removed,
                        remaining: result.remaining,
                    },
                });
            }
            catch {
                // Non-blocking audit write.
            }
        }
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        console.log(chalk.green('\n✅ Policy exceptions pruned.\n'));
        console.log(chalk.dim(`Removed: ${result.removed}`));
        console.log(chalk.dim(`Remaining active: ${result.remaining}\n`));
    });
}
//# sourceMappingURL=policy.js.map