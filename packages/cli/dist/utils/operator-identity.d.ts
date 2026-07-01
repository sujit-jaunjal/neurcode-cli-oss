import type { ApprovalAssurance } from '@neurcode-ai/governance-runtime';
export interface LocalOperatorIdentity {
    approvedBy: string;
    assurance: ApprovalAssurance;
}
/**
 * Derive a local operator actor string and approval assurance level.
 *
 * Priority (stops at first available signal):
 *  1. NEURCODE_OPERATOR env → local_asserted
 *  2. git user.name + user.email → local_derived
 *  3. OS username → local_derived
 *  4. fallback → 'unknown_local_actor' / 'unknown'
 */
export declare function deriveLocalOperatorIdentity(repoRoot?: string): LocalOperatorIdentity;
//# sourceMappingURL=operator-identity.d.ts.map