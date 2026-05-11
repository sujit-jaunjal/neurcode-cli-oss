import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR006FanoutErrorSanitization implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR006-fanout-error-sanitization.d.ts.map