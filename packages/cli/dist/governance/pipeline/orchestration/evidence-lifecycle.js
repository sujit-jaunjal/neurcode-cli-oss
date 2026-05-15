"use strict";
/**
 * Evidence Lifecycle Runtime
 * --------------------------
 * Extracts the closure-heavy evidence/finalize plumbing previously inlined at
 * `commands/verify.ts:2816–2905`. The original implementation captured five
 * pieces of mutable state via closure (`lastCanonicalOutput`,
 * `lastEvidenceFallbackOutput`, `evidenceFinalizeAttempted`,
 * `verifyStartedAtMs`, `lastProvenanceRunId`) and exposed three lambdas
 * (`captureEvidencePayload`, `finalizeEvidence`, `exitWithEvidence`).
 *
 * This module replaces that pattern with a typed, explicit holder object so:
 *   - lifecycle state is replay-visible (not hidden inside a closure)
 *   - finalize idempotency is enforced at the type level
 *   - the caller decides termination policy (we DO NOT call process.exit here)
 *   - degraded persistence (write failure, missing payload) is explicit
 *
 * Semantic preservation:
 *   - finalize is called at most once (existing invariant)
 *   - write failure is swallowed and (in non-JSON mode) reported (existing)
 *   - calibration telemetry call (`appendVerifyCompletedFromCanonical`) is
 *     wrapped in try/catch (existing)
 *   - process.exit is INVOKED BY THE CALLER, not by this module
 *
 * Replay invariant:
 *   The evidence artifact written by `runEvidenceFinalize` is byte-identical
 *   to what the prior closure wrote, for any given lifecycle state. The
 *   transition `appendVerifyCompletedFromCanonical(...)` happens at the same
 *   point (after finalize, before exit) so telemetry semantics are preserved.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvidenceLifecycleState = createEvidenceLifecycleState;
exports.captureEvidencePayload = captureEvidencePayload;
exports.setProvenanceRunId = setProvenanceRunId;
exports.runEvidenceFinalize = runEvidenceFinalize;
exports.emitCalibrationTelemetry = emitCalibrationTelemetry;
const verification_evidence_1 = require("../../../utils/verification-evidence");
const telemetry_1 = require("@neurcode-ai/telemetry");
/**
 * Create a fresh lifecycle state. Replaces the four `let` declarations at the
 * top of `verifyCommand`.
 */
function createEvidenceLifecycleState() {
    return {
        lastCanonicalOutput: null,
        lastEvidenceFallbackOutput: null,
        finalizeAttempted: false,
        lastProvenanceRunId: null,
    };
}
/**
 * Record a verify payload into the lifecycle state. Computes the canonical
 * representation eagerly so finalize can write either form. Replaces the
 * `captureEvidencePayload` closure.
 *
 * Pure side-effect on the state object — no I/O.
 */
function captureEvidencePayload(state, config, payload) {
    state.lastEvidenceFallbackOutput = payload;
    state.lastCanonicalOutput = config.toCanonicalVerifyOutput(payload);
}
/**
 * Set the provenance run ID. Replaces the inline mutation `lastProvenanceRunId = ...`.
 */
function setProvenanceRunId(state, runId) {
    state.lastProvenanceRunId = runId;
}
/**
 * Run the evidence-finalize lifecycle. Replaces the `finalizeEvidence` closure.
 *
 * Idempotent: subsequent calls return `{ attempted: true, skipped: true }`.
 * Never throws — failures are surfaced via the returned `error` field and the
 * configured warning logger.
 */
function runEvidenceFinalize(state, config, exitCode) {
    if (!config.enabled) {
        return { attempted: false, skipped: true, skipReason: 'disabled', artifactPath: null };
    }
    if (state.finalizeAttempted) {
        return { attempted: true, skipped: true, skipReason: 'already-attempted', artifactPath: null };
    }
    state.finalizeAttempted = true;
    try {
        const artifactPath = (0, verification_evidence_1.writeVerificationEvidence)({
            enabled: config.enabled,
            projectRoot: config.projectRoot,
            startedAtMs: config.startedAtMs,
            exitCode,
            ciMode: config.ciMode,
            deterministicMode: config.deterministicMode,
            evidenceDir: config.evidenceDir,
            canonicalOutput: state.lastCanonicalOutput,
            fallbackOutput: state.lastEvidenceFallbackOutput,
            ciContext: config.ciContext,
            runtimeMetadata: config.runtimeMetadata,
        });
        if (artifactPath && !config.jsonMode && config.reportArtifactPath) {
            config.reportArtifactPath(artifactPath);
        }
        return { attempted: true, skipped: false, artifactPath: artifactPath ?? null };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!config.jsonMode && config.reportFinalizeFailure) {
            config.reportFinalizeFailure(message);
        }
        return { attempted: true, skipped: false, artifactPath: null, error: message };
    }
}
/**
 * Run the telemetry-calibration emission. Replaces the inline call
 * `appendVerifyCompletedFromCanonical(projectRoot, lastCanonicalOutput,
 * lastProvenanceRunId)` previously inside the `exitWithEvidence` closure.
 *
 * Never throws — calibration must not affect verify exit.
 */
function emitCalibrationTelemetry(state, config) {
    try {
        (0, telemetry_1.appendVerifyCompletedFromCanonical)(config.projectRoot, state.lastCanonicalOutput, state.lastProvenanceRunId);
    }
    catch {
        // calibration must never affect exit
    }
}
//# sourceMappingURL=evidence-lifecycle.js.map