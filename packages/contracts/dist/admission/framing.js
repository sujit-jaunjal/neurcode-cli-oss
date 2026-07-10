"use strict";
/**
 * Runtime Admission — canonical byte-safe framing (Phase A).
 *
 * Deterministic, length-prefixed framing for the delta and coverage hashes.
 * Web-safe: uses Uint8Array + TextEncoder only (this package is imported by
 * the dashboard and other non-Node surfaces). No Node Buffer, no crypto here —
 * hashing of the framed bytes happens in the governance-runtime core.
 *
 * Why length-prefixed framing (and not a delimiter join):
 *   A delimiter such as "\0" or "\t" can appear inside a path, so a delimiter
 *   join lets two distinct field sets collapse to the same byte stream
 *   (e.g. ["a\tb"] vs ["a","b"]). Every field and every record here is prefixed
 *   with its exact byte length, so field and record boundaries are
 *   unambiguous and no path content can forge a boundary.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMISSION_COVERAGE_SET_HASH_DOMAIN = exports.ADMISSION_DELTA_HASH_DOMAIN = exports.ADMISSION_FRAMING_VERSION = void 0;
exports.frameField = frameField;
exports.frameFields = frameFields;
exports.frameRecordSet = frameRecordSet;
/** Schema/domain version for the framing contract. Bump only on a breaking framing change. */
exports.ADMISSION_FRAMING_VERSION = 'neurcode.admission-framing.v1';
/** Domain separators so delta and coverage hashes can never alias each other. */
exports.ADMISSION_DELTA_HASH_DOMAIN = 'neurcode.admission.delta.v1';
exports.ADMISSION_COVERAGE_SET_HASH_DOMAIN = 'neurcode.admission.coverage-set.v1';
const textEncoder = new TextEncoder();
function u32be(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new Error(`admission framing: length out of range: ${value}`);
    }
    const out = new Uint8Array(4);
    const view = new DataView(out.buffer);
    view.setUint32(0, value, false);
    return out;
}
function concatBytes(parts) {
    let total = 0;
    for (const part of parts)
        total += part.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}
/** Frame a single field as: u32be(byteLength) ‖ utf8(value). */
function frameField(value) {
    const bytes = textEncoder.encode(value);
    return concatBytes([u32be(bytes.length), bytes]);
}
/** Frame an ordered list of fields. Order is preserved; the caller sorts records. */
function frameFields(fields) {
    return concatBytes(fields.map((field) => frameField(field)));
}
/**
 * Frame a header plus an ordered set of records into one canonical byte stream.
 *
 * Layout:
 *   frameFields(header)
 *   for each record: u32be(recordByteLength) ‖ frameFields(record)
 *
 * Records must already be canonically sorted by the caller (the hash functions
 * sort before calling this, which is what makes shuffled input produce an
 * identical hash). Double length-prefixing (record length + per-field length)
 * makes both record and field boundaries unambiguous.
 */
function frameRecordSet(header, records) {
    const parts = [frameFields(header)];
    for (const record of records) {
        const recordBytes = frameFields(record);
        parts.push(u32be(recordBytes.length), recordBytes);
    }
    return concatBytes(parts);
}
//# sourceMappingURL=framing.js.map