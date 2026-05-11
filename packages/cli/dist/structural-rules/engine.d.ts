import { StructuralRule, StructuralRuleResult } from './types';
export declare class StructuralRuleEngine {
    private rules;
    private suppressionEnabled;
    register(rule: StructuralRule): void;
    registerAll(rules: StructuralRule[]): void;
    setSuppression(enabled: boolean): void;
    /**
     * Run all registered rules against the provided files.
     * files: array of { filePath, sourceText } — caller provides content, engine doesn't do I/O.
     * Never throws. Failed rules are caught, file is added to skippedFiles.
     */
    analyze(files: Array<{
        filePath: string;
        sourceText: string;
    }>): StructuralRuleResult;
    /** Run only rules whose IDs are in the filter set. */
    analyzeWithFilter(files: Array<{
        filePath: string;
        sourceText: string;
    }>, ruleIds: Set<string>): StructuralRuleResult;
    /** Get all registered rule IDs. */
    getRuleIds(): string[];
}
//# sourceMappingURL=engine.d.ts.map