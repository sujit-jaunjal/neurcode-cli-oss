import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR007CrossRequestError implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR007-cross-request-error.d.ts.map