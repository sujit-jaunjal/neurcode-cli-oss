"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trustCommand = trustCommand;
const chalk_1 = __importDefault(require("chalk"));
const enterprise_trust_1 = require("../utils/enterprise-trust");
const HOSTS = new Set(['claude', 'codex', 'copilot', 'cursor', 'vscode', 'action']);
function trustCommand(program) {
    const trust = program.command('trust').description('Inspect authenticated runtime installation trust and host capability');
    trust.command('status')
        .description('Inspect local host posture and submit a source-free signed trust report when connected')
        .option('--host <host>', 'Selected host: claude, codex, copilot, cursor, vscode, or action')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--local-only', 'Inspect without sending a posture report')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        const host = options.host ? String(options.host).toLowerCase() : undefined;
        if (host && !HOSTS.has(host)) {
            console.error(`Unsupported host: ${host}`);
            process.exitCode = 2;
            return;
        }
        try {
            const result = await (0, enterprise_trust_1.submitEnterprisePosture)({ repoRoot: options.dir, host: host, localOnly: options.localOnly === true });
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }
            const local = result.local;
            const state = result.trust?.state || (result.ok ? local.installation.state : 'unavailable');
            console.log('');
            console.log(chalk_1.default.bold('Runtime trust status'));
            console.log(chalk_1.default.dim('-'.repeat(68)));
            console.log(`Repository: ${local.repository.name} (${local.repository.key})`);
            console.log(`Workspace:  ${local.repository.organizationId}`);
            console.log(`Host:       ${local.capability.label}`);
            console.log(`Trust:      ${result.trust?.trusted ? chalk_1.default.green(state) : state === 'healthy' ? chalk_1.default.green(state) : chalk_1.default.yellow(state)}`);
            console.log(`Capability: ${local.capability.interception}`);
            console.log(`Evidence:   ${result.trust?.evidenceAt || local.lastReport?.reportedAt || 'never reported'}`);
            if (result.trust?.reasonCodes.length)
                console.log(`Reasons:    ${result.trust.reasonCodes.join(', ')}`);
            if (!result.ok && result.unavailableReason)
                console.log(`Cloud:      ${chalk_1.default.yellow(result.unavailableReason)}`);
            console.log(`Remediate:  ${local.remediationCommand}`);
            console.log('');
            console.log(chalk_1.default.bold('Enforcement boundary'));
            console.log(local.capability.governedAction);
            console.log(chalk_1.default.yellow(local.capability.limitation));
            console.log(chalk_1.default.dim('Privacy: no source, prompts, diffs, secrets, environment values, or absolute personal paths were uploaded.'));
            console.log('');
            if (!result.ok && !options.localOnly)
                process.exitCode = 1;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json)
                console.log(JSON.stringify({ ok: false, error: message }, null, 2));
            else
                console.error(chalk_1.default.red(`Trust status failed: ${message}`));
            process.exitCode = 1;
        }
    });
}
//# sourceMappingURL=trust.js.map