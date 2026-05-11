import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY001AsyncioTaskWithoutCancel implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY001-asyncio-task-without-cancel.d.ts.map