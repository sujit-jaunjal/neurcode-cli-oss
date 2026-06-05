import type { AgentRuntimeAdapterId, AgentRuntimeEnforcementLevel } from './agent-runtime-adapter';
import type { GovernanceSession } from './session';
export declare const AGENT_INVOCATION_OBSERVABILITY_SCHEMA_VERSION: "neurcode.agent-invocation-observability.v1";
export type AgentInvocationStatus = 'not_launched' | 'awaiting_handshake' | 'awaiting_plan' | 'awaiting_prewrite_check' | 'following_contract' | 'attention_needed' | 'observe_only' | 'finished';
export type AgentInvocationCheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
export interface AgentInvocationProtocolCheck {
    id: 'session_launch' | 'handshake' | 'plan_capture' | 'prewrite_checks' | 'deny_boundary' | 'exact_approval' | 'replan' | 'finish';
    label: string;
    status: AgentInvocationCheckStatus;
    message: string;
    ts?: string | null;
}
export interface AgentInvocationSummary {
    schemaVersion: typeof AGENT_INVOCATION_OBSERVABILITY_SCHEMA_VERSION;
    status: AgentInvocationStatus;
    score: number;
    adapter: AgentRuntimeAdapterId | string | null;
    enforcementLevel: AgentRuntimeEnforcementLevel | string | null;
    automatic: boolean;
    sourceFree: true;
    launched: boolean;
    handshakeSeen: boolean;
    planCaptured: boolean;
    planBeforeFirstEdit: boolean | null;
    explicitRuntimeCallCount: number;
    editBeforeCallCount: number;
    preWriteCheckCount: number;
    allowedCheckCount: number;
    warningCheckCount: number;
    deniedPreWriteCount: number;
    approvalsApplied: number;
    planAmendments: number;
    pendingPlanAmendments: number;
    finishSeen: boolean;
    eventCount: number;
    latestProtocolEvent: {
        type: string;
        ts: string | null;
        filePath?: string | null;
        decision?: string | null;
    } | null;
    gaps: string[];
    nextAction: string;
    checks: AgentInvocationProtocolCheck[];
}
export declare function buildAgentInvocationSummary(session: GovernanceSession): AgentInvocationSummary;
//# sourceMappingURL=agent-invocation-observability.d.ts.map