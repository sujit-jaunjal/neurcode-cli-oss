/**
 * Semantic Intent Expander (Phase 2)
 *
 * Calls an LLM exactly ONCE per unique intent to produce a structured
 * semantic expansion. The result is stored as a signed governance artifact
 * (HMAC-SHA256) so all subsequent enforcement runs against the same
 * deterministic stored result — never re-calling the LLM.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  TRUST MODEL                                                 │
 * │                                                              │
 * │  LLM is used for UNDERSTANDING (once, stored, signed).      │
 * │  All ENFORCEMENT decisions are deterministic (regex/AST).   │
 * │                                                              │
 * │  This mirrors how human architects write design docs:        │
 * │  judgment applied once → all reviews check the document.    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Provider support: any OpenAI-compatible HTTP endpoint.
 *   - OpenAI:    NEURCODE_OPENAI_API_KEY  (default)
 *   - Anthropic: NEURCODE_ANTHROPIC_API_KEY  (maps to their API)
 *   - Local:     NEURCODE_LLM_BASE_URL=http://localhost:11434/v1  (Ollama)
 *
 * Fallback: if no API key is configured, silently falls back to the
 * deterministic keyword parser — expansion still produced, marked
 * expansionMethod='keyword-fallback'.
 */
import { z } from 'zod';
import { ParsedIntent } from './parser';
/**
 * The structured output schema enforced on the LLM response.
 * Zod parses and strips any extra fields — if the LLM hallucinates
 * fields outside this schema they are silently dropped.
 */
declare const SemanticExpansionResponseSchema: z.ZodObject<{
    semanticDescription: z.ZodString;
    domains: z.ZodArray<z.ZodString>;
    affectedLayerHints: z.ZodArray<z.ZodString>;
    expectedFilePatterns: z.ZodArray<z.ZodString>;
    policyApplicability: z.ZodArray<z.ZodString>;
    riskLevel: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>;
    riskRationale: z.ZodString;
    semanticKeywords: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
type SemanticExpansionResponse = z.infer<typeof SemanticExpansionResponseSchema>;
export interface SemanticIntentExpansion extends SemanticExpansionResponse {
    /** SHA-256 of normalized intent — stable identifier for this expansion. */
    intentHash: string;
    rawIntent: string;
    expansionMethod: 'llm' | 'keyword-fallback';
    modelUsed: string | null;
    expandedAt: string;
    /** Carries parsed keyword data for backward-compat with existing matcher. */
    parsedKeyword: ParsedIntent;
    /** HMAC-SHA256 signature — tamper-evident. Present when signing key configured. */
    signature?: {
        algorithm: 'hmac-sha256';
        keyId: string | null;
        signedAt: string;
        payloadHash: string;
        value: string;
    };
}
export interface ExpandIntentOptions {
    cwd: string;
    /** Force a fresh LLM call even if a cached expansion exists. */
    forceRefresh?: boolean;
    /** Skip signing (for tests). */
    skipSigning?: boolean;
}
/**
 * Expands an intent into a rich semantic governance artifact.
 *
 * Call flow:
 *  1. Check cache (.neurcode/intent-expansions/{hash}.json)
 *  2. If fresh cached → return it (pure deterministic path)
 *  3. If no cache and LLM available → call LLM once, sign, store, return
 *  4. If no cache and no LLM → keyword fallback, sign, store, return
 *
 * The returned artifact is always HMAC-signed if a signing key is configured.
 * Callers must treat this artifact as the authoritative intent record.
 */
export declare function expandIntent(rawIntent: string, options: ExpandIntentOptions): Promise<SemanticIntentExpansion>;
/**
 * Loads a cached expansion for an intent, or null if not found.
 * Used by verify/plan to retrieve the stored governance artifact.
 */
export declare function loadCachedExpansion(cwd: string, rawIntent: string): SemanticIntentExpansion | null;
/**
 * Lists all cached expansion hashes in this workspace.
 */
export declare function listCachedExpansions(cwd: string): string[];
/**
 * Returns a human-readable summary of what the intent expander knows.
 * Useful for `neurcode intent show` command and audit reports.
 */
export declare function formatExpansionSummary(exp: SemanticIntentExpansion): string;
export {};
//# sourceMappingURL=semantic-expander.d.ts.map