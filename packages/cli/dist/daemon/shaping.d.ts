import type { RunExecutionResult } from './runtime/execution-bus';
type GovernanceEnvelopeOptions = {
    executionBoundary?: Record<string, unknown>;
    compatibilityBoundary?: Record<string, unknown>;
};
export declare function buildGovernanceEnvelope(run: RunExecutionResult, options?: GovernanceEnvelopeOptions): Record<string, unknown>;
export declare function buildExecutionResponseMeta(run: RunExecutionResult, options?: GovernanceEnvelopeOptions): Record<string, unknown>;
export declare function normalizeVerifyPayloadForLegacyClients(payload: Record<string, unknown> | null): Record<string, unknown> | null;
export declare function normalizeFixPayloadForLegacyClients(payload: Record<string, unknown> | null): Record<string, unknown> | null;
export {};
//# sourceMappingURL=shaping.d.ts.map