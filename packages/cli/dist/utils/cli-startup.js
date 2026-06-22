"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStartupConsistencyChecks = runStartupConsistencyChecks;
exports.buildRuntimeIdentityPayload = buildRuntimeIdentityPayload;
const cli_runtime_1 = require("@neurcode-ai/cli-runtime");
const path_1 = require("path");
function shouldEmitDiagnostics() {
    const raw = process.env.NEURCODE_RUNTIME_DIAGNOSTICS?.trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
}
function isSupervisorChild() {
    const raw = process.env.NEURCODE_AGENT_GUARD_SUPERVISOR_CHILD?.trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
}
function isIdentityCommand(argv) {
    return argv.includes('runtime') && argv.includes('identity');
}
function isAuthorityBootstrapCommand(argv) {
    return isIdentityCommand(argv)
        || (argv.includes('runtime') && argv.includes('repair'))
        || argv.includes('activate')
        || argv.includes('--version')
        || argv.includes('--help');
}
function runStartupConsistencyChecks(input) {
    if (isIdentityCommand(input.argv)) {
        return null;
    }
    const report = (0, cli_runtime_1.checkDeploymentConsistency)({
        bundledCliDir: input.bundledCliDir,
        strict: false,
        spawnExpectedEntry: isSupervisorChild()
            ? process.env.NEURCODE_CLI_SPAWN_ENTRY?.trim() ?? null
            : null,
    });
    if (shouldEmitDiagnostics()) {
        const payload = {
            type: 'neurcode.cli.runtime.diagnostics',
            identity: report.identity,
            installations: report.installations,
            violations: report.violations,
        };
        console.error(JSON.stringify(payload));
    }
    if (!report.ok) {
        for (const violation of report.violations) {
            console.error(`[neurcode-cli] deployment warning: [${violation.code}] ${violation.message}`);
        }
        try {
            (0, cli_runtime_1.assertDeploymentConsistency)({
                bundledCliDir: input.bundledCliDir,
                spawnExpectedEntry: isSupervisorChild()
                    ? process.env.NEURCODE_CLI_SPAWN_ENTRY?.trim() ?? null
                    : null,
                context: isSupervisorChild() ? 'supervisor child' : 'cli startup',
            });
        }
        catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    }
    if (!isAuthorityBootstrapCommand(input.argv)) {
        const authority = (0, cli_runtime_1.assessRuntimeAuthority)({
            repoRoot: process.cwd(),
            current: report.identity,
            adapter: 'cli',
            protectedOperation: false,
            manifest: (0, cli_runtime_1.readActivatedRuntimeManifest)(process.cwd()),
            installations: report.installations,
        });
        if (!authority.ok) {
            console.error(`[neurcode-cli] degraded runtime authority: ${authority.status}. Run \`${authority.repairCommand}\`.`);
        }
    }
    return report;
}
function buildRuntimeIdentityPayload(bundledCliDir) {
    const identity = (0, cli_runtime_1.collectCliRuntimeIdentity)({ bundledCliDir });
    const report = (0, cli_runtime_1.checkDeploymentConsistency)({
        bundledCliDir,
        strict: false,
    });
    return {
        ok: report.ok,
        identity,
        installations: report.installations,
        violations: report.violations,
        bundledCliDir: (0, path_1.join)(bundledCliDir, 'index.js'),
    };
}
//# sourceMappingURL=cli-startup.js.map