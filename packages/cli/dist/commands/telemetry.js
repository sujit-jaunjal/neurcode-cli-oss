"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.telemetryCommand = telemetryCommand;
const activation_telemetry_1 = require("../utils/activation-telemetry");
const activation_proof_1 = require("../utils/activation-proof");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        bold: (s) => s,
        dim: (s) => s,
        green: (s) => s,
        yellow: (s) => s,
    };
}
function printStatus() {
    const status = (0, activation_telemetry_1.getActivationTelemetryStatus)();
    console.log(chalk.bold('Neurcode activation telemetry'));
    console.log(`  Status:       ${status.enabled ? chalk.green('on') : chalk.yellow('off')}`);
    console.log(`  Env override: ${status.envDisabled ? 'NEURCODE_TELEMETRY=0' : 'none'}`);
    console.log(`  Install ID:   ${status.anonymousInstallId}`);
    console.log(`  Queue:        ${status.queueLength} event${status.queueLength === 1 ? '' : 's'}`);
    const proof = (0, activation_proof_1.getFirstValueActivationProofQueueStatus)();
    console.log(`  Proof queue:  ${proof.queueLength} proof${proof.queueLength === 1 ? '' : 's'}`);
    console.log(chalk.dim(`  State file:   ${status.path}`));
    console.log(chalk.dim(`  Proof file:   ${proof.path}`));
    console.log(chalk.dim('  Source-free:  no source, prompts, diffs, secrets, paths, raw args, raw IP, or repo contents.'));
}
function telemetryCommand(program) {
    const cmd = program
        .command('telemetry')
        .description('Manage source-free activation telemetry');
    cmd
        .command('status')
        .description('Show telemetry status and local queue details')
        .action(() => {
        printStatus();
    });
    cmd
        .command('off')
        .description('Disable activation telemetry for this machine')
        .action(() => {
        (0, activation_telemetry_1.setActivationTelemetryEnabled)(false);
        console.log(chalk.green('Neurcode activation telemetry is off.'));
        console.log(chalk.dim('NEURCODE_TELEMETRY=0 also disables it for a single command or shell.'));
    });
    cmd
        .command('on')
        .description('Enable activation telemetry for this machine')
        .action(() => {
        (0, activation_telemetry_1.setActivationTelemetryEnabled)(true);
        console.log(chalk.green('Neurcode activation telemetry is on.'));
        if (process.env.NEURCODE_TELEMETRY === '0') {
            console.log(chalk.yellow('Current shell still has NEURCODE_TELEMETRY=0, so events remain disabled here.'));
        }
    });
    cmd
        .command('flush')
        .description('Flush queued activation telemetry now')
        .action(async () => {
        const [result, proof] = await Promise.all([
            (0, activation_telemetry_1.flushActivationTelemetry)(),
            (0, activation_proof_1.flushFirstValueActivationProofQueue)(),
        ]);
        console.log(`Flushed ${result.sent}/${result.attempted} telemetry event${result.attempted === 1 ? '' : 's'}; ${result.remaining} queued.`);
        console.log(`Flushed ${proof.synced}/${proof.attempted} activation proof${proof.attempted === 1 ? '' : 's'}; ${proof.remaining} queued, ${proof.dropped} dropped.`);
    });
}
//# sourceMappingURL=telemetry.js.map