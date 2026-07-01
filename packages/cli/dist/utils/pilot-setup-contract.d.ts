/**
 * Builds the shared pilot setup contract for CLI JSON output and dashboard mirror.
 */
import { type PilotSetupContract } from '@neurcode-ai/contracts';
import { type AgentSetupTarget } from './agent-adapter-setup';
export declare function buildPilotSetupContract(input: {
    repoRoot: string;
    agent: AgentSetupTarget;
}): PilotSetupContract;
export declare function readPilotSetupContractFromFile(path: string): PilotSetupContract | null;
//# sourceMappingURL=pilot-setup-contract.d.ts.map