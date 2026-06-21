import { type GovernanceSession, type RepoGovernanceProfile, type RuntimeBlockType } from '@neurcode-ai/governance-runtime';
export declare const PROFILE_DRIFT_RECOVERY_REASON: "active_session_profile_changed";
export declare const PROFILE_DRIFT_RECOVERY_COMMAND: "neurcode session reset-stale --force";
export type ProfileDriftPendingDecisionKind = 'exact_approval' | 'plan_amendment' | 'operator_decision';
export interface ProfileDriftPendingDecision {
    kind: ProfileDriftPendingDecisionKind;
    filePath?: string;
    suggestedApprovalPath?: string;
    proposalId?: string;
    blockType?: RuntimeBlockType;
}
export type ProfileDriftStartRecovery = {
    status: 'no_active_session';
} | {
    status: 'compatible';
    session: GovernanceSession;
} | {
    status: 'blocked';
    reason: typeof PROFILE_DRIFT_RECOVERY_REASON;
    session: GovernanceSession;
    sessionProfileHash: string;
    currentProfileHash: string;
    pendingDecisions: ProfileDriftPendingDecision[];
    recoveryCommand: typeof PROFILE_DRIFT_RECOVERY_COMMAND;
} | {
    status: 'recovered';
    reason: typeof PROFILE_DRIFT_RECOVERY_REASON;
    previousSession: GovernanceSession;
    replacementSession: GovernanceSession;
    sessionProfileHash: string;
    currentProfileHash: string;
    replayVerified: boolean;
};
export declare function pendingProfileDriftDecisions(session: GovernanceSession): ProfileDriftPendingDecision[];
export declare function recoverProfileDriftForSessionStart(input: {
    repoRoot: string;
    currentProfile: RepoGovernanceProfile;
    goal: string;
}): ProfileDriftStartRecovery;
//# sourceMappingURL=profile-drift-recovery.d.ts.map