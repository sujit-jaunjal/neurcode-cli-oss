export interface SensitivePathEvidence {
    protected: boolean;
    kinds: Array<'auth' | 'security'>;
    reasonCodes: string[];
    matchedSymbolCount: number;
    sourceFree: true;
}
export declare function requestsSensitiveChange(intent: string): boolean;
export declare function shouldProtectSensitiveTaskPath(input: {
    filePath: string;
    plannedPaths: string[];
    sensitiveIntent: boolean;
    directEvidenceProtected: boolean;
    plannedSensitivePaths: string[];
}): boolean;
/** Bounded, source-free sensitive-path classification from immutable Brain rows. */
export declare function classifySensitivePathFromBrain(repoRoot: string, filePath: string): SensitivePathEvidence;
//# sourceMappingURL=sensitive-path-evidence.d.ts.map