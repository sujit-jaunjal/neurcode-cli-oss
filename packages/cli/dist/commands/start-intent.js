"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startIntentCommand = startIntentCommand;
const cli_json_1 = require("../utils/cli-json");
const project_root_1 = require("../utils/project-root");
const plan_sync_1 = require("../utils/plan-sync");
const chalk = (0, cli_json_1.loadChalk)();
function startIntentCommand(intentInput, options = {}) {
    const intent = intentInput.trim();
    if (!intent) {
        const message = 'Intent is required. Usage: neurcode start "<intent>"';
        if (options.json) {
            console.log(JSON.stringify({
                success: false,
                message,
            }, null, 2));
            process.exit(1);
            return;
        }
        console.error(chalk.red(`\n❌ ${message}\n`));
        process.exit(1);
        return;
    }
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const initialized = (0, plan_sync_1.initializeLocalPlanFromIntent)(projectRoot, intent);
    if (options.json) {
        const nextSteps = [
            'Run `neurcode generate "<what you want to implement>"`',
            'After changes, run `neurcode verify`',
            'Use `neurcode fix` if issues are found',
        ];
        console.log(JSON.stringify({
            success: true,
            intent: initialized.intent,
            detectedSignals: initialized.detectedSignals,
            expectedFiles: initialized.expectedFiles,
            constraints: initialized.constraints,
            planPath: initialized.path,
            createdAt: initialized.createdAt,
            lastUpdated: initialized.lastUpdated,
            nextSteps,
            message: 'Neurcode intent-based plan initialized.',
        }, null, 2));
        return;
    }
    console.log(chalk.bold('\nNeurcode Plan Initialization'));
    console.log(`Detected intent: ${initialized.intent}`);
    if (initialized.detectedSignals.length > 0) {
        console.log(`Detected areas: ${initialized.detectedSignals.join(', ')}`);
    }
    else {
        console.log('Detected areas: general');
    }
    console.log(chalk.bold('\nInitial expected files:'));
    initialized.expectedFiles.forEach((file) => {
        console.log(`  - ${file}`);
    });
    console.log(chalk.dim(`\nPlan saved: ${initialized.path}`));
    console.log(chalk.green('✅ Plan initialized. Plan Sync will keep expected files updated.'));
    console.log(chalk.bold('\nNext steps:'));
    console.log('1. Run `neurcode generate "<what you want to implement>"`');
    console.log('2. After changes, run `neurcode verify`');
    console.log('3. Use `neurcode fix` if issues are found\n');
}
//# sourceMappingURL=start-intent.js.map