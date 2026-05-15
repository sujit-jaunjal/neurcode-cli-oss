/**
 * Shared types used across pipeline modules. Kept narrow to avoid a circular
 * dependency between envelope-assembly and verify.ts.
 */
/** Mirror of `PolicyOnlySource` declared inside verify.ts. */
export type PolicyOnlySource = 'explicit' | 'fallback_missing_plan' | 'ci';
//# sourceMappingURL=shared-types.d.ts.map