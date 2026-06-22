"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRuntimeIdentityCommand = registerRuntimeIdentityCommand;
const path_1 = require("path");
const cli_startup_1 = require("../utils/cli-startup");
const runtime_authority_1 = require("../utils/runtime-authority");
const v0_governance_1 = require("../utils/v0-governance");
function registerRuntimeIdentityCommand(runtime) {
    runtime
        .command('identity')
        .description('Print the active Neurcode CLI runtime identity and deployment consistency report')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const repoRoot = (0, v0_governance_1.resolveRepoRoot)(options.dir || process.cwd());
        const authority = (0, runtime_authority_1.inspectRuntimeAuthority)(repoRoot);
        const payload = {
            ...(0, cli_startup_1.buildRuntimeIdentityPayload)((0, path_1.join)(__dirname, '..')),
            authority,
        };
        if (options.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
        }
        console.log('Neurcode CLI runtime identity');
        console.log(`  entry:            ${payload.identity.entryRealPath}`);
        console.log(`  bundled entry:    ${payload.identity.bundledEntryRealPath}`);
        console.log(`  version:          ${payload.identity.version}`);
        console.log(`  git commit:       ${payload.identity.gitCommit ?? 'unknown'}`);
        console.log(`  built at:         ${payload.identity.buildTimestamp ?? 'unknown'}`);
        console.log(`  fingerprint:      ${payload.identity.buildFingerprint}`);
        console.log(`  source:           ${payload.identity.source}`);
        console.log(`  argv matches:     ${payload.identity.argvMatchesBundled ? 'yes' : 'no'}`);
        console.log(`  authority:        ${authority.status}`);
        console.log(`  protected ops:    ${authority.protectedOperationAllowed ? 'allowed' : 'denied'}`);
        console.log(`  activated:        ${authority.activated?.activatedAt ?? 'missing'}`);
        if (payload.violations.length > 0) {
            console.log('  violations:');
            for (const violation of payload.violations) {
                console.log(`    - [${violation.code}] ${violation.message}`);
            }
        }
        for (const warning of authority.warnings) {
            console.log(`  warning:          ${warning}`);
        }
    });
    runtime
        .command('repair')
        .description('Idempotently refresh hooks, MCP, supervisor wiring, runtime manifest, and Repo Brain scheduling')
        .option('--dir <path>', 'Repository root (default: current directory)')
        .option('--json', 'Output machine-readable JSON')
        .action(async (options) => {
        try {
            const result = await (0, runtime_authority_1.repairRuntimeAuthority)(options.dir || process.cwd());
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }
            console.log('Neurcode runtime authority repaired');
            console.log(`  manifest:         ${result.manifestPath}`);
            console.log(`  manifest hash:    ${result.manifestHash}`);
            console.log(`  integrations:     ${result.integrations.length}`);
            console.log(`  refreshed:        ${result.repaired.join(', ') || 'none'}`);
            console.log(`  preserved:        ${result.preserved.join(', ') || 'none'}`);
            console.log(`  Brain:            ${result.brain.state}`);
            console.log(`  restart required: ${result.restartRequired ? 'yes' : 'no'}`);
            console.log(`  verify:           ${result.nextCheck}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.json)
                console.log(JSON.stringify({ ok: false, error: message }, null, 2));
            else
                console.error(`Runtime repair failed: ${message}`);
            process.exitCode = 1;
        }
    });
}
//# sourceMappingURL=runtime-identity.js.map