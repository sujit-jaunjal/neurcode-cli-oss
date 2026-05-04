/**
 * Code Indexer — builds a lightweight FileMeta index from diff hunks.
 * Operates entirely on the parsed diff (no disk I/O beyond what the diff
 * parser has already done), so it adds negligible time to verify.
 */
import type { DiffFile } from '@neurcode-ai/diff-parser';
export type FileLayer = 'ui' | 'api' | 'service' | 'core' | 'config' | 'test' | 'unknown';
export interface FileMeta {
    path: string;
    layer: FileLayer;
    imports: string[];
    keywords: string[];
    addedLines: number;
    removedLines: number;
    addedContent: string;
}
export declare function indexDiffFiles(diffFiles: DiffFile[]): Map<string, FileMeta>;
//# sourceMappingURL=indexer.d.ts.map