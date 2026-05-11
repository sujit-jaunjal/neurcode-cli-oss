import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR008BackgroundTaskOrphan implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR008-background-task-orphan.d.ts.map