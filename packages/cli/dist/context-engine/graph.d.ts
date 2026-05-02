import type { ProjectScanResult } from './scanner';
export type DependencyGraph = {
    imports: Record<string, string[]>;
};
export declare function buildDependencyGraph(scan: ProjectScanResult): DependencyGraph;
//# sourceMappingURL=graph.d.ts.map