import type { GovernanceVerifyCompletedPayload } from './contracts';
/**
 * Derive a privacy-safe, bounded payload from canonical verify JSON.
 * Does not copy excerpts, titles, or file paths.
 */
export declare function harvestGovernanceVerifyCompleted(canonical: Record<string, unknown> | null): {
    payload: GovernanceVerifyCompletedPayload;
    findingSetDigest: string;
} | null;
