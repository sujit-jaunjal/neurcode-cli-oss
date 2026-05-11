import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY003BroadExceptClause implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY003-broad-except-clause.d.ts.map