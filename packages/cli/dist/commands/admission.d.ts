import type { Command } from 'commander';
export interface AdmissionExportOptions {
    dir?: string;
    sessionId?: string;
    json?: boolean;
}
export interface AdmissionExportSummary {
    ok: true;
    repoRoot: string;
    sessionId: string;
    localPath: string;
    publicPath: string;
    localRelativePath: string;
    publicRelativePath: string;
    schemaVersion: string;
    attestationKind: 'self-attested';
    disclaimer: string;
    capture: {
        mode: string;
        baseRef?: string;
        headRef?: string;
    };
    manifest: {
        entryCount: number;
        coverageCount: number;
        deltaHash: string;
        coverageSetHash: string;
        governedCoverageCount: number;
        ungovernedCoverageCount: number;
    };
    nextSteps: string[];
}
export declare function findLatestLocalAdmissionSessionId(repoRoot: string): string | null;
export declare function exportAdmissionRecordForCli(options?: AdmissionExportOptions): AdmissionExportSummary;
export declare function admissionCommand(program: Command): void;
//# sourceMappingURL=admission.d.ts.map