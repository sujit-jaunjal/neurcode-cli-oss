import { type AgentRuntimeAdapterId, type AgentRuntimeEnforcementLevel, type GovernanceSession } from '@neurcode-ai/governance-runtime';
export declare const AGENT_SESSION_LAUNCH_SCHEMA_VERSION: "neurcode.agent-session-launch.v1";
export declare const AGENT_SESSION_HANDSHAKE_SCHEMA_VERSION: "neurcode.agent-session-handshake.v1";
export type AgentSessionLauncherAgent = 'claude' | 'copilot' | 'codex' | 'cursor' | 'gemini' | 'generic-mcp' | 'vscode';
export type AgentHandshakeStatus = 'awaiting_agent_prompt' | 'awaiting_plan_capture' | 'observe_only' | 'mcp_connected' | 'prompt_seen' | 'plan_captured';
export interface AgentSessionLaunchOptions {
    agent?: string;
    goal: string;
    dir?: string;
    plan?: string;
    activate?: boolean;
    forceProfile?: boolean;
    actor?: string;
}
export interface AgentSessionLaunchResult {
    schemaVersion: typeof AGENT_SESSION_LAUNCH_SCHEMA_VERSION;
    ok: true;
    generatedAt: string;
    repoRoot: string;
    privacy: {
        metadataOnly: true;
        sourceUploaded: false;
        sourceIncluded: false;
    };
    profile: {
        status: string;
        refreshed: boolean;
        profileHash: string;
        topologyHash: string;
        trackedFileCount: number;
        reasons: string[];
    };
    session: {
        sessionId: string;
        goal: string;
        scopeMode: GovernanceSession['contract']['scopeMode'];
        allowedGlobs: string[];
        approvalRequiredGlobs: string[];
        planRevision: number | null;
    };
    agent: {
        requested: string;
        normalized: AgentSessionLauncherAgent;
        adapter: AgentRuntimeAdapterId;
        enforcementLevel: AgentRuntimeEnforcementLevel;
        compatibilityMode: string;
        automatic: boolean;
        hardDeny: boolean;
        enforceable: string[];
        advisoryOnly: string[];
        supervisorSupported: boolean;
        description: string;
    };
    activation: {
        attempted: boolean;
        hooksInstalled?: boolean;
        mcpConfigured?: boolean;
    };
    handshake: {
        status: AgentHandshakeStatus;
        required: boolean;
        nextEvent: string | null;
        starterPrompt: string;
        instructions: string[];
    };
    commands: {
        status: string;
        approve: string;
        finish: string;
        capturePlan: string;
    };
}
export interface AgentSessionLauncherState {
    agent: AgentSessionLaunchResult['agent'];
    handshakeStatus: AgentHandshakeStatus;
    launchedAt?: string;
    promptSeenAt?: string;
    launchEventId?: string;
}
export declare function adapterForLauncherAgent(agent: AgentSessionLauncherAgent): AgentRuntimeAdapterId;
export declare function latestAgentLauncherState(session: GovernanceSession): AgentSessionLauncherState | null;
export declare function launchAgentSession(options: AgentSessionLaunchOptions): Promise<AgentSessionLaunchResult>;
export declare function recordLauncherHandshake(repoRoot: string, session: GovernanceSession, input: {
    handshakeStatus: AgentHandshakeStatus;
    promptMatched?: 'session_id' | 'active_launcher' | 'manual';
    source?: string;
    message?: string;
}): GovernanceSession;
//# sourceMappingURL=agent-session-launcher.d.ts.map