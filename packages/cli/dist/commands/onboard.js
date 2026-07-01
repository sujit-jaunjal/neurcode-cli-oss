"use strict";
/**
 * `neurcode onboard` — Self-serve enterprise onboarding walkthrough.
 *
 * Prints the step-by-step recipe for a first governed session, adapted to the
 * selected agent. Covers: install, repo brain index, agent activation, health
 * check, first governed session, boundary block, approval, evidence export.
 *
 * Use --agent to select the agent path. Defaults to claude.
 * Use --json for machine-readable output.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ONBOARD_AGENTS = void 0;
exports.resolveOnboardAgent = resolveOnboardAgent;
exports.detectOnboardEnvironment = detectOnboardEnvironment;
exports.agentSetupCommandFor = agentSetupCommandFor;
exports.buildOnboardWalkthrough = buildOnboardWalkthrough;
exports.onboardCommand = onboardCommand;
const brain_1 = require("@neurcode-ai/brain");
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const config_1 = require("../config");
const state_1 = require("../utils/state");
const project_root_1 = require("../utils/project-root");
let chalk;
try {
    chalk = require('chalk');
}
catch {
    chalk = {
        cyan: (s) => s,
        green: (s) => s,
        yellow: (s) => s,
        bold: (s) => s,
        dim: (s) => s,
        gray: (s) => s,
        white: (s) => s,
        red: (s) => s,
    };
}
exports.ONBOARD_AGENTS = [
    'claude', 'codex', 'cursor', 'copilot', 'vscode', 'action',
];
function resolveOnboardAgent(value) {
    if (!value)
        return 'claude';
    const lower = value.toLowerCase();
    return exports.ONBOARD_AGENTS.includes(lower) ? lower : 'claude';
}
const ADAPTER_AGENT = {
    'claude-code-hooks': 'claude',
    'cursor-mcp': 'cursor',
    'codex-mcp': 'codex',
    'copilot-hooks': 'copilot',
    'vscode-extension': 'vscode',
};
function environmentLabel(target) {
    switch (target) {
        case 'claude': return 'Claude Code';
        case 'cursor': return 'Cursor';
        case 'vscode': return 'VS Code';
        case 'copilot': return 'GitHub Copilot';
        case 'codex': return 'Codex';
        case 'action': return 'GitHub Action';
        case 'terminal': return 'generic terminal';
    }
}
/**
 * Detect which coding environment the user is in so the next step is exact.
 *
 * Order of trust: (1) an agent already activated in this repo's runtime
 * manifest, (2) host environment signals, (3) a generic-terminal default. We
 * read only coarse host markers — never command args, source, or paths.
 */
