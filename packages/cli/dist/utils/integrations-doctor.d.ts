import { type IntegrationsCompatibilityReport } from '@neurcode-ai/contracts';
/** Live-read version sources for the report. All optional / null-safe. */
export interface IntegrationsVersionSources {
    cli: string | null;
    action: string | null;
    vscodeExtension: string | null;
    vscodeNewestVsix: string | null;
}
export interface IntegrationsDoctorInput {
    generatedAt: string;
    versions: IntegrationsVersionSources;
}
export declare function buildIntegrationsCompatibilityReport(input: IntegrationsDoctorInput): IntegrationsCompatibilityReport;
/**
 * Read the live version sources from repo manifests. `repoRoot` is the monorepo
 * root; `cliVersion` is passed in (the running CLI's own version) so the report
 * reflects the actual engine, not a manifest guess.
 */
export declare function collectIntegrationsVersionSources(repoRoot: string, cliVersion: string | null): IntegrationsVersionSources;
//# sourceMappingURL=integrations-doctor.d.ts.map