import type { DiffFile } from '@neurcode-ai/diff-parser';
export type AdvisorySignalSeverity = 'info' | 'warn';
export interface AdvisorySignal {
    code: 'SENSITIVE_DOMAIN_SPAN' | 'DIRECT_DB_IN_REQUEST_LAYER' | 'LARGE_CHANGE_SURFACE' | 'CODE_WITHOUT_TEST_UPDATES' | 'INFRA_AND_APP_MIXED' | 'POSSIBLE_SECRET_ADDITION';
    severity: AdvisorySignalSeverity;
    title: string;
    detail: string;
    files: string[];
    advisoryOnly: true;
    confidence: 'low' | 'medium';
    evidence: string[];
    uncertainty: string;
    structuralCoverageGap: string;
}
interface AdvisoryInput {
    diffFiles: DiffFile[];
    summary?: {
        totalFiles: number;
        totalAdded: number;
        totalRemoved: number;
    };
}
export declare function evaluateAdvisorySignals(input: AdvisoryInput): AdvisorySignal[];
export {};
//# sourceMappingURL=advisory-signals.d.ts.map