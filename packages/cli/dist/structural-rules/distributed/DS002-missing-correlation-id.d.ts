import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class DS002MissingCorrelationId implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=DS002-missing-correlation-id.d.ts.map