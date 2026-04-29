"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planShowCommand = planShowCommand;
const cli_json_1 = require("../utils/cli-json");
const project_root_1 = require("../utils/project-root");
const plan_sync_1 = require("../utils/plan-sync");
const chalk = (0, cli_json_1.loadChalk)();
function planShowCommand(options = {}) {
    const projectRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const localPlan = (0, plan_sync_1.ensureLocalPlan)(projectRoot);
    if (options.json) {
        console.log(JSON.stringify({
            success: true,
            planPath: localPlan.path,
            expectedFiles: localPlan.expectedFiles,
            lastUpdated: localPlan.lastUpdated,
        }, null, 2));
        return;
    }
    console.log(chalk.bold('\nNeurcode Plan Sync'));
    console.log(chalk.dim(`Path: ${localPlan.path}`));
    console.log(chalk.dim(`Last updated: ${localPlan.lastUpdated}`));
    console.log(chalk.bold(`\nExpected files (${localPlan.expectedFiles.length}):`));
    if (localPlan.expectedFiles.length === 0) {
        console.log(chalk.dim('  (none)\n'));
        return;
    }
    localPlan.expectedFiles.forEach((file) => {
        console.log(`  - ${file}`);
    });
    console.log('');
}
//# sourceMappingURL=plan-show.js.map