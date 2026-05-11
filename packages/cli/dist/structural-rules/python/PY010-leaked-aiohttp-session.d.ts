import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY010LeakedAiohttpSession implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY010-leaked-aiohttp-session.d.ts.map