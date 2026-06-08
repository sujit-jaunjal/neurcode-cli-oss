"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURSOR_PILOT_READINESS_SCHEMA_VERSION = void 0;
exports.runCursorPilotReadinessCheck = runCursorPilotReadinessCheck;
const pilot_readiness_1 = require("../governance/pilot-readiness");
const governance_health_1 = require("./governance-health");
const cursor_mcp_agent_1 = require("./cursor-mcp-agent");
const v0_governance_1 = require("./v0-governance");
exports.CURSOR_PILOT_READINESS_SCHEMA_VERSION = 'neurcode.cursor-pilot-readiness.v1';
function runCursorPilotReadinessCheck(dir) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(dir || process.cwd());
    const repo = (0, pilot_readiness_1.runPilotReadinessCheck)(repoRoot);
    const health = (0, governance_health_1.evaluateGovernanceHealth)(repoRoot);
    const mcp = (0, cursor_mcp_agent_1.inspectCursorMcpAdoptionPath)(repoRoot);
    const blockers = [
        ...repo.blockers,
        ...health.checks.filter((check) => check.status === 'fail').map((check) => `[${check.id}] ${check.message}`),
        ...mcp.checks.filter((check) => check.status === 'fail').map((check) => `[${check.id}] ${check.message}`),
    ];
    const warnings = [
        ...repo.warnings,
        ...health.checks.filter((check) => check.status === 'warn').map((check) => `[${check.id}] ${check.message}`),
        ...mcp.checks.filter((check) => check.status === 'warn').map((check) => `[${check.id}] ${check.message}`),
    ];
    return {
        schemaVersion: exports.CURSOR_PILOT_READINESS_SCHEMA_VERSION,
        ready: blockers.length === 0 && mcp.ok && health.verdict !== 'ungoverned',
        repoRoot,
        blockers,
        warnings,
        repo,
        health,
        mcp,
    };
}
//# sourceMappingURL=cursor-pilot-readiness.js.map