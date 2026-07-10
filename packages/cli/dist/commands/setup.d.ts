/**
 * Canonical first-run/resume surface.
 *
 * `neurcode setup` owns only the deterministic activation sequence. Existing
 * commands remain available as compatibility/advanced surfaces, but users no
 * longer need to guess whether login, init, onboard, or activate comes first.
 */
import type { Command } from 'commander';
import { type OnboardAgent, type OnboardEnvironment } from './onboard';
export type SetupStageId = 'install' | 'login' | 'repository' | 'brain' | 'agent';
export type SetupBrainState = 'missing' | 'fresh' | 'partial' | 'stale';
export type SetupAuthState = 'authenticated' | 'missing' | 'invalid' | 'unknown';
export interface SetupSnapshot {
    installed: boolean;
    authState: SetupAuthState;
    repositoryConnected: boolean;
    brainState: SetupBrainState;
    agentConfigured: boolean;
}
export interface SetupStage {
    id: SetupStageId;
    label: string;
    complete: boolean;
}
export interface SetupNextAction {
    stage: SetupStageId | 'agent_selection' | 'first_value_proof';
    label: string;
    command: string;
    reason: string;
}
export interface SetupPlan {
    complete: boolean;
    agent: OnboardAgent | null;
    environment: OnboardEnvironment;
    enforcementPosture: string;
    warnings: string[];
    stages: SetupStage[];
    nextAction: SetupNextAction;
}
/** Pure planner used by the CLI and focused next-step tests. */
export declare function buildSetupPlan(input: {
    snapshot: SetupSnapshot;
    agent: OnboardAgent | null;
    environment: OnboardEnvironment;
}): SetupPlan;
export declare function normalizeProfileAgent(value: unknown): OnboardAgent | null;
export declare function validateSetupAuthentication(input: {
    apiKey: string | null;
    apiUrl: string;
    organizationId?: string | null;
    fetchImpl?: typeof fetch;
}): Promise<SetupAuthState>;
export declare function collectSetupPlan(requestedAgent?: string): Promise<SetupPlan>;
export declare function setupCommand(program: Command): void;
//# sourceMappingURL=setup.d.ts.map