import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY013MutableDefaultArg implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY013-mutable-default-arg.d.ts.map