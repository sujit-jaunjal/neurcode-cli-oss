/**
 * Runtime Admission — source-free privacy guard (Phase A).
 *
 * The admission artifact may contain only: paths, object ids, modes, hashes,
 * classifications, timestamps, session ids, and version strings. It must never
 * contain file content, diff hunks, patch text, excerpts, or secrets.
 *
 * This guard is a denylist on key names (mirrors the runtime-sync upload guard)
 * plus a value-shape check. It is intentionally conservative: any source-like
 * key anywhere in the structure throws.
 */
/** Keys that would indicate source content / diffs / secrets leaked into the artifact. */
export declare const ADMISSION_SOURCE_LIKE_KEYS: ReadonlySet<string>;
export declare class AdmissionSourceLeakError extends Error {
    readonly keyPath: string;
    constructor(keyPath: string);
}
/**
 * Walk a value and throw AdmissionSourceLeakError if any object key is a
 * source-like key. Arrays and nested objects are walked recursively.
 */
export declare function assertSourceFreeAdmissionValue(value: unknown, path?: string): void;
//# sourceMappingURL=privacy.d.ts.map