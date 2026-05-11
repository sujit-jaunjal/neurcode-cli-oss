import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR013MissingIdempotencyKey implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR013-missing-idempotency-key.d.ts.map