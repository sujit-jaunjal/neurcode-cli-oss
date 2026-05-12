import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY014FixedSleepRetry implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY014-fixed-sleep-retry.d.ts.map