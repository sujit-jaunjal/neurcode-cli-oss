/**
 * Pilot Readiness Validator (Phase 6 — Pilot Readiness Hardening)
 *
 * Checks that a repository meets all prerequisites for a reliable Neurcode
 * onboarding. Designed to be runnable in under 10 seconds with no external
 * network calls.
 *
 * Usage: runPilotReadinessCheck(projectRoot) → PilotReadinessReport
 *
 * Returns:
 *   ready:    true if all blockers pass (warnings are non-blocking)
 *   blockers: list of hard failures that prevent governance from running
 *   warnings: list of soft issues that degrade experience but don't block
 */
export interface PilotReadinessReport {
    ready: boolean;
    blockers: string[];
    warnings: string[];
    checks: PilotReadinessCheck[];
    durationMs: number;
}
export interface PilotReadinessCheck {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
}
/**
 * Run all pilot readiness checks for a repository.
 *
 * @param projectRoot  Absolute path to the project root
 * @returns            PilotReadinessReport with ready flag, blockers, warnings, and per-check results
 */
export declare function runPilotReadinessCheck(projectRoot: string): PilotReadinessReport;
//# sourceMappingURL=pilot-readiness.d.ts.map