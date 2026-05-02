export type ProjectScanResult = {
    files: string[];
    fileContents: Record<string, string>;
};
export declare function scanProject(rootPath: string): ProjectScanResult;
//# sourceMappingURL=scanner.d.ts.map