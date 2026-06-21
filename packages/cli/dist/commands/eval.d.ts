/**
 * `neurcode eval` — the guided enterprise evaluation runner.
 *
 * Turns the technical evaluation from a static checklist into an interactive,
 * progress-aware flow a principal engineer can drive without a founder on the
 * call. Subcommands:
 *
 *   neurcode eval start [--fixture] [--agent <id>]  — begin / scaffold the eval
 *   neurcode eval status [--json]                   — progress + per-step facts
 *   neurcode eval next [--json]                     — the single next command
 *   neurcode eval export [--json] [--out <path>]    — source-free shareable report
 *
 * Everything here is source-free and read-only against the user's repo. The
 * only thing that writes is `--fixture` mode (a controlled local demo repo) and
 * the eval run-state / report under `.neurcode/eval/` (gitignored).
 */
import type { Command } from 'commander';
export declare function evalCommand(program: Command): void;
//# sourceMappingURL=eval.d.ts.map