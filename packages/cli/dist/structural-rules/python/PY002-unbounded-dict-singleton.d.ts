import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY002UnboundedDictSingleton implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY002-unbounded-dict-singleton.d.ts.map