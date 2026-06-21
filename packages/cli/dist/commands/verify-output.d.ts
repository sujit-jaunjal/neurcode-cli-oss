import { type VerifyOutput } from '@neurcode-ai/contracts';
import type { FlowIssue, IntentIssue, IntentSummary, RegressionIssue } from '../intent-engine';
export interface VerifyTriageItem {
    file: string;
    message: string;
    policy: string;
    severity: 'critical' | 'high' | 'warning' | 'info' | 'block';
    source: 'violation' | 'warning' | 'scope' | 'expedite';
}
export type CanonicalVerifyOutput = VerifyOutput & {
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    score: number;
    blockingCount: number;
    advisoryCount: number;
    blockingItems: VerifyTriageItem[];
    advisoryItems: VerifyTriageItem[];
    intentIssues: IntentIssue[];
    intentDomains: string[];
    intentSummary: IntentSummary | null;
    flowIssues: FlowIssue[];
    regressions: RegressionIssue[];
    expediteModeUsed: boolean;
    expediteCount: number;
    expediteItems: VerifyTriageItem[];
    expediteFollowUpChecklist: string[];
    expediteNote?: string;
    engineeringContext?: unknown;
    driftIntelligence?: unknown;
    evaluationStatus?: 'evaluated' | 'partial' | 'not_evaluated';
    verificationCoverage?: unknown;
};
export declare const EXPEDITE_FOLLOW_UP_CHECKLIST: readonly ["Add validation back", "Move logic to proper layer", "Remove temporary code"];
export declare function containsAnyToken(value: string, tokens: string[]): boolean;
export declare function isSecurityOrAuthViolation(fileRaw: string, policyRaw: string, messageRaw: string): boolean;
export declare function isCriticalScopeBreach(fileRaw: string, messageRaw: string): boolean;
export declare function toCanonicalVerifyOutput(payload: Record<string, unknown>): CanonicalVerifyOutput;
export declare function emitCanonicalVerifyJson(payload: Record<string, unknown>, onEmit?: (canonical: CanonicalVerifyOutput) => void): void;
export declare function buildDeterministicLayerSummary(payload: Record<string, unknown>): Record<string, unknown>;
//# sourceMappingURL=verify-output.d.ts.map