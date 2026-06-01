"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommand = runCommand;
const agent_session_launcher_1 = require("../utils/agent-session-launcher");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (s) => s,
        yellow: (s) => s,
        red: (s) => s,
        bold: (s) => s,
        dim: (s) => s,
        cyan: (s) => s,
        white: (s) => s,
    };
}
function compact(values, max = 5) {
    if (values.length === 0)
        return 'none';
    const shown = values.slice(0, max).join(', ');
    return values.length > max ? `${shown} +${values.length - max} more` : shown;
}
function render(result) {
    console.log('');
    console.log(chalk.bold('Neurcode governed AI session'));
    console.log(chalk.dim('-'.repeat(72)));
    console.log(`Repo:     ${chalk.white(result.repoRoot)}`);
    console.log(`Session:  ${chalk.cyan(result.session.sessionId)}`);
    console.log(`Goal:     ${result.session.goal}`);
    console.log(`Agent:    ${result.agent.normalized} -> ${result.agent.adapter} ` +
        chalk.dim(`(${result.agent.enforcementLevel}, ${result.agent.automatic ? 'automatic' : 'explicit events'})`));
    console.log(`Profile:  ${result.profile.refreshed ? chalk.green('refreshed') : chalk.green(result.profile.status)} ` +
        chalk.dim(`${result.profile.profileHash} / topology ${result.profile.topologyHash}`));
    console.log(`Scope:    ${result.session.scopeMode} · ${compact(result.session.allowedGlobs)}`);
    console.log(`Approve:  ${result.session.approvalRequiredGlobs.length} approval-required boundar${result.session.approvalRequiredGlobs.length === 1 ? 'y' : 'ies'}`);
    console.log(`Handshake:${' '} ${result.handshake.status} · next=${result.handshake.nextEvent ?? 'none'}`);
    console.log(chalk.dim('-'.repeat(72)));
    console.log(chalk.bold('Starter prompt'));
    console.log(result.handshake.starterPrompt);
    console.log('');
    console.log(chalk.bold('Next'));
    for (const step of result.handshake.instructions) {
        console.log(chalk.dim(`  - ${step}`));
    }
    console.log('');
    console.log(chalk.bold('Commands'));
    console.log(chalk.dim(`  Status:  ${result.commands.status}`));
    console.log(chalk.dim(`  Approve: ${result.commands.approve}`));
    console.log(chalk.dim(`  Finish:  ${result.commands.finish}`));
    if (result.agent.enforcementLevel === 'cooperative') {
        console.log(chalk.dim(`  Plan:    ${result.commands.capturePlan}`));
    }
    console.log('');
}
function runCommand(program) {
    program
        .command('run [agent]')
        .description('Start a governed AI coding session and print the agent runtime handshake')
        .requiredOption('--goal <goal>', 'Task goal for the governed AI session')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--plan <text>', 'Optional initial source-free agent plan to capture immediately')
        .option('--no-activate', 'Do not install/refresh Claude Code hooks when launching Claude')
        .option('--force-profile', 'Force refresh the repo governance profile before launch')
        .option('--json', 'Output machine-readable JSON')
        .action(async (agent, options) => {
        try {
            const result = await (0, agent_session_launcher_1.launchAgentSession)({
                agent,
                goal: options.goal || '',
                dir: options.dir,
                plan: options.plan,
                activate: options.activate !== false,
                forceProfile: options.forceProfile === true,
                actor: 'local_cli',
            });
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                render(result);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json) {
                console.log(JSON.stringify({ ok: false, error: message }, null, 2));
            }
            else {
                console.error(chalk.red(`Agent session launch failed: ${message}`));
            }
            process.exitCode = 1;
        }
    });
}
//# sourceMappingURL=run.js.map