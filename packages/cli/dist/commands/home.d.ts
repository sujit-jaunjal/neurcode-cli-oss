/**
 * `neurcode home` — operational home surface.
 *
 * Surfaces the current runtime state in a single, scannable view:
 *   - Active intent contract (declared scope, forbidden boundaries)
 *   - Last verify run (verdict, canonical replay checksum, governance posture)
 *   - Runtime capabilities envelope (what actually executed)
 *   - Recent governance decisions (accept-risk, temporary-exception)
 *
 * This command does NOT mutate any runtime state. It is a read-only
 * presentation of canonical artefacts already on disk:
 *   - .neurcode/intent-pack.json
 *   - .neurcode/last-verify-output.json
 *   - .neurcode/governance/*.json
 *
 * Replay-safe: the command's output is human-presentation only. Same
 * canonical artefacts on disk → same `home` output.
 */
import type { Command } from 'commander';
export declare function homeCommand(program: Command): void;
//# sourceMappingURL=home.d.ts.map