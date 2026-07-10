"use strict";
/**
 * Shared typed setup contract between CLI and dashboard.
 *
 * Both surfaces consume the same JSON shape from `neurcode agent setup --json`
 * and the dashboard setup API mirror. No duplicated command templates.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PILOT_SETUP_CONTRACT_SCHEMA_VERSION = void 0;
exports.buildPilotSetupRecoveryCommand = buildPilotSetupRecoveryCommand;
exports.PILOT_SETUP_CONTRACT_SCHEMA_VERSION = 'neurcode.pilot-setup.v1';
function buildPilotSetupRecoveryCommand(steps) {
    const recovery = steps.find((step) => step.recovery === true);
    if (recovery)
        return recovery.command;
    const doctor = steps.find((step) => step.id === 'health' || step.id === 'doctor');
    return doctor?.command ?? steps[0]?.command ?? 'neurcode doctor --runtime';
}
//# sourceMappingURL=index.js.map