import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY005FastAPIWithoutPydantic implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY005-fastapi-without-pydantic.d.ts.map