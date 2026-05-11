import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY008CeleryTaskWithoutRetry implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY008-celery-task-without-retry.d.ts.map