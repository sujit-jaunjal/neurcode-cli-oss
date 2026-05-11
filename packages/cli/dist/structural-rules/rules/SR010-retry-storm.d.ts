import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR010RetryStorm implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR010-retry-storm.d.ts.map