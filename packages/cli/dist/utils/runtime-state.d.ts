import { type RuntimeStateAssessment } from '@neurcode-ai/governance-runtime';
export declare function classifyRuntimeState(repoRootInput: string): RuntimeStateAssessment;
export interface OperationalRuntimeState {
    isGitRepo: boolean;
    hasHeadCommit: boolean;
    hasNeurcodeDir: boolean;
    hasIntentPack: boolean;
    hasLastVerifyOutput: boolean;
    enforcement: RuntimeStateAssessment;
}
export type OperationalRuntimeIssue = 'not-a-git-repo' | 'no-head-commit' | 'no-neurcode-dir' | 'no-intent-pack';
export declare function detectRuntimeState(repoRootInput: string): OperationalRuntimeState;
export declare function renderRuntimeStateGuidance(issue: OperationalRuntimeIssue, state: OperationalRuntimeState, options?: {
    commandLabel?: string;
}): number;
//# sourceMappingURL=runtime-state.d.ts.map