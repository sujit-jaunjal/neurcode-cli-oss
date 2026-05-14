export interface AtomicWriteResult {
    path: string;
    bytes: number;
    sha256: string;
}
export interface AtomicWriteOptions {
    /**
     * Best-effort fsync of the temp file before rename and containing directory
     * after rename. Disable only for non-custody caches where speed matters more
     * than crash durability.
     */
    fsync?: boolean;
}
export interface AppendWriteOptions {
    /**
     * Best-effort fsync after append. Keep enabled for custody-critical ledgers;
     * disable only for high-volume diagnostic streams where the primary artifact
     * remains the source of truth.
     */
    fsync?: boolean;
}
export interface FileLockOptions {
    timeoutMs?: number;
    staleMs?: number;
    retryMs?: number;
}
export declare function stableJson(value: unknown): string;
export declare function atomicWriteUtf8FileSync(filePath: string, content: string, options?: AtomicWriteOptions): AtomicWriteResult;
export declare function atomicWriteJsonFileSync(filePath: string, value: unknown, options?: AtomicWriteOptions): AtomicWriteResult;
export declare function appendUtf8FileSync(filePath: string, content: string, options?: AppendWriteOptions): AtomicWriteResult;
export declare function appendJsonLineSync(filePath: string, value: unknown, options?: AppendWriteOptions): AtomicWriteResult;
export declare function withFileLockSync<T>(lockPath: string, fn: () => T, options?: FileLockOptions): T;
//# sourceMappingURL=artifact-io.d.ts.map