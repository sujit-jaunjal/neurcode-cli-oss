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
exports.buildOnboardWalkthrough = buildOnboardWalkthrough;
exports.onboardCommand = onboardCommand;
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
function onboardCommand(program) {
    program
        .command('onboard')
        .description('Step-by-step onboarding walkthrough for the selected AI agent.\n' +
        'Covers: install, repo brain, activation, health check, governed session,\n' +
        'boundary block, exact-path approval, AI Change Record export.')
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
}
//# sourceMappingURL=onboard.js.map