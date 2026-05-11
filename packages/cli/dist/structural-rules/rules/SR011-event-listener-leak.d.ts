import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR011EventListenerLeak implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR011-event-listener-leak.d.ts.map