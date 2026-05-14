"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printVerifyNextStep = printVerifyNextStep;
exports.printFirstRunAdvisoryMessage = printFirstRunAdvisoryMessage;
exports.printAdvisorySignals = printAdvisorySignals;
function printVerifyNextStep(chalk, hasIssues) {
    if (!hasIssues)
        return;
    console.log(chalk.bold('\nNext step:'));
    console.log(`  ${chalk.cyan('neurcode remediate-export --finding-index 0')}`);
    console.log(chalk.dim('  or: neurcode fix  (review deterministic guidance without transferring mutation ownership)'));
}
function printFirstRunAdvisoryMessage(chalk, demoMode) {
    console.log(chalk.cyan('\nNeurcode first-run advisory mode'));
    console.log(chalk.dim('Neurcode checks whether the current diff matches declared intent and deterministic governance rules.'));
    console.log(chalk.dim('To get full enforcement:'));
    console.log(chalk.dim('1. Declare intent with `neurcode start "<intent>"`'));
    console.log(chalk.dim('2. Re-run `neurcode verify --evidence` with scoped changes'));
    console.log(chalk.dim('3. Add compiled policy or change-contract artifacts for stricter gates when needed'));
    console.log(chalk.dim('Running in advisory mode for now.\n'));
    if (demoMode) {
        console.log(chalk.dim('Demo mode: this run is intentionally non-blocking to make evaluation easy.'));
    }
}
function printAdvisorySignals(chalk, signals, demoMode) {
    if (signals.length === 0) {
        if (demoMode) {
            console.log(chalk.dim('No high-signal advisory findings detected for this diff.'));
        }
        return;
    }
    console.log(chalk.yellow('\nAdvisory findings (non-blocking):'));
    for (const signal of signals) {
        const severityLabel = signal.severity === 'warn' ? chalk.yellow('[warn]') : chalk.dim('[info]');
        console.log(`  ${severityLabel} ${signal.title}`);
        console.log(chalk.dim(`    ${signal.detail}`));
        console.log(chalk.dim(`    Confidence: ${signal.confidence.toUpperCase()} (advisory-only)`));
        if (signal.evidence.length > 0) {
            console.log(chalk.dim(`    Evidence: ${signal.evidence.join(', ')}`));
        }
        console.log(chalk.dim(`    Structural gap: ${signal.structuralCoverageGap}`));
        console.log(chalk.dim(`    Uncertainty: ${signal.uncertainty}`));
        signal.files.forEach((file) => {
            console.log(chalk.dim(`    - ${file}`));
        });
    }
    console.log('');
}
//# sourceMappingURL=verify-guidance.js.map