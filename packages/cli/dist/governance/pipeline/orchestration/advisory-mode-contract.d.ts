/**
 * Advisory-mode auto-contract construction.
 *
 * Builds a minimal `ChangeContract` for the advisory-first branch when no
 * change contract exists. Extracted from `commands/verify.ts:6769` as part of
 * the advisory-mode orchestration extraction.
 *
 * The contract is intentionally permissive (all `enforce*` flags false) — it
 * captures "what changed" as a baseline so subsequent runs have something
 * to compare against, without imposing enforcement.
 */
import type { DiffFile } from '@neurcode-ai/diff-parser';
import { createChangeContract } from '../../../utils/change-contract';
export declare function buildMinimalAdvisoryContractFromDiff(diffFiles: ReadonlyArray<DiffFile>, fallbackPlanId: string): ReturnType<typeof createChangeContract>;
//# sourceMappingURL=advisory-mode-contract.d.ts.map