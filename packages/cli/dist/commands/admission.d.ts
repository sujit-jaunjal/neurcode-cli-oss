import type { Command } from 'commander';
export interface AdmissionExportOptions {
    dir?: string;
    sessionId?: string;
    receiptPath?: string;
    explain?: boolean;
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
    trustLevel: 'unsigned_local' | 'self_attested' | 'backend_signed';
    receipt: {
        present: boolean;
        receiptId?: string;
        keyId?: string | null;
        signatureStatus?: string | null;
        verificationStatus?: string | null;
        verifier?: string | null;
    };
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
    contains: string[];
    excludes: string[];
    actionConsumption: string[];
    nextSteps: string[];
}
export interface AdmissionDoctorSummary {
    ok: boolean;
    repoRoot: string;
    latestLocalSessionId: string | null;
    activeSessionId: string | null;
    exportable: boolean;
    publicDir: string;
    checks: Array<{
        id: string;
        status: 'pass' | 'warn' | 'fail';
        message: string;
    }>;
    nextSteps: string[];
}
export declare function findLatestLocalAdmissionSessionId(repoRoot: string): string | null;
export declare function buildAdmissionDoctorSummary(options?: {
    dir?: string;
}): AdmissionDoctorSummary;
export declare function exportAdmissionRecordForCli(options?: AdmissionExportOptions): AdmissionExportSummary;
export declare function admissionCommand(program: Command): void;
//# sourceMappingURL=admission.d.ts.map