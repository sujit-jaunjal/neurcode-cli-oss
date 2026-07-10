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
/** Schema/domain version for the framing contract. Bump only on a breaking framing change. */
export declare const ADMISSION_FRAMING_VERSION: "neurcode.admission-framing.v1";
/** Domain separators so delta and coverage hashes can never alias each other. */
export declare const ADMISSION_DELTA_HASH_DOMAIN: "neurcode.admission.delta.v1";
export declare const ADMISSION_COVERAGE_SET_HASH_DOMAIN: "neurcode.admission.coverage-set.v1";
/** Frame a single field as: u32be(byteLength) ‖ utf8(value). */
export declare function frameField(value: string): Uint8Array;
/** Frame an ordered list of fields. Order is preserved; the caller sorts records. */
export declare function frameFields(fields: readonly string[]): Uint8Array;
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
export declare function frameRecordSet(header: readonly string[], records: readonly (readonly string[])[]): Uint8Array;
//# sourceMappingURL=framing.d.ts.map