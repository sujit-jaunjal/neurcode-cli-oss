/**
 * Governance-aligned remediation subcommands for the Neurcode CLI.
 *
 * These implement the provider-agnostic remediation architecture:
 *   neurcode remediate export    → export GovernanceRemediationRequest JSON
 *   neurcode remediate validate  → validate a patch against governance rules
 *   neurcode remediate status    → show remediation artifact status
 *
 * These are SEPARATE from the autonomous remediation loop in remediate.ts.
 * Governance remains deterministic throughout.
 * LLMs are optional and advisory — never autonomous.
 */
export interface GovernanceRemediateExportOptions {
    findingId?: string;
    findingIndex?: number;
    verifyOutputFile?: string;
    projectRoot?: string;
    outputFile?: string;
    json?: boolean;
}
/**
 * neurcode remediate export
 *
 * Reads governance findings from a verify output JSON file and exports a
 * GovernanceRemediationRequest artifact for the selected finding.
 * No provider is invoked. No files are modified.
 */
export declare function remediateExportCommand(options?: GovernanceRemediateExportOptions): Promise<void>;
export interface GovernanceRemediateValidateOptions {
    requestFile: string;
    responseDiff?: string;
    responseFile?: string;
    projectRoot?: string;
    json?: boolean;
}
/**
 * neurcode remediate validate
 *
 * Validates an LLM-generated (or manually written) patch against the
 * deterministic governance validation pipeline.
 * Never modifies files. Output is a validation receipt (append-only).
 */
export declare function remediateValidateCommand(options: GovernanceRemediateValidateOptions): Promise<void>;
export interface GovernanceRemediateStatusOptions {
    projectRoot?: string;
    json?: boolean;
}
/**
 * neurcode remediate status
 *
 * Shows the status of all remediation artifacts in .neurcode/remediation/.
 */
export declare function remediateStatusCommand(options?: GovernanceRemediateStatusOptions): Promise<void>;
//# sourceMappingURL=remediate-governance.d.ts.map