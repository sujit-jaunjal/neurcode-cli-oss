import type { DiffFile } from '@neurcode-ai/diff-parser';
export type AiDebtMode = 'off' | 'advisory' | 'enforce';
export interface AiDebtThresholds {
    maxAddedTodoFixme: number;
    maxAddedConsoleLogs: number;
    maxAddedAnyTypes: number;
    maxLargeFilesTouched: number;
    largeFileDeltaLines: number;
    maxBloatFiles: number;
}
export interface AiDebtMetrics {
    addedTodoFixme: number;
    addedConsoleLogs: number;
    addedAnyTypes: number;
    largeFilesTouched: number;
    bloatFiles: number;
}
export interface AiDebtViolation {
    code: 'added_todo_fixme' | 'added_console_logs' | 'added_any_types' | 'large_files_touched' | 'bloat_files' | 'db_in_ui' | 'missing_validation';
    metric: keyof AiDebtMetrics | 'architectural';
    observed: number;
    budget: number;
    message: string;
    files?: string[];
}
export interface AiDebtBudgetConfig {
    mode: AiDebtMode;
    thresholds: AiDebtThresholds;
    source: 'defaults' | 'env' | 'file' | 'file+env';
}
export interface AiDebtEvaluation {
    mode: AiDebtMode;
    pass: boolean;
    score: number;
    metrics: AiDebtMetrics;
    thresholds: AiDebtThresholds;
    violations: AiDebtViolation[];
    source: AiDebtBudgetConfig['source'];
}
interface EvaluateAiDebtInput {
    diffFiles: DiffFile[];
    bloatCount: number;
    config: AiDebtBudgetConfig;
}
export declare function resolveAiDebtBudgetConfig(projectRoot: string, options?: {
    strictDefault?: boolean;
}): AiDebtBudgetConfig;
export declare function evaluateAiDebtBudget(input: EvaluateAiDebtInput): AiDebtEvaluation;
export {};
//# sourceMappingURL=ai-debt-budget.d.ts.map