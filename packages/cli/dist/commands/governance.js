"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.governanceCommand = governanceCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const project_root_1 = require("../utils/project-root");
const governance_decisions_1 = require("../utils/governance-decisions");
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
}
//# sourceMappingURL=governance.js.map