"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeReportCommand = runtimeReportCommand;
exports.reportCommand = reportCommand;
const fs_1 = require("fs");
const runtime_evidence_1 = require("../utils/runtime-evidence");
const v0_governance_1 = require("../utils/v0-governance");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (s) => s,
        red: (s) => s,
        yellow: (s) => s,
        dim: (s) => s,
    };
}
function runtimeReportCommand(options = {}) {
    if (options.runtime !== true) {
        const message = 'Only runtime reports are supported in V0.2. Run `neurcode report --runtime`.';
        if (options.json || options.format === 'json') {
            console.log(JSON.stringify({ ok: false, error: message }, null, 2));
        }
        else {
            console.error(chalk.yellow(message));
        }
        process.exitCode = 2;
        return;
    }
    try {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        const report = (0, runtime_evidence_1.buildRuntimeEvidenceReport)(repoRoot, { since: options.since });
        const format = options.json ? 'json' : (options.format || 'markdown').toLowerCase();
        if (format !== 'json' && format !== 'markdown') {
            throw new Error(`Unsupported report format "${format}". Use markdown or json.`);
        }
        const body = format === 'json'
            ? JSON.stringify({ ok: true, ...report }, null, 2) + '\n'
            : (0, runtime_evidence_1.renderRuntimeEvidenceMarkdown)(report);
        if (options.out) {
            (0, fs_1.writeFileSync)(options.out, body, 'utf8');
            console.log(chalk.green(`Runtime report written to ${options.out}`));
            return;
        }
        process.stdout.write(body);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json || options.format === 'json') {
            console.log(JSON.stringify({ ok: false, error: message }, null, 2));
        }
        else {
            console.error(chalk.red(`Runtime report failed: ${message}`));
        }
        process.exitCode = 1;
    }
}
function reportCommand(program) {
    program
        .command('report')
        .description('Generate local governance evidence reports')
        .option('--runtime', 'Generate a report from local in-flow governance sessions')
        .option('--since <duration>', 'Limit to sessions with events in the window, e.g. 24h, 7d, 2w')
        .option('--format <format>', 'Output format: markdown | json', 'markdown')
        .option('--out <path>', 'Write report to a file')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Alias for --format json')
        .action((options) => {
        runtimeReportCommand({
            runtime: options.runtime === true,
            since: options.since,
            format: options.format,
            out: options.out,
            dir: options.dir,
            json: options.json === true,
        });
    });
}
//# sourceMappingURL=runtime-report.js.map