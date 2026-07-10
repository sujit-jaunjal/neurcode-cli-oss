import { type ProposedChangeEnvelope } from './repo-intelligence-v2';
declare const ADAPTERS: readonly ["claude-code-hooks", "copilot-hooks", "generic-mcp", "codex-mcp", "cursor-mcp", "vscode-extension", "github-action", "neurcode-cli"];
export type TrustedProposedChangeAdapterId = typeof ADAPTERS[number];
export type ProposedChangeTiming = ProposedChangeEnvelope['host']['timing'];
export interface TrustedProposedChangeContext {
    adapterId: TrustedProposedChangeAdapterId;
    timing: ProposedChangeTiming;
    targetPath: string;
    operation?: ProposedChangeEnvelope['target']['operation'];
    previousPath?: string | null;
    expectedContentHash?: string | null;
    repository?: Partial<ProposedChangeEnvelope['repository']>;
    session?: Partial<ProposedChangeEnvelope['session']>;
}
export declare function normalizeRepositoryRelativePath(value: unknown, path: string): string;
export declare function deriveTrustedHostPosture(adapterId: TrustedProposedChangeAdapterId, timing: ProposedChangeTiming): ProposedChangeEnvelope['host'];
export declare function validateProposedChangeEnvelope(value: unknown): ProposedChangeEnvelope;
export declare function validateAndBindProposedChangeEnvelope(value: unknown, context: TrustedProposedChangeContext): ProposedChangeEnvelope;
export {};
//# sourceMappingURL=proposed-change-validation.d.ts.map