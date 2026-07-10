#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const fs_1 = require("fs");
const path_1 = require("path");
const contracts_1 = require("@neurcode-ai/contracts");
// Import chalk with fallback
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        yellow: (str) => str,
    };
}
const check_1 = require("./commands/check");
const revert_1 = require("./commands/revert");
const refactor_1 = require("./commands/refactor");
const security_1 = require("./commands/security");
const ask_1 = require("./commands/ask");
const plan_1 = require("./commands/plan");
const plan_show_1 = require("./commands/plan-show");
const plan_slo_1 = require("./commands/plan-slo");
const repo_1 = require("./commands/repo");
const apply_1 = require("./commands/apply");
const verify_1 = require("./commands/verify");
const pilot_report_1 = require("./commands/pilot-report");
const prompt_1 = require("./commands/prompt");
const ship_1 = require("./commands/ship");
const remediate_1 = require("./commands/remediate");
const remediate_governance_1 = require("./commands/remediate-governance");
const fix_1 = require("./commands/fix");
const remediate_export_1 = require("./commands/remediate-export");
const generate_1 = require("./commands/generate");
const config_1 = require("./commands/config");
const map_1 = require("./commands/map");
const allow_1 = require("./commands/allow");
const approve_1 = require("./commands/approve");
const watch_1 = require("./commands/watch");
const simulate_1 = require("./commands/simulate");
const login_1 = require("./commands/login");
const logout_1 = require("./commands/logout");
const init_1 = require("./commands/init");
const whoami_1 = require("./commands/whoami");
const doctor_1 = require("./commands/doctor");
const runtime_authority_1 = require("./utils/runtime-authority");
const v0_governance_1 = require("./utils/v0-governance");
const session_1 = require("./commands/session");
const brain_1 = require("./commands/brain");
const policy_1 = require("./commands/policy");
const audit_1 = require("./commands/audit");
const contract_1 = require("./commands/contract");
const feedback_1 = require("./commands/feedback");
const guard_1 = require("./commands/guard");
const bootstrap_1 = require("./commands/bootstrap");
const quickstart_1 = require("./commands/quickstart");
const home_1 = require("./commands/home");
const onboard_1 = require("./commands/onboard");
const setup_1 = require("./commands/setup");
const telemetry_1 = require("./commands/telemetry");
const bootstrap_policy_1 = require("./commands/bootstrap-policy");
const messages_1 = require("./utils/messages");
const config_2 = require("./config");
const start_intent_1 = require("./commands/start-intent");
const patch_apply_1 = require("./commands/patch-apply");
const server_1 = require("./daemon/server");
const export_1 = require("./commands/export");
const control_plane_1 = require("./commands/control-plane");
const workspace_1 = require("./commands/workspace");
const replay_1 = require("./commands/replay");
const governance_1 = require("./commands/governance");
const profile_1 = require("./commands/profile");
const session_hook_1 = require("./commands/session-hook");
const runtime_adapter_1 = require("./commands/runtime-adapter");
const agent_1 = require("./commands/agent");
const activate_1 = require("./commands/activate");
const cursor_1 = require("./commands/cursor");
const integrations_1 = require("./commands/integrations");
const run_1 = require("./commands/run");
const runtime_doctor_1 = require("./commands/runtime-doctor");
const runtime_report_1 = require("./commands/runtime-report");
const runtime_sync_1 = require("./commands/runtime-sync");
const runtime_1 = require("./commands/runtime");
const ops_1 = require("./commands/ops");
const admission_1 = require("./commands/admission");
const demo_1 = require("./commands/demo");
const eval_1 = require("./commands/eval");
const pilot_1 = require("./commands/pilot");
const execution_bus_1 = require("./utils/execution-bus");
const execution_actions_1 = require("./utils/execution-actions");
const cli_startup_1 = require("./utils/cli-startup");
const command_budget_1 = require("./utils/command-budget");
const activation_telemetry_1 = require("./utils/activation-telemetry");
// Read version from package.json
let version = '0.1.2'; // fallback
try {
    const packageJsonPath = (0, path_1.join)(__dirname, '../package.json');
    const packageJson = JSON.parse((0, fs_1.readFileSync)(packageJsonPath, 'utf-8'));
    version = packageJson.version || version;
}
catch (error) {
    // If we can't read package.json, use fallback
}
(0, cli_startup_1.runStartupConsistencyChecks)({
    bundledCliDir: (0, path_1.join)(__dirname),
    argv: process.argv,
});
const program = new commander_1.Command();
const CORE_WORKFLOW_STEPS = [
    {
        command: 'npx -y @neurcode-ai/cli@latest setup',
        description: 'Resume login, repository, Brain, and agent setup from the first incomplete stage',
    },
    {
        command: 'npx -y @neurcode-ai/cli@latest eval demo --fixture --agent codex',
        description: 'Run the complete enterprise evaluation in a safe local fixture',
    },
    {
        command: 'neurcode eval start --agent codex --fixture',
        description: 'Begin the guided buyer evaluation and continue step by step',
    },
    {
        command: 'neurcode agent start codex --goal "<task>"',
        description: 'Start a governed session for non-Claude agents using the universal runtime handshake',
    },
    {
        command: 'neurcode run claude --goal "<task>"',
        description: 'Start a governed AI coding session and print the agent runtime handshake',
    },
    {
        command: 'neurcode activate claude --connect <token>',
        description: 'Install Claude Code governance hooks, pair the repo, and enable runtime evidence auto-sync',
    },
    {
        command: 'neurcode status',
        description: 'Inspect the active in-flow governance session and latest boundary block',
    },
    {
        command: 'neurcode runtime cloud-status',
        description: 'Read dashboard-visible live session, approval, transport, and ingestion state',
    },
    {
        command: 'neurcode ops status',
        description: 'Check CLI/npm, API, dashboard, runtime backend, receipts, Action, and release posture',
    },
    {
        command: 'neurcode report --runtime',
        description: 'Summarize blocked edits, approvals, owners, and replay records across sessions',
    },
    {
        command: 'neurcode sync --runtime',
        description: 'Manual fallback upload for finished in-flow session records',
    },
    {
        command: 'neurcode admission export',
        description: 'Export the latest source-free runtime admission record for the GitHub Action',
    },
    {
        command: 'neurcode demo rehearse',
        description: 'Print the canonical production demo rehearsal protocol',
    },
    {
        command: 'neurcode login',
        description: 'Connect this machine/runtime to Neurcode with browser approval',
    },
    {
        command: 'neurcode init',
        description: 'Bind this repository to a personal or organization workspace',
    },
    {
        command: 'neurcode start "<intent>"',
        description: 'Declare governance context for a bounded implementation scope',
    },
    {
        command: 'neurcode replay --json',
        description: 'Inspect deterministic replay and source-free runtime receipts',
    },
    {
        command: 'neurcode brain impact --summary',
        description: 'Inspect source-free repo impact, owners, tests, and reviewer questions',
    },
];
const CANONICAL_OPERATOR_COMMAND_NAMES = new Set([
    'setup',
    'activate',
    'agent',
    'run',
    'status',
    'runtime',
    'eval',
    'sessions',
    'report',
    'sync',
    'admission',
    'demo',
    'start',
    'quickstart',
    'replay',
]);
const ENTERPRISE_OPERATIONS_COMMAND_NAMES = new Set([
    'policy',
    'governance',
    'workspace',
    'control-plane',
    'doctor',
    'compat',
    'login',
    'logout',
    'init',
    'whoami',
    'config',
    'repo',
    'approve',
    'bootstrap-policy',
]);
const RUNTIME_ENGINEERING_COMMAND_NAMES = new Set([
    'audit',
    'contract',
    'feedback',
    'guard',
    'bootstrap',
    'map',
    'execute',
    'executions',
    'session',
    'brain',
]);
function shouldRouteJsonLegacyCommandThroughExecutionBus(jsonEnabled) {
    if (!jsonEnabled)
        return false;
    if (process.env.NEURCODE_EXECUTION_CHILD === '1')
        return false;
    if (process.env.NEURCODE_LEGACY_JSON_DIRECT === '1')
        return false;
    return true;
}
function emitJsonPayloadWithExitCode(payload, exitCode) {
    console.log(JSON.stringify(payload, null, 2));
    if (typeof exitCode === 'number' && Number.isFinite(exitCode)) {
        process.exitCode = exitCode;
    }
}
function formatCoreWorkflowStep(step) {
    return `  * ${step.command.padEnd(28)} ${step.description}`;
}
function collectCommandLayer(root, commandNames, preferredOrder) {
    const visible = new Set(root.commands
        .map((subcommand) => subcommand.name())
        .filter((commandName) => commandName !== 'help' && commandNames.has(commandName)));
    const ordered = preferredOrder.filter((commandName) => visible.has(commandName));
    const remainder = [...visible]
        .filter((commandName) => !preferredOrder.includes(commandName))
        .sort((left, right) => left.localeCompare(right));
    return [...ordered, ...remainder];
}
function buildAdvancedLegacyHints(root) {
    const fallbackCommands = root.commands
        .map((subcommand) => subcommand.name())
        .filter((commandName) => commandName !== 'help'
        && !CANONICAL_OPERATOR_COMMAND_NAMES.has(commandName))
        .sort((left, right) => left.localeCompare(right));
    return fallbackCommands.map((commandName) => `neurcode ${commandName}`);
}
function configurePrimaryHelpView(root) {
    const primaryOrder = ['setup', 'activate', 'agent', 'run', 'status', 'runtime', 'ops', 'sessions', 'report', 'sync', 'admission', 'demo', 'login', 'init', 'start', 'quickstart', 'replay'];
    root.configureHelp({
        visibleCommands: (command) => {
            const filtered = command.commands.filter((subcommand) => {
                const commandName = subcommand.name();
                return commandName === 'help' || commandName === 'login' || commandName === 'init' || CANONICAL_OPERATOR_COMMAND_NAMES.has(commandName);
            });
            return filtered.sort((left, right) => {
                const leftIndex = primaryOrder.indexOf(left.name());
                const rightIndex = primaryOrder.indexOf(right.name());
                const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
                const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
                return leftRank - rightRank;
            });
        },
    });
}
function printCoreWorkflowGuide() {
    // Operational lifecycle guide. Same aesthetic as the welcome banner and
    // neurcode home - subtle sophistication, no emoji ornaments, info dense.
    // The lifecycle bar mirrors what the welcome banner shows so identity is
    // coherent across surfaces. (See docs/ux/final-operational-experience-report.md.)
    console.log('');
    console.log(`${chalk.bold('neurcode')}${chalk.dim('  ·  operational lifecycle')}`);
    console.log('');
    console.log(chalk.dim('  connect repo  ->  activate agent  ->  govern session  ->  approve exact path  ->  export evidence'));
    console.log('');
    console.log(`  ${chalk.bold('Canonical commands')}`);
    CORE_WORKFLOW_STEPS.forEach((step) => console.log(chalk.dim(formatCoreWorkflowStep(step))));
    console.log('');
    console.log(chalk.dim('  See ') + chalk.cyan('neurcode home') + chalk.dim(' for current runtime state. ') +
        chalk.dim('Run ') + chalk.cyan('neurcode whoami') + chalk.dim(' to inspect user/workspace/repo identity.'));
    console.log('');
}
function formatCommandList(commandNames) {
    return commandNames.length > 0
        ? commandNames.map((commandName) => `  * neurcode ${commandName}`)
        : ['  * (none)'];
}
function renderHelpFooter(root) {
    const enterpriseOperations = collectCommandLayer(root, ENTERPRISE_OPERATIONS_COMMAND_NAMES, [
        'policy',
        'governance',
        'workspace',
        'control-plane',
        'doctor',
        'compat',
        'login',
        'logout',
        'init',
        'whoami',
        'config',
        'repo',
        'approve',
        'bootstrap-policy',
    ]);
    const runtimeEngineering = collectCommandLayer(root, RUNTIME_ENGINEERING_COMMAND_NAMES, [
        'audit',
        'contract',
        'feedback',
        'guard',
        'bootstrap',
        'map',
        'execute',
        'executions',
        'session',
        'brain',
    ]);
    return [
        '',
        'Core Workflow',
        ...CORE_WORKFLOW_STEPS.map((step) => formatCoreWorkflowStep(step)),
        '',
        'Enterprise Operations',
        ...formatCommandList(enterpriseOperations),
        '',
        'Runtime Engineering',
        ...formatCommandList(runtimeEngineering),
        '',
        'Compatibility commands from the older plan/verify/ship era remain callable for existing CI and migration workflows, but are intentionally absent from first-run help.',
        'Run `neurcode <command> --help` for command-specific details.',
    ].join('\n');
}
const SAFE_SUBCOMMAND_FAMILIES = {
    agent: new Set(['setup', 'bootstrap', 'check', 'start']),
    brain: new Set(['status', 'index', 'repo-status', 'repo-index', 'readiness']),
    onboard: new Set(['status', 'next']),
    repo: new Set(['connect', 'init']),
    'session-hook': new Set(['start', 'check', 'approve', 'finish']),
    telemetry: new Set(['status', 'off', 'on', 'flush']),
};
function isCommandFamilyToken(value) {
    return typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/i.test(value);
}
function inferCommandFamily(args) {
    if (args.length === 0)
        return 'help';
    if (args.includes('--version') || args.includes('-V'))
        return 'version';
    const commandTokens = args.filter((arg) => !arg.startsWith('-') && isCommandFamilyToken(arg));
    const firstCommand = commandTokens[0];
    if (!firstCommand)
        return 'root';
    const secondCommand = commandTokens[1];
    const allowedSecond = SAFE_SUBCOMMAND_FAMILIES[firstCommand];
    if (allowedSecond && secondCommand && allowedSecond.has(secondCommand)) {
        return `${firstCommand}:${secondCommand}`;
    }
    return firstCommand;
}
program
    .name('neurcode')
    .description('Intent-aware deterministic governance infrastructure for AI-assisted engineering')
    .version(version);
