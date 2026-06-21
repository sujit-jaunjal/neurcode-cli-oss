import { Command } from 'commander';
import { type AgentRuntimeAdapterId, type AgentRuntimeDecisionEnvelope, type AgentRuntimeEvent } from '@neurcode-ai/governance-runtime';
export type LocalAgentRuntimeEvent = AgentRuntimeEvent & {
    cwd: string;
};
export declare function launcherAdapterMatches(eventAdapter: AgentRuntimeAdapterId, launchedAdapter?: AgentRuntimeAdapterId): boolean;
export declare function submitAgentRuntimeEvent(event: LocalAgentRuntimeEvent): Promise<AgentRuntimeDecisionEnvelope>;
export declare function runtimeAdapterCommand(program: Command): void;
//# sourceMappingURL=runtime-adapter.d.ts.map