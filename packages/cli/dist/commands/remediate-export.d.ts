/**
 * neurcode remediate-export
 *
 * Exports a structured, deterministic remediation payload for a governance finding.
 * The payload is designed to be passed to an external AI coding assistant
 * (Cursor, Claude, Codex, GitHub Copilot) for remediation.
 *
 * TRUST BOUNDARY:
 *   Neurcode detects and exports. Your AI assistant remediates.
 *   This command never modifies any file.
 *
 * Usage:
 *   neurcode remediate-export --finding <id>
 *   neurcode remediate-export --finding-index 0
 *   neurcode remediate-export --all
 *   neurcode remediate-export --finding <id> --format mcp
 *   neurcode remediate-export --finding <id> --out ./payload.json
 *   neurcode remediate-export --finding <id> --copy
 */
interface RemediateExportOptions {
    finding?: string;
    findingIndex?: string;
    all?: boolean;
    format?: 'json' | 'mcp';
    out?: string;
    copy?: boolean;
    json?: boolean;
}
export declare function remediateExportCommand(options: RemediateExportOptions): Promise<void>;
export {};
//# sourceMappingURL=remediate-export.d.ts.map