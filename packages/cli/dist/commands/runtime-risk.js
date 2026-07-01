"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRuntimeRiskCommand = registerRuntimeRiskCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const runtime_risk_pack_1 = require("../utils/runtime-risk-pack");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (s) => s,
        yellow: (s) => s,
        red: (s) => s,
        cyan: (s) => s,
        dim: (s) => s,
        bold: (s) => s,
    };
}
function readCliVersion() {
    try {
        const pkg = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', '..', 'package.json'), 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : null;
    }
    catch {
        return null;
    }
}
function actionBadge(action) {
    switch (action) {
        case 'block':
            return chalk.red('block');
        case 'approval_required':
            return chalk.yellow('approval_required');
        case 'warn':
            return chalk.cyan('warn');
        default:
            return chalk.dim('allow');
    }
}
function printCategory(category) {
    const sub = category.subLabel ? chalk.dim(` · sub-label: ${category.subLabel}`) : '';
    console.log(`\n${chalk.bold(category.label)}  ${actionBadge(category.enforcementAction)}${sub}`);
    console.log(chalk.dim(`  Family: ${category.family} · tier: ${category.truthTier} · coverage: ${category.coverage}`));
    if (category.reasonIds.length > 0) {
        console.log(chalk.dim(`  Reason codes: ${category.reasonIds.join(', ')}`));
    }
    if (category.sampleSurfaces.length > 0) {
        console.log(chalk.dim(`  Surfaces: ${category.sampleSurfaces.join(', ')}`));
    }
    for (const limitation of category.limitations) {
        console.log(chalk.dim(`  · ${limitation}`));
    }
}
function runRuntimeRiskDoctor(options) {
    const report = (0, runtime_risk_pack_1.buildRuntimeRiskPackReport)({
        generatedAt: new Date().toISOString(),
        cliVersion: readCliVersion(),
    });
    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    console.log(chalk.bold('Neurcode runtime risk pack — AppSec-adjacent runtime boundaries'));
    console.log(chalk.dim(`Schema ${report.schemaVersion} · policy ${report.policyId} · plan mode ${report.planMode} · CLI ${report.cliVersion ?? 'unknown'}`));
    console.log(chalk.dim(report.appSec.statement));
    for (const category of report.categories)
        printCategory(category);
    console.log(`\n${chalk.bold('Summary')}`);
    console.log(`  ${report.summary.totalCategories} categories · ${report.summary.enforced} enforced · ${report.summary.enforcedPartial} partial`);
    console.log(chalk.dim(`  By action — block: ${report.summary.byAction.block} · approval_required: ${report.summary.byAction.approval_required} · warn: ${report.summary.byAction.warn} · allow: ${report.summary.byAction.allow}`));
    console.log(chalk.dim(`  Families: ${report.summary.families.join(', ')}`));
    console.log(`\n${chalk.bold('What this is / is not')}`);
    for (const item of report.appSec.weDo)
        console.log(chalk.dim(`  ✓ ${item}`));
    for (const item of report.appSec.weDoNot)
        console.log(chalk.dim(`  ✗ ${item}`));
    const wiredImports = report.advisoryImports.filter((i) => i.status !== 'not_wired');
    console.log(`\n${chalk.bold('Advisory imports')} ${chalk.dim(`(${wiredImports.length} wired / ${report.advisoryImports.length} planned)`)}`);
    console.log(chalk.dim(`  Sources: ${report.advisoryImports.map((i) => `${i.source} (${i.status})`).join(', ')}`));
    console.log('');
    for (const note of report.notes)
        console.log(chalk.dim(`  ${note}`));
    console.log('');
}
function registerRuntimeRiskCommand(runtime) {
    const risk = runtime
        .command('risk')
        .description('AppSec-adjacent runtime risk boundaries the agent must obey before a write lands');
    risk
        .command('doctor')
        .description('Show the AppSec-adjacent runtime-risk categories, their kernel enforcement, and positioning')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        runRuntimeRiskDoctor({ json: options.json === true });
    });
}
//# sourceMappingURL=runtime-risk.js.map