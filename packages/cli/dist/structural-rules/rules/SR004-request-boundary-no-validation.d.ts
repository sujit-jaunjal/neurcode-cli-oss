import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR004RequestBoundaryNoValidation implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR004-request-boundary-no-validation.d.ts.map