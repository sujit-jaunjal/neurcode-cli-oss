"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoCommand = demoCommand;
const DEFAULT_DASHBOARD_URL = 'https://neurcode.com/w/me/runtime-control-plane';
const DEFAULT_TARGET_PATH = 'fixtures/demo-svc/src/tasks/export_task.py';
const DEFAULT_PROBE_PATH = 'fixtures/demo-svc/src/billing/neurcode_demo_probe.py';
const DEFAULT_NEIGHBOR_PATH = 'fixtures/demo-svc/src/billing/neurcode_demo_neighbor.py';
function demoGoal(targetPath) {
    return [
        `Modify only ${targetPath} to add a small retry/backoff marker for the demo.`,
        'Do not touch billing, auth, API routes, database, dashboard, package files, or generated files.',
    ].join(' ');
}
function buildRehearsalProtocol(options = {}) {
    const dashboardUrl = options.dashboardUrl || DEFAULT_DASHBOARD_URL;
    const targetPath = options.targetPath || DEFAULT_TARGET_PATH;
    const probePath = options.probePath || DEFAULT_PROBE_PATH;
    const neighborPath = options.neighborPath || DEFAULT_NEIGHBOR_PATH;
    const goal = demoGoal(targetPath);
    const steps = [
        'Pull latest main and confirm the working tree is clean.',
        'Build the local CLI if needed: pnpm build:cli.',
        'Run: node packages/cli/dist/index.js doctor --runtime --json.',
        'Start a governed session with the exact goal below.',
        `Make one safe edit to ${targetPath}; it should be allowed.`,
        `Attempt a Write to ${probePath}; it must be blocked before file creation.`,
        `Confirm ${probePath} was not created.`,
        `Use ${dashboardUrl} to approve exactly ${probePath}; do not approve a directory or glob.`,
        'After operator confirmation, run one governed re-check to pull the dashboard grant.',
        `Verify approvedPaths contains exactly ${probePath}.`,
        `Retry ${probePath}; it should be allowed.`,
        `Attempt ${neighborPath}; it must still be blocked.`,
        'Clean up any allowed probe file and finish the session.',
        'Export source-free admission/evidence and report the A-K verdict table.',
    ];
    return {
        dashboardUrl,
        goal,
        targetPath,
        probePath,
        neighborPath,
        hardRules: [
            'Do not fabricate dashboard visibility.',
            'Do not use CLI/MCP self-approval unless the operator explicitly authorizes it.',
            'Do not approve directories or globs for the exact-path test.',
            'Do not leave probe files behind.',
            'Do not commit or push during rehearsal.',
        ],
        steps,
        continueAfterApprovalText: `Approved exact probe path in dashboard. Continue without CLI self-approval; verify approvedPaths contains exactly ${probePath}.`,
    };
}
function printProtocol(protocol) {
    console.log('Neurcode production demo rehearsal');
    console.log('');
    console.log(`Dashboard: ${protocol.dashboardUrl}`);
    console.log(`Goal: ${protocol.goal}`);
    console.log('');
    console.log('Paths');
    console.log(`  target:   ${protocol.targetPath}`);
    console.log(`  probe:    ${protocol.probePath}`);
    console.log(`  neighbor: ${protocol.neighborPath}`);
    console.log('');
    console.log('Steps');
    protocol.steps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step}`);
    });
    console.log('');
    console.log('Hard rules');
    protocol.hardRules.forEach((rule) => console.log(`  - ${rule}`));
    console.log('');
    console.log('Operator reply after dashboard approval');
    console.log(`  ${protocol.continueAfterApprovalText}`);
}
function demoCommand(program) {
    const demo = program
        .command('demo')
        .description('Demo rehearsal protocols for in-flow runtime governance');
    demo
        .command('rehearse')
        .description('Print the canonical production demo rehearsal protocol')
        .option('--dashboard-url <url>', 'Runtime Control Plane URL', DEFAULT_DASHBOARD_URL)
        .option('--target-path <path>', 'Safe in-scope edit path', DEFAULT_TARGET_PATH)
        .option('--probe-path <path>', 'Approval-required exact probe path', DEFAULT_PROBE_PATH)
        .option('--neighbor-path <path>', 'Neighbor path that must remain blocked', DEFAULT_NEIGHBOR_PATH)
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const protocol = buildRehearsalProtocol({
            json: options.json === true,
            dashboardUrl: options.dashboardUrl,
            targetPath: options.targetPath,
            probePath: options.probePath,
            neighborPath: options.neighborPath,
        });
        if (options.json === true) {
            process.stdout.write(JSON.stringify(protocol, null, 2) + '\n');
            return;
        }
        printProtocol(protocol);
    });
}
//# sourceMappingURL=demo.js.map