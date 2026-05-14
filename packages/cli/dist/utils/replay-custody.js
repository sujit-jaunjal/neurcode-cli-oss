"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureVerifyReplayCustody = captureVerifyReplayCustody;
exports.applyReplayCustodyToCanonicalOutput = applyReplayCustodyToCanonicalOutput;
const control_plane_1 = require("./control-plane");
const governance_provenance_1 = require("./governance-provenance");
const workspace_runtime_1 = require("./workspace-runtime");
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    return value;
}
function compactStrings(values) {
    return values.filter((value) => typeof value === 'string' && value.trim().length > 0);
}
function cloneReplayIntegrity(missingArtifacts, notes) {
    return {
        status: missingArtifacts.length === 0 ? 'exact' : 'bounded-degradation',
        missingArtifacts,
        provenanceMismatches: [],
        graphMismatches: [],
        semanticTruncationMismatches: [],
        notes,
        driftReasons: [],
    };
}
function captureVerifyReplayCustody(input) {
    const notes = [];
    const missingArtifacts = [];
    const provenanceRecord = (0, governance_provenance_1.buildProvenanceRecord)({
        repoRoot: input.projectRoot,
        filesAnalyzed: input.filesAnalyzed,
        diffContext: input.diffContext,
        planId: input.planId,
        intentHash: null,
        policyHash: input.compiledPolicyFingerprint ?? input.policyLockFingerprint,
        ruleIds: [...input.ruleIds].sort((left, right) => left.localeCompare(right)),
        blockingCount: input.blockingCount,
        advisoryCount: input.advisoryCount,
        suppressedCount: input.suppressedCount,
        structuralBlockingCount: input.structuralBlockingCount,
        structuralAdvisoryCount: input.structuralAdvisoryCount,
        deterministicSignals: input.deterministicSignals,
        heuristicSignals: input.heuristicSignals,
        overallTrustScore: input.overallTrustScore,
        verdict: input.verdict,
        governanceDecision: input.governanceDecision,
    });
    const provenanceSaved = (0, governance_provenance_1.saveProvenanceRecord)(input.projectRoot, provenanceRecord);
    if (!provenanceSaved) {
        missingArtifacts.push('Provenance record could not be persisted for this verify run.');
    }
    const lineage = {
        provenanceRunId: provenanceRecord.runId,
        replayChecksum: input.replayChecksum,
        verificationSource: input.verificationSource,
        planId: input.planId,
        policyLockFingerprint: input.policyLockFingerprint,
        compiledPolicyFingerprint: input.compiledPolicyFingerprint,
    };
    let controlPlaneSnapshotId = null;
    let controlPlaneSnapshotPath = null;
    try {
        const snapshot = (0, control_plane_1.captureControlPlaneSnapshot)({
            cwd: input.projectRoot,
            actor: input.actor,
            source: input.source,
            reason: `verify.${input.verificationSource}.attestation`,
            lineage,
        });
        controlPlaneSnapshotId = snapshot.snapshotId;
        controlPlaneSnapshotPath = snapshot.snapshotPath;
    }
    catch {
        missingArtifacts.push('Immutable control-plane snapshot could not be captured at verify time.');
    }
    let workspaceSnapshotId = null;
    let workspaceSnapshotPath = null;
    let workspaceSnapshotRequired = false;
    try {
        const workspace = (0, workspace_runtime_1.captureWorkspaceReplayAttestation)({
            cwd: input.projectRoot,
            actor: input.actor,
            source: input.source,
            action: `verify.${input.verificationSource}.attestation`,
        });
        workspaceSnapshotRequired = workspace.required;
        workspaceSnapshotId = workspace.snapshotId;
        workspaceSnapshotPath = workspace.snapshotPath;
        if (!workspace.required) {
            notes.push('No active workspace context was configured for this verify run.');
        }
        else if (!workspace.snapshotId) {
            missingArtifacts.push('Active workspace context existed but no immutable workspace snapshot was captured.');
        }
    }
    catch {
        workspaceSnapshotRequired = true;
        missingArtifacts.push('Active workspace context could not be snapshotted for replay custody.');
    }
    return {
        provenanceRecord,
        provenanceSaved,
        verificationSource: input.verificationSource,
        planId: input.planId,
        policyLockFingerprint: input.policyLockFingerprint,
        compiledPolicyFingerprint: input.compiledPolicyFingerprint,
        controlPlaneSnapshotId,
        controlPlaneSnapshotPath,
        workspaceSnapshotId,
        workspaceSnapshotPath,
        workspaceSnapshotRequired,
        missingArtifacts,
        notes,
    };
}
function applyReplayCustodyToCanonicalOutput(canonicalOutput, custody) {
    if (!canonicalOutput)
        return;
    const missingArtifacts = [...custody.missingArtifacts];
    const notes = [...custody.notes];
    const replayIntegrity = cloneReplayIntegrity(missingArtifacts, notes);
    const snapshotIds = compactStrings([
        custody.controlPlaneSnapshotId,
        custody.workspaceSnapshotId,
    ]);
    canonicalOutput.provenanceRunId = custody.provenanceRecord?.runId ?? null;
    canonicalOutput.provenanceRunAt = custody.provenanceRecord?.runAt ?? null;
    canonicalOutput.planId = custody.planId;
    canonicalOutput.verificationSource = custody.verificationSource;
    canonicalOutput.controlPlaneSnapshotId = custody.controlPlaneSnapshotId;
    canonicalOutput.workspaceSnapshotId = custody.workspaceSnapshotId;
    canonicalOutput.replayIntegrity = replayIntegrity;
    const envelope = asRecord(canonicalOutput.governanceVerification);
    if (envelope) {
        envelope.replayIntegrity = { ...replayIntegrity };
        const findings = Array.isArray(envelope.findings) ? envelope.findings : [];
        for (const finding of findings) {
            const record = asRecord(finding);
            if (!record)
                continue;
            const existingProvenance = asRecord(record.provenanceMetadata) || {};
            record.provenanceMetadata = {
                ...existingProvenance,
                ...(custody.provenanceRecord?.runId ? { runId: custody.provenanceRecord.runId } : {}),
                ...(custody.planId !== undefined ? { planId: custody.planId } : {}),
                verificationSource: custody.verificationSource,
                ...(custody.provenanceRecord?.runAt ? { generatedAt: custody.provenanceRecord.runAt } : {}),
                ...(custody.policyLockFingerprint ? { policyLockFingerprint: custody.policyLockFingerprint } : {}),
                ...(custody.compiledPolicyFingerprint ? { compiledPolicyFingerprint: custody.compiledPolicyFingerprint } : {}),
            };
            const existingReplay = asRecord(record.replayMetadata) || {};
            record.replayMetadata = {
                ...existingReplay,
                ...(snapshotIds.length > 0 ? { snapshotIds } : {}),
                reconstructedExactly: missingArtifacts.length === 0,
                ...(missingArtifacts.length > 0 ? { boundedDegradation: missingArtifacts } : {}),
            };
        }
    }
    if (typeof canonicalOutput.compiledPolicyFingerprint !== 'string') {
        canonicalOutput.compiledPolicyFingerprint = custody.compiledPolicyFingerprint ?? custody.provenanceRecord?.policyHash ?? null;
    }
    if (typeof canonicalOutput.policyLockFingerprint !== 'string') {
        canonicalOutput.policyLockFingerprint = custody.policyLockFingerprint ?? null;
    }
}
//# sourceMappingURL=replay-custody.js.map