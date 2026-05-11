import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR014MutableClosureAsync implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR014-mutable-closure-async.d.ts.map