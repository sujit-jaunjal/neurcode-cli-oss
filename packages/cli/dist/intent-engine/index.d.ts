export { parseIntent, type ParsedIntent } from './parser';
export { indexDiffFiles, type FileMeta, type FileLayer } from './indexer';
export { matchIntentToCode, type IntentIssue, type MatchResult, type ComponentQualityLevel, } from './matcher';
export { computeCoverage, computeIntentSummary, formatCoverageBar, formatComponentLabel, type DomainCoverage, type IntentSummary, type ConfidenceLevel, type SystemStatus, } from './coverage';
export { requirementsForDomain, labelForComponent, type ComponentKey } from './requirements';
export { buildFlowGraph, type FileNode, type GraphLayer } from './graph';
export { validateFlows, type FlowIssue } from './flow-validator';
export { type FlowRule, type FlowRuleType } from './flow-rules';
export { loadPreviousState, saveCurrentState, buildCurrentState, type IntentState } from './state';
export { detectRegressions, type RegressionIssue, type RegressionType } from './regression';
import type { DiffFile } from '@neurcode-ai/diff-parser';
import { type IntentIssue, type ComponentQualityLevel } from './matcher';
import { type IntentSummary } from './coverage';
import { type FlowIssue } from './flow-validator';
import { type RegressionIssue } from './regression';
export interface IntentEngineResult {
    intentIssues: IntentIssue[];
    checkedDomains: string[];
    foundComponents: Record<string, string[]>;
    componentMap: Record<string, string[]>;
    componentQuality: Record<string, ComponentQualityLevel>;
    intentSummary: IntentSummary | null;
    /** V5: wiring and connectivity issues between components */
    flowIssues: FlowIssue[];
    /** V6: previously-working behaviour that has now degraded */
    regressions: RegressionIssue[];
    intentText: string;
}
/**
 * Single entry point: parse intent → index → match → coverage → flow → regression.
 * Returns empty result if intent is blank or diff is empty.
 * Never throws — errors are caught and return a safe empty result.
 */
export declare function runIntentEngine(intentText: string, diffFiles: DiffFile[], projectRoot?: string): IntentEngineResult;
//# sourceMappingURL=index.d.ts.map