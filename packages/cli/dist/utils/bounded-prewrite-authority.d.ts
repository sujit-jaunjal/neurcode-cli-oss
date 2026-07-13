import { type GovernanceDecisionV15, type GovernancePreWriteDecisionV15 } from '@neurcode-ai/contracts';
import type { GovernanceSession } from '@neurcode-ai/governance-runtime';
export declare const GOVERNANCE_PREWRITE_DEADLINE_MS = 2000;
export declare function evaluateBoundedPreWriteAuthority(input: {
    repoRoot: string;
    session: GovernanceSession;
    rawDecision: GovernanceDecisionV15;
    deterministicStructuralBlock?: boolean;
    structuralProtected: boolean;
    exactApprovalCurrentContext: boolean;
    startedAtMs: number;
    nowMs?: number;
}): GovernancePreWriteDecisionV15;
//# sourceMappingURL=bounded-prewrite-authority.d.ts.map