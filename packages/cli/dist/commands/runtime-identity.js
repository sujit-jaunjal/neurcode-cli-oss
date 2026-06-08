"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRuntimeIdentityCommand = registerRuntimeIdentityCommand;
const path_1 = require("path");
const cli_startup_1 = require("../utils/cli-startup");
function registerRuntimeIdentityCommand(runtime) {
    runtime
        .command('identity')
        .description('Print the active Neurcode CLI runtime identity and deployment consistency report')
        .option('--json', 'Output machine-readable JSON')
        .action((options) => {
        const payload = (0, cli_startup_1.buildRuntimeIdentityPayload)((0, path_1.join)(__dirname, '..'));
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
        if (payload.violations.length > 0) {
            console.log('  violations:');
            for (const violation of payload.violations) {
                console.log(`    - [${violation.code}] ${violation.message}`);
            }
        }
    });
}
//# sourceMappingURL=runtime-identity.js.map