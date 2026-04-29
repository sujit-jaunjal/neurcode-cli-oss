export interface LocalPlanData {
    intent: string;
    expectedFiles: string[];
    constraints: string[];
    createdAt: string;
    lastUpdated: string;
}
export interface LocalPlanSnapshot extends LocalPlanData {
    path: string;
    existed: boolean;
}
export declare function resolveLocalPlanPath(projectRoot: string): string;
export declare function ensureLocalPlan(projectRoot: string): LocalPlanSnapshot;
export interface PlanSyncUpdateResult {
    path: string;
    addedFiles: string[];
    expectedFiles: string[];
    intent: string;
    constraints: string[];
    createdAt: string;
    lastUpdated: string;
}
export declare function addExpectedFilesToLocalPlan(projectRoot: string, files: string[]): PlanSyncUpdateResult;
export interface IntentPlanInitializationResult {
    path: string;
    intent: string;
    detectedSignals: Array<'auth' | 'api' | 'ui'>;
    expectedFiles: string[];
    constraints: string[];
    createdAt: string;
    lastUpdated: string;
}
export declare function initializeLocalPlanFromIntent(projectRoot: string, intentInput: string): IntentPlanInitializationResult;
//# sourceMappingURL=plan-sync.d.ts.map