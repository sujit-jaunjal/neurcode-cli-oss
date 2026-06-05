/**
 * Agent Runtime Adapter Contract V1
 *
 * Stable, source-free local ingress shared by hooks, MCP clients, IDE
 * companions, and future agent integrations. The adapter contract describes
 * agent lifecycle events; the CLI remains the local enforcement engine.
 */
export declare const AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION: "neurcode.agent-runtime-event.v1";
export declare const AGENT_RUNTIME_DECISION_SCHEMA_VERSION: "neurcode.agent-runtime-decision.v1";
export type AgentRuntimeAdapterId = 'claude-code-hooks' | 'copilot-hooks' | 'generic-mcp' | 'codex-mcp' | 'cursor-mcp' | 'vscode-extension' | 'github-action';
export type AgentRuntimeEnforcementLevel = 'hard_deny' | 'cooperative' | 'observe_only' | 'post_change_backstop';
export type AgentRuntimeControlLevel = 'hard_block_capable' | 'supervised_advisory_capable' | 'evidence_only_capable' | 'unsupported_unknown';
export type AgentRuntimeCompatibilityMode = 'hard_pre_write_enforcement' | 'cooperative_check' | 'supervisor_diff_watch' | 'evidence_only';
export type AgentRuntimeEventType = 'session.handshake' | 'session.start' | 'plan.capture' | 'plan.amend' | 'edit.before' | 'edit.after' | 'session.finish' | 'approval.apply' | 'obligation.waive';
export type AgentRuntimeDecision = 'recorded' | 'allow' | 'warn' | 'deny' | 'observe';
export interface AgentRuntimeEventPayload {
    goal?: string;
    filePath?: string;
    toolName?: string;
    plan?: string | {
        summary?: string;
        steps?: string[];
    };
    summary?: string;
    scope?: string[];
    reason?: string;
    path?: string;
    obligationId?: string;
    sessionId?: string;
    expiresAt?: string;
    ttlMinutes?: number;
    actor?: string;
}
export interface AgentRuntimeEvent {
    schemaVersion: typeof AGENT_RUNTIME_ADAPTER_SCHEMA_VERSION;
    adapter: AgentRuntimeAdapterId;
    eventType: AgentRuntimeEventType;
    cwd?: string;
    eventId?: string;
    timestamp?: string;
    payload: AgentRuntimeEventPayload;
}
export interface AgentRuntimeAdapterCapability {
    adapter: AgentRuntimeAdapterId;
    enforcementLevel: AgentRuntimeEnforcementLevel;
    controlLevel: AgentRuntimeControlLevel;
    compatibilityMode: AgentRuntimeCompatibilityMode;
    automatic: boolean;
    events: AgentRuntimeEventType[];
    enforceable: string[];
    advisoryOnly: string[];
    supervisorSupported: boolean;
    description: string;
}
export interface AgentRuntimeDecisionEnvelope {
    schemaVersion: typeof AGENT_RUNTIME_DECISION_SCHEMA_VERSION;
    ok: boolean;
    adapter: AgentRuntimeAdapterId;
    enforcementLevel: AgentRuntimeEnforcementLevel;
    eventType: AgentRuntimeEventType;
    decision: AgentRuntimeDecision;
    message: string;
    wouldBlock?: boolean;
    payload?: Record<string, unknown>;
}
export declare function listAgentRuntimeAdapterCapabilities(): AgentRuntimeAdapterCapability[];
export declare function getAgentRuntimeAdapterCapability(adapter: AgentRuntimeAdapterId): AgentRuntimeAdapterCapability;
export declare function normalizeAgentRuntimeEvent(value: unknown): AgentRuntimeEvent;
//# sourceMappingURL=agent-runtime-adapter.d.ts.map