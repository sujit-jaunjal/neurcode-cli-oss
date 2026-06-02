/**
 * Runtime Admission — local artifact emission (Phase A, CLI orchestration).
 *
 * Builds and writes `.neurcode/admission/<sessionId>.json`, a SELF-ATTESTED,
 * source-free record. It is a claim that a governed session produced these
 * effects — NOT cryptographic proof that governance ran (see disclaimer).
 *
 * This module keeps governance-runtime's finishSession pure: the admission
 * artifact is a separate file, emitted from the CLI finish paths and wrapped in
 * try/catch by callers so it can never break session finish. No source content,
 * diff hunks, patch text, excerpts, or secrets are ever written.
 */
import { type SelfAttestedAdmissionRecord } from '@neurcode-ai/contracts';
import { type GovernanceClassificationMap, type GovernanceSession } from '@neurcode-ai/governance-runtime';
export declare function admissionDir(repoRoot: string): string;
export declare function admissionRecordPath(repoRoot: string, sessionId: string): string;
/** Tracked, explicit export seam for the future OSS advisory Action. */
export declare function publicAdmissionDir(repoRoot: string): string;
export declare function publicAdmissionRecordPath(repoRoot: string, sessionId: string): string;
/**
 * Derive a path → governance classification map from the session's source-free
 * agent-guard posture. Files with no guard evidence default to 'ungoverned'.
 */
export declare function buildGovernanceClassificationMap(session: GovernanceSession, deletedPaths?: ReadonlySet<string>): GovernanceClassificationMap;
export interface EmitAdmissionOptions {
    repoRoot: string;
    session: GovernanceSession;
    /** Override the base ref for the worktree capture (defaults to HEAD). */
    baseRef?: string;
}
export interface EmitAdmissionResult {
    path: string;
    record: SelfAttestedAdmissionRecord;
}
/**
 * Build + write the self-attested admission artifact for a finished session.
 * Throws on capture/serialization failure; finish-path callers wrap in try/catch.
 */
export declare function emitSelfAttestedAdmissionRecord(options: EmitAdmissionOptions): EmitAdmissionResult;
/**
 * Explicitly export one selected local record into a source-controlled support
 * directory. Normal session completion never writes here.
 */
export declare function exportSelfAttestedAdmissionRecord(repoRoot: string, sessionId: string): EmitAdmissionResult;
/**
 * Best-effort wrapper for finish paths: emits the artifact, swallows and returns
 * any error so session finish is never disrupted.
 */
export declare function tryEmitSelfAttestedAdmissionRecord(options: EmitAdmissionOptions): {
    ok: true;
    result: EmitAdmissionResult;
} | {
    ok: false;
    error: string;
};
//# sourceMappingURL=admission-artifact.d.ts.map