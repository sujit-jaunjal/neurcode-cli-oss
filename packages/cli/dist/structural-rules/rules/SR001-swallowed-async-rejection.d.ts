import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR001SwallowedAsyncRejection implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR001-swallowed-async-rejection.d.ts.map