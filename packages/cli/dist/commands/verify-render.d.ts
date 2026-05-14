import { evaluateGovernance } from '../utils/governance';
import type { FlowIssue, IntentIssue, IntentSummary, RegressionIssue } from '../intent-engine';
import type { StructuralViolation } from '../structural-rules';
interface VerifyDisplayResult {
    adherenceScore: number;
    bloatCount: number;
    bloatFiles: string[];
    plannedFilesModified: number;
    totalPlannedFiles: number;
    verdict: 'PASS' | 'FAIL' | 'WARN';
    message: string;
}
interface PolicyViolationDisplayItem {
    rule: string;
    file: string;
    severity: string;
    message?: string;
}
interface ChangeContractDisplaySummary {
    path: string;
    violations: Array<{
        code: string;
        message: string;
        file?: string;
        symbol?: string;
        symbolType?: string;
        expected?: string;
        actual?: string;
    }>;
}
export declare function displayGovernanceInsights(chalk: any, governance: ReturnType<typeof evaluateGovernance>, options?: {
    explain?: boolean;
    maxUnexpectedFiles?: number;
}): void;
export declare function displayChangeContractDrift(chalk: any, summary: ChangeContractDisplaySummary, options?: {
    advisory: boolean;
    maxItemsPerGroup?: number;
}): void;
export declare function displayVerifyResults(chalk: any, result: VerifyDisplayResult, policyViolations?: PolicyViolationDisplayItem[], expediteModeUsed?: boolean, intentIssuesForDisplay?: IntentIssue[], intentSummaryForDisplay?: IntentSummary | null, flowIssuesForDisplay?: FlowIssue[], regressionsForDisplay?: RegressionIssue[], structuralViolationsForDisplay?: StructuralViolation[]): void;
export {};
//# sourceMappingURL=verify-render.d.ts.map