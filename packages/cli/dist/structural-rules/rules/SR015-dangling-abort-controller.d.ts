import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR015DanglingAbortController implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR015-dangling-abort-controller.d.ts.map