export type BashMutationOperation = 'redirect' | 'rm' | 'mv' | 'cp' | 'touch' | 'mkdir' | 'tee' | 'sed_in_place' | 'git_restore' | 'git_checkout_path' | 'runtime_write' | 'unknown_mutation';
export interface BashCommandAnalysis {
    mutates: boolean;
    suspicious: boolean;
    readOnly: boolean;
    operation: BashMutationOperation | 'read_only' | 'unclassified';
    targetPaths: string[];
    commandFingerprint: string;
    commandPreview: string;
}
export declare function analyzeBashCommand(command: string): BashCommandAnalysis;
//# sourceMappingURL=bash-command-analysis.d.ts.map