"use strict";
/**
 * `neurcode eval` — the guided enterprise evaluation runner.
 *
 * Turns the technical evaluation from a static checklist into an interactive,
 * progress-aware flow a principal engineer can drive without a founder on the
 * call. Subcommands:
 *
 *   neurcode eval start [--fixture] [--agent <id>]  — begin / scaffold the eval
 *   neurcode eval status [--json]                   — progress + per-step facts
 *   neurcode eval next [--json]                     — the single next command
 *   neurcode eval export [--json] [--out <path>]    — source-free shareable report
 *
 * Everything here is source-free and read-only against the user's repo. The
 * only thing that writes is `--fixture` mode (a controlled local demo repo) and
 * the eval run-state / report under `.neurcode/eval/` (gitignored).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.evalCommand = evalCommand;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const v0_governance_1 = require("../utils/v0-governance");
const guided_eval_1 = require("../utils/guided-eval");
const eval_demo_command_1 = require("../utils/eval-demo-command");
let chalk;
try {
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
const EVAL_RUN_STATE_SCHEMA = 'neurcode.eval-run.v1';
function evalDir(repoRoot) {
    return (0, node_path_1.join)(repoRoot, '.neurcode', 'eval');
}
function runStatePath(repoRoot) {
    return (0, node_path_1.join)(evalDir(repoRoot), 'run-state.json');
}
function loadRunState(repoRoot) {
    const p = runStatePath(repoRoot);
    if (!(0, node_fs_1.existsSync)(p))
        return null;
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(p, 'utf8'));
    }
    catch {
        return null;
    }
}
function saveRunState(repoRoot, state) {
    const dir = evalDir(repoRoot);
    if (!(0, node_fs_1.existsSync)(dir))
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    (0, node_fs_1.writeFileSync)(runStatePath(repoRoot), JSON.stringify(state, null, 2) + '\n', 'utf8');
}
/** Resolve agent/mode from flags, falling back to the saved run-state. */
function resolveRun(options) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
    const saved = loadRunState(repoRoot);
    const agent = options.agent ? (0, guided_eval_1.normalizeGuidedEvalAgent)(options.agent) : saved?.agent ?? 'claude';
    const mode = options.fixture ? 'fixture' : saved?.mode ?? 'real';
    const fixtureDir = (0, node_path_1.join)(repoRoot, '.neurcode', 'eval', 'fixture');
    const gatherRoot = mode === 'fixture' && (0, node_fs_1.existsSync)(fixtureDir) ? fixtureDir : repoRoot;
    return { repoRoot, agent, mode, gatherRoot };
}
function buildState(run) {
    const ctx = (0, guided_eval_1.gatherGuidedEvalContext)(run.gatherRoot, { agent: run.agent, mode: run.mode });
    return (0, guided_eval_1.buildGuidedEvalState)(ctx);
}
const STATUS_TONE = {
    done: (s) => chalk.green(s),
    pending: (s) => chalk.dim(s),
    attention: (s) => chalk.yellow(s),
    not_applicable: (s) => chalk.dim(s),
};
const STATUS_GLYPH = {
    done: '✓',
    pending: '○',
    attention: '!',
    not_applicable: '–',
};
function printState(state) {
    const { summary } = state;
    console.log('');
    console.log(chalk.bold('Guided Enterprise Evaluation'));
    console.log(chalk.dim(`  agent ${state.agent} · ${state.enforcementLabel} · mode ${state.mode}`));
    const bar = '█'.repeat(Math.round(summary.percent / 10)) + '░'.repeat(10 - Math.round(summary.percent / 10));
    console.log(`  ${bar} ${summary.percent}%  ` +
        chalk.dim(`(${summary.done}/${summary.applicable} done${summary.attention ? `, ${summary.attention} need attention` : ''})`));
    console.log('');
    for (const step of state.steps) {
        const glyph = STATUS_TONE[step.status](STATUS_GLYPH[step.status]);
        const tier = chalk.dim(`[${guided_eval_1.GUIDED_EVAL_TRUTH_TIERS[step.truthTier].label}]`);
        const title = step.status === 'done' ? chalk.green(step.title) : step.title;
        console.log(`  ${glyph} ${title} ${tier}`);
        if (step.fact)
            console.log(chalk.dim(`      ${step.fact}`));
    }
    console.log('');
    if (state.nextAction) {
        console.log(chalk.bold('Next action:') + ` ${state.nextAction.title}`);
        console.log(chalk.dim(`  why: ${state.nextAction.why}`));
        for (const line of state.nextAction.command.split('\n'))
            console.log(chalk.cyan(`  ${line}`));
    }
    else if (summary.complete) {
        console.log(chalk.green('All applicable steps complete. Run `neurcode eval export` for a shareable report.'));
    }
    console.log('');
}
function evalCommand(program) {
    const evalCmd = program
        .command('eval')
        .description('Guided enterprise evaluation — progress-aware, source-free, agent-specific');
    // ── start ──────────────────────────────────────────────────────────────────
    evalCmd
        .command('start')
        .description('Begin the guided evaluation (optionally scaffold a safe local fixture)')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--agent <id>', 'Agent posture: claude | codex | cursor | vscode | copilot | action', 'claude')
        .option('--fixture', 'Create/use a controlled local demo fixture (never touches your source)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        const agent = (0, guided_eval_1.normalizeGuidedEvalAgent)(options.agent);
        const mode = options.fixture ? 'fixture' : 'real';
        let fixture = null;
        if (mode === 'fixture')
            fixture = (0, guided_eval_1.scaffoldEvalFixture)(repoRoot);
        const runState = {
            schemaVersion: EVAL_RUN_STATE_SCHEMA,
            agent,
            mode,
            startedAt: new Date().toISOString(),
            repoRootHash: '',
        };
        const run = resolveRun({ dir: options.dir, agent, fixture: options.fixture });
        const state = buildState(run);
        runState.repoRootHash = state.repoRootHash;
        saveRunState(repoRoot, runState);
        if (options.json) {
            console.log(JSON.stringify({ ok: true, runState, fixture, state }, null, 2));
            return;
        }
        console.log('');
        console.log(chalk.green('Guided evaluation started.'));
        console.log(chalk.dim(`  agent: ${agent} · mode: ${mode}`));
        if (fixture) {
            console.log('');
            console.log(chalk.bold('Safe fixture ready:') + ` ${fixture.relativeDir}`);
            console.log(chalk.dim('  A throwaway repo with a CODEOWNERS boundary. Edits here never touch your source.'));
            console.log(chalk.dim('  Run the block / approve / neighbor steps against this directory.'));
        }
        printState(state);
        console.log(chalk.dim('Run `neurcode eval status` anytime, or `neurcode eval next` for just the next step.'));
        console.log('');
    });
    // ── status ─────────────────────────────────────────────────────────────────
    evalCmd
        .command('status')
        .description('Show evaluation progress and per-step facts')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--agent <id>', 'Override the agent posture for this view')
        .option('--fixture', 'Inspect the local fixture state')
        .option('--json', 'Output machine-readable JSON (for dashboard consumption)')
        .action((options) => {
        const run = resolveRun(options);
        const state = buildState(run);
        if (options.json) {
            console.log(JSON.stringify(state, null, 2));
            return;
        }
        printState(state);
    });
    // ── next ───────────────────────────────────────────────────────────────────
    evalCmd
        .command('next')
        .description('Print exactly the next command to run for the selected agent')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--agent <id>', 'Override the agent posture')
        .option('--fixture', 'Use the local fixture state')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const run = resolveRun(options);
        const state = buildState(run);
        if (options.json) {
            console.log(JSON.stringify({ nextAction: state.nextAction, complete: state.summary.complete }, null, 2));
            return;
        }
        if (!state.nextAction) {
            console.log(chalk.green('Nothing pending — all applicable steps are complete.'));
            console.log(chalk.dim('Run `neurcode eval export` for a shareable source-free report.'));
            return;
        }
        console.log('');
        console.log(chalk.bold(`Next: ${state.nextAction.title}`));
        console.log(chalk.dim(`  ${state.nextAction.why}`));
        for (const line of state.nextAction.command.split('\n'))
            console.log(chalk.cyan(`  ${line}`));
        console.log('');
    });
    // ── export ─────────────────────────────────────────────────────────────────
    evalCmd
        .command('export')
        .description('Write a shareable, source-free evaluation report')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--agent <id>', 'Override the agent posture')
        .option('--fixture', 'Export the local fixture evaluation')
        .option('--out <path>', 'Output path for the JSON report (default: .neurcode/eval/guided-eval-report.json)')
        .option('--json', 'Print the report JSON to stdout instead of a summary')
        .action((options) => {
        const run = resolveRun(options);
        const ctx = (0, guided_eval_1.gatherGuidedEvalContext)(run.gatherRoot, { agent: run.agent, mode: run.mode });
        const state = (0, guided_eval_1.buildGuidedEvalState)(ctx);
        const report = (0, guided_eval_1.buildGuidedEvalReport)(state, ctx);
        const markdown = (0, guided_eval_1.renderGuidedEvalReportMarkdown)(report);
        // Source-free backstop before anything is written or printed.
        (0, guided_eval_1.assertGuidedEvalSourceFree)(report, 'guided-eval report (json)');
        (0, guided_eval_1.assertGuidedEvalSourceFree)(markdown, 'guided-eval report (markdown)');
        const dir = evalDir(run.repoRoot);
        if (!(0, node_fs_1.existsSync)(dir))
            (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        const jsonPath = options.out ? (0, node_path_1.resolve)(run.repoRoot, options.out) : (0, node_path_1.join)(dir, 'guided-eval-report.json');
        const mdPath = jsonPath.replace(/\.json$/, '.md');
        (0, node_fs_1.writeFileSync)(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
        (0, node_fs_1.writeFileSync)(mdPath, markdown, 'utf8');
        if (options.json) {
            console.log(JSON.stringify(report, null, 2));
            return;
        }
        console.log('');
        console.log(chalk.green('Evaluation report written (source-free).'));
        console.log(`  JSON:     ${chalk.cyan(jsonPath)}`);
        console.log(`  Markdown: ${chalk.cyan(mdPath)}`);
        console.log(chalk.dim(`  ${report.result.done}/${report.result.applicable} applicable steps done (${report.result.percent}%) · agent ${report.agent}`));
        console.log(chalk.dim('  Contains paths, owners, symbol names, hashes, verdicts, and tiers only — no source.'));
        console.log('');
    });
    // ── demo ─────────────────────────────────────────────────────────────────────
    evalCmd
        .command('demo')
        .description('Run the complete one-command local enterprise demo against a safe fixture')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--agent <id>', 'Agent posture: claude | codex | cursor | vscode | copilot', 'claude')
        .option('--fixture', 'Use the safe local fixture (default and only mode in V1)')
        .option('--preflight', 'Only run the buyer-friendly preflight checks, then stop')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        // Delegates to the shared front-door body so `eval demo` and `pilot start`
        // can never drift — same engine, same renderer, same exit code.
        (0, eval_demo_command_1.runEvalDemoCommandAction)(options);
    });
    // ── doctor ───────────────────────────────────────────────────────────────────
    evalCmd
        .command('doctor')
        .description('Buyer-friendly preflight — environment, CLI, repo, fixture, and trust posture')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--agent <id>', 'Agent posture for the report', 'claude')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        // `eval doctor` is the preflight-only view of the shared front-door body.
        (0, eval_demo_command_1.runEvalDemoCommandAction)({ ...options, preflight: true });
    });
}
//# sourceMappingURL=eval.js.map