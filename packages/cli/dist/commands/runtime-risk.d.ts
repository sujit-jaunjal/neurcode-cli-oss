/**
 * `neurcode runtime risk doctor` (Iteration 11 — AppSec-Adjacent Runtime Risk
 * Pack). Read-only, source-free. States which AppSec-adjacent runtime boundaries
 * an AI agent must obey before a write lands, and exactly what each one enforces
 * — grounded in the Runtime Safety Kernel, never re-authored here.
 *
 * This command does not start a session, read repository source, or mutate any
 * runtime state, so it stays reachable even when a session is wedged.
 */
import type { Command } from 'commander';
export declare function registerRuntimeRiskCommand(runtime: Command): void;
//# sourceMappingURL=runtime-risk.d.ts.map