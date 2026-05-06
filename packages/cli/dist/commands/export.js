"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCommand = exportCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const project_root_1 = require("../utils/project-root");
const plan_sync_1 = require("../utils/plan-sync");
const context_injector_1 = require("../mcp/context-injector");
const cli_json_1 = require("../utils/cli-json");
const chalk = (0, cli_json_1.loadChalk)();
function exportCommand(options = {}) {
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const plan = (0, plan_sync_1.ensureLocalPlan)(projectRoot);
    if (!plan.intent) {
        const message = 'No intent found. Run `neurcode start "<intent>"` first.';
        if (options.json) {
            console.log(JSON.stringify({ success: false, message }, null, 2));
            process.exit(1);
        }
        console.error(chalk.red(`\n❌ ${message}\n`));
        process.exit(1);
        return;
    }
    const policies = (0, context_injector_1.buildPolicyContext)(projectRoot);
    const compiledPolicyPath = (0, fs_1.existsSync)((0, path_1.resolve)(projectRoot, 'neurcode.policy.compiled.json'))
        ? 'neurcode.policy.compiled.json'
        : null;
    const payload = {
        intent: plan.intent,
        expectedFiles: plan.expectedFiles,
        constraints: plan.constraints,
        policyPackId: policies.policyPackId,
        policyPackVersion: policies.policyPackVersion,
        effectiveRuleCount: policies.effectiveRuleCount,
        policyRuleHints: policies.deterministicRuleHints,
        compiledPolicyPath,
        planPath: '.neurcode/plan.json',
        exportedAt: new Date().toISOString(),
    };
    const json = JSON.stringify(payload, null, 2);
    if (options.file) {
        const outPath = (0, path_1.resolve)(process.cwd(), options.file);
        (0, fs_1.writeFileSync)(outPath, json, 'utf8');
        console.log(chalk.green(`\n✓ Plan exported to ${options.file}\n`));
        console.log(chalk.dim(`  Intent:         ${payload.intent}`));
        console.log(chalk.dim(`  Expected files: ${payload.expectedFiles.length}`));
        console.log(chalk.dim(`  Constraints:    ${payload.constraints.length}`));
        console.log(chalk.dim(`  Policy pack:    ${payload.policyPackId ?? 'none'}`));
        console.log(chalk.dim(`\nAgents can consume ${options.file} for governed code generation.\n`));
        return;
    }
    if (options.json) {
        console.log(json);
        return;
    }
    // Human-readable output
    console.log(chalk.bold('\nNeurcode Plan Export\n'));
    console.log(`  ${chalk.cyan('Intent:')}         ${payload.intent}`);
    console.log(`  ${chalk.cyan('Expected files:')} ${payload.expectedFiles.join(', ') || '(none)'}`);
    if (payload.constraints.length > 0) {
        console.log(`  ${chalk.cyan('Constraints:')}    ${payload.constraints.join(', ')}`);
    }
    if (payload.policyPackId) {
        console.log(`  ${chalk.cyan('Policy pack:')}    ${payload.policyPackId}${payload.policyPackVersion ? ` v${payload.policyPackVersion}` : ''}`);
    }
    if (payload.policyRuleHints.length > 0) {
        console.log(`\n  ${chalk.cyan('Policy rule hints:')}`);
        payload.policyRuleHints.forEach((hint) => console.log(`    - ${hint}`));
    }
    console.log(chalk.dim('\n  Use --json or --file <path> to export for agent consumption.\n'));
}
//# sourceMappingURL=export.js.map