// Show welcome banner before parsing (for help or unauthenticated users)
async function showWelcomeIfNeeded() {
    if (!process.env.CI && process.stdout.isTTY) {
        const args = process.argv.slice(2);
        const isHelp = args.length === 0 || args.includes('--help') || args.includes('-h');
        // Show welcome for help or if no API key is set (first-time users)
        if (isHelp || !(0, config_2.getApiKey)()) {
            await (0, messages_1.printWelcomeBanner)();
        }
    }
}
// Call before parsing
showWelcomeIfNeeded().catch(() => {
    // Ignore errors in welcome banner (non-critical)
});
program
    .command('start [intent...]')
    .description('Declare governance intent and initialize bounded change context')
    .option('--run-init', 'Run `neurcode init` immediately after showing the guide')
    .option('--json', 'Output machine-readable onboarding metadata')
    .action(async (intentParts, options) => {
    const intentText = Array.isArray(intentParts)
        ? intentParts.join(' ')
        : typeof intentParts === 'string'
            ? intentParts
            : '';
    const trimmedIntent = intentText.trim();
    if (trimmedIntent.length > 0) {
        (0, start_intent_1.startIntentCommand)(trimmedIntent, {
            json: options.json === true,
        });
        return;
    }
    if (options.json) {
        console.log(JSON.stringify({
            command: 'start',
            coreWorkflow: CORE_WORKFLOW_STEPS,
            advancedHints: buildAdvancedLegacyHints(program),
            timestamp: new Date().toISOString(),
        }, null, 2));
        if (options.runInit === true) {
            await (0, init_1.initCommand)();
        }
        return;
    }
    printCoreWorkflowGuide();
    if (options.runInit === true) {
        await (0, init_1.initCommand)();
    }
    else {
        console.log(chalk.dim('Tip: run `neurcode start --run-init` to begin setup immediately.\n'));
    }
});
program
    .command('check')
    .description('Analyze git diff for risky changes')
    .option('--staged', 'Check staged changes (git diff --staged)')
    .option('--head', 'Check changes against HEAD (git diff HEAD)')
    .option('--base <ref>', 'Check changes against a specific base ref')
    .option('--online', 'Send diff to Neurcode API for analysis')
    .option('--ai', 'Use AI-powered analysis (redundancy, bloat, intent matching)')
    .option('--intent <description>', 'Describe what you intended to do (for AI analysis)')
    .option('--session-id <id>', 'Use existing session ID (for AI analysis)')
    .action(check_1.checkCommand);
