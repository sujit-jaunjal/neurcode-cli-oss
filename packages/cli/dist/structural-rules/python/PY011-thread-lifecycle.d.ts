import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY011ThreadLifecycle implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY011-thread-lifecycle.d.ts.map