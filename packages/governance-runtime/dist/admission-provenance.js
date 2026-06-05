"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ADMISSION_ID_LENGTH = exports.MAX_ADMISSION_PATH_LENGTH = exports.MAX_ADMISSION_SESSIONS_PER_ENTRY = exports.MAX_ADMISSION_SESSION_REFS = exports.MAX_ADMISSION_COVERAGE_ENTRIES = exports.MAX_ADMISSION_DELTA_ENTRIES = exports.MAX_ADMISSION_JSON_BYTES = void 0;
exports.sortDeltaEntries = sortDeltaEntries;
exports.sortCoverageEntries = sortCoverageEntries;
exports.normalizeDeltaEntries = normalizeDeltaEntries;
exports.deriveCoverageEntries = deriveCoverageEntries;
exports.computeDeltaHash = computeDeltaHash;
exports.computeCoverageSetHash = computeCoverageSetHash;
exports.buildCoverageManifest = buildCoverageManifest;
exports.unionCoverageEntries = unionCoverageEntries;
exports.unionCoverageManifests = unionCoverageManifests;
exports.validateSelfAttestedRecordConsistency = validateSelfAttestedRecordConsistency;
exports.readSelfAttestedAdmissionRecord = readSelfAttestedAdmissionRecord;
exports.readSelfAttestedAdmissionRecordFromText = readSelfAttestedAdmissionRecordFromText;
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@neurcode-ai/contracts");
// ── untrusted-input limits (Fix 4) ───────────────────────────────────────────
exports.MAX_ADMISSION_JSON_BYTES = 8 * 1024 * 1024;
exports.MAX_ADMISSION_DELTA_ENTRIES = 100_000;
exports.MAX_ADMISSION_COVERAGE_ENTRIES = 100_000;
exports.MAX_ADMISSION_SESSION_REFS = 4_096;
exports.MAX_ADMISSION_SESSIONS_PER_ENTRY = 4_096;
exports.MAX_ADMISSION_PATH_LENGTH = 4_096;
exports.MAX_ADMISSION_ID_LENGTH = 256;
const CHANGE_TYPES = new Set(['added', 'modified', 'deleted', 'typechanged']);
const OBJECT_TYPES = new Set(['blob', 'symlink', 'submodule', 'absent']);
const CLASSIFICATIONS = new Set([
    'governed_prewrite',
    'governed_delete',
    'observed_postwrite',
    'generated',
    'ungoverned',
]);
const HEX_ID = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
// ── hashing ─────────────────────────────────────────────────────────────────
function sha256Hex(bytes) {
    return (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex');
}
// ── deterministic ordering ────────────────────────────────────────────────
// NUL separator: git paths never contain NUL, so this can never collide across
// fields. Escaped here so the source file stays plain text; the runtime value
// (and therefore every hash) is byte-identical to a literal NUL.
const SORT_SEP = '\0';
function deltaSortKey(entry) {
    return (0, contracts_1.deltaEntryCanonicalFields)(entry).join(SORT_SEP);
}
function coverageSortKey(entry) {
    return (0, contracts_1.coverageEntryCanonicalFields)(entry).join(SORT_SEP);
}
/** Deterministic, locale-independent string order (UTF-16 code-unit, identical everywhere). */
function byKey(a, b) {
    if (a < b)
        return -1;
    if (a > b)
        return 1;
    return 0;
}
function sortDeltaEntries(entries) {
    return [...entries].sort((a, b) => byKey(deltaSortKey(a), deltaSortKey(b)));
}
function sortCoverageEntries(entries) {
    return [...entries].sort((a, b) => byKey(coverageSortKey(a), coverageSortKey(b)));
}
// ── normalization ───────────────────────────────────────────────────────────
function normalizeMode(mode) {
    const value = (mode ?? '').trim();
    if (!value)
        return contracts_1.GIT_MODE_ABSENT;
    if (!(0, contracts_1.isKnownGitMode)(value)) {
        throw new Error(`admission: unsupported git mode "${value}"`);
    }
    return value;
}
function normalizeObjectId(objectId, mode, format) {
    if (mode === contracts_1.GIT_MODE_ABSENT)
        return (0, contracts_1.zeroObjectId)(format);
    const value = (objectId ?? '').trim().toLowerCase();
    if (!value || (0, contracts_1.isZeroObjectId)(value)) {
        throw new Error(`admission: missing object id for present mode ${mode}`);
    }
    // Submodule gitlinks carry a commit id from another repo whose object format
    // may differ from the super-repo, so accept either width for any present id.
    if (!HEX_ID.test(value)) {
        throw new Error(`admission: invalid object id "${value}"`);
    }
    return value;
}
function buildEntry(path, rawOldMode, rawOldId, rawNewMode, rawNewId, format) {
    const cleanPath = path.replace(/^\.\//, '').trim();
    if (!cleanPath)
        return null;
    const oldMode = normalizeMode(rawOldMode);
    const newMode = normalizeMode(rawNewMode);
    const oldPresent = oldMode !== contracts_1.GIT_MODE_ABSENT;
    const newPresent = newMode !== contracts_1.GIT_MODE_ABSENT;
    if (!oldPresent && !newPresent)
        return null;
    const oldObjectId = normalizeObjectId(rawOldId, oldMode, format);
    const newObjectId = normalizeObjectId(rawNewId, newMode, format);
    let changeType;
    let objectType;
    if (!oldPresent && newPresent) {
        changeType = 'added';
        objectType = (0, contracts_1.objectTypeForMode)(newMode);
    }
    else if (oldPresent && !newPresent) {
        changeType = 'deleted';
        objectType = (0, contracts_1.objectTypeForMode)(oldMode);
    }
    else {
        const oldType = (0, contracts_1.objectTypeForMode)(oldMode);
        const newType = (0, contracts_1.objectTypeForMode)(newMode);
        changeType = oldType !== newType ? 'typechanged' : 'modified';
        objectType = newType;
    }
    return { path: cleanPath, changeType, objectType, oldMode, newMode, oldObjectId, newObjectId };
}
function isRenameOrCopy(status) {
    const value = (status ?? '').trim().toUpperCase();
    if (value.startsWith('R'))
        return 'rename';
    if (value.startsWith('C'))
        return 'copy';
    return null;
}
/**
 * Normalize raw capture entries into the canonical delta. Renames become a
 * delete (old path) + add (new path); copies become an add only (the source is
 * unchanged and not part of the tree delta). Deterministically sorted, deduped.
 */
function normalizeDeltaEntries(raw, objectFormat) {
    const out = [];
    for (const entry of raw) {
        const renameKind = isRenameOrCopy(entry.status);
        const hasDistinctSource = typeof entry.oldPath === 'string' && entry.oldPath.trim() && entry.oldPath.trim() !== entry.path.trim();
        if ((renameKind === 'rename' || (!entry.status && hasDistinctSource)) && entry.oldPath) {
            // delete(oldPath) + add(newPath)
            const del = buildEntry(entry.oldPath, entry.oldMode, entry.oldObjectId, null, null, objectFormat);
            if (del)
                out.push(del);
            const add = buildEntry(entry.path, null, null, entry.newMode, entry.newObjectId, objectFormat);
            if (add)
                out.push(add);
            continue;
        }
        if (renameKind === 'copy') {
            const add = buildEntry(entry.path, null, null, entry.newMode, entry.newObjectId, objectFormat);
            if (add)
                out.push(add);
            continue;
        }
        const built = buildEntry(entry.path, entry.oldMode, entry.oldObjectId, entry.newMode, entry.newObjectId, objectFormat);
        if (built)
            out.push(built);
    }
    // Dedup by full canonical fields, then sort.
    const seen = new Map();
    for (const entry of out) {
        seen.set(deltaSortKey(entry), entry);
    }
    return sortDeltaEntries([...seen.values()]);
}
// ── coverage derivation ───────────────────────────────────────────────────
function coverageIdentityFields(entry) {
    if (entry.changeType === 'deleted') {
        return { mode: entry.oldMode, objectId: entry.oldObjectId };
    }
    return { mode: entry.newMode, objectId: entry.newObjectId };
}
function sortedUniqueSessions(sessions) {
    return Array.from(new Set((sessions ?? []).map((s) => s.trim()).filter(Boolean))).sort(byKey);
}
/**
 * Derive governed coverage entries from a normalized delta plus a per-path
 * classification map. Paths with no governance evidence are 'ungoverned'.
 */
function deriveCoverageEntries(delta, governance = {}) {
    const entries = delta.map((entry) => {
        const { mode, objectId } = coverageIdentityFields(entry);
        const governedInfo = governance[entry.path];
        const classification = governedInfo?.classification ?? 'ungoverned';
        return {
            path: entry.path,
            changeType: entry.changeType,
            objectType: entry.objectType,
            mode,
            objectId,
            classification,
            sessions: sortedUniqueSessions(governedInfo?.sessions),
        };
    });
    return sortCoverageEntries(entries);
}
// ── hashes ─────────────────────────────────────────────────────────────────
function computeDeltaHash(delta, objectFormat) {
    const sorted = sortDeltaEntries(delta);
    const records = sorted.map((entry) => (0, contracts_1.deltaEntryCanonicalFields)(entry));
    const header = [
        contracts_1.ADMISSION_DELTA_HASH_DOMAIN,
        contracts_1.ADMISSION_FRAMING_VERSION,
        objectFormat,
        String(records.length),
    ];
    return sha256Hex((0, contracts_1.frameRecordSet)(header, records));
}
/**
 * Hash of the governed-effect identity SET. Deduped by identity (classification
 * and sessions are excluded), sorted, framed. Stable across squash/rebase that
 * preserve file content.
 */
function computeCoverageSetHash(coverage, objectFormat) {
    const byIdentity = new Map();
    for (const entry of coverage) {
        byIdentity.set((0, contracts_1.coverageEntryIdentityKey)(entry), entry);
    }
    const sorted = sortCoverageEntries([...byIdentity.values()]);
    const records = sorted.map((entry) => (0, contracts_1.coverageEntryCanonicalFields)(entry));
    const header = [
        contracts_1.ADMISSION_COVERAGE_SET_HASH_DOMAIN,
        contracts_1.ADMISSION_FRAMING_VERSION,
        objectFormat,
        String(records.length),
    ];
    return sha256Hex((0, contracts_1.frameRecordSet)(header, records));
}
function buildCoverageManifest(input) {
    const delta = normalizeDeltaEntries(input.rawDelta, input.objectFormat);
    const coverage = deriveCoverageEntries(delta, input.governance ?? {});
    return {
        schemaVersion: contracts_1.ADMISSION_COVERAGE_MANIFEST_SCHEMA_VERSION,
        objectFormat: input.objectFormat,
        framingVersion: contracts_1.ADMISSION_FRAMING_VERSION,
        entryCount: delta.length,
        deltaHash: computeDeltaHash(delta, input.objectFormat),
        coverageSetHash: computeCoverageSetHash(coverage, input.objectFormat),
        delta,
        coverage,
    };
}
// ── multi-session deterministic union ───────────────────────────────────────
const CLASSIFICATION_RANK = {
    governed_prewrite: 5,
    governed_delete: 4,
    observed_postwrite: 3,
    generated: 2,
    ungoverned: 1,
};
function strongerClassification(a, b) {
    return CLASSIFICATION_RANK[a] >= CLASSIFICATION_RANK[b] ? a : b;
}
/**
 * Deterministically union coverage entries from multiple sessions/manifests.
 * Entries sharing an identity (path + mode + objectId) merge: classification
 * becomes the strongest, sessions union and sort. Distinct identities are kept
 * (e.g. the same path edited to different final objects by different sessions).
 */
function unionCoverageEntries(groups) {
    const merged = new Map();
    for (const group of groups) {
        for (const entry of group) {
            const key = (0, contracts_1.coverageEntryIdentityKey)(entry);
            const existing = merged.get(key);
            if (!existing) {
                merged.set(key, {
                    ...entry,
                    sessions: sortedUniqueSessions(entry.sessions),
                });
                continue;
            }
            merged.set(key, {
                ...existing,
                classification: strongerClassification(existing.classification, entry.classification),
                sessions: sortedUniqueSessions([...existing.sessions, ...entry.sessions]),
            });
        }
    }
    return sortCoverageEntries([...merged.values()]);
}
function unionCoverageManifests(manifests, objectFormat) {
    const coverage = unionCoverageEntries(manifests.map((m) => m.coverage));
    return { coverage, coverageSetHash: computeCoverageSetHash(coverage, objectFormat) };
}
// ── self-attested record consistency ────────────────────────────────────────
function consistencyBase() {
    return {
        schemaVersion: contracts_1.ADMISSION_CONSISTENCY_DECISION_SCHEMA_VERSION,
        trustLevel: 'self-attested',
        notProof: true,
    };
}
function inconsistentDecision(reason) {
    return {
        ...consistencyBase(),
        verdict: 'self_attested_inconsistent',
        deltaHashMatches: false,
        coveredPaths: [],
        uncoveredPaths: [],
        unexpectedCoverage: [],
        reasons: [reason],
    };
}
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
function validateSelfAttestedRecordConsistency(record, groundTruthDelta, objectFormat, options = {}) {
    if (!record) {
        return {
            ...consistencyBase(),
            verdict: 'no_record',
            deltaHashMatches: false,
            coveredPaths: [],
            uncoveredPaths: [],
            unexpectedCoverage: [],
            reasons: ['No self-attested admission record present for this change.'],
        };
    }
    try {
        const validatedRecord = readSelfAttestedAdmissionRecord(record);
        if (!validatedRecord) {
            return inconsistentDecision('Admission record failed bounded structural validation.');
        }
        const manifest = validatedRecord.manifest;
        if (!manifest || typeof manifest !== 'object') {
            return inconsistentDecision('Admission record has no manifest.');
        }
        const recomputedDeltaHash = computeDeltaHash(manifest.delta, manifest.objectFormat);
        const recomputedCoverageSetHash = computeCoverageSetHash(manifest.coverage, manifest.objectFormat);
        if (manifest.deltaHash !== recomputedDeltaHash ||
            manifest.coverageSetHash !== recomputedCoverageSetHash) {
            return inconsistentDecision('Admission record hashes do not match its own contents (corrupted or tampered artifact).');
        }
        // Ground-truth coverage identities (no governance — just what changed).
        const groundTruthCoverage = deriveCoverageEntries(sortDeltaEntries(groundTruthDelta), {});
        const recordByIdentity = new Map();
        for (const entry of manifest.coverage) {
            recordByIdentity.set((0, contracts_1.coverageEntryIdentityKey)(entry), entry);
        }
        const groundTruthKeys = new Set();
        const coveredPaths = [];
        const uncoveredPaths = [];
        for (const gt of groundTruthCoverage) {
            const key = (0, contracts_1.coverageEntryIdentityKey)(gt);
            groundTruthKeys.add(key);
            const match = recordByIdentity.get(key);
            if (match && (0, contracts_1.isAdmissibleClassification)(match.classification, options)) {
                coveredPaths.push(gt.path);
            }
            else {
                uncoveredPaths.push(gt.path);
            }
        }
        const unexpectedCoverage = [];
        for (const entry of manifest.coverage) {
            if (!groundTruthKeys.has((0, contracts_1.coverageEntryIdentityKey)(entry))) {
                unexpectedCoverage.push(entry.path);
            }
        }
        const deltaHashMatches = computeDeltaHash(sortDeltaEntries(groundTruthDelta), objectFormat) === manifest.deltaHash;
        const verdict = uncoveredPaths.length === 0 ? 'self_attested_complete' : 'self_attested_incomplete';
        const eligibility = (options.mode ?? 'strict') === 'descriptive' ? 'descriptive' : 'strict';
        const reasons = [];
        reasons.push(verdict === 'self_attested_complete'
            ? `All ${coveredPaths.length} changed file(s) have ${eligibility}-admissible governance (self-attested).`
            : `${uncoveredPaths.length} changed file(s) are not ${eligibility}-admissible (drift, post-write-only, or post-session edits).`);
        if (!deltaHashMatches) {
            reasons.push('Delta differs from capture base (squash/rebase/new base); matched by coverage identity.');
        }
        if (unexpectedCoverage.length > 0) {
            reasons.push(`${unexpectedCoverage.length} governed coverage entry(ies) are not present in this change.`);
        }
        reasons.push('Self-attested: a claim, not proof that governance ran.');
        return {
            ...consistencyBase(),
            verdict,
            deltaHashMatches,
            coveredPaths: coveredPaths.sort(byKey),
            uncoveredPaths: uncoveredPaths.sort(byKey),
            unexpectedCoverage: unexpectedCoverage.sort(byKey),
            reasons,
        };
    }
    catch (error) {
        return inconsistentDecision(`Admission record could not be evaluated: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// ── hardened, bounded reading of untrusted artifacts (Fix 4) ─────────────────
function isBoundedString(value, max) {
    return typeof value === 'string' && value.length <= max;
}
function isObjectIdForMode(value, mode, format) {
    if (typeof value !== 'string')
        return false;
    if (mode === contracts_1.GIT_MODE_ABSENT)
        return value === (0, contracts_1.zeroObjectId)(format);
    if ((0, contracts_1.isZeroObjectId)(value))
        return false;
    // A submodule gitlink may point into a repo using the other object format.
    return mode === '160000' ? HEX_ID.test(value) : (0, contracts_1.isValidObjectId)(value, format);
}
function validateDeltaEntry(value, format) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const e = value;
    if (!(isBoundedString(e.path, exports.MAX_ADMISSION_PATH_LENGTH) && e.path.length > 0 &&
        typeof e.changeType === 'string' && CHANGE_TYPES.has(e.changeType) &&
        typeof e.objectType === 'string' && OBJECT_TYPES.has(e.objectType) &&
        typeof e.oldMode === 'string' && (0, contracts_1.isKnownGitMode)(e.oldMode) &&
        typeof e.newMode === 'string' && (0, contracts_1.isKnownGitMode)(e.newMode) &&
        isObjectIdForMode(e.oldObjectId, e.oldMode, format) &&
        isObjectIdForMode(e.newObjectId, e.newMode, format)))
        return false;
    const oldPresent = e.oldMode !== contracts_1.GIT_MODE_ABSENT;
    const newPresent = e.newMode !== contracts_1.GIT_MODE_ABSENT;
    const expectedChangeType = !oldPresent
        ? 'added'
        : !newPresent
            ? 'deleted'
            : e.oldMode !== e.newMode
                ? 'typechanged'
                : 'modified';
    const identityMode = newPresent ? e.newMode : e.oldMode;
    return e.changeType === expectedChangeType && e.objectType === (0, contracts_1.objectTypeForMode)(identityMode);
}
function validateCoverageEntry(value, format) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const e = value;
    if (!(isBoundedString(e.path, exports.MAX_ADMISSION_PATH_LENGTH) && e.path.length > 0))
        return false;
    if (!(typeof e.changeType === 'string' && CHANGE_TYPES.has(e.changeType)))
        return false;
    if (!(typeof e.objectType === 'string' && OBJECT_TYPES.has(e.objectType)))
        return false;
    if (!(typeof e.mode === 'string' && (0, contracts_1.isKnownGitMode)(e.mode)))
        return false;
    if (e.mode === contracts_1.GIT_MODE_ABSENT || !isObjectIdForMode(e.objectId, e.mode, format))
        return false;
    if (e.objectType !== (0, contracts_1.objectTypeForMode)(e.mode))
        return false;
    if (!(typeof e.classification === 'string' && CLASSIFICATIONS.has(e.classification)))
        return false;
    if (!Array.isArray(e.sessions) || e.sessions.length > exports.MAX_ADMISSION_SESSIONS_PER_ENTRY)
        return false;
    if (!e.sessions.every((s) => isBoundedString(s, exports.MAX_ADMISSION_ID_LENGTH) && s.length > 0))
        return false;
    return e.classification === 'ungoverned' || e.sessions.length > 0;
}
function validateSessionRef(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const r = value;
    if (!(isBoundedString(r.sessionId, exports.MAX_ADMISSION_ID_LENGTH) && r.sessionId.length > 0))
        return false;
    if (r.replayHash !== undefined && !isBoundedString(r.replayHash, exports.MAX_ADMISSION_ID_LENGTH))
        return false;
    if (r.profileHash !== undefined && !isBoundedString(r.profileHash, exports.MAX_ADMISSION_ID_LENGTH))
        return false;
    return true;
}
/**
 * Strict, bounded structural validation of an untrusted, already-parsed value.
 * Returns a typed record only when every field, enum, hash, mode, array, and
 * limit checks out; otherwise null. Never throws.
 */
function readSelfAttestedAdmissionRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    try {
        (0, contracts_1.assertSourceFreeAdmissionValue)(value);
    }
    catch {
        return null;
    }
    if (record.attestationKind !== 'self-attested')
        return null;
    if (record.schemaVersion !== contracts_1.SELF_ATTESTED_ADMISSION_RECORD_SCHEMA_VERSION)
        return null;
    if (!isBoundedString(record.admissionContractVersion, exports.MAX_ADMISSION_ID_LENGTH))
        return null;
    if (!isBoundedString(record.disclaimer, 4096))
        return null;
    if (!(isBoundedString(record.sessionId, exports.MAX_ADMISSION_ID_LENGTH) && record.sessionId.length > 0))
        return null;
    if (!Array.isArray(record.sessionRefs) || record.sessionRefs.length > exports.MAX_ADMISSION_SESSION_REFS)
        return null;
    if (!record.sessionRefs.every(validateSessionRef))
        return null;
    const repo = record.repo;
    if (!repo || typeof repo !== 'object' || Array.isArray(repo))
        return null;
    const r = repo;
    if (r.name !== undefined && !isBoundedString(r.name, exports.MAX_ADMISSION_PATH_LENGTH))
        return null;
    if (r.rootHash !== undefined && !(typeof r.rootHash === 'string' && HEX_32.test(r.rootHash)))
        return null;
    if (r.remoteHash !== undefined && !(typeof r.remoteHash === 'string' && HEX_32.test(r.remoteHash)))
        return null;
    const capture = record.capture;
    if (!capture || typeof capture !== 'object' || Array.isArray(capture))
        return null;
    const c = capture;
    if (c.mode !== 'worktree' && c.mode !== 'committed')
        return null;
    if (!isBoundedString(c.capturedAt, 64) || !Number.isFinite(Date.parse(c.capturedAt)))
        return null;
    if (c.baseRef !== undefined && !isBoundedString(c.baseRef, exports.MAX_ADMISSION_PATH_LENGTH))
        return null;
    if (c.headRef !== undefined && !isBoundedString(c.headRef, exports.MAX_ADMISSION_PATH_LENGTH))
        return null;
    const manifest = record.manifest;
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
        return null;
    const m = manifest;
    if (m.schemaVersion !== contracts_1.ADMISSION_COVERAGE_MANIFEST_SCHEMA_VERSION)
        return null;
    if (m.objectFormat !== 'sha1' && m.objectFormat !== 'sha256')
        return null;
    if (!isBoundedString(m.framingVersion, exports.MAX_ADMISSION_ID_LENGTH))
        return null;
    if (typeof m.entryCount !== 'number' || !Number.isInteger(m.entryCount) || m.entryCount < 0)
        return null;
    if (!(typeof m.deltaHash === 'string' && HEX_64.test(m.deltaHash)))
        return null;
    if (!(typeof m.coverageSetHash === 'string' && HEX_64.test(m.coverageSetHash)))
        return null;
    if (!Array.isArray(m.delta) || m.delta.length > exports.MAX_ADMISSION_DELTA_ENTRIES)
        return null;
    if (!Array.isArray(m.coverage) || m.coverage.length > exports.MAX_ADMISSION_COVERAGE_ENTRIES)
        return null;
    if (m.entryCount !== m.delta.length || m.entryCount !== m.coverage.length)
        return null;
    if (!m.delta.every((entry) => validateDeltaEntry(entry, m.objectFormat)))
        return null;
    if (!m.coverage.every((entry) => validateCoverageEntry(entry, m.objectFormat)))
        return null;
    return value;
}
/**
 * Parse + validate untrusted artifact JSON text. Enforces a byte ceiling before
 * JSON.parse, never throws, and returns null on any violation.
 */
function readSelfAttestedAdmissionRecordFromText(text) {
    if (typeof text !== 'string')
        return null;
    // Byte length, not code units, so multibyte payloads cannot exceed the cap.
    let byteLength;
    try {
        byteLength = new TextEncoder().encode(text).length;
    }
    catch {
        return null;
    }
    if (byteLength > exports.MAX_ADMISSION_JSON_BYTES)
        return null;
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return null;
    }
    return readSelfAttestedAdmissionRecord(parsed);
}
//# sourceMappingURL=admission-provenance.js.map