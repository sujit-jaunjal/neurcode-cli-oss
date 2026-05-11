import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR003TimerWithoutCleanup implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR003-timer-without-cleanup.d.ts.map