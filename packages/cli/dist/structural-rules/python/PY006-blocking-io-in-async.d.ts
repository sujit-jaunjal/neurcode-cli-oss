import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY006BlockingIOInAsync implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY006-blocking-io-in-async.d.ts.map