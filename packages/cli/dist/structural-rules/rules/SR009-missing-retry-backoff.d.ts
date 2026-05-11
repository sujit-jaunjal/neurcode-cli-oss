import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR009MissingRetryBackoff implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR009-missing-retry-backoff.d.ts.map