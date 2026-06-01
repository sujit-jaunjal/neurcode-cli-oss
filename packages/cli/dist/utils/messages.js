"use strict";
/**
 * Enhanced Messaging Utility
 *
 * Provides enterprise-grade, personalized CLI messaging with consistent formatting,
 * helpful error messages, and actionable next steps.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserFirstName = exports.getUserInfo = void 0;
exports.printGreeting = printGreeting;
exports.printSuccess = printSuccess;
exports.printWarning = printWarning;
exports.printError = printError;
exports.printInfo = printInfo;
exports.printSection = printSection;
exports.printStep = printStep;
exports.printProgress = printProgress;
exports.printProgressComplete = printProgressComplete;
exports.printAuthError = printAuthError;
exports.printProjectError = printProjectError;
exports.printSuccessBanner = printSuccessBanner;
exports.printCommandHelp = printCommandHelp;
exports.printWaiting = printWaiting;
exports.clearWaiting = clearWaiting;
exports.printVerificationResult = printVerificationResult;
exports.printTable = printTable;
exports.printWelcomeBanner = printWelcomeBanner;
const user_context_1 = require("./user-context");
Object.defineProperty(exports, "getUserInfo", { enumerable: true, get: function () { return user_context_1.getUserInfo; } });
Object.defineProperty(exports, "getUserFirstName", { enumerable: true, get: function () { return user_context_1.getUserFirstName; } });
// Import chalk with fallback
let chalkInstance;
try {
    chalkInstance = require('chalk');
    // Disable colors in CI environments
    if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
        chalkInstance.level = 0;
    }
}
catch {
    chalkInstance = {
        green: (str) => str,
        yellow: (str) => str,
        red: (str) => str,
        bold: (str) => str,
        dim: (str) => str,
        cyan: (str) => str,
        white: (str) => str,
        blue: (str) => str,
        magenta: (str) => str,
        gray: (str) => str,
    };
}
/**
 * Print a personalized greeting
 */
async function printGreeting(message) {
    const firstName = await (0, user_context_1.getUserFirstName)();
    console.log(chalkInstance.cyan(`\nHello ${firstName}\n`));
    console.log(chalkInstance.dim(message));
    console.log('');
}
/**
 * Print a success message with premium formatting
 */
function printSuccess(message, details) {
    console.log(chalkInstance.green(`\n${message}\n`));
    if (details) {
        console.log(chalkInstance.dim(`   ${details}`));
        console.log('');
    }
}
/**
 * Print a warning message with helpful context
 */
function printWarning(message, suggestion) {
    console.log(chalkInstance.yellow(`\n${message}\n`));
    if (suggestion) {
        console.log(chalkInstance.dim(`   ${suggestion}\n`));
    }
}
/**
 * Print an error message with actionable next steps
 */
function printError(message, error, nextSteps) {
    console.log(chalkInstance.red(`\n${message}\n`));
    if (error) {
        const errorMessage = error instanceof Error ? error.message : error;
        console.log(chalkInstance.dim(`   Error: ${errorMessage}`));
        console.log('');
    }
    if (nextSteps && nextSteps.length > 0) {
        console.log(chalkInstance.bold.white('   Next steps:'));
        nextSteps.forEach(step => {
            console.log(chalkInstance.dim(`   • ${step}`));
        });
        console.log('');
    }
}
/**
 * Print an info message
 */
function printInfo(message, details) {
    console.log(chalkInstance.cyan(`\n${message}\n`));
    if (details) {
        console.log(chalkInstance.dim(`   ${details}`));
        console.log('');
    }
}
/**
 * Print a section header with premium styling
 */
function printSection(title, marker = '>') {
    console.log(chalkInstance.bold.white(`\n${marker} ${title}\n`));
    console.log(chalkInstance.dim('─────────────────────────────────────────────────────────'));
}
/**
 * Print a step indicator
 */
function printStep(step, total, description) {
    console.log(chalkInstance.dim(`[${step}/${total}]`), chalkInstance.white(description));
}
/**
 * Print a progress indicator
 */
function printProgress(message) {
    process.stdout.write(chalkInstance.dim(`   ${message}... `));
}
/**
 * Print completion of progress
 */
function printProgressComplete(success = true) {
    if (success) {
        console.log(chalkInstance.green('✓'));
    }
    else {
        console.log(chalkInstance.red('✗'));
    }
}
/**
 * Print authentication-related errors with helpful suggestions
 */
async function printAuthError(error) {
    const errorMessage = error instanceof Error ? error.message : error;
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        printError('Authentication Failed', error, [
            'Your API key may be invalid or expired',
            'Run: neurcode login',
            'Verify your credentials in ~/.neurcoderc'
        ]);
    }
    else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        printError('Access Denied', error, [
            'Your API key may not have the required permissions',
            'Contact your administrator to verify access',
            'Try running: neurcode logout && neurcode login'
        ]);
    }
    else if (errorMessage.includes('Network') || errorMessage.includes('fetch')) {
        printError('Network Connection Failed', error, [
            'Check your internet connection',
            'Verify the API URL: neurcode doctor',
            'Check firewall/proxy settings',
            'Try again in a few moments'
        ]);
    }
    else {
        printError('Authentication Error', error);
    }
}
/**
 * Print project-related errors with helpful suggestions
 */
