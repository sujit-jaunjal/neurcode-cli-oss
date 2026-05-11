import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY009UnsafePickleDeserialization implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY009-unsafe-pickle-deserialization.d.ts.map