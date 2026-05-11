import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class SR005HalfOpenProbeGate implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "ADVISORY";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=SR005-halfopen-probe-gate.d.ts.map