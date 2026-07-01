"use strict";
/**
 * Shared front-door command body for the one-command enterprise demo.
 *
 * Both `neurcode eval demo` and the headline `neurcode pilot start` delegate to
 * {@link runEvalDemoCommandAction}, so `pilot start` is a genuinely thin alias to
 * the same {@link runEvalDemo} engine — there is exactly one governance loop and
 * one renderer, never a fork. Keep all demo presentation here so the two entry
 * points can never drift.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.printPreflight = printPreflight;
exports.printDemoResult = printDemoResult;
exports.runEvalDemoCommandAction = runEvalDemoCommandAction;
const v0_governance_1 = require("./v0-governance");
const guided_eval_1 = require("./guided-eval");
const eval_demo_1 = require("./eval-demo");
let chalk;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (s) => s,
        yellow: (s) => s,
        red: (s) => s,
        dim: (s) => s,
        bold: (s) => s,
        cyan: (s) => s,
    };
}
const PREFLIGHT_GLYPH = {
    ok: (s) => chalk.green(s),
    warn: (s) => chalk.yellow(s),
    info: (s) => chalk.dim(s),
};
const PREFLIGHT_MARK = { ok: '✓', warn: '!', info: '·' };
function printPreflight(preflight) {
    console.log('');
    console.log(chalk.bold('Neurcode evaluation preflight'));
    console.log(chalk.dim(`  agent ${preflight.agent} · ${preflight.ok ? 'ready' : 'needs attention'}`));
    console.log('');
    for (const check of preflight.checks) {
        const mark = PREFLIGHT_GLYPH[check.status](PREFLIGHT_MARK[check.status]);
        console.log(`  ${mark} ${chalk.bold(check.label)}: ${check.detail}`);
        if (check.recovery)
            console.log(chalk.dim(`      → ${check.recovery}`));
    }
    console.log('');
    console.log(preflight.backendSigningConfigured
        ? chalk.dim('  Evidence will be backend-signed where a receipt verifies.')
        : chalk.dim('  Evidence will be a self-attested local record (honest default).'));
    console.log(chalk.cyan('  Next: neurcode pilot start --agent ' + preflight.agent));
    console.log('');
}
const DEMO_TONE = {
    pass: (s) => chalk.green(s),
    fail: (s) => chalk.red(s),
    advisory: (s) => chalk.yellow(s),
    skipped: (s) => chalk.dim(s),
};
const DEMO_MARK = { pass: '✓', fail: '✗', advisory: '~', skipped: '–' };
function printDemoResult(result) {
    const { report, summary } = result;
    console.log('');
    console.log(chalk.bold('Enterprise Self-Serve Evaluation — demo complete'));
    console.log(chalk.dim(`  agent ${result.agent} · ${report.enforcementLabel}`));
    console.log('');
    for (const c of result.checkpoints) {
        const mark = DEMO_TONE[c.status](DEMO_MARK[c.status]);
        const title = c.status === 'pass' ? chalk.green(c.title) : c.status === 'fail' ? chalk.red(c.title) : c.title;
        console.log(`  ${mark} ${title} ${chalk.dim('— ' + c.observed)}`);
    }
    console.log('');
    console.log(result.ok
        ? chalk.green(`  Core governance loop held (${report.result.passed}/${report.result.total} checkpoints).`)
        : chalk.red(`  ${report.result.criticalFailures} critical checkpoint(s) failed — see the report.`));
    console.log('');
    // Runtime Safety Kernel evidence (surfaced from the AI Change Record, source-free).
    const rs = summary.runtimeSafety;
    if (rs?.present) {
        console.log(chalk.bold('  Runtime safety evidence:'));
        console.log(chalk.dim(`    Plan mode: ${rs.planMode ?? 'not set (observe)'} · source uploaded: ${rs.sourceUploaded ? 'yes' : 'no'}`));
        console.log(chalk.dim(`    Sensitive surfaces attempted: ${rs.sensitiveSurfacesAttempted.length} · blocked: ${rs.pathsBlocked.length} · approved: ${rs.pathsApproved.length} · plan drift: ${rs.planDriftDetected ? 'yes' : 'no'}`));
        console.log('');
    }
    console.log(chalk.bold('  Evidence trust posture:'));
    console.log(chalk.dim(`    ${summary.trustPosture.label}`));
    console.log('');
    console.log(chalk.bold('  Readiness:'));
    console.log(chalk.dim(`    Founder demo: ${summary.verdict.founderDemo}`));
    console.log(chalk.dim(`    Design-partner pilot: ${summary.verdict.designPartnerPilot}`));
    console.log(chalk.dim(`    Serious enterprise pilot: ${summary.verdict.seriousEnterprisePilot}`));
    console.log('');
    console.log(chalk.bold('  Artifacts (source-free, gitignored):'));
    console.log(`    Report:  ${chalk.cyan(result.artifacts.reportMarkdownPath)}`);
    console.log(`    Summary: ${chalk.cyan(result.artifacts.summaryJsonPath)}`);
    console.log('');
    console.log(chalk.dim('  Paste the summary JSON into the dashboard Enterprise Evaluation page to render it.'));
    console.log(chalk.cyan(`  Next: ${summary.recommendedNextCommand}`));
    console.log('');
}
/**
 * The shared action body for `eval demo` and `pilot start`. Resolves the repo
 * root, runs preflight (or the full loop), renders the result, and sets the exit
 * code. Returns nothing — it owns `process.exitCode` exactly as the original
 * `eval demo` action did, so the two front doors are byte-identical in behavior.
 */
function runEvalDemoCommandAction(options) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const agent = (0, guided_eval_1.normalizeGuidedEvalAgent)(options.agent);
    if (options.preflight) {
        const preflight = (0, eval_demo_1.buildEvalDemoPreflight)(repoRoot, { agent });
        if (options.json) {
            console.log(JSON.stringify(preflight, null, 2));
        }
        else {
            printPreflight(preflight);
        }
        process.exitCode = preflight.ok ? 0 : 1;
        return;
    }
    const result = (0, eval_demo_1.runEvalDemo)({
        repoRoot,
        agent,
        onStep: options.json ? undefined : (line) => console.log(chalk.dim(`  ${line}`)),
    });
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = result.ok ? 0 : 1;
        return;
    }
    printDemoResult(result);
    process.exitCode = result.ok ? 0 : 1;
}
//# sourceMappingURL=eval-demo-command.js.map