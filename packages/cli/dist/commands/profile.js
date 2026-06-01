"use strict";
/**
 * neurcode profile
 *
 * Builds a deterministic Repo Governance Profile from:
 *   - git ls-files (paths only — no source contents)
 *   - CODEOWNERS (3 standard locations)
 *   - primary manifest (package.json / pyproject.toml / go.mod / Cargo.toml / pom.xml)
 *
 * Writes .neurcode/profile.json and prints a summary to the terminal.
 * Zero network calls. Zero code transmission. Same inputs → same profileHash.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileCommand = profileCommand;
const v0_governance_1 = require("../utils/v0-governance");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        green: (s) => s, yellow: (s) => s, red: (s) => s,
        bold: (s) => s, dim: (s) => s, cyan: (s) => s,
        white: (s) => s, blue: (s) => s, gray: (s) => s,
    };
}
// ── Renderer ─────────────────────────────────────────────────────────────────
function renderProfile(p) {
    const status = p.readiness.status === 'READY'
        ? chalk.green('● READY')
        : p.readiness.status === 'PARTIAL'
            ? chalk.yellow('● PARTIAL')
            : chalk.red('● LOW');
    console.log('');
    console.log(chalk.bold(`  REPO GOVERNANCE PROFILE — ${p.repo.name}`), '  ', status, chalk.dim(`score ${p.readiness.score}/100`));
    console.log(chalk.dim('  ' + '─'.repeat(70)));
    console.log(`  ${chalk.cyan('Stack')}            ${p.stack.primaryLanguage} · ${p.stack.frameworkEcosystem}  ${chalk.dim(`(confidence ${Math.round(p.stack.confidence * 100)}%)`)}`);
    console.log(`  ${chalk.cyan('Agent support')}    ${p.agentCompatibility.claudeCode === 'supported' ? chalk.green('✅ Claude Code') : chalk.yellow('⚡ Claude Code (best-effort)')}`);
    console.log('');
    if (p.sensitiveBoundaries.length === 0) {
        console.log(`  ${chalk.yellow('🔒 Sensitive')}     ${chalk.dim('none detected')}`);
    }
    else {
        console.log(`  ${chalk.yellow('🔒 Sensitive boundaries')} (${p.sensitiveBoundaries.length})`);
        for (const b of p.sensitiveBoundaries.slice(0, 6)) {
            console.log(`     ${chalk.dim('·')} ${chalk.white(b.glob.padEnd(36))} ${chalk.dim(b.tag)}`);
        }
        if (p.sensitiveBoundaries.length > 6) {
            console.log(chalk.dim(`     … and ${p.sensitiveBoundaries.length - 6} more`));
        }
    }
    console.log('');
    if (p.ownershipBoundaries.length === 0) {
        console.log(`  ${chalk.blue('👤 Ownership')}     ${chalk.dim('no CODEOWNERS found — add one to enable ownership governance')}`);
    }
    else {
        console.log(`  ${chalk.blue('👤 Ownership boundaries')} (${p.ownershipBoundaries.length} rules · ${p.unownedPercent}% unowned)`);
        for (const o of p.ownershipBoundaries.slice(0, 5)) {
            console.log(`     ${chalk.dim('·')} ${chalk.white(o.glob.padEnd(36))} ${chalk.dim(o.owners.join(' '))}`);
        }
        if (p.ownershipBoundaries.length > 5) {
            console.log(chalk.dim(`     … and ${p.ownershipBoundaries.length - 5} more`));
        }
    }
    console.log('');
    if (p.approvalRequiredPaths.length > 0) {
        console.log(`  ${chalk.red('⛔ Approval-required')}`);
        for (const ap of p.approvalRequiredPaths.slice(0, 4)) {
            console.log(`     ${chalk.dim('·')} ${chalk.white(ap)}`);
        }
        console.log('');
    }
    if (p.readiness.reasons.length > 0) {
        console.log(`  ${chalk.dim('Improvement hints:')}`);
        for (const r of p.readiness.reasons) {
            console.log(`     ${chalk.dim('•')} ${chalk.dim(r)}`);
        }
        console.log('');
    }
    console.log(chalk.dim('  ' + '─'.repeat(70)));
    console.log(`  ${chalk.dim('profileHash')}  ${chalk.dim(p.profileHash)}`);
    console.log(`  ${chalk.dim('topology')}     ${chalk.dim(p.topology.hash)} ${chalk.dim(`(${p.topology.trackedFileCount} tracked files)`)}`);
    console.log('');
    console.log(chalk.bold.green('  Next step:') + '  activate Neurcode for Claude Code:');
    console.log(chalk.cyan('             neurcode activate claude'));
    console.log('');
}
// ── Command ───────────────────────────────────────────────────────────────────
function profileCommand(program) {
    program
        .command('profile')
        .description('Build a deterministic Repo Governance Profile from repo metadata (zero source transmission)')
        .option('--json', 'Output machine-readable JSON')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .action((options) => {
        const cwd = options.dir ? options.dir : process.cwd();
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(cwd);
        if (!options.json) {
            console.log(chalk.dim('  Reading file tree (paths only — no source transmitted)…'));
        }
        const paths = (0, v0_governance_1.gitLsFiles)(repoRoot);
        if (paths.length === 0 && !options.json) {
            console.log(chalk.yellow('  ⚠ No files found via git ls-files. Are you in a git repository?'));
            console.log(chalk.dim('  Try running `git init && git add .` first.'));
            process.exitCode = 1;
            return;
        }
        const profile = (0, v0_governance_1.buildCurrentGovernanceProfile)(repoRoot);
        const profilePath = (0, v0_governance_1.writeGovernanceProfile)(repoRoot, profile);
        if (options.json) {
            console.log(JSON.stringify(profile, null, 2));
            return;
        }
        renderProfile(profile);
        console.log(chalk.dim(`  Profile written to: ${profilePath}`));
    });
}
//# sourceMappingURL=profile.js.map