export type BoundedCommandKey = 'run_agent' | 'session_hook_start' | 'session_hook_approve' | 'session_status' | 'runtime_report' | 'runtime_doctor' | 'cloud_status';
export interface CommandBudgetDefinition {
    budgetMs: number;
    recoveryCommand: string;
    phases: string[];
    sessionStart: boolean;
}
export declare const COMMAND_BUDGETS: Record<BoundedCommandKey, CommandBudgetDefinition>;
export declare function maybeRunBoundedCliCommand(argv: string[]): Promise<boolean>;
//# sourceMappingURL=command-budget.d.ts.map