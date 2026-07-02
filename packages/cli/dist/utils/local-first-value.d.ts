/**
 * Local-First Aha V1 — the default `neurcode pilot start` engine.
 *
 * Runs a complete first-value proof in the user's own repository BEFORE any
 * login: detect boundaries from the existing governance profile, run a real
 * (non-activated) governed session through the same decision kernel the hooks
 * use, demonstrate block → exact-path approval → neighbor containment, and
 * write a source-free local proof artifact. Login/sync is offered only after
 * the proof exists.
 *
 * Safety properties:
 *  - never modifies user source (write attempts are decisions, not writes)
 *  - never requires cloud auth, never opens a browser
 *  - never touches the active session pointer (activate: false throughout)
 *  - never requires a healthy runtime manifest; stale identity only downgrades
 *    the reported host tier and prints the recovery command (no wedge)
 */
import { checkFileBoundary, type GovernanceSession } from '@neurcode-ai/governance-runtime';
import { type LocalFirstValueArtifact } from '@neurcode-ai/contracts';
export declare const LOCAL_FIRST_VALUE_JSON_PATH = ".neurcode/eval/local-first-value.json";
export declare const LOCAL_FIRST_VALUE_MARKDOWN_PATH = ".neurcode/eval/local-first-value.md";
export declare const LOCAL_FIRST_VALUE_LOGIN_PROMPT = "Want this in the dashboard or to share with your team? Run `neurcode login`.";
export type LocalFirstValueOutcomeKind = 'proof_complete' | 'proof_degraded' | 'setup_required';
export interface LocalFirstValueOptions {
    dir?: string;
    agent?: string;
    /** Skip the interactive approval prompt (also implied by --json / non-TTY). */
    assumeYes?: boolean;
    /** Force non-interactive mode (JSON output). */
    nonInteractive?: boolean;
}
export interface LocalFirstValueResult {
    ok: boolean;
    outcome: LocalFirstValueOutcomeKind;
    artifact: LocalFirstValueArtifact;
    artifactFiles: {
        json: string;
        markdown: string;
    };
    text: string;
}
interface SessionBoundaryInput {
    allowedGlobs: string[];
    ownershipRules: GovernanceSession['contract']['ownershipRules'];
    sensitiveGlobs: string[];
    approvalRequiredGlobs: string[];
    scopeMode: GovernanceSession['contract']['scopeMode'];
}
interface ProtectedPair {
    target: string;
    neighbor: string | null;
    targetResult: ReturnType<typeof checkFileBoundary>;
    neighborResult: ReturnType<typeof checkFileBoundary> | null;
}
export declare function pickProtectedPair(files: string[], contract: SessionBoundaryInput): ProtectedPair | null;
interface HookProbeDecision {
    decision: 'block' | 'allow';
    reason: string | null;
}
export declare function probeHookBinary(input: {
    repoRoot: string;
    entrypoint: string;
    sessionId: string;
    filePath: string;
}): HookProbeDecision | null;
export declare function renderLocalFirstValueMarkdown(artifact: LocalFirstValueArtifact): string;
export declare function renderLocalFirstValueText(result: {
    artifact: LocalFirstValueArtifact;
    outcome: LocalFirstValueOutcomeKind;
    artifactFiles: {
        json: string;
        markdown: string;
    };
}): string;
export declare function runLocalFirstValue(options?: LocalFirstValueOptions): Promise<LocalFirstValueResult>;
export {};
//# sourceMappingURL=local-first-value.d.ts.map