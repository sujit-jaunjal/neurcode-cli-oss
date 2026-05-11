import { StructuralRule, StructuralViolation, RuleLanguage } from '../types';
export declare class PY007SQLAlchemySessionLeak implements StructuralRule {
    id: string;
    name: string;
    policyRef: string;
    severity: "BLOCKING";
    languages: RuleLanguage[];
    description: string;
    check(filePath: string, sourceText: string): StructuralViolation[];
}
//# sourceMappingURL=PY007-sqlalchemy-session-leak.d.ts.map