function printProjectError(error, projectId) {
    const errorMessage = error instanceof Error ? error.message : error;
    const nextSteps = [];
    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        nextSteps.push('The project may have been deleted or you don\'t have access');
        nextSteps.push('List your projects: neurcode init');
        nextSteps.push('Create a new project: neurcode init');
    }
    else if (!projectId) {
        nextSteps.push('No project is configured for this directory');
        nextSteps.push('Run: neurcode init');
        nextSteps.push('Or set project ID: neurcode config --project-id <id>');
    }
    else {
        nextSteps.push('Verify project configuration: neurcode doctor');
        nextSteps.push('Check project access: neurcode init');
    }
    printError('Project Error', error, nextSteps);
}
/**
 * Print a beautiful success banner
 */
async function printSuccessBanner(title, subtitle) {
    console.log('');
    console.log(chalkInstance.bold.green(title));
    if (subtitle) {
        console.log(chalkInstance.dim(subtitle));
    }
    console.log(chalkInstance.dim('-'.repeat(Math.max(48, title.length))));
    console.log('');
}
/**
 * Print command-specific help in errors
 */
function printCommandHelp(command, options) {
    console.log(chalkInstance.bold.white('\n   Usage:'));
    console.log(chalkInstance.dim(`   $ neurcode ${command}${options ? ' ' + options.join(' ') : ''}`));
    if (options && options.length > 0) {
        console.log(chalkInstance.dim('\n   Common options:'));
        options.forEach(opt => {
            console.log(chalkInstance.dim(`   ${opt}`));
        });
    }
    console.log('');
}
/**
 * Print waiting/progress message with spinner (simple version)
 */
function printWaiting(message, showDots = true) {
    if (showDots) {
        process.stdout.write(chalkInstance.dim(`   ${message}`));
    }
    else {
        console.log(chalkInstance.dim(`   ${message}`));
    }
}
/**
 * Clear waiting message
 */
function clearWaiting() {
    process.stdout.write('\r');
}
/**
 * Print verification result with detailed breakdown
 */
function printVerificationResult(passed, score, warnings, violations) {
    if (passed) {
        if (score !== undefined) {
            printSuccess(`Verification Passed`, `Your code scored ${score}% and meets all governance requirements`);
        }
        else {
            printSuccess('Verification Passed', 'Your code meets all governance requirements');
        }
    }
    else {
        const details = [];
        if (violations !== undefined && violations > 0) {
            details.push(`${violations} violation(s) found`);
        }
        if (warnings !== undefined && warnings > 0) {
            details.push(`${warnings} warning(s) found`);
        }
        if (score !== undefined) {
            details.push(`Score: ${score}%`);
        }
        printError('Verification Failed', undefined, details.length > 0 ? details : undefined);
    }
}
/**
 * Print a table-like output for structured data
 */
function printTable(rows) {
    // Find max width for each column
    const maxWidths = rows[0].map((_, colIndex) => {
        return Math.max(...rows.map(row => row[colIndex]?.length || 0));
    });
    rows.forEach((row, index) => {
        const formatted = row.map((cell, colIndex) => {
            const width = maxWidths[colIndex];
            return cell.padEnd(width);
        });
        if (index === 0) {
            console.log(chalkInstance.bold.white(formatted.join('  ')));
        }
        else {
            console.log(chalkInstance.dim(formatted.join('  ')));
        }
    });
    console.log('');
}
/**
 * Print a big welcome banner (like other enterprise CLIs)
 */
async function printWelcomeBanner() {
    const userInfo = await (0, user_context_1.getUserInfo)();
    // Subtle sophistication, not terminal theatrics. The banner identifies
    // the runtime, names the operational lifecycle, and lists the four
    // canonical next steps. No emojis, no boxes, no "AI-powered" framing -
    // the target aesthetic is Claude Code / Linear / Warp / Terraform Cloud.
    console.log('');
    console.log(`${chalkInstance.bold('neurcode')}${chalkInstance.dim('  ·  deterministic operational governance for AI-assisted engineering')}`);
    if (userInfo?.displayName || userInfo?.email) {
        const id = userInfo.displayName || userInfo.email;
        console.log(chalkInstance.dim(`            signed in as ${id}`));
    }
    console.log('');
    console.log(chalkInstance.dim('  User identity           Active workspace         Repo ownership'));
    console.log(chalkInstance.dim('  Runtime session         Governance boundary      Replay continuity'));
    console.log(chalkInstance.dim('  Intent contracts        Scope guard              Evidence lifecycle'));
    console.log('');
    console.log(`  ${chalkInstance.bold('Operational onboarding')}`);
    console.log(chalkInstance.dim('    install  ->  login  ->  init  ->  start governance lifecycle'));
    console.log('');
    console.log(`  ${chalkInstance.bold('Governance lifecycle')}`);
    console.log(chalkInstance.dim('    start  ->  verify  ->  replay  ->  remediate-export  ->  re-verify'));
    console.log('');
    console.log(`  ${chalkInstance.bold('Next steps')}`);
    console.log(chalkInstance.cyan('    neurcode login') + chalkInstance.dim('                     (connect this machine/runtime)'));
    console.log(chalkInstance.cyan('    neurcode init') + chalkInstance.dim('                      (select workspace ownership for this repo)'));
    console.log(chalkInstance.cyan('    neurcode whoami') + chalkInstance.dim('                    (inspect identity + boundary)'));
    console.log(chalkInstance.cyan('    neurcode start') + chalkInstance.dim(' "what you intend to change"'));
    console.log('');
}
//# sourceMappingURL=messages.js.map