(0, refactor_1.refactorCommand)(program);
(0, security_1.securityCommand)(program);
(0, brain_1.brainCommand)(program);
(0, policy_1.policyCommand)(program);
(0, governance_1.governanceCommand)(program);
// V0: in-flow governance
(0, profile_1.profileCommand)(program);
(0, session_hook_1.sessionHookCommand)(program);
(0, runtime_adapter_1.runtimeAdapterCommand)(program);
(0, agent_1.agentCommand)(program);
(0, activate_1.activateCommand)(program);
(0, cursor_1.cursorCommand)(program);
(0, integrations_1.integrationsCommand)(program);
(0, run_1.runCommand)(program);
(0, runtime_report_1.reportCommand)(program);
(0, runtime_sync_1.syncCommand)(program);
(0, runtime_1.runtimeCommand)(program);
(0, ops_1.opsCommand)(program);
(0, admission_1.admissionCommand)(program);
(0, demo_1.demoCommand)(program);
(0, eval_1.evalCommand)(program);
(0, pilot_1.registerPilotCommands)(program);
program
    .command('status')
    .description('Show the active in-flow governance session for this repository')
    .option('--session-id <id>', 'Local governance session ID (default: active session)')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.localGovernanceStatusCommand)({
        sessionId: options.sessionId,
        dir: options.dir,
        json: options.json === true,
    });
});
program
    .command('sessions')
    .description('List local in-flow governance sessions for this repository')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.listRuntimeSessionsCommand)({
        dir: options.dir,
        json: options.json === true,
    });
});
(0, control_plane_1.controlPlaneCommand)(program);
(0, workspace_1.workspaceCommand)(program);
(0, replay_1.replayCommand)(program);
(0, home_1.homeCommand)(program);
(0, setup_1.setupCommand)(program);
(0, onboard_1.onboardCommand)(program);
(0, telemetry_1.telemetryCommand)(program);
// Top-level discoverability alias for `neurcode replay timeline`. Reviewers
// asking "what changed and when?" should not need to know the subcommand
// hierarchy. Same canonical artifact source, same deterministic output.
program
    .command('timeline')
    .description('Operational governance timeline (alias for `replay timeline`)')
    .option('--workspace <workspaceId>', 'Workspace scope')
    .option('--from <timestamp>', 'ISO start timestamp')
    .option('--to <timestamp>', 'ISO end timestamp')
    .option('--limit <count>', 'Maximum timeline items to return', (value) => Number.parseInt(value, 10))
    .option('--json', 'Output JSON')
    .action(async (options) => {
    const args = ['replay', 'timeline'];
    if (options.workspace)
        args.push('--workspace', String(options.workspace));
    if (options.from)
        args.push('--from', String(options.from));
    if (options.to)
        args.push('--to', String(options.to));
    if (Number.isFinite(options.limit))
        args.push('--limit', String(options.limit));
    if (options.json)
        args.push('--json');
    await program.parseAsync(['node', 'neurcode', ...args]);
});
(0, audit_1.auditCommand)(program);
(0, contract_1.contractCommand)(program);
(0, feedback_1.feedbackCommand)(program);
(0, guard_1.runtimeGuardCommand)(program);
(0, repo_1.repoCommand)(program);
program
    .command('bootstrap')
    .description('One-command governance setup (policy bootstrap + optional contract import + runtime guard)')
    .option('--pack <id>', 'Policy pack ID to bootstrap (default: soc2)', 'soc2')
    .option('--force-pack', 'Replace existing installed policy pack during bootstrap (default)', true)
    .option('--no-force-pack', 'Do not replace an already-installed policy pack')
    .option('--intent <text>', 'Deterministic intent constraints for policy compile')
    .option('--require-deterministic-match', 'Fail bootstrap if policy intent cannot be compiled deterministically')
    .option('--include-dashboard', 'Include dashboard custom policies in policy bootstrap')
    .option('--require-dashboard', 'Fail if dashboard custom policies cannot be loaded')
    .option('--provider <name>', 'External plan provider for contract import (default: generic)', 'generic')
    .option('--plan-input <path>', 'Import external plan from file (JSON or text)')
    .option('--plan-text <payload>', 'Import external plan from inline text/JSON')
    .option('--plan-stdin', 'Import external plan from stdin')
    .option('--skip-contract', 'Skip contract import stage')
    .option('--skip-guard', 'Skip runtime guard start stage')
    .option('--strict-guard', 'Require strict runtime guard start (default)', true)
    .option('--no-strict-guard', 'Allow advisory runtime guard start by default')
    .option('--allow-advisory-fallback', 'Fallback to advisory runtime guard when strict prerequisites are missing', true)
    .option('--no-allow-advisory-fallback', 'Disable advisory fallback and fail bootstrap when strict guard start fails')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, bootstrap_1.bootstrapCommand)({
        pack: options.pack,
        forcePack: options.forcePack,
        intent: options.intent,
        requireDeterministicMatch: options.requireDeterministicMatch,
        includeDashboard: options.includeDashboard,
        requireDashboard: options.requireDashboard,
        provider: options.provider,
        planInput: options.planInput,
        planText: options.planText,
        planStdin: options.planStdin,
        skipContract: options.skipContract,
        skipGuard: options.skipGuard,
        strictGuard: options.strictGuard,
        allowAdvisoryFallback: options.allowAdvisoryFallback,
        json: options.json,
    });
});
program
    .command('login')
    .description('Connect this machine/runtime to a Neurcode workspace')
    .option('--org <id>', 'Connect to a specific workspace/organization (internal UUID)')
    .option('--choose-workspace', 'Ignore repo-local scope and explicitly choose a workspace in the browser')
    .action((options) => {
    (0, login_1.loginCommand)({ orgId: options.org, chooseWorkspace: options.chooseWorkspace === true });
});
program
    .command('logout')
    .description('Disconnect Neurcode runtime credentials from this machine')
    .option('--all', 'Remove all saved runtime credentials (all workspaces)')
    .option('--org <id>', 'Remove saved runtime credential for a specific workspace/organization')
    .action((options) => {
    (0, logout_1.logoutCommand)({
        all: options.all || false,
        orgId: options.org,
    });
});
program
    .command('init')
    .description('Bind this repository to a workspace governance boundary')
    .option('--org <id>', 'Preselect workspace/organization by internal UUID')
    .option('--project-id <id>', 'Link an existing project by internal UUID (non-interactive)')
    .option('--create <name>', 'Create and link a new project (non-interactive)')
    .action((options) => {
    (0, init_1.initCommand)({
        orgId: options.org,
        projectId: options.projectId,
        create: options.create,
    });
});
program
    .command('doctor')
    .description('Enterprise readiness diagnostics (config, artifacts, API compatibility, CORS)')
    .option('--runtime', 'Run local in-flow runtime diagnostics for Claude Code governance')
    .option('--dir <path>', 'Repository root for --runtime diagnostics')
    .option('--json', 'Output machine-readable diagnostics JSON')
    .action((options) => {
    // Explicit --runtime flag always wins.
    if (options.runtime === true) {
        (0, runtime_doctor_1.runtimeDoctorCommand)({ json: options.json === true, dir: options.dir });
        return;
    }
    const cwd = options.dir || process.cwd();
    let repoRoot = cwd;
    try {
        repoRoot = (0, v0_governance_1.resolveRepoRoot)(cwd);
    }
    catch { /* not in a git repo */ }
    const hasGovernance = (0, fs_1.existsSync)((0, path_1.join)(repoRoot, '.neurcode', 'governance.json'));
    const hasManifest = (0, runtime_authority_1.runtimeManifestExists)(repoRoot);
    if (hasManifest && hasGovernance) {
        // Runtime-governed repo → invoke runtime diagnostics only (no enterprise preamble).
        (0, runtime_doctor_1.runtimeDoctorCommand)({ json: options.json === true, dir: options.dir });
        return;
    }
    if (!hasGovernance && !hasManifest) {
        // Ambiguous repo: print concise mode-selection and return — do NOT auto-run diagnostics.
        if (options.json) {
            console.log(JSON.stringify({
                ok: null,
                mode: 'ambiguous',
                message: 'No governance profile or runtime activation found.',
                actions: {
                    setupRuntime: 'neurcode activate',
                    runtimeDiagnostics: 'neurcode doctor --runtime',
                },
            }, null, 2));
        }
        else {
            console.log('');
            console.log('  No governance profile or runtime activation found.');
            console.log('');
            console.log('  Set up runtime governance:        neurcode activate');
            console.log('  Runtime governance diagnostics:   neurcode doctor --runtime');
            console.log('');
        }
        return;
    }
    // hasGovernance && !hasManifest → policy/compiler project without runtime activation.
    if (!options.json) {
        console.log('');
        console.log('  Governance profile found — runtime not yet activated.');
        console.log('  For runtime diagnostics run:  neurcode doctor --runtime');
        console.log('  To activate runtime:          neurcode activate');
        console.log('');
    }
    (0, doctor_1.doctorCommand)({ json: options.json, cliVersion: version });
});
program
    .command('quickstart')
    .description('Local-only governance sandbox for a first deterministic finding (for the canonical one-command evaluation, prefer `neurcode pilot start`)')
    .option('--force', 'Overwrite existing starter files')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, quickstart_1.quickstartCommand)({
        force: options.force === true,
        json: options.json === true,
    });
});
program
    .command('bootstrap-policy')
    .description('Generate deterministic enterprise policies based on detected repo ecosystem (no network, no LLM)')
    .option('--force', 'Overwrite existing policy file')
    .option('--ecosystem <type>', 'Override detected ecosystem (typescript|python|go|java|infra|mixed)')
    .option('--profile <type>', 'Override detected profile (backend-service|auth-payment|queue-workflow|infra|general)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, bootstrap_policy_1.bootstrapPolicyCommand)({
        force: options.force === true,
        ecosystem: options.ecosystem,
        profile: options.profile,
        json: options.json === true,
    });
});
program
    .command('compat')
    .description('Show runtime compatibility contract (CLI <-> Action <-> API)')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    const runtimeManifest = (0, contracts_1.getRuntimeCompatibilityManifest)();
    const compatibility = (0, contracts_1.buildRuntimeCompatibilityDescriptor)('cli', version);
    const payload = {
        contractVersion: contracts_1.CLI_JSON_CONTRACT_VERSION,
        success: true,
        timestamp: new Date().toISOString(),
        component: 'cli',
        componentVersion: version,
        compatibility,
        matrix: (0, contracts_1.getRuntimeMinimumPeerVersionMatrix)(),
        runtimeManifest: {
            schemaVersion: runtimeManifest.schemaVersion,
            manifestVersion: runtimeManifest.manifestVersion,
            validatedTriplets: runtimeManifest.validatedTriplets,
        },
        message: 'Runtime compatibility contract resolved.',
    };
    if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    console.log(chalk.bold.cyan('\n🔗 Runtime Compatibility'));
    console.log(chalk.dim(`CLI version: ${version}`));
    console.log(chalk.dim(`Runtime contract: ${compatibility.contractId}@${compatibility.runtimeContractVersion}`));
    console.log(chalk.dim(`CLI JSON contract: ${compatibility.cliJsonContractVersion}`));
    console.log(chalk.dim(`Manifest version: ${runtimeManifest.manifestVersion}`));
    console.log(chalk.dim(`Validated triplets: ${runtimeManifest.validatedTriplets.length}`));
    console.log(chalk.white('\nMinimum peer versions for this CLI:'));
    const peers = compatibility.minimumPeerVersions;
    console.log(chalk.dim(`  action >= ${peers.action || 'n/a'}`));
    console.log(chalk.dim(`  api    >= ${peers.api || 'n/a'}`));
    console.log('');
});
program
    .command('whoami')
    .description('Show user, workspace, repo ownership, session, and governance boundary')
    .action(() => {
    (0, whoami_1.whoamiCommand)();
});
program
    .command('config')
    .description('Configure Neurcode CLI settings')
    .option('--key <key>', 'Set API key')
    .option('--global', 'Save to home directory (applies to all projects)')
    .option('--show', 'Show current configuration')
    .action((options) => {
    if (options.show) {
        (0, config_1.showConfigCommand)();
    }
    else if (options.key) {
        (0, config_1.configCommand)(options.key, { global: options.global });
    }
    else {
        // Show current config if no options provided
        (0, config_1.showConfigCommand)();
    }
});
program
    .command('map')
    .description('Scan codebase and generate asset map (exports and imports)')
    .action(() => {
    (0, map_1.mapCommand)();
});
program
    .command('ask')
    .description('Advanced: ask a repo question with grounded, citation-backed answers')
    .argument('<question...>', 'Question about the codebase')
    .option('--project-id <id>', 'Project ID')
    .option('--json', 'Output machine-readable JSON')
    .option('--proof', 'Show concise answer plus evidence digest')
    .option('-v, --verbose', 'Show full findings, citations, and truth-scoring details')
    .option('--max-citations <n>', 'Maximum citations to show (default: 12)', (val) => parseInt(val, 10))
    .option('--no-cache', 'Disable local ask cache and force fresh retrieval')
    .action(async (question, options) => {
    const questionString = Array.isArray(question) ? question.join(' ') : question;
    if (Array.isArray(question) && question.length > 1) {
        console.log(chalk.yellow('Tip: Wrap your question in quotes for best shell compatibility.'));
    }
    await (0, ask_1.askCommand)(questionString, {
        projectId: options['project-id'] || options.projectId,
        json: options.json === true,
        proof: options.proof === true,
        verbose: options.verbose === true,
        maxCitations: Number.isFinite(options.maxCitations) ? options.maxCitations : undefined,
        cache: options.cache !== false,
    });
});
program
    .command('plan')
    .description('Legacy: generate an execution plan for a user intent')
    .argument('<intent...>', 'Description of what you want to accomplish')
    .option('--project-id <id>', 'Project ID')
    .option('--ticket <id>', 'Ticket ID from Linear or Jira (e.g., PROJ-123, ABC-123)')
    .option('--issue <id>', 'GitHub issue number (auto-detects repo from git remote)')
    .option('--pr <id>', 'GitHub PR number (auto-detects repo from git remote)')
    .option('--mask', 'Mask detected secrets automatically (default: true)', true)
    .option('--no-mask', 'Abort if secrets detected instead of masking')
    .option('--no-cache', 'Disable local plan cache and force regeneration')
    .option('--force-plan', 'Force plan generation even for read-only analysis intents')
    .option('--snapshot-mode <mode>', 'Snapshot mode: auto | full | off (default: auto)')
    .option('--snapshot-max-files <n>', 'Maximum MODIFY files to snapshot (default: auto=40, full=500)', (val) => parseInt(val, 10))
    .option('--snapshot-budget-ms <n>', 'Time budget for snapshots in ms (default: auto=60000, full=unbounded)', (val) => parseInt(val, 10))
    .option('--json', 'Output machine-readable JSON')
    .action(async (intent, options) => {
    // Handle multiple arguments (when user doesn't quote)
    const intentString = Array.isArray(intent) ? intent.join(' ') : intent;
    const trimmedIntent = intentString.trim().toLowerCase();
    if (trimmedIntent === 'show') {
        (0, plan_show_1.planShowCommand)({
            json: options.json === true,
        });
        return;
    }
    if (Array.isArray(intent) && intent.length > 1) {
        console.log(chalk.yellow('Tip: Wrap your intent in quotes for better shell compatibility.'));
    }
    if (!options.forcePlan && (0, plan_1.detectIntentMode)(intentString) === 'analysis') {
        console.log(chalk.dim('🔎 Read-only intent detected. Routing to `neurcode ask` for grounded answer mode.\n'));
        await (0, ask_1.askCommand)(intentString, {
            projectId: options['project-id'] || options.projectId,
            cache: options.cache !== false,
            fromPlan: true,
        });
        return;
    }
    await (0, plan_1.planCommand)(intentString, {
        projectId: options['project-id'] || options.projectId,
        ticket: options.ticket,
        issue: options.issue,
        pr: options.pr,
        mask: options.mask !== false, // Default to true unless --no-mask is used
        cache: options.cache !== false,
        snapshotMode: options.snapshotMode,
        snapshotMaxFiles: Number.isFinite(options.snapshotMaxFiles) ? options.snapshotMaxFiles : undefined,
        snapshotBudgetMs: Number.isFinite(options.snapshotBudgetMs) ? options.snapshotBudgetMs : undefined,
        json: options.json === true,
    });
});
const planSloCmd = program
    .command('plan-slo')
    .description('Inspect local plan runtime SLO telemetry');
