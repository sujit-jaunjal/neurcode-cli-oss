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
export declare function sessionHookCommand(program: Command): void;
//# sourceMappingURL=session-hook.d.ts.map