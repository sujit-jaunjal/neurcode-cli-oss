import type { ChangeContractExpectedSymbol, ChangeContractSymbolAction } from './change-contract';
interface PlanFileLike {
    path: string;
    action: ChangeContractSymbolAction;
    reason?: string;
    suggestion?: string;
    rationale?: string;
}
export interface PlanLike {
    summary?: string;
    recommendations?: string[];
    files?: PlanFileLike[];
    symbols?: unknown;
}
export declare function mapPlanSymbolsForChangeContract(plan: PlanLike): ChangeContractExpectedSymbol[];
export {};
//# sourceMappingURL=plan-symbols.d.ts.map