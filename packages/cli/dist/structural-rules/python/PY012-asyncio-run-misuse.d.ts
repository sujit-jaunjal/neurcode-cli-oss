import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY012AsyncioRunMisuse implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY012-asyncio-run-misuse.d.ts.map