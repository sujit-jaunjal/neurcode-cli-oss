/**
 * Pilot Evidence Pack — repo-local I/O glue (Iteration 10).
 *
 * Reads the source-free runtime artifacts the Neurcode control plane already
 * persists and projects them into the narrow, source-free inputs consumed by the
 * pure builder in utils/pilot-evidence-pack.ts:
 *
 *   - .neurcode/sessions/<id>.change-record.json  (neurcode.governed-session-record.v1)
 *   - .neurcode/admission/<id>.json               (neurcode.admission-record.v1)
 *   - .neurcode/pilot-metrics.json                (rolling governance metrics)
 *
 * Hard rules:
 *   - NEVER read the raw `.neurcode/sessions/<id>.json` session log (large; may
 *     contain source-like trajectory data). Only the curated, source-free
 *     `.change-record.json` projection is read.
 *   - NEVER copy the admission record's natural-language `intentSummary` / goal
 *     prose. Intent is represented by its hash + categories only.
 *   - Every field is coerced defensively so a malformed artifact degrades to a
 *     count of zero / null rather than crashing the export.
 */
import type { BuildPilotEvidencePackInput, PilotAdmissionInput, PilotBrainReadinessInput, PilotMetricsInput, PilotSessionInput } from './pilot-evidence-pack';
/**
 * Project `.neurcode/sessions/*.change-record.json` into source-free session
 * inputs. The raw `<id>.json` session logs are intentionally never read.
 */
export declare function readPilotChangeRecords(repoRoot: string): PilotSessionInput[];
/**
 * Project `.neurcode/admission/*.json` into source-free admission inputs. The
 * record's `runtimeContext.intentSummary` prose is intentionally never read.
 */
export declare function readPilotAdmissionRecords(repoRoot: string): PilotAdmissionInput[];
/**
 * Project the local pilot-metrics rollup into source-free metric inputs. Returns
 * null when no `.neurcode/pilot-metrics.json` exists (an incomplete-pilot signal).
 */
export declare function readPilotMetricsInput(repoRoot: string, days?: number): PilotMetricsInput | null;
/** Resolve the CLI's own package version without spawning a subprocess. */
export declare function resolveCliVersion(): string | null;
export interface GatherPilotEvidenceOptions {
    generatedAt: string;
    cliVersion?: string | null;
    days?: number;
    repoName?: string | null;
    brainReadiness?: PilotBrainReadinessInput | null;
}
/**
 * Read every repo-local artifact and assemble the source-free builder input.
 * Synchronous and side-effect-free apart from reads; the optional brain
 * readiness is computed by the caller and threaded through.
 */
export declare function gatherPilotEvidenceInputs(repoRoot: string, options: GatherPilotEvidenceOptions): BuildPilotEvidencePackInput;
//# sourceMappingURL=pilot-evidence-io.d.ts.map