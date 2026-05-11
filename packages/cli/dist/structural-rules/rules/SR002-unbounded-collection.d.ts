import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR002UnboundedCollection implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR002-unbounded-collection.d.ts.map