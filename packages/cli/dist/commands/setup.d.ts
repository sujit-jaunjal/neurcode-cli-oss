/**
 * Canonical first-run/resume surface.
 *
 * `neurcode setup` owns only the deterministic activation sequence. Existing
 * commands remain available as compatibility/advanced surfaces, but users no
 * longer need to guess whether login, init, onboard, or activate comes first.
 */
import type { Command } from 'commander';
import { type OnboardAgent, type OnboardEnvironment } from './onboard';
export type SetupStageId = 'install' | 'login' | 'repository_context' | 'repository' | 'brain' | 'agent';
export type SetupBrainState = 'missing' | 'fresh' | 'partial' | 'stale';
export type SetupAuthState = 'authenticated' | 'missing' | 'invalid' | 'unknown';
export interface SetupSnapshot {
    installed: boolean;
    authState: SetupAuthState;
    repositoryContextReady: boolean;
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
    stage: SetupStageId | 'agent_selection' | 'first_governed_session';
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
    repositoryContext: SetupRepositoryContext;
    stages: SetupStage[];
    nextAction: SetupNextAction;
}
export interface SetupRepositoryContext {
    status: 'ready' | 'required';
    kind: 'git_repository' | 'linked_directory' | 'none';
    repoRoot: string | null;
    label: string | null;
    explicit: boolean;
    reason: string;
}
/** Pure planner used by the CLI and focused next-step tests. */
export declare function buildSetupPlan(input: {
    snapshot: SetupSnapshot;
    agent: OnboardAgent | null;
    environment: OnboardEnvironment;
    repositoryContext?: SetupRepositoryContext;
}): SetupPlan;
/** Resolve a safe repository boundary without ever creating local state. */
export declare function resolveSetupRepositoryContext(input?: {
    cwd?: string;
    repositoryPath?: string;
}): SetupRepositoryContext;
export declare function normalizeProfileAgent(value: unknown): OnboardAgent | null;
export declare function validateSetupAuthentication(input: {
    apiKey: string | null;
    apiUrl: string;
    organizationId?: string | null;
    fetchImpl?: typeof fetch;
}): Promise<SetupAuthState>;
export declare function collectSetupPlan(requestedAgent?: string, repositoryPath?: string): Promise<SetupPlan>;
export declare function setupCommand(program: Command): void;
//# sourceMappingURL=setup.d.ts.map