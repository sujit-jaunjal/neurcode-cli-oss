/**
 * Agent setup commands for pilot OS — CLI mirror of dashboard agentPreference.
 * Keeps command templates in one place for the shared setup contract.
 */
import type { AgentSetupTarget } from './agent-adapter-setup';
export interface PilotAgentSetupCommands {
    activate: string;
    health: string;
    start: string;
    evidence: string;
}
export declare function buildAgentSetupCommands(agent: AgentSetupTarget): PilotAgentSetupCommands;
//# sourceMappingURL=pilot-setup-commands.d.ts.map