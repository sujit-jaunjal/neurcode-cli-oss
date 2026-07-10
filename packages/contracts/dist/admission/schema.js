"use strict";
/**
 * Runtime Admission — Phase A schema (Provenance Core V1).
 *
 * Source-free, deterministic provenance types shared across CLI, the future
 * OSS advisory Action, and future Enterprise enforcement. Phase A defines the
 * normalized git tree-delta, the governed coverage manifest, the self-attested
 * local artifact, and the consistency decision. No signing, no receipts, no
 * backend, no Action here — those are later phases.
 *
 * Two distinct hashes by design (do not collapse them):
 *   - deltaHash:       exact, base-specific tree-delta fingerprint (debugging /
 *                      deterministic reproduction).
 *   - coverageSetHash: governed-effect set fingerprint used for squash/rebase-
 *                      survivable, per-entry subset matching of a PR to sessions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GIT_MODE_ABSENT = exports.GIT_MODE_SUBMODULE = exports.GIT_MODE_SYMLINK = exports.GIT_MODE_EXEC = exports.GIT_MODE_BLOB = exports.SELF_ATTESTED_ADMISSION_DISCLAIMER = exports.ADMISSION_CONSISTENCY_DECISION_SCHEMA_VERSION = exports.SELF_ATTESTED_ADMISSION_RECORD_SCHEMA_VERSION = exports.ADMISSION_COVERAGE_MANIFEST_SCHEMA_VERSION = void 0;
exports.objectIdHexLength = objectIdHexLength;
exports.zeroObjectId = zeroObjectId;
exports.isZeroObjectId = isZeroObjectId;
exports.isValidObjectId = isValidObjectId;
exports.isKnownGitMode = isKnownGitMode;
exports.objectTypeForMode = objectTypeForMode;
exports.deltaEntryCanonicalFields = deltaEntryCanonicalFields;
exports.coverageEntryCanonicalFields = coverageEntryCanonicalFields;
exports.coverageEntryIdentityKey = coverageEntryIdentityKey;
exports.isGovernedClassification = isGovernedClassification;
exports.isStrictlyAdmissible = isStrictlyAdmissible;
exports.isAdmissibleClassification = isAdmissibleClassification;
exports.ADMISSION_COVERAGE_MANIFEST_SCHEMA_VERSION = 'neurcode.admission-coverage.v1';
exports.SELF_ATTESTED_ADMISSION_RECORD_SCHEMA_VERSION = 'neurcode.admission-record.v1';
exports.ADMISSION_CONSISTENCY_DECISION_SCHEMA_VERSION = 'neurcode.admission-consistency.v1';
/**
 * Mandatory honesty label. A locally committed artifact is authored by the same
 * untrusted principal who authored the diff, so it can be fabricated with
 * matching object ids. It is a claim, never proof.
 */
exports.SELF_ATTESTED_ADMISSION_DISCLAIMER = 'Self-attested by the local Neurcode runtime: a source-free claim that a governed ' +
    'session produced these effects. This is NOT cryptographic proof that governance ran. ' +
    'Enterprise enforcement requires a backend-anchored signed receipt.';
/** Canonical git file modes used by this contract. */
exports.GIT_MODE_BLOB = '100644';
exports.GIT_MODE_EXEC = '100755';
exports.GIT_MODE_SYMLINK = '120000';
exports.GIT_MODE_SUBMODULE = '160000';
exports.GIT_MODE_ABSENT = '000000';
const KNOWN_MODES = new Set([
    exports.GIT_MODE_BLOB,
    exports.GIT_MODE_EXEC,
    exports.GIT_MODE_SYMLINK,
    exports.GIT_MODE_SUBMODULE,
    exports.GIT_MODE_ABSENT,
]);
// ── Pure helpers (no crypto, no IO) ─────────────────────────────────────────
function objectIdHexLength(format) {
    return format === 'sha256' ? 64 : 40;
}
function zeroObjectId(format) {
    return '0'.repeat(objectIdHexLength(format));
}
function isZeroObjectId(objectId) {
    return /^0+$/.test(objectId);
}
function isValidObjectId(objectId, format) {
    const len = objectIdHexLength(format);
    return new RegExp(`^[0-9a-f]{${len}}$`).test(objectId);
}
function isKnownGitMode(mode) {
    return KNOWN_MODES.has(mode);
}
function objectTypeForMode(mode) {
    switch (mode) {
        case exports.GIT_MODE_SUBMODULE:
            return 'submodule';
        case exports.GIT_MODE_SYMLINK:
            return 'symlink';
        case exports.GIT_MODE_BLOB:
        case exports.GIT_MODE_EXEC:
            return 'blob';
        case exports.GIT_MODE_ABSENT:
            return 'absent';
        default:
            throw new Error(`admission: unsupported git mode "${mode}"`);
    }
}
/**
 * Canonical, ordered field list for a delta entry. The field ORDER is part of
 * the hashing contract and must never be reordered.
 */
function deltaEntryCanonicalFields(entry) {
    return [
        entry.path,
        entry.changeType,
        entry.objectType,
        entry.oldMode,
        entry.newMode,
        entry.oldObjectId,
        entry.newObjectId,
    ];
}
/**
 * Canonical, ordered identity field list for a coverage entry.
 *
 * Identity per the matching contract:
 *   present (added/modified/typechanged) → path + newMode + newObjectId
 *   deleted                              → path + oldMode + oldObjectId
 *
 * `mode`/`objectId` already hold the correct side. `changeType` collapses to a
 * single present/deleted flag so a squash/rebase that reclassifies modified↔added
 * (same resulting content) still matches. `objectType` is derived from `mode` and
 * is excluded. `classification` and `sessions` are annotations and excluded.
 */
function coverageEntryCanonicalFields(entry) {
    const presence = entry.changeType === 'deleted' ? 'D' : 'P';
    return [presence, entry.path, entry.mode, entry.objectId];
}
/** Stable in-memory identity key for set/union operations (not a security hash). */
function coverageEntryIdentityKey(entry) {
    return JSON.stringify(coverageEntryCanonicalFields(entry));
}
/**
 * Descriptive test: did this effect have ANY governance evidence (pre- or
 * post-write, or generated)? Use this for descriptive surfaces (telemetry,
 * "what did the runtime observe"). It is NOT the admission eligibility test.
 */
function isGovernedClassification(classification) {
    return (classification === 'governed_prewrite' ||
        classification === 'observed_postwrite' ||
        classification === 'governed_delete' ||
        classification === 'generated');
}
/**
 * Strict runtime admission eligibility. Only pre-write governance is admissible:
 * `governed_prewrite` and `governed_delete`. `observed_postwrite` is visible but
 * NOT admissible (the write was only seen after it happened). `generated` is
 * admissible only when `allowGenerated` is explicitly set by policy.
 */
function isStrictlyAdmissible(classification, options = {}) {
    if (classification === 'governed_prewrite' || classification === 'governed_delete')
        return true;
    if (classification === 'generated')
        return options.allowGenerated === true;
    return false;
}
/**
 * Eligibility predicate honoring the requested mode. Strict (default) uses
 * `isStrictlyAdmissible`; descriptive uses `isGovernedClassification`.
 */
function isAdmissibleClassification(classification, options = {}) {
    if ((options.mode ?? 'strict') === 'descriptive') {
        return isGovernedClassification(classification);
    }
    return isStrictlyAdmissible(classification, options);
}
//# sourceMappingURL=schema.js.map