planSloCmd
    .command('status')
    .description('Show local p95 latency, escalation rates, confidence stats, and kill-switch state')
    .option('--window <n>', 'Number of most recent plan events to summarize (default: 200)', (val) => parseInt(val, 10))
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, plan_slo_1.planSloStatusCommand)({
        window: Number.isFinite(options.window) ? options.window : undefined,
        json: options.json === true,
    });
});
program
    .command('ship')
    .description('Legacy: run the older autonomous ship loop and produce a merge confidence card')
    .argument('<goal...>', 'Implementation goal to ship')
    .option('--project-id <id>', 'Project ID')
    .option('--max-fix-attempts <n>', 'Maximum auto-remediation attempts (default: 2)', (val) => parseInt(val, 10))
    .option('-d, --allow-dirty', 'Allow running with a dirty working tree')
    .option('--skip-tests', 'Skip test execution stage')
    .option('--test-command <cmd>', 'Override test command used in ship workflow')
    .option('--no-record', 'Disable cloud recording in verify stage')
    .option('--require-pass', 'Require verify verdict PASS (do not treat INFO as pass)')
    .option('--require-policy-lock', 'Require policy lock baseline during verify stages')
    .option('--skip-policy-lock', 'Skip policy lock checks during verify stages')
    .option('--manual-approve-high-risk', 'Allow ship to continue when verify blast radius risk is HIGH')
    .option('--no-publish-card', 'Do not publish merge confidence card to Neurcode Cloud')
    .option('--json', 'Emit machine-readable ship summary JSON')
    .action(async (goal, options) => {
    const goalString = Array.isArray(goal) ? goal.join(' ') : goal;
    if (Array.isArray(goal) && goal.length > 1) {
        console.log(chalk.yellow('Tip: Wrap your goal in quotes for best shell compatibility.'));
    }
    await (0, ship_1.shipCommand)(goalString, {
        projectId: options['project-id'] || options.projectId,
        maxFixAttempts: Number.isFinite(options.maxFixAttempts) ? options.maxFixAttempts : undefined,
        allowDirty: options.allowDirty === true,
        skipTests: options.skipTests === true,
        testCommand: options.testCommand,
        record: options.record !== false,
        requirePass: options.requirePass === true,
        requirePolicyLock: options.requirePolicyLock === true,
        skipPolicyLock: options.skipPolicyLock === true,
        manualApproveHighRisk: options.manualApproveHighRisk === true,
        publishCard: options.publishCard !== false,
        json: options.json === true,
    });
});
program
    .command('ship-resume')
    .description('Legacy: resume a previously started ship run from its checkpoint')
    .argument('<run-id>', 'Ship run ID (see neurcode ship-runs)')
    .option('--project-id <id>', 'Project ID override')
    .option('--max-fix-attempts <n>', 'Maximum auto-remediation attempts override', (val) => parseInt(val, 10))
    .option('--skip-tests', 'Skip tests on resumed run')
    .option('--test-command <cmd>', 'Override test command for resumed run')
    .option('--no-record', 'Disable cloud recording in verify stage')
    .option('--require-pass', 'Require verify verdict PASS (do not treat INFO as pass)')
    .option('--require-policy-lock', 'Require policy lock baseline during verify stages')
    .option('--skip-policy-lock', 'Skip policy lock checks during verify stages')
    .option('--manual-approve-high-risk', 'Allow resumed ship to continue when blast radius risk is HIGH')
    .option('--no-publish-card', 'Do not publish merge confidence card to Neurcode Cloud')
    .option('--json', 'Emit machine-readable ship summary JSON')
    .action(async (runId, options) => {
    await (0, ship_1.shipResumeCommand)(runId, {
        projectId: options['project-id'] || options.projectId,
        maxFixAttempts: Number.isFinite(options.maxFixAttempts) ? options.maxFixAttempts : undefined,
        skipTests: options.skipTests === true,
        testCommand: options.testCommand,
        record: options.record !== false,
        requirePass: options.requirePass === true,
        requirePolicyLock: options.requirePolicyLock === true,
        skipPolicyLock: options.skipPolicyLock === true,
        manualApproveHighRisk: options.manualApproveHighRisk === true,
        publishCard: options.publishCard !== false,
        json: options.json === true,
    });
});
program
    .command('ship-runs')
    .description('Legacy: list persisted ship runs for this repository')
    .option('--limit <n>', 'Maximum runs to show (default: 20)', (val) => parseInt(val, 10))
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, ship_1.shipRunsCommand)({
        limit: Number.isFinite(options.limit) ? options.limit : undefined,
        json: options.json === true,
    });
});
program
    .command('ship-attestation-verify')
    .description('Legacy: verify a ship release attestation against the referenced merge card artifact')
    .argument('<path>', 'Path to release attestation JSON file')
    .option('--hmac-key <key>', 'HMAC key override for signature verification (defaults to NEURCODE_ATTEST_HMAC_KEY)')
    .option('--json', 'Output machine-readable JSON')
    .action((pathArg, options) => {
    (0, ship_1.shipAttestationVerifyCommand)(pathArg, {
        hmacKey: options.hmacKey,
        json: options.json === true,
    });
});
program
    .command('apply')
    .description('Legacy: apply a saved architect plan by generating and writing code files')
    .argument('<planId>', 'Plan ID (UUID) to apply')
    .option('--force', 'Overwrite existing files without confirmation')
    .option('--json', 'Output machine-readable JSON')
    .action((planId, options) => {
    (0, apply_1.applyCommand)(planId, {
        force: options.force || false,
        json: options.json === true,
    });
});
program
    .command('allow')
    .description('Allow a file to be modified (bypass strict scope guard)')
    .argument('<filePath>', 'Path to the file to allow')
    .action((filePath) => {
    (0, allow_1.allowCommand)(filePath);
});
program
    .command('approve')
    .description('Record or list manual governance approvals for current commit')
    .option('--approver <id>', 'Approver identity (defaults to git user.name or USER)')
    .option('--reason <text>', 'Approval reason/comment')
    .option('--plan-id <id>', 'Optional plan ID this approval applies to')
    .option('--head <sha>', 'Commit SHA to record/list approval against (defaults to HEAD)')
    .option('--list', 'List approvals for the target commit instead of adding one')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, approve_1.approveCommand)({
        approver: options.approver,
        reason: options.reason,
        planId: options.planId,
        head: options.head,
        list: options.list === true,
        json: options.json === true,
    });
});
program
    .command('simulate')
    .description('Advanced: predict blast radius and likely regressions before merge ("what would have broken?")')
    .option('--staged', 'Analyze staged changes only')
    .option('--head', 'Analyze changes against HEAD')
    .option('--base <ref>', 'Analyze changes against a specific base ref')
    .option('--max-impacted <n>', 'Maximum impacted files to include (default: 50)', (val) => parseInt(val, 10))
    .option('--depth <n>', 'Reverse dependency traversal depth (default: 3)', (val) => parseInt(val, 10))
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, simulate_1.simulateCommand)({
        staged: options.staged === true,
        head: options.head === true,
        base: options.base,
        maxImpacted: Number.isFinite(options.maxImpacted) ? options.maxImpacted : undefined,
        depth: Number.isFinite(options.depth) ? options.depth : undefined,
        json: options.json === true,
    });
});
program
    .command('watch')
    .description('Legacy: start the local file-change recorder used by Time Machine workflows')
    .action(() => {
    (0, watch_1.watchCommand)();
});
// Session management commands
const sessionCmd = program
    .command('session')
    .description('Manage cloud sessions and local intent-runtime continuity');
