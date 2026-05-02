export type PatternKind = 'db_in_ui' | 'missing_validation' | 'todo_fixme';
export declare function classifyViolation(issue: string, policy: string): PatternKind | null;
export declare function detectPattern(content: string, kind: PatternKind): number | null;
//# sourceMappingURL=patterns.d.ts.map