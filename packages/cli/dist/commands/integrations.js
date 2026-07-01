"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runIntegrationsDoctor = runIntegrationsDoctor;
exports.integrationsCommand = integrationsCommand;
/**
 * `neurcode integrations doctor` (Iteration 8 — AI Tool Compatibility Layer).
 *
 * One honest, source-free surface that tells operators exactly what enforcement
 * guarantee each host tool (Claude Code, Cursor, Codex, VS Code, GitHub Action)
 * supports, the live version posture, and the four setup commands per tool.
 *
 * This command is a READ-ONLY diagnostic: it never starts/finishes a governed
 * session, never writes the runtime manifest, and is reachable even when a
 * session is wedged (same property as `runtime repair`). It aggregates the
 * canonical capability registry + the runtime compatibility manifest; it does
 * not re-author enforcement prose.
 */
const fs_1 = require("fs");
const path_1 = require("path");
const chalk_1 = __importDefault(require("chalk"));
const integrations_doctor_1 = require("../utils/integrations-doctor");
const v0_governance_1 = require("../utils/v0-governance");
function readCliVersion() {
    try {
        const pkg = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', '..', 'package.json'), 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : null;
    }
    catch {
        return null;
    }
}
function statusBadge(status) {
    switch (status) {
        case 'ready':
            return chalk_1.default.green('ready');
        case 'needs_attention':
            return chalk_1.default.yellow('needs_attention');
        case 'not_ready':
            return chalk_1.default.red('not_ready');
        default:
            return chalk_1.default.dim('not_evaluated');
    }
}
function versionLine(check) {
    const marker = check.status === 'ok' || check.status === 'ahead_of_validated'
        ? chalk_1.default.green('•')
        : check.status === 'unknown'
            ? chalk_1.default.dim('•')
            : chalk_1.default.yellow('•');
    return `    ${marker} ${check.component}: ${chalk_1.default.dim(check.detail)}`;
}
function printTool(tool) {
    console.log(`\n${chalk_1.default.bold(tool.displayName)}  ${statusBadge(tool.status)}  ${chalk_1.default.dim(`(${tool.adapter})`)}`);
    console.log(`  Guarantee: ${tool.enforcement.guarantee}`);
    console.log(chalk_1.default.dim(`  Mode: ${tool.enforcement.mode} · ${tool.enforcement.automatic ? 'automatic' : 'cooperative/explicit'}`));
    if (tool.enforcement.enforceable.length > 0) {
        console.log(chalk_1.default.dim(`  Enforceable: ${tool.enforcement.enforceable.join('; ')}`));
    }
    if (tool.enforcement.advisoryOnly.length > 0) {
        console.log(chalk_1.default.dim(`  Advisory only: ${tool.enforcement.advisoryOnly.join('; ')}`));
    }
    console.log('  Setup:');
    console.log(`    install:  ${tool.setup.install ?? chalk_1.default.dim('n/a (see notes)')}`);
    console.log(`    activate: ${tool.setup.activate ?? chalk_1.default.dim('n/a (see notes)')}`);
    console.log(`    test:     ${tool.setup.test ?? chalk_1.default.dim('n/a')}`);
    console.log(`    repair:   ${tool.setup.repair ?? chalk_1.default.dim('n/a')}`);
    if (tool.versions.length > 0) {
        console.log('  Versions:');
        for (const check of tool.versions)
            console.log(versionLine(check));
    }
    if (tool.knownWedges.length > 0) {
        console.log(chalk_1.default.dim(`  Known limitations: ${tool.knownWedges.join(' ')}`));
    }
}
function printHuman(report) {
    console.log(chalk_1.default.bold.cyan('\n🔌 Neurcode Integrations Doctor'));
    console.log(chalk_1.default.dim(`CLI ${report.cliVersion} · manifest ${report.manifestVersion} · contract ${report.compatibilityContractVersion}`));
    console.log(`Overall: ${statusBadge(report.overallStatus)}`);
    for (const tool of report.tools)
        printTool(tool);
    console.log(chalk_1.default.bold('\nNotes'));
    for (const note of report.notes)
        console.log(chalk_1.default.dim(`  - ${note}`));
    console.log('');
}
function runIntegrationsDoctor(options = {}) {
    const cwd = options.dir || process.cwd();
    let repoRoot = cwd;
    try {
        repoRoot = (0, v0_governance_1.resolveRepoRoot)(cwd);
    }
    catch {
        /* not in a git repo — version reads degrade to null honestly */
    }
    const cliVersion = readCliVersion();
    const versions = (0, integrations_doctor_1.collectIntegrationsVersionSources)(repoRoot, cliVersion);
    const report = (0, integrations_doctor_1.buildIntegrationsCompatibilityReport)({
        generatedAt: new Date().toISOString(),
        versions,
    });
    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    }
    else {
        printHuman(report);
    }
    return report;
}
function integrationsCommand(program) {
    const integrations = program
        .command('integrations')
        .description('AI tool compatibility: enforcement guarantees, versions, and setup per host tool');
    integrations
        .command('doctor')
        .description('Show per-tool enforcement guarantee, version posture, and setup commands')
        .option('--json', 'Output machine-readable JSON')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .action((options) => {
        runIntegrationsDoctor({ json: options.json === true, dir: options.dir });
    });
}
//# sourceMappingURL=integrations.js.map