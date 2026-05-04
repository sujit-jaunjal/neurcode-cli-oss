/**
 * Dependency Graph Builder — constructs a lightweight, in-memory graph of
 * file relationships from an already-built FileMeta index.
 *
 * No disk I/O.  Purely derived from the diff data the indexer has already
 * parsed, so it adds negligible time to verification.
 */
import type { FileMeta, FileLayer } from './indexer';
/**
 * Refined layer type — extends the indexer's FileLayer with 'middleware'
 * so the flow validator can distinguish middleware files from generic API files.
 */
export type GraphLayer = FileLayer | 'middleware';
export interface FileNode {
    file: string;
    /** Module specifiers from import / require statements in added diff lines. */
    imports: string[];
    layer: GraphLayer;
    addedContent: string;
    keywords: string[];
}
/**
 * Build a FileNode graph from the FileMeta index produced by indexDiffFiles().
 * Returns Map<filePath, FileNode>.
 */
export declare function buildFlowGraph(index: Map<string, FileMeta>): Map<string, FileNode>;
/** Returns nodes whose layer matches any of the given layers. */
export declare function nodesOfLayer(graph: Map<string, FileNode>, ...layers: GraphLayer[]): FileNode[];
/** Returns true when any node in the graph has content matching the pattern. */
export declare function anyNodeMatches(graph: Map<string, FileNode>, re: RegExp): boolean;
/** Returns true when node `a` imports something that matches the path of node `b`. */
export declare function nodeImportsFile(a: FileNode, bPath: string): boolean;
//# sourceMappingURL=graph.d.ts.map