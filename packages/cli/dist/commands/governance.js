"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.governanceCommand = governanceCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const contracts_1 = require("@neurcode-ai/contracts");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const project_root_1 = require("../utils/project-root");
const runtime_state_1 = require("../utils/runtime-state");
const v0_governance_1 = require("../utils/v0-governance");
const governance_decisions_1 = require("../utils/governance-decisions");
/** Fixed, source-free fixture paths that the runtime-policy preview classifies. */
const RUNTIME_POLICY_PREVIEW_FIXTURES = [
    '.env',
    'src/auth/login.ts',
    'migrations/001.sql',
    'package.json',
    'dist/x.js',
    'src/feature/x.ts',
];
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        bold: (str) => str,
        cyan: (str) => str,
        dim: (str) => str,
        green: (str) => str,
        red: (str) => str,
        yellow: (str) => str,
    };
}
function printJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
function formatDecisionScope(decision) {
    const parts = [
        decision.findingId ? `finding=${decision.findingId}` : null,
        decision.category ? `category=${decision.category}` : null,
        decision.file ? `file=${decision.file}` : null,
        decision.module ? `module=${decision.module}` : null,
        decision.service ? `service=${decision.service}` : null,
    ].filter((item) => Boolean(item));
    return parts.length > 0 ? parts.join(', ') : 'unscoped';
}
function decisionStatus(decision) {
    return (0, governance_decisions_1.isGovernanceDecisionExpired)(decision) ? 'expired' : 'active';
}
function resolveArtifactPath(pathArg) {
    return (0, path_1.resolve)(process.cwd(), pathArg);
}
function readJsonArtifact(pathArg) {
    const artifactPath = resolveArtifactPath(pathArg);
    const parsed = JSON.parse((0, fs_1.readFileSync)(artifactPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('artifact must be a JSON object');
    }
    return parsed;
}
function extractArtifactGovernanceSummary(artifact) {
    const direct = artifact.governanceVerification;
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
        const envelope = direct;
        const intentGovernance = envelope.intentGovernance;
        if (intentGovernance && typeof intentGovernance === 'object' && !Array.isArray(intentGovernance)) {
            return intentGovernance;
        }
    }
    const remediation = artifact.remediationContext;
    if (remediation && typeof remediation === 'object' && !Array.isArray(remediation)) {
        const governanceDecisions = remediation.governanceDecisions;
        if (governanceDecisions && typeof governanceDecisions === 'object' && !Array.isArray(governanceDecisions)) {
            return { governanceDecisions };
        }
    }
    return null;
}
function requireReason(options) {
    const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
    if (reason.length < 8) {
        throw new Error('provide --reason with at least 8 characters');
    }
    return reason;
}
function normalizeDecisionCategory(category) {
    if (!category || !category.trim())
        return null;
    const normalized = category.trim();
    if (!(0, governance_decisions_1.isDriftIntelligenceCategory)(normalized)) {
        throw new Error(`unsupported drift category '${normalized}'. Known categories: ${(0, governance_decisions_1.listDriftIntelligenceCategories)().join(', ')}`);
    }
    return normalized;
}
function createDecision(projectRoot, state, options) {
    const category = normalizeDecisionCategory(options.category);
    const expiresAt = (0, governance_decisions_1.resolveGovernanceDecisionExpiry)({
        expiresAt: options.expires,
        expiresInDays: options.days,
        required: state === 'temporary-exception',
    });
    const decision = (0, governance_decisions_1.buildGovernanceDecision)({
        state,
        findingId: options.finding || null,
        category,
        file: options.file || null,
        module: options.module || null,
        service: options.service || null,
        reason: requireReason(options),
        actor: (0, governance_decisions_1.resolveGovernanceActor)(projectRoot, options.actor),
        expiresAt,
        temporary: state === 'temporary-exception',
    });
    return (0, governance_decisions_1.addGovernanceDecision)(projectRoot, decision);
}
function renderDecision(decision) {
    const status = decisionStatus(decision);
    const color = status === 'expired' ? chalk.yellow : chalk.green;
    console.log(`${color(`• ${decision.id}`)} ${chalk.dim(`[${decision.state}; ${status}]`)}`);
    console.log(chalk.dim(`  Scope: ${formatDecisionScope(decision)}`));
    console.log(chalk.dim(`  Actor: ${decision.actor} @ ${decision.decidedAt}`));
    if (decision.expiresAt) {
        console.log(chalk.dim(`  Expires: ${decision.expiresAt}`));
    }
    console.log(chalk.dim(`  Reason: ${decision.reason}`));
}
function renderHygiene(summary) {
    console.log(chalk.bold.cyan('\nGovernance Hygiene'));
    console.log(chalk.dim(`Store: ${summary.sourcePath || '(none)'}`));
    console.log(chalk.dim(`Decisions: ${summary.totalDecisions} active=${summary.activeDecisions} expired=${summary.expiredDecisions}`));
    console.log(chalk.dim(`Issues: ${summary.issueCount} errors=${summary.errorCount} warnings=${summary.warningCount}`));
    if (summary.issues.length === 0) {
        console.log(chalk.green('No governance hygiene issues detected.\n'));
        return;
    }
    summary.issues.forEach((issue) => {
        const prefix = issue.severity === 'error' ? chalk.red('error') : issue.severity === 'warning' ? chalk.yellow('warning') : chalk.dim('info');
        console.log(`${prefix} ${issue.code}${issue.decisionId ? ` (${issue.decisionId})` : ''}: ${issue.message}`);
        if (issue.remediation) {
            console.log(chalk.dim(`  ${issue.remediation}`));
        }
    });
    console.log('');
}
function handleDecisionWrite(projectRoot, state, options, label) {
    // Operational lifecycle guard (hardening phase §2.2): governance
    // decisions write to .neurcode/governance/. If there's no .neurcode/
    // dir at all, surface the structured guidance panel instead of letting
    // the underlying writer produce a generic "ENOENT" or similar.
    const lifecycleState = (0, runtime_state_1.detectRuntimeState)(projectRoot);
    if (!lifecycleState.hasNeurcodeDir && !options.json) {
        const code = (0, runtime_state_1.renderRuntimeStateGuidance)('no-neurcode-dir', lifecycleState, {
            commandLabel: `neurcode governance ${state.replace('-', '-')}`,
        });
        process.exit(code);
    }
    try {
        const result = createDecision(projectRoot, state, options);
        if (options.json) {
            printJson({ success: true, ...result });
            return;
        }
        console.log(chalk.green(`\n${label}`));
        renderDecision(result.decision);
        console.log(chalk.dim(`\nStore: ${result.sourcePath}`));
        console.log(chalk.dim('Re-run `neurcode verify --evidence` to make the decision replay-visible in governance artifacts.\n'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            printJson({ success: false, error: message });
        }
        else {
            console.error(chalk.red(`\n${message}\n`));
        }
        process.exitCode = 1;
    }
}
function filterDecisions(decisions, options) {
    return decisions.filter((decision) => {
        if (options.state && decision.state !== options.state)
            return false;
        if (options.active && decisionStatus(decision) !== 'active')
            return false;
        if (options.expired && decisionStatus(decision) !== 'expired')
            return false;
        return true;
    });
}
function renderGovernanceStatus(projectRoot, json) {
    const registry = (0, governance_decisions_1.readGovernanceDecisionRegistry)(projectRoot);
    const hygiene = (0, governance_decisions_1.summarizeGovernanceDecisionHygiene)(registry);
    if (json) {
        printJson({
            storePath: (0, governance_decisions_1.getGovernanceDecisionsPath)(projectRoot),
            decisions: {
                total: registry.decisions.length,
                active: hygiene.activeDecisions,
                expired: hygiene.expiredDecisions,
                invalid: registry.invalidEntries,
            },
            hygiene,
        });
        return;
    }
    console.log(chalk.bold.cyan('\nGovernance Accountability Status'));
    console.log(chalk.dim(`Store: ${(0, governance_decisions_1.getGovernanceDecisionsPath)(projectRoot)}`));
    if (!(0, fs_1.existsSync)((0, governance_decisions_1.getGovernanceDecisionsPath)(projectRoot))) {
        console.log(chalk.yellow('No governance decisions artifact found yet.'));
        console.log(chalk.dim('Create one with `neurcode governance accept-risk`, `temporary-exception`, or `review`.\n'));
        return;
    }
    console.log(chalk.dim(`Decisions: ${registry.decisions.length} active=${hygiene.activeDecisions} expired=${hygiene.expiredDecisions}`));
    console.log(chalk.dim(`Hygiene: ${hygiene.errorCount} error(s), ${hygiene.warningCount} warning(s)`));
    const active = registry.decisions.filter((decision) => decisionStatus(decision) === 'active').slice(0, 5);
    if (active.length > 0) {
        console.log(chalk.dim('\nActive decisions:'));
        active.forEach((decision) => console.log(chalk.dim(`  • ${decision.id} ${decision.state} — ${formatDecisionScope(decision)}`)));
    }
    console.log(chalk.dim('\nRun `neurcode governance hygiene` for detailed health checks.\n'));
}
// readRuntimeGovernanceConfig joins field errors with '; '. None of the
// individual messages contain that delimiter, so this recovers the structured
// list for JSON output and credential-violation highlighting.
function splitGovernanceErrors(error) {
    if (!error)
        return [];
    return error.split('; ').map((part) => part.trim()).filter(Boolean);
}
function atomicWriteFile(path, contents, mode) {
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
    const temporaryPath = `${path}.tmp.${process.pid}`;
    (0, fs_1.writeFileSync)(temporaryPath, contents, { encoding: 'utf8', mode });
    (0, fs_1.renameSync)(temporaryPath, path);
}
// Build the source-free export manifest from the (already fail-closed-validated)
// repo governance config. credentialWrites is pinned to block; planMode mirrors
// the same reconciliation the profile builder uses (top-level wins, else policy).
function runtimePolicyManifestFromConfig(config) {
    const policy = (0, governance_runtime_1.parseRuntimeSafetyPolicyProfile)(config.runtimeSafetyPolicy);
    const planMode = config.planMode ?? policy.planMode;
    return (0, contracts_1.buildRuntimePolicyManifest)({
        approvalRequiredGlobs: config.approvalRequiredGlobs,
        sensitiveGlobs: config.sensitiveGlobs,
        safeSupportGlobs: config.safeSupportGlobs,
        ignoredGlobs: config.ignoredGlobs,
        planCoherence: config.planCoherence,
        repoSymbolDuplicateMode: config.repoSymbolDuplicateMode,
        runtimeSafetyPolicy: {
            credentialWrites: 'block',
            authRbac: policy.authRbac,
            migrations: policy.migrations,
            dependencyManifests: policy.dependencyManifests,
            infraDeploy: policy.infraDeploy,
            sensitiveSurfaces: policy.sensitiveSurfaces,
            generatedFiles: policy.generatedFiles,
            ordinaryFeatureFiles: policy.ordinaryFeatureFiles,
            planMode,
        },
    });
}
// Merge an imported manifest into an existing governance.json record, replacing
// only the runtime-policy fields the manifest owns and preserving everything
// else (e.g. localMode, architectureObligations). manifestId is intentionally
// not written into governance.json.
function mergeRuntimePolicyManifest(existing, manifest) {
    return {
        ...existing,
        approvalRequiredGlobs: manifest.approvalRequiredGlobs,
        sensitiveGlobs: manifest.sensitiveGlobs,
        safeSupportGlobs: manifest.safeSupportGlobs,
        ignoredGlobs: manifest.ignoredGlobs,
        planMode: manifest.planMode,
        planCoherence: manifest.planCoherence,
        repoSymbolDuplicateMode: manifest.repoSymbolDuplicateMode,
        runtimeSafetyPolicy: { ...manifest.runtimeSafetyPolicy },
    };
}
function previewRuntimePolicy(policy) {
    return RUNTIME_POLICY_PREVIEW_FIXTURES.map((filePath) => {
        const classification = (0, governance_runtime_1.classifyRuntimeSafetySurface)({ filePath });
        const action = (0, governance_runtime_1.resolvePolicyActionForClassification)(classification, policy);
        const reasonCodes = Array.from(new Set(classification.classifications.flatMap((item) => item.reasonCodes.map((code) => code.code))));
        return {
            filePath,
            family: classification.primaryFamily ?? 'runtime_scope',
            action,
            reasonCodes,
        };
    });
}
function effectiveRuntimeSafetyPolicy(config) {
    const policy = (0, governance_runtime_1.parseRuntimeSafetyPolicyProfile)(config.runtimeSafetyPolicy);
    return { ...policy, planMode: config.planMode ?? policy.planMode };
}
function actionColor(action) {
    switch (action) {
        case 'block':
            return chalk.red;
        case 'approval_required':
            return chalk.yellow;
        case 'warn':
            return chalk.cyan;
        default:
            return chalk.green;
    }
}
function governanceCommand(program) {
    const governance = program
        .command('governance')
        .description('Review, explain, and author repo-local governance decisions');
    governance
        .command('status')
        .description('Show repo-local governance accountability status')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        renderGovernanceStatus(projectRoot, options.json === true);
    });
    governance
        .command('decisions')
        .description('List repo-local governance decisions')
        .option('--state <state>', 'Filter by governance decision state')
        .option('--active', 'Show active decisions only')
        .option('--expired', 'Show expired decisions only')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const registry = (0, governance_decisions_1.readGovernanceDecisionRegistry)(projectRoot);
        const decisions = filterDecisions(registry.decisions, options);
        if (options.json) {
            printJson({
                sourcePath: registry.sourcePath,
                total: decisions.length,
                decisions,
                diagnostics: registry.diagnostics,
            });
            return;
        }
        console.log(chalk.bold.cyan('\nGovernance Decisions'));
        console.log(chalk.dim(`Store: ${registry.sourcePath || (0, governance_decisions_1.getGovernanceDecisionsPath)(projectRoot)}`));
        if (decisions.length === 0) {
            console.log(chalk.yellow('No matching governance decisions.\n'));
            return;
        }
        decisions.forEach(renderDecision);
        console.log('');
    });
    governance
        .command('explain')
        .description('Explain governance decisions and optional verify/evidence artifact decision lineage')
        .option('--decision <id>', 'Explain a specific decision ID')
        .option('--finding <id>', 'Show decisions targeting a specific finding ID')
        .option('--artifact <path>', 'Read governance decision summary from a verify, evidence, or remediation JSON artifact')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        try {
            const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
            const registry = (0, governance_decisions_1.readGovernanceDecisionRegistry)(projectRoot);
            const decisions = registry.decisions.filter((decision) => {
                if (options.decision && decision.id !== options.decision)
                    return false;
                if (options.finding && decision.findingId !== options.finding)
                    return false;
                return true;
            });
            const artifactSummary = options.artifact
                ? extractArtifactGovernanceSummary(readJsonArtifact(options.artifact))
                : null;
            if (options.json) {
                printJson({
                    sourcePath: registry.sourcePath,
                    decisions,
                    artifactPath: options.artifact ? resolveArtifactPath(options.artifact) : null,
                    artifactGovernance: artifactSummary,
                    diagnostics: registry.diagnostics,
                });
                return;
            }
            console.log(chalk.bold.cyan('\nGovernance Explanation'));
            console.log(chalk.dim(`Store: ${registry.sourcePath || (0, governance_decisions_1.getGovernanceDecisionsPath)(projectRoot)}`));
            if (decisions.length === 0) {
                console.log(chalk.yellow('No matching repo-local decisions found.'));
            }
            else {
                decisions.forEach(renderDecision);
            }
            if (options.artifact) {
                console.log(chalk.dim(`\nArtifact: ${resolveArtifactPath(options.artifact)}`));
                if (artifactSummary) {
                    console.log(chalk.dim(JSON.stringify(artifactSummary, null, 2)));
                }
                else {
                    console.log(chalk.yellow('No governance decision summary found in artifact.'));
                }
            }
            console.log('');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json) {
                printJson({ success: false, error: message });
            }
            else {
                console.error(chalk.red(`\n${message}\n`));
            }
            process.exitCode = 1;
        }
    });
    governance
        .command('accept-risk')
        .description('Record an accepted-risk decision for a bounded finding or drift category')
        .option('--finding <id>', 'Specific drift finding ID')
        .option('--category <category>', 'Drift category to match')
        .option('--file <path>', 'Optional file scope')
        .option('--module <path>', 'Optional module scope')
        .option('--service <name>', 'Optional service scope')
        .requiredOption('--reason <text>', 'Audit-visible justification')
        .option('--actor <id>', 'Decision actor (defaults to git user/email or environment)')
        .option('--expires <iso>', 'Optional expiry timestamp')
        .option('--days <n>', 'Optional expiry window in days', (value) => parseInt(value, 10))
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        handleDecisionWrite(projectRoot, 'accepted-risk', options, 'Accepted risk recorded');
    });
    governance
        .command('temporary-exception')
        .description('Record a bounded temporary exception with required expiry')
        .option('--finding <id>', 'Specific drift finding ID')
        .option('--category <category>', 'Drift category to match')
        .option('--file <path>', 'Optional file scope')
        .option('--module <path>', 'Optional module scope')
        .option('--service <name>', 'Optional service scope')
        .requiredOption('--reason <text>', 'Audit-visible justification')
        .option('--actor <id>', 'Decision actor (defaults to git user/email or environment)')
        .option('--expires <iso>', 'Expiry timestamp')
        .option('--days <n>', 'Expiry window in days', (value) => parseInt(value, 10))
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        handleDecisionWrite(projectRoot, 'temporary-exception', options, 'Temporary exception recorded');
    });
    governance
        .command('review')
        .description('Record a lightweight governance review decision')
        .option('--state <state>', 'Decision state (acknowledged, review-required, rollout-approved, rollout-blocked, advisory-dismissed)', 'review-required')
        .option('--finding <id>', 'Specific drift finding ID')
        .option('--category <category>', 'Drift category to match')
        .option('--file <path>', 'Optional file scope')
        .option('--module <path>', 'Optional module scope')
        .option('--service <name>', 'Optional service scope')
        .requiredOption('--reason <text>', 'Audit-visible review note')
        .option('--actor <id>', 'Decision actor (defaults to git user/email or environment)')
        .option('--expires <iso>', 'Optional expiry timestamp')
        .option('--days <n>', 'Optional expiry window in days', (value) => parseInt(value, 10))
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const allowed = new Set([
            'acknowledged',
            'review-required',
            'rollout-approved',
            'rollout-blocked',
            'advisory-dismissed',
        ]);
        const state = options.state;
        if (!allowed.has(state)) {
            const message = `unsupported review state '${options.state}'`;
            if (options.json) {
                printJson({ success: false, error: message });
            }
            else {
                console.error(chalk.red(`\n${message}\n`));
            }
            process.exitCode = 1;
            return;
        }
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        handleDecisionWrite(projectRoot, state, options, 'Governance review decision recorded');
    });
    governance
        .command('hygiene')
        .description('Check governance decisions for expired, stale, broad, or malformed entries')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
        const registry = (0, governance_decisions_1.readGovernanceDecisionRegistry)(projectRoot);
        const hygiene = (0, governance_decisions_1.summarizeGovernanceDecisionHygiene)(registry);
        if (options.json) {
            printJson(hygiene);
            return;
        }
        renderHygiene(hygiene);
        if (hygiene.errorCount > 0) {
            process.exitCode = 1;
        }
    });
    governance
        .command('validate')
        .description('Validate .neurcode/governance.json (including runtimeSafetyPolicy); exits 1 on any error')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(process.cwd());
        const result = (0, v0_governance_1.readRuntimeGovernanceConfig)(repoRoot);
        const errors = splitGovernanceErrors(result.error);
        const credentialViolations = errors.filter((message) => message.includes('credentialWrites'));
        const ok = errors.length === 0;
        if (options.json) {
            printJson({
                ok,
                path: result.path,
                exists: result.exists,
                errors,
                credentialViolations,
                runtimeSafetyPolicy: result.config.runtimeSafetyPolicy ?? null,
            });
            if (!ok)
                process.exitCode = 1;
            return;
        }
        console.log(chalk.bold.cyan('\nRuntime Governance Validation'));
        console.log(chalk.dim(`Config: ${result.path}`));
        if (!result.exists) {
            console.log(chalk.yellow('No .neurcode/governance.json found — the safe enterprise defaults apply.'));
            console.log(chalk.dim('Run `neurcode governance export` to scaffold a manifest you can edit and import.\n'));
            return;
        }
        if (ok) {
            console.log(chalk.green('Valid. credentialWrites is block (enforced in every plan mode).\n'));
            return;
        }
        if (credentialViolations.length > 0) {
            console.log(chalk.red('\nCredential invariant violations (credentialWrites must be block):'));
            credentialViolations.forEach((message) => console.log(chalk.red(`  • ${message}`)));
        }
        const otherErrors = errors.filter((message) => !credentialViolations.includes(message));
        if (otherErrors.length > 0) {
            console.log(chalk.red('\nValidation errors:'));
            otherErrors.forEach((message) => console.log(chalk.red(`  • ${message}`)));
        }
        console.log('');
        process.exitCode = 1;
    });
    governance
        .command('export')
        .description('Emit a source-free neurcode.policy.runtime.v1 manifest from .neurcode/governance.json')
        .option('--out <path>', 'Write the manifest to a file instead of stdout')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        try {
            const repoRoot = (0, v0_governance_1.resolveRepoRoot)(process.cwd());
            const result = (0, v0_governance_1.readRuntimeGovernanceConfig)(repoRoot);
            const manifest = runtimePolicyManifestFromConfig(result.config);
            const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
            if (options.out) {
                const outPath = (0, path_1.resolve)(process.cwd(), options.out);
                // 0644: the manifest is source-free governance config meant to be
                // shared/committed, unlike the credential-bearing-adjacent config file.
                atomicWriteFile(outPath, serialized, 0o644);
                if (options.json) {
                    printJson({ ok: true, out: outPath, manifestId: manifest.manifestId });
                }
                else {
                    console.log(chalk.green(`\nWrote runtime policy manifest to ${outPath}`));
                    console.log(chalk.dim('Apply it elsewhere with `neurcode governance import <path>`.\n'));
                }
                return;
            }
            // Default + --json: emit the manifest JSON to stdout (pipe-friendly).
            console.log(serialized.trimEnd());
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json) {
                printJson({ ok: false, error: message });
            }
            else {
                console.error(chalk.red(`\n${message}\n`));
            }
            process.exitCode = 1;
        }
    });
    governance
        .command('import')
        .argument('<path>', 'Path to a neurcode.policy.runtime.v1 manifest file')
        .description('Validate a runtime policy manifest and merge it into .neurcode/governance.json')
        .option('--json', 'Output machine-readable JSON')
        .action((pathArg, options) => {
        const fail = (message, errors) => {
            if (options.json) {
                printJson({ ok: false, error: message, errors: errors ?? [] });
            }
            else {
                console.error(chalk.red(`\n${message}`));
                (errors ?? []).forEach((entry) => console.error(chalk.red(`  • ${entry}`)));
                console.error('');
            }
            process.exitCode = 1;
        };
        const manifestPath = (0, path_1.resolve)(process.cwd(), pathArg);
        let raw;
        try {
            raw = (0, fs_1.readFileSync)(manifestPath, 'utf8');
        }
        catch (error) {
            fail(`Cannot read manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch (error) {
            fail(`Manifest ${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        const { manifest, errors } = (0, contracts_1.parseRuntimePolicyManifest)(parsed);
        if (errors.length > 0) {
            fail('Manifest validation failed — nothing was written.', errors);
            return;
        }
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(process.cwd());
        const configPath = (0, v0_governance_1.governanceConfigPath)(repoRoot);
        let existing = {};
        if ((0, fs_1.existsSync)(configPath)) {
            try {
                const current = JSON.parse((0, fs_1.readFileSync)(configPath, 'utf8'));
                if (current && typeof current === 'object' && !Array.isArray(current)) {
                    existing = current;
                }
            }
            catch (error) {
                fail(`Cannot merge into ${configPath}: existing file is invalid JSON (${error instanceof Error ? error.message : String(error)})`);
                return;
            }
        }
        const merged = mergeRuntimePolicyManifest(existing, manifest);
        try {
            // Atomic temp+rename, mode 0600 — mirrors persistRepoSymbolDuplicateMode.
            atomicWriteFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, 0o600);
        }
        catch (error) {
            fail(`Failed to write ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        // Re-validate what we just wrote; a clean manifest must round-trip clean.
        const reread = (0, v0_governance_1.readRuntimeGovernanceConfig)(repoRoot);
        const rereadErrors = splitGovernanceErrors(reread.error);
        if (rereadErrors.length > 0) {
            fail('Imported config failed re-validation after write.', rereadErrors);
            return;
        }
        // Refresh the derived profile so the new policy takes effect immediately.
        (0, v0_governance_1.ensureFreshGovernanceProfile)(repoRoot, { force: true });
        if (options.json) {
            printJson({
                ok: true,
                path: configPath,
                manifestId: manifest.manifestId,
                runtimeSafetyPolicy: reread.config.runtimeSafetyPolicy ?? null,
            });
            return;
        }
        console.log(chalk.green(`\nImported runtime policy into ${configPath}`));
        console.log(chalk.dim('credentialWrites is block (always). Profile refreshed.'));
        console.log(chalk.dim('Commit .neurcode/governance.json to share this policy with your team.\n'));
    });
    governance
        .command('preview')
        .description('Classify and resolve runtime-safety actions over fixed fixture paths under the effective policy')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(process.cwd());
        const result = (0, v0_governance_1.readRuntimeGovernanceConfig)(repoRoot);
        const policy = effectiveRuntimeSafetyPolicy(result.config);
        const rows = previewRuntimePolicy(policy);
        const credentialRow = rows.find((row) => row.family === 'credential_or_secret');
        if (options.json) {
            printJson({
                policyId: policy.id,
                planMode: policy.planMode,
                credentialInvariant: credentialRow?.action ?? 'block',
                fixtures: rows,
            });
            return;
        }
        console.log(chalk.bold.cyan('\nRuntime Policy Preview'));
        console.log(chalk.dim(`Policy: ${policy.id}  •  plan mode: ${policy.planMode}`));
        console.log(chalk.dim('Resolved enforcement action per representative surface:\n'));
        for (const row of rows) {
            const color = actionColor(row.action);
            console.log(`  ${color(row.action.padEnd(18))} ${row.filePath}  ${chalk.dim(`[${row.family}]`)}`);
        }
        console.log(chalk.dim('\ncredentialWrites is block in every plan mode (.env is always blocked locally).\n'));
    });
}
//# sourceMappingURL=governance.js.map