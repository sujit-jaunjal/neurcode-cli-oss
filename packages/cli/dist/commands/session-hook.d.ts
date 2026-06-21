/**
 * neurcode session-hook  (internal — called by Claude Code hooks, not by users)
 *
 * Sub-commands:
 *   start   — UserPromptSubmit: create a session from the user's prompt
 *   check   — PreToolUse: check a pending Edit/Write before it lands
 *   finish  — Stop: finalize the session and write the replay record
 *
 * Claude Code hook protocol (stdin → JSON, stdout → JSON):
 *   PreToolUse exit 0 + { permissionDecision: "deny" } → block the edit
 *   PreToolUse exit 0 (no deny)                        → allow
 *   UserPromptSubmit / Stop → side-effect only; always exit 0
 *
 * Fail-open policy:
 *   Governance errors must not break the agent.  We fail open (allow) and
 *   emit a stderr diagnostic so the developer can diagnose the issue.
 *   The exceptions: when a session IS active and the boundary or configured
 *   plan-coherence policy returns 'block', we deny — intentional enforcement.
 */
import type { Command } from 'commander';
import { checkFileBoundary, type GovernanceSession, type RuntimeBlockType } from '@neurcode-ai/governance-runtime';
import type { TrustedProposedChangeAdapterId } from '@neurcode-ai/contracts';
export interface HookSessionResolution {
    session: GovernanceSession | null;
    requestedSessionId?: string;
    usedActiveFallback: boolean;
}
export declare function resolveSessionForHook(repoRoot: string, requestedSessionId?: string): HookSessionResolution;
export declare function normalizeHookFilePathForRepo(rawPath: string, repoRoot: string): string;
export declare function hookFilePathCandidates(hookInput: Record<string, unknown>): string[];
export declare function proposedSourceFromHookInput(hookInput: Record<string, unknown>): {
    source: string | null;
    sourceKind: 'write_content' | 'edit_new_string' | 'multi_edit_new_strings' | 'not_available';
};
export interface NoActiveSessionWriteDecision {
    block: boolean;
    filePath: string;
    result: ReturnType<typeof checkFileBoundary>;
    message: string;
}
export declare function evaluateNoActiveSessionWrite(repoRoot: string, filePath: string): NoActiveSessionWriteDecision;
export declare function shouldKeepSessionActiveForPendingApproval(session: GovernanceSession, pendingApproval: {
    filePath: string;
    suggestedApprovalPath?: string | null;
    blockType?: RuntimeBlockType;
} | null): boolean;
/**
 * Bind the attested host posture to the session's established launcher posture.
 * A governed session launched by a cooperative or observe-only agent can never
 * be re-labelled as host-enforced hard pre-write by a later check, even if the
 * check declares a hard adapter string. Changing adapters requires an explicit
 * re-handshake that re-launches the session. This is posture binding, not a
 * cryptographic host-attestation claim.
 */
export declare function reconcileTrustedAdapterPosture(declared: TrustedProposedChangeAdapterId, launched: TrustedProposedChangeAdapterId | undefined): {
    adapterId: TrustedProposedChangeAdapterId;
    downgraded: boolean;
};
export declare function sessionHookCommand(program: Command): void;
//# sourceMappingURL=session-hook.d.ts.map