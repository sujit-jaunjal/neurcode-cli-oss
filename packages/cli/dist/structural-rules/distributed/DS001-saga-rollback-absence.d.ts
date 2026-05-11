import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class DS001SagaRollbackAbsence implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=DS001-saga-rollback-absence.d.ts.map