function detectOnboardEnvironment(repoRoot, env = process.env) {
    try {
        const manifest = (0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot);
        const activatedAgent = manifest?.integrations
            ?.map((integration) => ADAPTER_AGENT[integration.adapter])
            .find((agent) => Boolean(agent));
        if (activatedAgent) {
            return { target: activatedAgent, label: environmentLabel(activatedAgent), source: 'activated' };
        }
    }
    catch {
        // Manifest read is best-effort; fall through to host env detection.
    }
    // Cursor also reports TERM_PROGRAM=vscode, so check its specific marker first.
    if (env.CURSOR_TRACE_ID || env.CURSOR_AGENT) {
        return { target: 'cursor', label: environmentLabel('cursor'), source: 'detected' };
    }
    if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) {
        return { target: 'claude', label: environmentLabel('claude'), source: 'detected' };
    }
    if (env.CODEX_SANDBOX || env.CODEX_HOME) {
        return { target: 'codex', label: environmentLabel('codex'), source: 'detected' };
    }
    if (env.TERM_PROGRAM === 'vscode' || env.VSCODE_PID || env.VSCODE_GIT_IPC_HANDLE) {
        return { target: 'vscode', label: environmentLabel('vscode'), source: 'detected' };
    }
    return { target: 'terminal', label: environmentLabel('terminal'), source: 'default' };
}
/** The agent id to pass to per-agent commands (generic terminal defaults to codex). */
function onboardAgentForCommands(target) {
    return target === 'terminal' ? 'codex' : target;
}
/** The exact, copy-pasteable agent setup command for an environment. */
function agentSetupCommandFor(target) {
    switch (target) {
        case 'claude': return 'npx -y @neurcode-ai/cli@latest activate claude --dir .';
        case 'cursor': return 'npx -y @neurcode-ai/cli@latest cursor onboard --strict';
        case 'copilot':
        case 'vscode': return 'npx -y @neurcode-ai/cli@latest activate copilot --dir .';
        case 'codex': return 'npx -y @neurcode-ai/cli@latest agent bootstrap codex';
        case 'action': return 'neurcode admission doctor';
        case 'terminal': return 'neurcode agent setup codex   # or: claude | cursor | vscode';
    }
}
function buildOnboardWalkthrough(agent) {
    const brain = 'neurcode brain index\nneurcode brain inspect "billing auth payments"';
    const exportEvidence = 'neurcode session export-admission --explain';
    const viewEvidence = 'neurcode eval status --json';
    let label;
    let guarantee;
    let steps;
    if (agent === 'claude') {
        label = 'Claude Code';
        guarantee = 'Hard pre-write deny where Claude hooks are installed and healthy.';
        steps = [
            { id: 'install', title: 'Verify CLI install', command: 'npx -y @neurcode-ai/cli@latest --version' },
            { id: 'brain', title: 'Build repo brain', command: brain },
            {
                id: 'activate',
                title: 'Activate Claude Code',
                command: 'npx -y @neurcode-ai/cli@latest activate claude --dir .',
            },
            { id: 'health', title: 'Verify health', command: 'neurcode doctor --runtime' },
            {
                id: 'session',
                title: 'Start a governed session',
                command: 'neurcode agent guard start claude --goal "Evaluate exact-path runtime governance" --plan "Safe path first; request exact approval for billing boundary" --no-supervise',
            },
            {
                id: 'block',
                title: 'Trigger a boundary block',
                command: 'neurcode agent check src/billing/charge.py --agent claude',
            },
            {
                id: 'approve',
                title: 'Approve the exact path',
                command: 'neurcode session approve --path src/billing/charge.py --reason "guided eval exact-path approval"',
            },
            { id: 'export', title: 'Export AI Change Record', command: exportEvidence },
            { id: 'view', title: 'View Runtime Evidence', command: viewEvidence },
        ];
    }
    else if (agent === 'cursor') {
        label = 'Cursor';
        guarantee = 'Cooperative checks plus local supervisor containment. No native hard pre-write denial.';
        steps = [
            { id: 'install', title: 'Verify CLI install', command: 'npx -y @neurcode-ai/cli@latest --version' },
            { id: 'brain', title: 'Build repo brain', command: brain },
            {
                id: 'activate',
                title: 'Activate Cursor',
                command: 'npx -y @neurcode-ai/cli@latest cursor onboard --strict\nneurcode cursor gate install --hook both',
            },
            { id: 'health', title: 'Verify health', command: 'neurcode cursor health --record' },
            {
                id: 'session',
                title: 'Start a guarded session',
                command: 'neurcode agent guard start cursor \\\n' +
                    '  --goal "Add retry to export task" \\\n' +
                    '  --plan "Edit src/tasks/export_task.ts only; keep billing untouched" \\\n' +
                    '  --no-supervise',
            },
            { id: 'block', title: 'Trigger a boundary check', command: 'neurcode agent check src/billing/charge.py --agent cursor' },
            {
                id: 'approve',
                title: 'Approve and finish',
                command: 'neurcode session approve --path src/billing/charge.py --reason "guided eval exact-path approval"\n' +
                    'neurcode agent guard finish --fail-on-unverified\n' +
                    'neurcode agent report cursor',
            },
            { id: 'export', title: 'Export AI Change Record', command: exportEvidence },
            { id: 'view', title: 'View Runtime Evidence', command: viewEvidence },
        ];
    }
    else if (agent === 'action') {
        label = 'GitHub Action';
        guarantee = 'Post-PR advisory routing and admission display. Not live pre-write enforcement.';
        steps = [
            { id: 'install', title: 'Verify CLI install', command: 'npx -y @neurcode-ai/cli@latest --version' },
            { id: 'brain', title: 'Build repo brain', command: brain },
            {
                id: 'activate',
                title: 'Add GitHub Action',
                command: 'neurcode admission doctor\ngh run list --workflow neurcode.yml --limit 3',
            },
            { id: 'health', title: 'Verify Action runs', command: 'gh run list --workflow neurcode.yml --limit 3' },
            {
                id: 'session',
                title: 'Open a PR',
                command: 'neurcode admission doctor',
            },
            {
                id: 'block',
                title: 'Trigger boundary in PR',
                command: 'gh run list --workflow neurcode.yml --limit 3',
            },
            {
                id: 'approve',
                title: 'Attach admission record',
                command: 'neurcode session export-admission\n' +
                    'git add .neurcode-admission/*.json\n' +
                    'git commit -m "Add Neurcode runtime admission context"',
            },
            { id: 'export', title: 'Export AI Change Record', command: exportEvidence },
            {
                id: 'view',
                title: 'View Action report',
                command: 'gh run list --workflow neurcode.yml --limit 3',
            },
        ];
    }
    else {
        // codex / copilot / vscode
        const agentId = agent === 'vscode' ? 'vscode' : agent === 'copilot' ? 'copilot' : 'codex';
        label =
            agent === 'vscode' ? 'VS Code / Copilot' : agent === 'copilot' ? 'GitHub Copilot' : 'Codex';
        guarantee = 'Cooperative guard plus supervisor evidence. No host-level hard pre-write deny is claimed.';
        steps = [
            { id: 'install', title: 'Verify CLI install', command: 'npx -y @neurcode-ai/cli@latest --version' },
            { id: 'brain', title: 'Build repo brain', command: brain },
            {
                id: 'activate',
                title: `Activate ${label}`,
                command: `npx -y @neurcode-ai/cli@latest agent walkthrough ${agentId}\nneurcode agent bootstrap ${agentId}`,
            },
            { id: 'health', title: 'Verify health', command: `neurcode agent doctor ${agentId}` },
            {
                id: 'session',
                title: 'Start a guarded session',
                command: `neurcode agent guard start ${agentId} \\\n` +
                    `  --goal "Add retry to export task" \\\n` +
                    `  --plan "Edit src/tasks/export_task.ts only; keep billing untouched" \\\n` +
                    `  --no-supervise`,
            },
            { id: 'block', title: 'Trigger a boundary check', command: `neurcode agent check src/billing/charge.py --agent ${agentId}` },
            {
                id: 'approve',
                title: 'Approve and finish',
                command: `neurcode session approve --path src/billing/charge.py --reason "guided eval exact-path approval"\n` +
                    `neurcode agent guard finish --fail-on-unverified\n` +
                    `neurcode agent report ${agentId}`,
            },
            { id: 'export', title: 'Export AI Change Record', command: exportEvidence },
            { id: 'view', title: 'View Runtime Evidence', command: viewEvidence },
        ];
    }
    return { agent, label, guarantee, steps, dashboardUrl: 'https://app.neurcode.com' };
}
async function fetchActivationOnboardingState() {
    const apiKey = (0, config_1.getApiKey)((0, state_1.getOrgId)() || undefined) || (0, config_1.getApiKey)();
    if (!apiKey)
        return null;
    const config = (0, config_1.loadConfig)();
    const apiUrl = (config.apiUrl || config_1.DEFAULT_API_URL).replace(/\/$/, '');
    const headers = {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
    };
    const orgId = (0, state_1.getOrgId)();
    if (orgId)
        headers['x-org-id'] = orgId;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
        const response = await fetch(`${apiUrl}/api/v1/activation/onboarding-state`, {
            method: 'GET',
            headers,
            signal: controller.signal,
        });
        if (!response.ok)
            return null;
        return await response.json();
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
async function localBrainReady(repoRoot) {
    try {
        const status = await (0, brain_1.repositoryGraphStatus)(repoRoot);
        return status.state === 'fresh' || status.state === 'partial' || status.state === 'stale';
    }
    catch {
        return false;
    }
}
async function buildOnboardStatus() {
    const repoRoot = (0, project_root_1.resolveNeurcodeProjectRoot)(process.cwd());
    const environment = detectOnboardEnvironment(repoRoot);
    const agentForCommands = onboardAgentForCommands(environment.target);
    const server = await fetchActivationOnboardingState();
    const serverCompleted = new Set(server?.completedStages ?? []);
    if (server?.stages) {
        for (const stage of server.stages) {
            if (stage.complete)
                serverCompleted.add(stage.stage);
        }
    }
    const loggedIn = Boolean((0, config_1.getApiKey)((0, state_1.getOrgId)() || undefined) || (0, config_1.getApiKey)());
    const repoConnected = Boolean((0, state_1.getOrgId)() && (0, state_1.getProjectId)());
    const brainReady = await localBrainReady(repoRoot);
    const agentConfigured = Boolean((0, cli_runtime_1.readActivatedRuntimeManifest)(repoRoot));
    const steps = [
        {
            stage: 'install_seen',
            label: 'CLI installed',
            complete: true,
            command: 'neurcode --version',
            message: 'This CLI invocation confirms the install is present.',
        },
        {
            stage: 'login_completed',
            label: 'Login completed',
            complete: loggedIn || serverCompleted.has('login_completed'),
            command: 'neurcode login',
            message: 'Connect this machine to a Neurcode workspace.',
        },
        {
            stage: 'repo_connected',
            label: 'Repository connected',
            complete: repoConnected || serverCompleted.has('repo_connected'),
            command: 'neurcode repo connect',
            message: 'Bind this local repository to a workspace/project.',
        },
        {
            stage: 'brain_indexed',
            label: 'Brain indexed',
            complete: brainReady || serverCompleted.has('brain_indexed'),
            command: 'neurcode brain index',
            message: 'Build source-free local repository intelligence.',
        },
        {
            stage: 'agent_configured',
            label: 'Agent configured',
            complete: agentConfigured || serverCompleted.has('agent_configured'),
            command: agentSetupCommandFor(environment.target),
            message: environment.target === 'terminal'
                ? 'Pick one agent: claude, cursor, codex, or vscode.'
                : `Set up ${environment.label} so it asks before sensitive writes.`,
        },
        {
            stage: 'first_governed_check',
            label: 'First governed check',
            complete: serverCompleted.has('first_governed_check'),
            command: `neurcode agent check README.md --agent ${agentForCommands}`,
            message: 'Run the first runtime governance check from your configured agent path.',
        },
        {
            stage: 'first_evidence_synced',
            label: 'Evidence synced',
            complete: serverCompleted.has('first_evidence_synced'),
            command: 'neurcode session export-admission --explain',
            message: 'Finish or export the first source-free governed session record.',
        },
        {
            stage: 'first_block_or_approval',
            label: 'Block or approval observed',
            complete: serverCompleted.has('first_block_or_approval'),
            command: 'neurcode session approve --path <path> --reason "first governed approval"',
            message: 'Observe a protected boundary block or exact-path approval.',
        },
    ];
    return { steps, environment };
}
function renderOnboardStatus(steps) {
    console.log('');
    console.log(chalk.bold('Neurcode onboarding status'));
    console.log('');
    for (const step of steps) {
        const marker = step.complete ? chalk.green('complete') : chalk.yellow('next');
        console.log(`${marker.padEnd(12)} ${step.label}`);
        if (!step.complete) {
            console.log(chalk.dim(`  ${step.message}`));
            console.log(chalk.green(`  ${step.command}`));
            break;
        }
    }
    console.log('');
}
function renderOnboardNext(steps, environment) {
    const next = steps.find((step) => !step.complete);
    console.log('');
    const detail = environment.source === 'default'
        ? chalk.dim('  (no agent detected — pick one in the command below)')
        : environment.source === 'activated'
            ? chalk.dim('  (from your activated runtime)')
            : chalk.dim('  (detected from this shell)');
    console.log(`${chalk.bold('Environment:')} ${environment.label}${detail}`);
    if (!next) {
        console.log('');
        console.log(`${chalk.green('Setup is complete.')} Open Runtime Evidence to review governed sessions.`);
        console.log('');
        return;
    }
    console.log('');
    console.log(`${chalk.bold('Next step:')} ${next.label}`);
    console.log(chalk.dim(`  ${next.message}`));
    console.log(chalk.green(`  ${next.command}`));
    console.log('');
}
function onboardCommand(program) {
    const cmd = program
        .command('onboard')
        .description('Guided step-by-step onboarding walkthrough for the selected AI agent.\n' +
        'Covers: install, repo brain, activation, health check, governed session,\n' +
        'boundary block, exact-path approval, AI Change Record export.\n' +
        'For the one-command evaluation, prefer the canonical `neurcode pilot start`.')
        .option('--agent <agent>', `Agent path: ${exports.ONBOARD_AGENTS.join(' | ')}`, 'claude')
        .option('--json', 'Emit machine-readable JSON instead of the walkthrough')
        .action((opts) => {
        const agent = resolveOnboardAgent(opts.agent);
        const walkthrough = buildOnboardWalkthrough(agent);
        if (opts.json) {
            console.log(JSON.stringify(walkthrough, null, 2));
            return;
        }
        const yellow = chalk.yellow;
        const dim = chalk.dim;
        const green = chalk.green;
        const bold = chalk.bold;
        const gray = chalk.gray;
        const SEP = dim('─'.repeat(72));
        console.log('');
        console.log(bold(yellow('Neurcode Self-Serve Onboarding')));
        console.log(dim(`Agent: ${walkthrough.label}`));
        console.log(dim(`Posture: ${walkthrough.guarantee}`));
        console.log('');
        console.log(SEP);
        walkthrough.steps.forEach(({ title, command }, i) => {
            console.log('');
            console.log(bold(`  Step ${i + 1}: ${title}`));
            command.split('\n').forEach((line) => {
                if (line.startsWith('#')) {
                    console.log(gray(`  ${line}`));
                }
                else if (line.trim() === '') {
                    console.log('');
                }
                else {
                    console.log(green(`  ${line}`));
                }
            });
        });
        console.log('');
        console.log(SEP);
        console.log('');
        console.log(bold('  Next steps'));
        console.log(dim('  Dashboard:       https://app.neurcode.com'));
        console.log(dim('  Setup checklist: /w/me/setup'));
        console.log(dim('  Tech eval:       /w/me/enterprise-eval'));
        console.log(dim('  Agent matrix:    /w/me/integrations'));
        console.log(dim('  CI setup:        /w/me/onboarding/ci'));
        console.log('');
    });
    cmd
        .command('status')
        .description('Show local + server onboarding progress')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options, command) => {
        const { steps, environment } = await buildOnboardStatus();
        // The parent `onboard` command also declares --json and can capture it
        // before this subcommand sees it; honor either level.
        const json = Boolean(options.json || command?.parent?.opts?.()?.json);
        if (json) {
            console.log(JSON.stringify({
                ok: true,
                environment,
                steps,
                completedCount: steps.filter((step) => step.complete).length,
                totalCount: steps.length,
                next: steps.find((step) => !step.complete) ?? null,
            }, null, 2));
            return;
        }
        renderOnboardStatus(steps);
    });
    cmd
        .command('next')
        .description('Print the exact next onboarding action')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options, command) => {
        const { steps, environment } = await buildOnboardStatus();
        const next = steps.find((step) => !step.complete) ?? null;
        const json = Boolean(options.json || command?.parent?.opts?.()?.json);
        if (json) {
            console.log(JSON.stringify({ ok: true, environment, next }, null, 2));
            return;
        }
        renderOnboardNext(steps, environment);
    });
}
//# sourceMappingURL=onboard.js.map