sessionCmd
    .command('list')
    .description('List all sessions for the current project')
    .option('--project-id <id>', 'Project ID')
    .option('--all', 'Show all sessions (including completed)')
    .option('--local', 'List local in-flow governance sessions from .neurcode/sessions')
    .option('--dir <path>', 'Repository root for --local')
    .option('--json', 'Output machine-readable JSON for --local')
    .action((options) => {
    (0, session_1.listSessionsCommand)({
        projectId: options.projectId,
        all: options.all || false,
        local: options.local === true,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('show')
    .description('Show one local in-flow governance session record')
    .argument('<session-id>', 'Local governance session ID')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action((sessionId, options) => {
    (0, session_1.showRuntimeSessionCommand)(sessionId, {
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('record')
    .description('Build the source-free AI Change Record for a governed coding session')
    .option('--session-id <id>', 'Local governance session ID (default: active, then latest)')
    .option('--latest', 'Use the latest local session even if another session is active')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.aiChangeRecordCommand)({
        sessionId: options.sessionId,
        latest: options.latest === true,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('export-record [sessionId]')
    .description('Export a PR-safe source-free AI Change Record envelope')
    .option('--session-id <id>', 'Local governance session ID (default: active, then latest)')
    .option('--latest', 'Use the latest local session even if another session is active')
    .option('--signed', 'Attempt backend signing; fall back to self-attested with a warning if unavailable')
    .option('--output <path>', 'Output JSON path (default: .neurcode-ai-record/<session-id>.json)')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (sessionId, options) => {
    try {
        const summary = await (0, session_1.exportAIChangeRecordForCli)({
            sessionId: options.sessionId || sessionId,
            latest: options.latest === true,
            signed: options.signed === true,
            output: options.output,
            dir: options.dir,
            json: options.json === true,
        });
        if (options.json) {
            console.log(JSON.stringify(summary, null, 2));
            return;
        }
        console.log('AI Change Record exported');
        console.log(`  Session:  ${summary.sessionId}`);
        console.log(`  Artifact: ${summary.publicRelativePath}`);
        console.log(`  Hash:     ${summary.recordHash}`);
        console.log(`  Trust:    ${summary.trustLevel}`);
        if (summary.receipt.present) {
            console.log(`  Receipt:  ${summary.receipt.receiptId || 'attached'} (${summary.receipt.verificationStatus})`);
        }
        for (const warning of summary.warnings) {
            console.log(`  Warning:  ${warning}`);
        }
        console.log('  Privacy:  source-free; no source, diffs, patches, raw prompts, or secrets.');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json)
            console.log(JSON.stringify({ ok: false, error: message }, null, 2));
        else
            console.error(`AI Change Record export failed: ${message}`);
        process.exitCode = 1;
    }
});
sessionCmd
    .command('verify-record')
    .description('Verify an AI Change Record receipt against a source-free record export')
    .requiredOption('--record <path>', 'AI Change Record JSON or export envelope')
    .option('--receipt <path>', 'Receipt JSON or export envelope (defaults to --record envelope)')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    try {
        const result = (0, session_1.verifyAIChangeRecordForCli)({
            record: options.record,
            receipt: options.receipt,
            json: options.json === true,
        });
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        console.log(result.ok ? 'AI Change Record receipt valid' : 'AI Change Record receipt not valid');
        console.log(`  Trust:   ${result.trustLevel}`);
        console.log(`  Receipt: ${result.receiptId || 'n/a'}`);
        if (result.verification.reasons.length > 0) {
            console.log(`  Reasons: ${result.verification.reasons.join('; ')}`);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json)
            console.log(JSON.stringify({ ok: false, error: message }, null, 2));
        else
            console.error(`AI Change Record verification failed: ${message}`);
        process.exitCode = 1;
    }
});
sessionCmd
    .command('understanding')
    .description('Build local TypeScript structural understanding for the active governed change')
    .option('--session-id <id>', 'Local governance session ID (default: active, then latest)')
    .option('--latest', 'Use the latest local session even if another session is active')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--staged', 'Analyze staged changes only')
    .option('--head', 'Analyze working tree against HEAD (default)')
    .option('--base <ref>', 'Analyze working tree against a specific git ref')
    .option('--max-program-files <n>', 'Maximum TypeScript/JavaScript files to analyze', (value) => Number.parseInt(value, 10))
    .option('--time-budget-ms <n>', 'Static analysis time budget in milliseconds', (value) => Number.parseInt(value, 10))
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.structuralUnderstandingCommand)({
        sessionId: options.sessionId,
        latest: options.latest === true,
        dir: options.dir,
        staged: options.staged === true,
        head: options.head === true,
        base: options.base,
        maxProgramFiles: Number.isFinite(options.maxProgramFiles) ? options.maxProgramFiles : undefined,
        timeBudgetMs: Number.isFinite(options.timeBudgetMs) ? options.timeBudgetMs : undefined,
        json: options.json === true,
    });
});
sessionCmd
    .command('end')
    .description('End the current session or a specific session')
    .option('--session-id <id>', 'Session ID to end (defaults to current session)')
    .option('--project-id <id>', 'Project ID')
    .option('--local', 'Restrict resolution to local governance sessions')
    .option('--outcome <status>', 'completed | denied | abandoned | attention_required | expired | superseded')
    .option('--dir <path>', 'Repository root for local governance session resolution')
    .option('--json', 'Output stable machine-readable JSON')
    .action(async (options) => {
    const outcomes = ['completed', 'denied', 'abandoned', 'attention_required', 'expired', 'superseded'];
    if (options.outcome && !outcomes.includes(options.outcome)) {
        console.error(`Unsupported session outcome: ${options.outcome}`);
        process.exitCode = 2;
        return;
    }
    await (0, session_1.endSessionCommand)({
        sessionId: options.sessionId,
        projectId: options.projectId,
        local: options.local === true,
        completionStatus: options.outcome,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('status')
    .description('Show status of the current session or a specific session')
    .option('--session-id <id>', 'Session ID to check (defaults to current session)')
    .option('--project-id <id>', 'Project ID')
    .option('--local', 'Force local in-flow governance session status')
    .option('--dir <path>', 'Repository root for local in-flow session status')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.sessionStatusCommand)({
        sessionId: options.sessionId,
        projectId: options.projectId,
        local: options.local === true,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('export-admission [sessionId]')
    .description('Export a source-free runtime admission record into .neurcode-admission/')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--receipt <path>', 'Attach source-free backend receipt summary from a receipt/control-plane JSON file')
    .option('--explain', 'Explain what the record contains, excludes, and how the GitHub Action consumes it')
    .option('--json', 'Output machine-readable JSON')
    .action((sessionId, options) => {
    try {
        const summary = (0, admission_1.exportAdmissionRecordForCli)({
            dir: options.dir,
            sessionId,
            receiptPath: options.receipt,
            explain: options.explain === true,
            json: options.json === true,
        });
        if (options.json) {
            console.log(JSON.stringify(summary, null, 2));
            return;
        }
        console.log('Admission record exported');
        console.log(`  Session:     ${summary.sessionId}`);
        console.log(`  PR artifact: ${summary.publicRelativePath}`);
        console.log(`  Trust:       ${summary.trustLevel}`);
        if (summary.receipt.present) {
            console.log(`  Receipt:     ${summary.receipt.receiptId || 'attached'} (${summary.receipt.verificationStatus || 'unknown'})`);
        }
        console.log(`  Note:        ${summary.trustLevel === 'backend_signed' ? 'backend-signed metadata is attached; verify the receipt before treating it as enterprise evidence.' : 'self-attested local records are claims, not cryptographic proof.'}`);
        if (options.explain) {
            console.log('');
            console.log('What it contains:');
            for (const item of summary.contains)
                console.log(`  - ${item}`);
            console.log('');
            console.log('What it intentionally excludes:');
            for (const item of summary.excludes)
                console.log(`  - ${item}`);
            console.log('');
            console.log('How the GitHub Action consumes it:');
            for (const item of summary.actionConsumption)
                console.log(`  - ${item}`);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
            console.log(JSON.stringify({ ok: false, error: message }, null, 2));
        }
        else {
            console.error(`Admission export failed: ${message}`);
        }
        process.exitCode = 1;
    }
});
sessionCmd
    .command('approve')
    .description('Approve a file path or glob for the active in-flow governance session')
    .requiredOption('--path <path>', 'File path or glob to approve')
    .option('--reason <text>', 'Human-readable approval reason')
    .option('--session-id <id>', 'Session ID to approve against (default: active session)')
    .option('--request-id <id>', 'Runtime Control Plane approval request id to reconcile when using local/demo fallback')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, session_1.approveGovernanceSessionCommand)({
        path: options.path,
        reason: options.reason,
        sessionId: options.sessionId,
        requestId: options.requestId,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('reset-stale')
    .description('Finish and clear an abandoned active in-flow governance session')
    .option('--max-age-minutes <n>', 'Only reset sessions idle at least this many minutes (default: 120)', (value) => Number.parseFloat(value))
    .option('--force', 'Reset even if the session is fresh or waiting on approval')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, session_1.resetStaleGovernanceSessionCommand)({
        maxAgeMinutes: Number.isFinite(options.maxAgeMinutes) ? options.maxAgeMinutes : undefined,
        force: options.force === true,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('cleanup-stale')
    .description('Selectively expire one stale session while preserving unresolved-decision evidence')
    .option('--session-id <id>', 'Only clean this session id')
    .option('--max-age-minutes <n>', 'Only clean sessions idle at least this many minutes (default: 120)', (value) => Number.parseFloat(value))
    .option('--abandon', 'Explicitly abandon the selected session even if it is fresh or has unresolved decisions')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, session_1.resetStaleGovernanceSessionCommand)({
        sessionId: options.sessionId,
        maxAgeMinutes: Number.isFinite(options.maxAgeMinutes) ? options.maxAgeMinutes : undefined,
        force: options.abandon === true,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('obligations')
    .description('Show live source-free architecture obligations for the active in-flow session')
    .option('--session-id <id>', 'Session ID to inspect (default: active session)')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.showGovernanceObligationsCommand)({
        sessionId: options.sessionId,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('waive-obligation')
    .description('Waive one pending architecture obligation for the active in-flow session')
    .requiredOption('--id <obligation-id>', 'Architecture obligation ID to waive')
    .requiredOption('--reason <text>', 'Human-readable waiver reason')
    .option('--session-id <id>', 'Session ID to update (default: active session)')
    .option('--expires-at <iso>', 'Absolute waiver expiry timestamp')
    .option('--ttl-minutes <n>', 'Waiver TTL in minutes (default: 60)', (value) => Number.parseFloat(value))
    .option('--waived-by <identity>', 'Human identity recording the waiver')
    .option('--source <source>', 'Waiver source: local_cli | dashboard | mcp | unknown', 'local_cli')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, session_1.waiveGovernanceObligationCommand)({
        obligationId: options.id,
        reason: options.reason,
        sessionId: options.sessionId,
        expiresAt: options.expiresAt,
        ttlMinutes: Number.isFinite(options.ttlMinutes) ? options.ttlMinutes : undefined,
        waivedBy: options.waivedBy,
        waiverSource: ['local_cli', 'dashboard', 'mcp', 'unknown'].includes(options.source) ? options.source : 'local_cli',
        dir: options.dir,
        json: options.json === true,
    });
});
function collectOption(value, previous = []) {
    return [...previous, value];
}
// ── Plan negotiation UX: view the active plan, show the mode, freeze/unfreeze ──
// `neurcode session plan` (and its subcommands) is the runtime plan surface.
// The top-level `neurcode plan` command is the retired legacy plan/apply/ship
// flow; the live runtime plan lives inside a governed session, so it sits here.
const planCmd = sessionCmd
    .command('plan')
    .description('View and negotiate the active runtime plan (mode / freeze / unfreeze)');
planCmd
    .command('view', { isDefault: true })
    .description('Show the active plan: summary, scope, revision, mode, and freeze state')
    .option('--session-id <id>', 'Session ID (default: active session)')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.viewPlanCommand)({
        sessionId: options.sessionId,
        dir: options.dir,
        json: options.json === true,
    });
});
planCmd
    .command('mode')
    .description('Explain the plan control mode: observe / advise / enforce_after_freeze')
    .option('--session-id <id>', 'Session ID (default: active session)')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.showPlanModeCommand)({
        sessionId: options.sessionId,
        dir: options.dir,
        json: options.json === true,
    });
});
planCmd
    .command('freeze')
    .description('Freeze the active plan; enforce_after_freeze starts blocking drift outside it')
    .option('--by <identity>', 'Who is freezing the plan (recorded source-free)')
    .option('--reason <text>', 'Why the plan is being frozen')
    .option('--session-id <id>', 'Session ID (default: active session)')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, session_1.freezePlanCommand)({
        by: options.by,
        reason: options.reason,
        sessionId: options.sessionId,
        dir: options.dir,
        json: options.json === true,
    });
});
planCmd
    .command('unfreeze')
    .description('Reopen the active plan for planning; suspends plan-drift blocking (credential guards stay on)')
    .option('--by <identity>', 'Who is unfreezing the plan (recorded source-free)')
    .option('--reason <text>', 'Why the plan is being reopened')
    .option('--session-id <id>', 'Session ID (default: active session)')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, session_1.unfreezePlanCommand)({
        by: options.by,
        reason: options.reason,
        sessionId: options.sessionId,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('replan')
    .description('Amend or replace the active in-flow agent plan')
    .option('--plan <text>', 'Full replacement plan text')
    .option('--plan-file <path>', 'Read replacement plan text from a file')
    .option('--summary <text>', 'Replace the active plan summary')
    .option('--add-step <text>', 'Add a plan step', collectOption, [])
    .option('--remove-step <text>', 'Remove a plan step by exact text', collectOption, [])
    .option('--add-file <path>', 'Add an expected file to the active plan', collectOption, [])
    .option('--remove-file <path>', 'Remove an expected file from the active plan', collectOption, [])
    .option('--add-glob <glob>', 'Add an expected glob to the active plan', collectOption, [])
    .option('--remove-glob <glob>', 'Remove an expected glob from the active plan', collectOption, [])
    .option('--add-constraint <text>', 'Add a stated plan constraint', collectOption, [])
    .option('--remove-constraint <text>', 'Remove a stated plan constraint by exact text', collectOption, [])
    .option('--add-risk <text>', 'Add a stated plan risk/caveat', collectOption, [])
    .option('--remove-risk <text>', 'Remove a stated plan risk/caveat by exact text', collectOption, [])
    .option('--reason <text>', 'Why the plan changed')
    .option('--proposed-by <actor>', 'Proposal actor: human | agent', 'human')
    .option('--decided-by <identity>', 'Human identity when a human-authored re-plan is applied')
    .option('--session-id <id>', 'Session ID to update (default: active session)')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, session_1.replanGovernanceSessionCommand)({
        plan: options.plan,
        planFile: options.planFile,
        summary: options.summary,
        addStep: options.addStep,
        removeStep: options.removeStep,
        addFile: options.addFile,
        removeFile: options.removeFile,
        addGlob: options.addGlob,
        removeGlob: options.removeGlob,
        addConstraint: options.addConstraint,
        removeConstraint: options.removeConstraint,
        addRisk: options.addRisk,
        removeRisk: options.removeRisk,
        reason: options.reason,
        proposedBy: options.proposedBy === 'agent' ? 'agent' : 'human',
        decidedBy: options.decidedBy,
        sessionId: options.sessionId,
        dir: options.dir,
        json: options.json === true,
    });
});
// `amend-plan` is the human-facing alias of `replan`, matching the documented
// `neurcode session amend-plan --summary "..." --reason "..." --scope "<glob>"`.
// It shares the same revisioning engine; `--scope` is sugar for `--add-glob`.
sessionCmd
    .command('amend-plan')
    .description('Amend the active in-flow agent plan (alias of replan; supports --scope)')
    .option('--plan <text>', 'Full replacement plan text')
    .option('--plan-file <path>', 'Read replacement plan text from a file')
    .option('--summary <text>', 'Replace the active plan summary')
    .option('--scope <glob>', 'Add an expected scope glob to the active plan', collectOption, [])
    .option('--add-step <text>', 'Add a plan step', collectOption, [])
    .option('--remove-step <text>', 'Remove a plan step by exact text', collectOption, [])
    .option('--add-file <path>', 'Add an expected file to the active plan', collectOption, [])
    .option('--remove-file <path>', 'Remove an expected file from the active plan', collectOption, [])
    .option('--add-glob <glob>', 'Add an expected glob to the active plan', collectOption, [])
    .option('--remove-glob <glob>', 'Remove an expected glob from the active plan', collectOption, [])
    .option('--add-constraint <text>', 'Add a stated plan constraint', collectOption, [])
    .option('--remove-constraint <text>', 'Remove a stated plan constraint by exact text', collectOption, [])
    .option('--add-risk <text>', 'Add a stated plan risk/caveat', collectOption, [])
    .option('--remove-risk <text>', 'Remove a stated plan risk/caveat by exact text', collectOption, [])
    .option('--reason <text>', 'Why the plan changed')
    .option('--proposed-by <actor>', 'Proposal actor: human | agent', 'human')
    .option('--decided-by <identity>', 'Human identity when a human-authored re-plan is applied')
    .option('--session-id <id>', 'Session ID to update (default: active session)')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    await (0, session_1.replanGovernanceSessionCommand)({
        plan: options.plan,
        planFile: options.planFile,
        summary: options.summary,
        scope: options.scope,
        addStep: options.addStep,
        removeStep: options.removeStep,
        addFile: options.addFile,
        removeFile: options.removeFile,
        addGlob: options.addGlob,
        removeGlob: options.removeGlob,
        addConstraint: options.addConstraint,
        removeConstraint: options.removeConstraint,
        addRisk: options.addRisk,
        removeRisk: options.removeRisk,
        reason: options.reason,
        proposedBy: options.proposedBy === 'agent' ? 'agent' : 'human',
        decidedBy: options.decidedBy,
        sessionId: options.sessionId,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('replan-decide')
    .description('Accept or reject a pending agent-authored plan amendment')
    .requiredOption('--proposal-id <id>', 'Pending plan amendment proposal ID')
    .requiredOption('--decision <decision>', 'Decision: accept | reject')
    .option('--reason <text>', 'Human-readable decision reason')
    .option('--decided-by <identity>', 'Human identity recording the decision')
    .option('--session-id <id>', 'Session ID to update (default: active session)')
    .option('--dir <path>', 'Repository root (default: current directory)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    if (options.decision !== 'accept' && options.decision !== 'reject') {
        throw new Error('decision must be accept or reject');
    }
    await (0, session_1.decideGovernanceReplanCommand)({
        proposalId: options.proposalId,
        decision: options.decision,
        reason: options.reason,
        decidedBy: options.decidedBy,
        sessionId: options.sessionId,
        dir: options.dir,
        json: options.json === true,
    });
});
sessionCmd
    .command('list-local')
    .description('List local intent-runtime session snapshots for this repository')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.listLocalSessionsCommand)({
        json: options.json === true,
    });
});
sessionCmd
    .command('current-local')
    .description('Show the active local intent-runtime session')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.currentLocalSessionCommand)({
        json: options.json === true,
    });
});
sessionCmd
    .command('resume-local')
    .description('Restore a stored local intent-runtime session snapshot')
    .option('--session-id <id>', 'Local session ID to restore (defaults to the active or latest snapshot)')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.resumeLocalSessionCommand)({
        sessionId: options.sessionId,
        json: options.json === true,
    });
});
sessionCmd
    .command('compare-local')
    .description('Compare the approved scope and boundary expectations of two local intent sessions')
    .requiredOption('--left <id>', 'Left local session ID')
    .requiredOption('--right <id>', 'Right local session ID')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, session_1.compareLocalSessionsCommand)({
        left: options.left,
        right: options.right,
        json: options.json === true,
    });
});
program
    .command('remediate')
    .description('Legacy: run verify, auto-remediate using the older ship loop, then re-verify')
    .option('--goal <text>', 'Goal text for remediation ship loop')
    .option('--plan-id <id>', 'Plan ID for verify scope checks')
    .option('--project-id <id>', 'Project ID override')
    .option('--max-fix-attempts <n>', 'Maximum remediation attempts for ship loop (default: 2)', (val) => parseInt(val, 10))
    .option('--policy-only', 'Run remediation in policy-only verification mode')
    .option('--require-plan', 'Fail verify if plan context is missing')
    .option('--require-policy-lock', 'Require policy lock checks in verify and ship phases')
    .option('--skip-policy-lock', 'Skip policy lock checks in verify and ship phases')
    .option('--strict-artifacts', 'Require deterministic compiled-policy/change-contract artifacts in verify stages')
    .option('--no-strict-artifacts', 'Disable strict deterministic artifact enforcement in verify stages')
    .option('--enforce-change-contract', 'Require change contract enforcement in verify stages')
    .option('--no-enforce-change-contract', 'Disable change contract enforcement in verify stages')
    .option('--require-runtime-guard', 'Require `neurcode guard check` to pass before each remediation attempt')
    .option('--require-approval', 'Require manual approval quorum before each remediation attempt')
    .option('--min-approvals <n>', 'Minimum distinct manual approvers required when --require-approval is enabled', (val) => parseInt(val, 10))
    .option('--approval-commit <sha>', 'Commit SHA used for manual approval quorum checks (default: HEAD)')
    .option('--auto-repair-ai-log', 'Attempt deterministic AI change-log integrity repair before remediation (default)', true)
    .option('--no-auto-repair-ai-log', 'Disable automatic AI change-log integrity repair preflight')
    .option('--disable-rollback-on-regression', 'Disable rollback restore when a remediation attempt does not improve verify')
    .option('--require-rollback-snapshot', 'Fail remediation when rollback snapshot cannot be created')
    .option('--snapshot-max-files <n>', 'Rollback snapshot max files (default: 5000)', (val) => parseInt(val, 10))
    .option('--snapshot-max-bytes <n>', 'Rollback snapshot max total bytes (default: 128000000)', (val) => parseInt(val, 10))
    .option('--snapshot-max-file-bytes <n>', 'Rollback snapshot max bytes per file (default: 8000000)', (val) => parseInt(val, 10))
    .option('--no-record', 'Disable cloud recording during verify/ship runs')
    .option('--skip-tests', 'Skip tests during remediation ship loop (default: true)')
    .option('--no-publish-card', 'Do not publish merge confidence card during remediation ship loop')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, remediate_1.remediateCommand)({
        goal: options.goal,
        planId: options.planId,
        projectId: options.projectId,
        maxFixAttempts: Number.isFinite(options.maxFixAttempts) ? options.maxFixAttempts : undefined,
        policyOnly: options.policyOnly === true,
        requirePlan: options.requirePlan === true,
        requirePolicyLock: options.requirePolicyLock === true,
        skipPolicyLock: options.skipPolicyLock === true,
        strictArtifacts: options.strictArtifacts !== false,
        enforceChangeContract: options.enforceChangeContract !== false,
        requireRuntimeGuard: options.requireRuntimeGuard === true,
        requireApproval: options.requireApproval === true ? true : undefined,
        minApprovals: Number.isFinite(options.minApprovals) ? options.minApprovals : undefined,
        approvalCommit: options.approvalCommit,
        autoRepairAiLog: options.autoRepairAiLog !== false,
        rollbackOnRegression: options.disableRollbackOnRegression === true ? false : undefined,
        requireRollbackSnapshot: options.requireRollbackSnapshot === true ? true : undefined,
        snapshotMaxFiles: Number.isFinite(options.snapshotMaxFiles) ? options.snapshotMaxFiles : undefined,
        snapshotMaxBytes: Number.isFinite(options.snapshotMaxBytes) ? options.snapshotMaxBytes : undefined,
        snapshotMaxFileBytes: Number.isFinite(options.snapshotMaxFileBytes) ? options.snapshotMaxFileBytes : undefined,
        noRecord: options.record === false,
        skipTests: options.skipTests === true ? true : undefined,
        publishCard: options.publishCard !== false,
        json: options.json === true,
    });
});
// ── neurcode remediate-export (Phase 2 — trust boundary export) ───────────────
program
    .command('remediate-export')
    .description('Export a structured deterministic remediation payload for a governance finding.\n' +
    'Pass the output to an external remediation tool or coding workflow.\n' +
    'This command NEVER modifies any file. Neurcode verifies. External remediation owns the code change.')
    .option('--finding <id>', 'Export payload for a specific finding ID')
    .option('--finding-id <id>', 'Alias for --finding (backward compatible)')
    .option('--finding-index <n>', 'Export payload for finding at 0-based index')
    .option('--all', 'Export payloads for all findings from last verify')
    .option('--format <fmt>', 'Output format: json | mcp | prompt | markdown (default: json)', 'json')
    .option('--provider <provider>', 'Provider handoff: claude | codex | cursor | gemini')
    .option('--out <path>', 'Write output to file instead of stdout')
    .option('--copy', 'Copy output to clipboard (macOS pbcopy)')
    .option('--open', 'Open provider workflow when a documented local deep link is available')
    .option('--verify-output-file <path>', 'Path to verify JSON output (default: .neurcode/last-verify-output.json)')
    .option('--project-root <path>', 'Project root override')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    const finding = options.finding ?? options.findingId;
    await (0, remediate_export_1.remediateExportCommand)({
        finding,
        findingIndex: options.findingIndex,
        all: options.all === true,
        format: ['json', 'mcp', 'prompt', 'markdown'].includes(options.format) ? options.format : 'json',
        provider: ['claude', 'codex', 'cursor', 'gemini'].includes(options.provider) ? options.provider : undefined,
        out: options.out,
        copy: options.copy === true,
        open: options.open === true,
        json: options.json === true,
        verifyOutputFile: options.verifyOutputFile,
        projectRoot: options.projectRoot,
    });
});
program
    .command('remediation-export')
    .description('Alias for remediate-export.')
    .option('--finding <id>', 'Export payload for a specific finding ID')
    .option('--finding-id <id>', 'Alias for --finding (backward compatible)')
    .option('--finding-index <n>', 'Export payload for finding at 0-based index')
    .option('--all', 'Export payloads for all findings from last verify')
    .option('--format <fmt>', 'Output format: json | mcp | prompt | markdown (default: json)', 'json')
    .option('--provider <provider>', 'Provider handoff: claude | codex | cursor | gemini')
    .option('--out <path>', 'Write output to file instead of stdout')
    .option('--copy', 'Copy output to clipboard (macOS pbcopy)')
    .option('--open', 'Open provider workflow when a documented local deep link is available')
    .option('--verify-output-file <path>', 'Path to verify JSON output (default: .neurcode/last-verify-output.json)')
    .option('--project-root <path>', 'Project root override')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    const finding = options.finding ?? options.findingId;
    await (0, remediate_export_1.remediateExportCommand)({
        finding,
        findingIndex: options.findingIndex,
        all: options.all === true,
        format: ['json', 'mcp', 'prompt', 'markdown'].includes(options.format) ? options.format : 'json',
        provider: ['claude', 'codex', 'cursor', 'gemini'].includes(options.provider) ? options.provider : undefined,
        out: options.out,
        copy: options.copy === true,
        open: options.open === true,
        json: options.json === true,
        verifyOutputFile: options.verifyOutputFile,
        projectRoot: options.projectRoot,
    });
});
// ── neurcode remediate validate ────────────────────────────────────────────────
program
    .command('remediate-validate')
    .description('Validate an LLM-generated patch against deterministic governance rules. ' +
    'Runs syntax, scope, and structural re-verification. Never modifies files. Outputs a validation receipt.')
    .requiredOption('--request-file <path>', 'Path to GovernanceRemediationRequest JSON (from remediate-export)')
    .option('--response-diff <diff>', 'Unified diff string to validate')
    .option('--response-file <path>', 'Path to patch file (.patch/.diff) or GovernanceRemediationResponse JSON')
    .option('--project-root <path>', 'Project root override')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, remediate_governance_1.remediateValidateCommand)({
        requestFile: options.requestFile,
        responseDiff: options.responseDiff,
        responseFile: options.responseFile,
        projectRoot: options.projectRoot,
        json: options.json === true,
    });
});
// ── neurcode remediate status ──────────────────────────────────────────────────
program
    .command('remediate-status')
    .description('Show status of remediation artifacts in .neurcode/remediation/')
    .option('--project-root <path>', 'Project root override')
    .option('--json', 'Output machine-readable JSON')
    .action((options) => {
    (0, remediate_governance_1.remediateStatusCommand)({
        projectRoot: options.projectRoot,
        json: options.json === true,
    });
});
program
    .command('generate')
    .description('Legacy: generate governed plan context (reads intent from plan.json if no prompt given)')
    .argument('[prompt...]', 'Implementation prompt — omit to use intent from plan.json')
    .option('--plan-id <id>', 'Plan ID override for scope context')
    .option('--json', 'Output machine-readable JSON')
    .option('--file <path>', 'Write JSON output to a file (for agent consumption)')
    .action((promptParts, options) => {
    const promptText = Array.isArray(promptParts) ? promptParts.join(' ') : String(promptParts || '');
    (0, generate_1.generateCommand)(promptText, {
        planId: options.planId,
        json: options.json === true,
        file: options.file,
    });
});
program
    .command('patch')
    .description('Legacy: apply a deterministic fix patch to a file (from neurcode fix suggestions)')
    .requiredOption('--file <path>', 'Path to the file to patch')
    .option('--preview-token <token>', 'Preview token generated by deterministic patch preview')
    .option('--rollback-receipt <id>', 'Rollback a previously applied deterministic patch receipt')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    if (shouldRouteJsonLegacyCommandThroughExecutionBus(options.json === true)) {
        const patchArgs = ['patch', '--file', options.file];
        if (typeof options.previewToken === 'string' && options.previewToken.trim().length > 0) {
            patchArgs.push('--preview-token', options.previewToken.trim());
        }
        if (typeof options.rollbackReceipt === 'string' && options.rollbackReceipt.trim().length > 0) {
            patchArgs.push('--rollback-receipt', options.rollbackReceipt.trim());
        }
        const run = await (0, execution_bus_1.runExecution)({
            type: 'patch',
            source: 'cli',
            target: options.file,
            cwd: process.cwd(),
            reverify: false,
            primaryArgs: patchArgs,
        });
        emitJsonPayloadWithExitCode(run.primaryPayload ?? {
            success: false,
            file: options.file,
            message: run.execution.result?.message || 'Patch execution produced no payload',
        }, run.execution.result?.exitCode);
        return;
    }
    (0, patch_apply_1.patchApplyCommand)({
        file: options.file,
        previewToken: typeof options.previewToken === 'string' ? options.previewToken : undefined,
        rollbackReceipt: typeof options.rollbackReceipt === 'string' ? options.rollbackReceipt : undefined,
        json: options.json === true,
    });
});
program
    .command('fix')
    .description('Review prioritized governance findings and optional legacy patch suggestions')
    .option('--plan-id <id>', 'Plan ID for verify scope checks')
    .option('--project-id <id>', 'Project ID override')
    .option('--ci', 'CI mode: deterministic verification-only flow, no local interactive/runtime assumptions')
    .option('--policy-only', 'Run in policy-only verification mode')
    .option('--staged', 'Verify staged changes only; unstaged and untracked files are excluded')
    .option('--head', 'Verify the working tree against HEAD, including untracked files')
    .option('--base <ref>', 'Verify the working tree against a base ref, including untracked files')
    .option('--apply-safe', 'Auto-apply high-confidence, deterministic patches and re-run verify')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options) => {
    if (shouldRouteJsonLegacyCommandThroughExecutionBus(options.json === true)) {
        const fixArgs = ['fix'];
        if (options.planId)
            fixArgs.push('--plan-id', options.planId);
        if (options.projectId)
            fixArgs.push('--project-id', options.projectId);
        if (options.ci === true)
            fixArgs.push('--ci');
        if (options.policyOnly === true)
            fixArgs.push('--policy-only');
        if (options.staged === true)
            fixArgs.push('--staged');
        if (options.head === true)
            fixArgs.push('--head');
        if (options.base)
            fixArgs.push('--base', options.base);
        if (options.applySafe === true)
            fixArgs.push('--apply-safe');
        const run = await (0, execution_bus_1.runExecution)({
            type: options.applySafe === true ? 'apply-safe' : 'fix',
            source: 'cli',
            cwd: process.cwd(),
            reverify: false,
            ciMode: options.ci === true,
            primaryArgs: fixArgs,
        });
        emitJsonPayloadWithExitCode(run.primaryPayload ?? {
            success: false,
            message: run.execution.result?.message || 'Fix execution produced no payload',
        }, run.execution.result?.exitCode);
        return;
    }
    await (0, fix_1.fixCommand)({
        planId: options.planId,
        projectId: options.projectId,
        ci: options.ci === true,
        policyOnly: options.policyOnly === true,
        staged: options.staged === true,
        head: options.head === true,
        base: options.base,
        applySafe: options.applySafe === true,
        json: options.json === true,
    });
});
program
    .command('pilot-report')
    .description('Print a local governance pilot summary (metrics, provenance, telemetry)')
    .option('--days <n>', 'Report window in days (7 or 30)', '7')
    .option('--json', 'Emit machine-readable JSON')
    .action((options) => {
    const raw = String(options.days ?? '7');
    const days = raw === '30' ? 30 : 7;
    (0, pilot_report_1.pilotReportCommand)({
        days,
        json: options.json === true,
    });
});
program
    .command('verify')
    .description('Run intent-aware deterministic verification against policy and bounded change scope')
    .option('--plan-id <id>', 'Plan ID to verify against (required unless --policy-only)')
    .option('--project-id <id>', 'Project ID')
    .option('--ci', 'CI mode: deterministic verification-only flow, no daemon/interactive/local-state assumptions')
    .option('--require-plan', 'Fail if no plan context exists instead of falling back to policy-only mode')
    .option('--policy-only', 'General Governance mode: policy checks only, no plan/scope enforcement')
    .option('--require-policy-lock', 'Fail if policy lock baseline is missing or mismatched')
    .option('--skip-policy-lock', 'Bypass policy lock baseline checks for this run')
    .option('--compiled-policy <path>', 'Compiled policy artifact path (default: neurcode.policy.compiled.json)')
    .option('--change-contract <path>', 'Change contract path (default: .neurcode/change-contract.json)')
    .option('--enforce-change-contract', 'Treat change contract drift as a hard verification failure')
    .option('--strict-artifacts', 'Require deterministic compiled-policy + change-contract artifacts')
    .option('--require-signed-artifacts', 'Require cryptographic signatures on compiled-policy + change-contract artifacts')
    .option('--require-runtime-guard', 'Require runtime guard artifact to pass before verify evaluation')
    .option('--runtime-guard <path>', 'Runtime guard artifact path (default: .neurcode/runtime-guard.json)')
    .option('--async', 'Use queue-backed async verification mode (enterprise)')
    .option('--verify-job-poll-ms <ms>', 'Polling interval for async verification jobs (default: 1500ms)', (val) => parseInt(val, 10))
    .option('--verify-job-timeout-ms <ms>', 'Timeout for async verification jobs (default: 300000ms)', (val) => parseInt(val, 10))
    .option('--verify-idempotency-key <key>', 'Idempotency key for queue-backed verify job creation')
    .option('--verify-job-max-attempts <n>', 'Max backend retry attempts for verify jobs (1-10)', (val) => parseInt(val, 10))
    .option('--staged', 'Only verify staged changes')
    .option('--head', 'Verify changes against HEAD')
    .option('--base <ref>', 'Verify changes against a specific base ref')
    .option('--explain', 'Include AI change justification details in human-readable output')
    .option('--demo', 'Demo mode: print extra explanatory output')
    .option('--json', 'Output results as JSON')
    .option('--evidence', 'Write deterministic verification evidence artifact (.neurcode/evidence)')
    .option('--evidence-dir <path>', 'Verification evidence output directory (default: .neurcode/evidence)')
    .option('--record', 'Report verification results to Neurcode Cloud')
    .option('--api-key <key>', 'Neurcode API Key (overrides config and env var)')
    .option('--api-url <url>', 'Override API URL (default: https://api.neurcode.com)')
    .option('--local-only', 'Offline compatibility alias for the supported local policy + structural engine (no API)')
    .option('--require-intent-runtime', 'Fail if the intent-governed runtime is not active for this run (no silent downgrade to structural-only). Honours NEURCODE_REQUIRE_INTENT_RUNTIME=1.')
    .action(async (options) => {
    if (options.localOnly === true) {
        process.env.NEURCODE_VERIFY_LOCAL_ONLY = '1';
    }
    if (shouldRouteJsonLegacyCommandThroughExecutionBus(options.json === true)) {
        const verifyArgs = ['verify'];
        if (options.planId)
            verifyArgs.push('--plan-id', options.planId);
        if (options.projectId)
            verifyArgs.push('--project-id', options.projectId);
        if (options.ci === true)
            verifyArgs.push('--ci');
        if (options.requirePlan === true)
            verifyArgs.push('--require-plan');
        if (options.policyOnly === true)
            verifyArgs.push('--policy-only');
        if (options.requirePolicyLock === true)
            verifyArgs.push('--require-policy-lock');
        if (options.skipPolicyLock === true)
            verifyArgs.push('--skip-policy-lock');
        if (options.compiledPolicy)
            verifyArgs.push('--compiled-policy', options.compiledPolicy);
        if (options.changeContract)
            verifyArgs.push('--change-contract', options.changeContract);
        if (options.enforceChangeContract === true)
            verifyArgs.push('--enforce-change-contract');
        if (options.strictArtifacts === true)
            verifyArgs.push('--strict-artifacts');
        if (options.requireSignedArtifacts === true)
            verifyArgs.push('--require-signed-artifacts');
        if (options.requireRuntimeGuard === true)
            verifyArgs.push('--require-runtime-guard');
        if (options.runtimeGuard)
            verifyArgs.push('--runtime-guard', options.runtimeGuard);
        if (options.async === true)
            verifyArgs.push('--async');
        if (Number.isFinite(options.verifyJobPollMs))
            verifyArgs.push('--verify-job-poll-ms', String(options.verifyJobPollMs));
        if (Number.isFinite(options.verifyJobTimeoutMs))
            verifyArgs.push('--verify-job-timeout-ms', String(options.verifyJobTimeoutMs));
        if (options.verifyIdempotencyKey)
            verifyArgs.push('--verify-idempotency-key', options.verifyIdempotencyKey);
        if (Number.isFinite(options.verifyJobMaxAttempts))
            verifyArgs.push('--verify-job-max-attempts', String(options.verifyJobMaxAttempts));
        if (options.staged === true)
            verifyArgs.push('--staged');
        if (options.head === true)
            verifyArgs.push('--head');
        if (options.base)
            verifyArgs.push('--base', options.base);
        if (options.explain === true)
            verifyArgs.push('--explain');
        if (options.demo === true)
            verifyArgs.push('--demo');
        if (options.evidence === true)
            verifyArgs.push('--evidence');
        if (options.evidenceDir)
            verifyArgs.push('--evidence-dir', options.evidenceDir);
        if (options.record === true)
            verifyArgs.push('--record');
        if (options.apiKey)
            verifyArgs.push('--api-key', options.apiKey);
        if (options.apiUrl)
            verifyArgs.push('--api-url', options.apiUrl);
        if (options.requireIntentRuntime === true)
            verifyArgs.push('--require-intent-runtime');
        const run = await (0, execution_bus_1.runExecution)({
            type: 'verify',
            source: 'cli',
            cwd: process.cwd(),
            reverify: false,
            ciMode: options.ci === true,
            primaryArgs: verifyArgs,
        });
        emitJsonPayloadWithExitCode(run.primaryPayload ?? {
            success: false,
            message: run.execution.result?.message || 'Verify execution produced no payload',
        }, run.execution.result?.exitCode);
        return;
    }
    await (0, verify_1.verifyCommand)({
        planId: options.planId,
        projectId: options.projectId,
        staged: options.staged,
        head: options.head,
        base: options.base,
        demo: options.demo === true,
        explain: options.explain === true,
        json: options.json,
        evidence: options.evidence === true,
        evidenceDir: options.evidenceDir,
        record: options.record,
        apiKey: options.apiKey,
        apiUrl: options.apiUrl,
        ci: options.ci === true,
        requirePlan: options.requirePlan === true,
        policyOnly: options.policyOnly === true,
        requirePolicyLock: options.requirePolicyLock === true,
        skipPolicyLock: options.skipPolicyLock === true,
        compiledPolicy: options.compiledPolicy,
        changeContract: options.changeContract,
        enforceChangeContract: options.enforceChangeContract === true,
        strictArtifacts: options.strictArtifacts === true,
        requireSignedArtifacts: options.requireSignedArtifacts === true,
        requireRuntimeGuard: options.requireRuntimeGuard === true,
        runtimeGuard: options.runtimeGuard,
        asyncMode: options.async === true,
        verifyJobPollMs: Number.isFinite(options.verifyJobPollMs) ? options.verifyJobPollMs : undefined,
        verifyJobTimeoutMs: Number.isFinite(options.verifyJobTimeoutMs) ? options.verifyJobTimeoutMs : undefined,
        verifyIdempotencyKey: options.verifyIdempotencyKey,
        verifyJobMaxAttempts: Number.isFinite(options.verifyJobMaxAttempts) ? options.verifyJobMaxAttempts : undefined,
        requireIntentRuntime: options.requireIntentRuntime === true,
    });
});
program
    .command('prompt [plan-id]')
    .description('Legacy: generate an external prompt from an Architect Plan (uses last plan if ID not provided)')
    .option('--json', 'Output machine-readable JSON')
    .option('--output <path>', 'Write prompt output to a file')
    .option('--no-copy', 'Do not copy prompt to clipboard')
    .action((planId, options) => {
    (0, prompt_1.promptCommand)(planId, {
        json: options.json === true,
        output: options.output,
        copy: options.copy !== false,
    });
});
const revertCmd = program
    .command('revert')
    .description('Revert files to previous versions from Neurcode history');
