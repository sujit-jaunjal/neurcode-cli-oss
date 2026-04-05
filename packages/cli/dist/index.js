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
const plan_slo_1 = require("./commands/plan-slo");
const repo_1 = require("./commands/repo");
const apply_1 = require("./commands/apply");
const verify_1 = require("./commands/verify");
const prompt_1 = require("./commands/prompt");
const ship_1 = require("./commands/ship");
const remediate_1 = require("./commands/remediate");
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
const session_1 = require("./commands/session");
const brain_1 = require("./commands/brain");
const policy_1 = require("./commands/policy");
const audit_1 = require("./commands/audit");
const contract_1 = require("./commands/contract");
const feedback_1 = require("./commands/feedback");
const guard_1 = require("./commands/guard");
const messages_1 = require("./utils/messages");
const config_2 = require("./config");
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
const program = new commander_1.Command();
const CORE_WORKFLOW_STEPS = [
    '1) neurcode init',
    '2) neurcode plan "Describe the change"',
    '3) neurcode prompt',
    '4) neurcode verify --record',
    '5) neurcode ship "Goal" --max-fix-attempts 2',
];
const ADVANCED_WORKFLOW_HINTS = [
    'neurcode ask "<question>"',
    'neurcode simulate --base origin/main',
    'neurcode guard start && neurcode guard check --staged',
    'neurcode compat --json',
    'neurcode policy install soc2',
    'neurcode audit evidence --no-include-events --out .neurcode/evidence.json',
    'neurcode verify --plan-id <id> --async --verify-job-timeout-ms 600000',
    'neurcode repo link ../backend --alias backend',
    'neurcode plan-slo status --json',
];
function printCoreWorkflowGuide() {
    console.log(chalk.bold.cyan('\n🚀 Neurcode Start\n'));
    console.log(chalk.bold.white('Primary Flow (Plan-First Governance):'));
    CORE_WORKFLOW_STEPS.forEach((step) => console.log(chalk.dim(`  ${step}`)));
    console.log('');
    console.log(chalk.bold.white('Advanced (When Needed):'));
    ADVANCED_WORKFLOW_HINTS.forEach((step) => console.log(chalk.dim(`  • ${step}`)));
    console.log('');
}
function renderHelpFooter() {
    return [
        '',
        'Core Workflow:',
        ...CORE_WORKFLOW_STEPS.map((step) => `  ${step}`),
        '',
        'Advanced Commands:',
        ...ADVANCED_WORKFLOW_HINTS.map((step) => `  • ${step}`),
        '',
        'Run `neurcode start` for a guided onboarding flow.',
    ].join('\n');
}
program
    .name('neurcode')
    .description('AI-powered code governance and diff analysis')
    .version(version);
program.addHelpText('after', renderHelpFooter());
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
    .command('start')
    .description('Show guided Neurcode flow (init -> plan -> prompt -> verify -> ship)')
    .option('--run-init', 'Run `neurcode init` immediately after showing the guide')
    .option('--json', 'Output machine-readable onboarding metadata')
    .action(async (options) => {
    if (options.json) {
        console.log(JSON.stringify({
            command: 'start',
            coreWorkflow: CORE_WORKFLOW_STEPS,
            advancedHints: ADVANCED_WORKFLOW_HINTS,
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
(0, audit_1.auditCommand)(program);
(0, contract_1.contractCommand)(program);
(0, feedback_1.feedbackCommand)(program);
(0, guard_1.runtimeGuardCommand)(program);
(0, repo_1.repoCommand)(program);
program
    .command('login')
    .description('Authenticate CLI with Neurcode (opens browser for approval)')
    .option('--org <id>', 'Authenticate for a specific organization (internal UUID)')
    .action((options) => {
    (0, login_1.loginCommand)({ orgId: options.org });
});
program
    .command('logout')
    .description('Log out from Neurcode CLI (removes API key)')
    .option('--all', 'Remove all saved API keys (all organizations)')
    .option('--org <id>', 'Remove saved API key for a specific organization (internal UUID)')
    .action((options) => {
    (0, logout_1.logoutCommand)({
        all: options.all || false,
        orgId: options.org,
    });
});
program
    .command('init')
    .description('Initialize project configuration (select a project)')
    .option('--org <id>', 'Preselect organization by internal UUID')
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
    .description('Health check & connectivity diagnostics - verify API connectivity')
    .action(() => {
    (0, doctor_1.doctorCommand)();
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
    .description('Show current identity and project scope')
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
    .description('Ask a repo question with grounded, citation-backed answers')
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
    .description('Generate an execution plan for a user intent')
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
    .description('Plan, apply, verify, auto-remediate, and produce a merge confidence card')
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
    .description('Resume a previously started ship run from its checkpoint')
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
    .description('List persisted ship runs for this repository')
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
    .description('Verify a ship release attestation against the referenced merge card artifact')
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
    .description('Apply a saved architect plan by generating and writing code files')
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
    .description('Predict blast radius and likely regressions before merge ("what would have broken?")')
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
    .description('Start Neurcode Watch - A local background service that records file changes for Time Machine feature')
    .action(() => {
    (0, watch_1.watchCommand)();
});
// Session management commands
const sessionCmd = program
    .command('session')
    .description('Manage AI coding sessions');
sessionCmd
    .command('list')
    .description('List all sessions for the current project')
    .option('--project-id <id>', 'Project ID')
    .option('--all', 'Show all sessions (including completed)')
    .action((options) => {
    (0, session_1.listSessionsCommand)({
        projectId: options.projectId,
        all: options.all || false,
    });
});
sessionCmd
    .command('end')
    .description('End the current session or a specific session')
    .option('--session-id <id>', 'Session ID to end (defaults to current session)')
    .option('--project-id <id>', 'Project ID')
    .action((options) => {
    (0, session_1.endSessionCommand)({
        sessionId: options.sessionId,
        projectId: options.projectId,
    });
});
sessionCmd
    .command('status')
    .description('Show status of the current session or a specific session')
    .option('--session-id <id>', 'Session ID to check (defaults to current session)')
    .option('--project-id <id>', 'Project ID')
    .action((options) => {
    (0, session_1.sessionStatusCommand)({
        sessionId: options.sessionId,
        projectId: options.projectId,
    });
});
program
    .command('remediate')
    .description('Run verify, auto-remediate using ship loop, then re-verify')
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
        noRecord: options.record === false,
        skipTests: options.skipTests === true ? true : undefined,
        publishCard: options.publishCard !== false,
        json: options.json === true,
    });
});
program
    .command('verify')
    .description('Verify plan adherence - Compare current changes against an Architect Plan')
    .option('--plan-id <id>', 'Plan ID to verify against (required unless --policy-only)')
    .option('--project-id <id>', 'Project ID')
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
    .option('--json', 'Output results as JSON')
    .option('--record', 'Report verification results to Neurcode Cloud')
    .option('--api-key <key>', 'Neurcode API Key (overrides config and env var)')
    .option('--api-url <url>', 'Override API URL (default: https://api.neurcode.com)')
    .action((options) => {
    (0, verify_1.verifyCommand)({
        planId: options.planId,
        projectId: options.projectId,
        staged: options.staged,
        head: options.head,
        base: options.base,
        explain: options.explain === true,
        json: options.json,
        record: options.record,
        apiKey: options.apiKey,
        apiUrl: options.apiUrl,
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
    });
});
program
    .command('prompt [plan-id]')
    .description('Generate a Cursor/Claude prompt from an Architect Plan (uses last plan if ID not provided)')
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
program.parse();
//# sourceMappingURL=index.js.map