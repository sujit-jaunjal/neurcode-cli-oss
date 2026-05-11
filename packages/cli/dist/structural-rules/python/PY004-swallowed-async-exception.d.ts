import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY004SwallowedAsyncException implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY004-swallowed-async-exception.d.ts.map