revertCmd
    .command('versions <filePath>')
    .description('List available versions for a file')
    .option('--project-id <id>', 'Project ID')
    .option('--limit <number>', 'Maximum number of versions to show', '50')
    .action((filePath, options) => {
    (0, revert_1.listVersionsCommand)(filePath, {
        projectId: options.projectId,
        limit: parseInt(options.limit, 10),
    });
});
revertCmd
    .argument('<filePath>', 'Path to the file to revert')
    .option('--to-version <version>', 'Version number to revert to (required)', (val) => parseInt(val, 10))
    .option('--project-id <id>', 'Project ID')
    .option('--reason <reason>', 'Reason for revert')
    .option('--dry-run', 'Show what would be reverted without making changes')
    .option('--backup', 'Create a backup of the current file before reverting')
    .option('--force', 'Skip confirmation prompt')
    .action((filePath, options) => {
    if (!options.toVersion) {
        console.error('❌ Error: --to-version is required');
        console.log('Use "neurcode revert versions <filePath>" to see available versions');
        process.exit(1);
    }
    (0, revert_1.revertCommand)(filePath, {
        toVersion: options.toVersion,
        projectId: options.projectId,
        reason: options.reason,
        dryRun: options.dryRun || false,
        backup: options.backup || false,
        force: options.force || false,
    });
});
// ── Export ────────────────────────────────────────────────────────────────────
program
    .command('export')
    .description('Legacy: export current plan as structured JSON for external workflow consumption')
    .option('--json', 'Output machine-readable JSON to stdout')
    .option('--file <path>', 'Write exported plan to a file (e.g. plan.json)')
    .action((options) => {
    (0, export_1.exportCommand)({
        json: options.json === true,
        file: options.file,
    });
});
// ── Daemon ────────────────────────────────────────────────────────────────────
program
    .command('daemon')
    .description('Legacy local dashboard/process transport (not required for setup or normal CLI use)')
    .addHelpText('after', '\nThe daemon serves the older localhost:4321 dashboard/process bridge for verify, findings, replay, and remediation export.\nIt is not a login, repository sync, activation, or onboarding prerequisite. Use `neurcode setup` for first run.\n')
    .action(() => {
    (0, server_1.startDaemon)();
});
// ── Unified Execution Bus ────────────────────────────────────────────────────
program
    .command('execute <type>')
    .description('Run a deterministic action with full receipt, evidence, and activity tracking')
    .option('--target <target>', 'Target file/path for action types that require one')
    .option('--intent <text>', 'Intent text for intent-update actions')
    .option('--source <source>', 'Execution source label (cli|daemon|dashboard|vscode|ci|mcp|cursor|api)', 'cli')
    .option('--actor <actor>', 'Actor attribution label')
    .option('--ci', 'Force CI-safe deterministic execution behavior')
    .option('--evidence-dir <path>', 'Override evidence artifact directory')
    .option('--dedupe-window-ms <ms>', 'Suppress duplicate runs within this time window', (val) => parseInt(val, 10))
    .option('--no-reverify', 'Skip post-action deterministic reverify stage')
    .option('--json', 'Output full execution record as JSON')
    .action(async (type, options) => {
    if (!(0, execution_actions_1.isExecutionActionType)(type)) {
        console.error(`❌ Unsupported execution type: ${type}`);
        console.error(`   Supported: ${execution_actions_1.EXECUTION_ACTION_TYPES.join(', ')}`);
        process.exit(1);
    }
    const run = await (0, execution_bus_1.runExecution)({
        type,
        source: options.source,
        actor: options.actor,
        target: options.target ?? null,
        intentText: options.intent ?? null,
        reverify: options.reverify !== false,
        ciMode: options.ci === true,
        evidenceDir: options.evidenceDir,
        dedupeWindowMs: Number.isFinite(options.dedupeWindowMs) ? options.dedupeWindowMs : undefined,
        cwd: process.cwd(),
    });
    if (options.json === true) {
        console.log(JSON.stringify(run.execution, null, 2));
        process.exitCode = run.execution.result?.success === true ? 0 : 1;
        return;
    }
    const execution = run.execution;
    const statusIcon = execution.result?.success ? '✅' : '❌';
    const trend = execution.verification.diff.trend;
    const evidenceCount = execution.evidence.references.length;
    console.log(`\n${statusIcon} Execution ${execution.id}`);
    console.log(`   Type: ${execution.type}`);
    console.log(`   Source: ${execution.source} (${execution.actor})`);
    console.log(`   Status: ${execution.status}`);
    console.log(`   Trend: ${trend}`);
    console.log(`   Evidence: ${evidenceCount} artifact(s)`);
    if (execution.narrative) {
        console.log(`\n   Narrative: ${execution.narrative.summary}`);
        console.log(`   Why: ${execution.narrative.why}`);
        console.log(`   Next: ${execution.narrative.recommendedAction}`);
    }
    console.log('');
    process.exit(execution.result?.success === true ? 0 : 1);
});
program
    .command('executions')
    .description('Inspect deterministic activity history and action receipts')
    .option('--id <executionId>', 'Show one execution by ID')
    .option('--limit <number>', 'Number of recent executions to show', '20')
    .option('--json', 'Output JSON')
    .action((options) => {
    const limit = Number.parseInt(options.limit, 10);
    if (options.id) {
        const record = (0, execution_bus_1.getExecutionById)(options.id, process.cwd());
        if (!record) {
            console.error(`❌ Execution not found: ${options.id}`);
            process.exit(1);
        }
        if (options.json === true) {
            console.log(JSON.stringify(record, null, 2));
            return;
        }
        console.log(`\nExecution ${record.id}`);
        console.log(`  Type: ${record.type}`);
        console.log(`  Source: ${record.source} (${record.actor})`);
        console.log(`  Status: ${record.status}`);
        console.log(`  Created: ${record.createdAt}`);
        if (record.completedAt)
            console.log(`  Completed: ${record.completedAt}`);
        if (record.durationMs !== null)
            console.log(`  Duration: ${record.durationMs}ms`);
        console.log(`  Trend: ${record.verification.diff.trend}`);
        console.log(`  Evidence: ${record.evidence.references.length} artifact(s)\n`);
        return;
    }
    const records = (0, execution_bus_1.listExecutions)(process.cwd(), Number.isFinite(limit) ? limit : 20);
    if (options.json === true) {
        console.log(JSON.stringify(records, null, 2));
        return;
    }
    if (records.length === 0) {
        console.log('\nNo executions recorded yet.\n');
        return;
    }
    console.log('');
    for (const record of records) {
        const icon = record.result?.success ? '✅' : '❌';
        const duration = record.durationMs === null ? 'n/a' : `${record.durationMs}ms`;
        console.log(`${icon} ${record.id}  ${record.type}  ${record.source}  ${record.status}  ${record.verification.diff.trend}  ${duration}`);
    }
    console.log('');
});
configurePrimaryHelpView(program);
program.addHelpText('after', renderHelpFooter(program));
async function main() {
    const args = process.argv.slice(2);
    (0, activation_telemetry_1.maybeShowActivationTelemetryNotice)();
    (0, activation_telemetry_1.trackActivationEvent)({
        eventType: 'cli_invoked',
        commandFamily: inferCommandFamily(args),
        reasonCode: 'cli.invoked',
    });
    const handled = await (0, command_budget_1.maybeRunBoundedCliCommand)(args);
    if (!handled)
        program.parse();
}
void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[neurcode] fatal startup error: ${message}\n`);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map