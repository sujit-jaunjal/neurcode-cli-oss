/**
 * State Management Utility
 *
 * Manages CLI state in .neurcode/config.json (project-local state)
 * Separates session state from user auth config
 */
export interface CliState {
    projectId?: string;
    orgId?: string;
    orgName?: string;
    workspaceType?: 'personal' | 'organization';
    workspaceRole?: string;
    linkedAt?: string;
    sessionId?: string;
    lastPlanId?: string;
    activePlanId?: string;
    activeSessionId?: string;
    lastPlanGeneratedAt?: string;
}
/**
 * Load state from .neurcode/config.json
 */
export declare function loadState(): CliState;
/**
 * Save state to .neurcode/config.json
 */
export declare function saveState(state: Partial<CliState>): void;
/**
 * Get session ID from state
 */
export declare function getSessionId(): string | null;
/**
 * Set session ID in state
 */
export declare function setSessionId(sessionId: string): void;
/**
 * Clear session ID from state
 */
export declare function clearSessionId(): void;
/**
 * Get project ID from state
 */
export declare function getProjectId(): string | null;
/**
 * Set project ID in state
 */
export declare function setProjectId(projectId: string): void;
/**
 * Get organization ID from state
 */
export declare function getOrgId(): string | null;
/**
 * Set organization ID in state
 */
export declare function setOrgId(orgId: string, orgName?: string): void;
/**
 * Persist the full governance ownership context for this repository.
 */
export declare function setWorkspaceContext(input: {
    orgId: string;
    orgName?: string;
    workspaceType?: 'personal' | 'organization';
    workspaceRole?: string;
    projectId?: string;
}): void;
/**
 * Get organization name from state
 */
export declare function getOrgName(): string | null;
/**
 * Get workspace ownership type from state.
 */
export declare function getWorkspaceType(): 'personal' | 'organization' | null;
/**
 * Get workspace role captured during repo initialization.
 */
export declare function getWorkspaceRole(): string | null;
/**
 * Get last plan ID from state
 */
export declare function getLastPlanId(): string | null;
/**
 * Set last plan ID in state
 * @deprecated Use setActivePlanId instead
 */
export declare function setLastPlanId(planId: string): void;
/**
 * Get active plan ID from state
 * Falls back to lastPlanId for backward compatibility
 */
export declare function getActivePlanId(): string | null;
/**
 * Set active plan ID in state
 */
export declare function setActivePlanId(planId: string): void;
/**
 * Get last plan generated timestamp
 */
export declare function getLastPlanGeneratedAt(): string | null;
/**
 * Set last plan generated timestamp
 */
export declare function setLastPlanGeneratedAt(timestamp: string): void;
//# sourceMappingURL=state.d.ts.map