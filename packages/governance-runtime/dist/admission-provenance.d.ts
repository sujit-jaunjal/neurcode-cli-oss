/**
 * Runtime Admission — pure provenance core (Phase A).
 *
 * Deterministic, source-free. No filesystem, no shell, no network. Consumes a
 * raw git tree-delta (captured elsewhere) plus a governance classification map,
 * and produces the normalized delta, the governed coverage manifest, and the
 * two distinct hashes:
 *
 *   - deltaHash       — exact, base-specific normalized tree-delta fingerprint.
 *   - coverageSetHash — squash/rebase-survivable governed-effect SET fingerprint.
 *
 * Coverage matching is per-entry subset membership, never global-hash equality:
 * a squash/rebase that preserves file content preserves coverage identities, so
 * a previously governed PR stays matchable even though its base (and therefore
 * its deltaHash) changed.
 *
 * Eligibility is strict by default (pre-write governance only); see
 * `validateSelfAttestedRecordConsistency`.
 */
import { type AdmissionConsistencyDecision, type AdmissionCoverageClassification, type AdmissionCoverageEntry, type AdmissionCoverageManifest, type AdmissionDeltaEntry, type AdmissionEligibilityOptions, type GitObjectFormat, type SelfAttestedAdmissionRecord } from '@neurcode-ai/contracts';
/** Loose, capture-friendly raw delta entry. Renames/copies may be pre-split or split here. */
export interface RawDeltaInput {
    path: string;
    oldMode?: string | null;
    newMode?: string | null;
    oldObjectId?: string | null;
    newObjectId?: string | null;
    /** Optional git rawstatus (e.g. 'A','M','D','R100','C75','T'); R/C split into delete+add. */
    status?: string | null;
    /** Rename/copy source path. */
    oldPath?: string | null;
}
export interface GovernanceClassificationInput {
    classification: AdmissionCoverageClassification;
    sessions?: string[];
}
/** path → governance classification + contributing sessions (from guard posture / session events). */
export type GovernanceClassificationMap = Record<string, GovernanceClassificationInput>;
export interface BuildCoverageManifestInput {
    rawDelta: RawDeltaInput[];
    governance?: GovernanceClassificationMap;
    objectFormat: GitObjectFormat;
}
export declare const MAX_ADMISSION_JSON_BYTES: number;
export declare const MAX_ADMISSION_DELTA_ENTRIES = 100000;
export declare const MAX_ADMISSION_COVERAGE_ENTRIES = 100000;
export declare const MAX_ADMISSION_SESSION_REFS = 4096;
export declare const MAX_ADMISSION_SESSIONS_PER_ENTRY = 4096;
export declare const MAX_ADMISSION_PATH_LENGTH = 4096;
export declare const MAX_ADMISSION_ID_LENGTH = 256;
export declare function sortDeltaEntries(entries: AdmissionDeltaEntry[]): AdmissionDeltaEntry[];
export declare function sortCoverageEntries(entries: AdmissionCoverageEntry[]): AdmissionCoverageEntry[];
/**
 * Normalize raw capture entries into the canonical delta. Renames become a
 * delete (old path) + add (new path); copies become an add only (the source is
 * unchanged and not part of the tree delta). Deterministically sorted, deduped.
 */
export declare function normalizeDeltaEntries(raw: RawDeltaInput[], objectFormat: GitObjectFormat): AdmissionDeltaEntry[];
/**
 * Derive governed coverage entries from a normalized delta plus a per-path
 * classification map. Paths with no governance evidence are 'ungoverned'.
 */
export declare function deriveCoverageEntries(delta: AdmissionDeltaEntry[], governance?: GovernanceClassificationMap): AdmissionCoverageEntry[];
export declare function computeDeltaHash(delta: AdmissionDeltaEntry[], objectFormat: GitObjectFormat): string;
/**
 * Hash of the governed-effect identity SET. Deduped by identity (classification
 * and sessions are excluded), sorted, framed. Stable across squash/rebase that
 * preserve file content.
 */
export declare function computeCoverageSetHash(coverage: AdmissionCoverageEntry[], objectFormat: GitObjectFormat): string;
export declare function buildCoverageManifest(input: BuildCoverageManifestInput): AdmissionCoverageManifest;
/**
 * Deterministically union coverage entries from multiple sessions/manifests.
 * Entries sharing an identity (path + mode + objectId) merge: classification
 * becomes the strongest, sessions union and sort. Distinct identities are kept
 * (e.g. the same path edited to different final objects by different sessions).
 */
export declare function unionCoverageEntries(groups: AdmissionCoverageEntry[][]): AdmissionCoverageEntry[];
export declare function unionCoverageManifests(manifests: AdmissionCoverageManifest[], objectFormat: GitObjectFormat): {
    coverage: AdmissionCoverageEntry[];
    coverageSetHash: string;
};
/**
 * Validate a self-attested record against a recomputed ground-truth delta.
 *
 * The coverage verdict is decided by per-entry subset matching of the
 * ground-truth identities against the record's ADMISSIBLE coverage entries —
 * NOT by deltaHash equality (which is base-specific and breaks under
 * squash/rebase). `deltaHashMatches` is a diagnostic only.
 *
 * Eligibility defaults to STRICT (pre-write governance only): `observed_postwrite`
 * and `generated` do not satisfy admission unless `options` opts in
 * (`mode: 'descriptive'` or `allowGenerated: true`).
 *
 * 'self_attested_inconsistent' is reserved for a record whose own claimed hashes
 * do not match its own contents (corrupted/tampered artifact). This function
 * never throws: malformed input yields 'self_attested_inconsistent'.
 */
export declare function validateSelfAttestedRecordConsistency(record: SelfAttestedAdmissionRecord | null | undefined, groundTruthDelta: AdmissionDeltaEntry[], objectFormat: GitObjectFormat, options?: AdmissionEligibilityOptions): AdmissionConsistencyDecision;
/**
 * Strict, bounded structural validation of an untrusted, already-parsed value.
 * Returns a typed record only when every field, enum, hash, mode, array, and
 * limit checks out; otherwise null. Never throws.
 */
export declare function readSelfAttestedAdmissionRecord(value: unknown): SelfAttestedAdmissionRecord | null;
/**
 * Parse + validate untrusted artifact JSON text. Enforces a byte ceiling before
 * JSON.parse, never throws, and returns null on any violation.
 */
export declare function readSelfAttestedAdmissionRecordFromText(text: unknown): SelfAttestedAdmissionRecord | null;
//# sourceMappingURL=admission-provenance.d.ts.map