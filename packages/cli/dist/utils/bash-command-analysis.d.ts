export type BashMutationOperation = 'redirect' | 'rm' | 'mv' | 'cp' | 'touch' | 'mkdir' | 'tee' | 'sed_in_place' | 'git_restore' | 'git_checkout_path' | 'runtime_write' | 'unknown_mutation';
export interface BashCommandAnalysis {
    mutates: boolean;
    suspicious: boolean;
    readOnly: boolean;
    /**
     * True when the command is an operator diagnostic/readback command and should
     * not be counted as a governed code edit in session evidence. This includes
     * plain read-only commands and read-only commands whose stdout/stderr is
     * redirected outside the repository for inspection.
     */
    operatorDiagnostic: boolean;
    operation: BashMutationOperation | 'read_only' | 'unclassified';
    targetPaths: string[];
    commandFingerprint: string;
    commandPreview: string;
}
export declare function analyzeBashCommand(command: string): BashCommandAnalysis;
//# sourceMappingURL=bash-command-analysis.d.ts.map