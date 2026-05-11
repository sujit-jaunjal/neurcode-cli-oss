import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR012PromiseRaceLeak implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR012-promise-race-leak.d.ts.map