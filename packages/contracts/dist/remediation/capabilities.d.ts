/**
 * RemediationProviderCapabilities — describes what an adapter can and cannot do.
 * Used by the registry for capability negotiation before dispatching requests.
 */
import type { GovernanceFindingCategory } from '../verification/taxonomy';
export type RemediationExecutionMode = 'export' | 'assisted' | 'apply';
export type RemediationTransport = 'stdin-stdout' | 'json-file' | 'http-local' | 'http-remote';
export interface RemediationProviderCapabilities {
    /** Stable provider ID (e.g. "cursor", "claude", "codex", "openai-compatible"). */
    providerId: string;
    /** Human-readable display name. */
    providerName: string;
    /** Supported execution modes. All providers must support 'export'. */
    supportedModes: RemediationExecutionMode[];
    /** Supported transport mechanisms. */
    supportedTransports: RemediationTransport[];
    /** Finding categories this provider handles well. */
    supportedCategories: GovernanceFindingCategory[];
    /** Structural rule IDs this provider has been validated against (e.g. ["SR001", "DS001"]). */
    validatedRuleIds: string[];
    /** Maximum context length the provider can accept (characters). */
    maxContextChars: number;
    /** True when the provider can run without network access (air-gapped). */
    supportsOffline: boolean;
    /** True when the provider requires network access to function. */
    requiresNetwork: boolean;
    /**
     * True when the provider is deterministic given identical inputs.
     * Currently false for all LLM-backed providers.
     * True only for future AST-based adapters.
     */
    isDeterministic: boolean;
    /** Provider schema version for capability negotiation. */
    capabilitiesVersion: string;
}
//# sourceMappingURL=capabilities.d.ts.map