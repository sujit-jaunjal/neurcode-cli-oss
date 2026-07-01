"use strict";
/**
 * Agent setup commands for pilot OS — CLI mirror of dashboard agentPreference.
 * Keeps command templates in one place for the shared setup contract.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentSetupCommands = buildAgentSetupCommands;
function buildAgentSetupCommands(agent) {
    if (agent === 'claude') {
        return {
            activate: 'npx -y @neurcode-ai/cli@latest activate claude --dir .',
            health: 'neurcode doctor --runtime',
            start: 'neurcode agent guard start claude --goal "Prove governed value on this repository" --plan "Safe in-scope edit first; exact approval for protected boundary" --no-supervise',
            evidence: 'neurcode session export-admission --explain',
        };
    }
    if (agent === 'cursor') {
        return {
            activate: 'npx -y @neurcode-ai/cli@latest cursor onboard --strict',
            health: 'neurcode cursor health --record',
            start: 'neurcode agent guard start cursor --goal "Prove governed value on this repository" --plan "Safe in-scope edit first; exact approval for protected boundary" --no-supervise',
            evidence: 'neurcode session export-admission --explain',
        };
    }
    if (agent === 'copilot') {
        return {
            activate: 'npx -y @neurcode-ai/cli@latest agent bootstrap copilot',
            health: 'neurcode agent doctor copilot',
            start: 'neurcode agent guard start copilot --goal "Prove governed value on this repository" --plan "Safe in-scope edit first; exact approval for protected boundary" --no-supervise',
            evidence: 'neurcode session export-admission --explain',
        };
    }
    if (agent === 'vscode') {
        return {
            activate: 'npx -y @neurcode-ai/cli@latest agent bootstrap vscode',
            health: 'neurcode agent doctor vscode',
            start: 'neurcode agent guard start vscode --goal "Prove governed value on this repository" --plan "Safe in-scope edit first; exact approval for protected boundary" --no-supervise',
            evidence: 'neurcode session export-admission --explain',
        };
    }
    return {
        activate: `npx -y @neurcode-ai/cli@latest agent bootstrap ${agent}`,
        health: `neurcode agent doctor ${agent}`,
        start: `neurcode agent guard start ${agent} --goal "Prove governed value on this repository" --plan "Safe in-scope edit first; exact approval for protected boundary" --no-supervise`,
        evidence: 'neurcode session export-admission --explain',
    };
}
//# sourceMappingURL=pilot-setup-commands.js.map