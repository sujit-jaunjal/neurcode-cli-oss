/**
 * Self-contained HTML replay report generator.
 *
 * Renders deterministic replay state into a single audit-grade HTML file.
 * No JavaScript, no external assets, no remote requests — every byte of the
 * output is derived from canonical replay artifacts.
 *
 * The output is intended to be opened directly in a browser, attached to
 * audit reports, or stored alongside `.neurcode/evidence/` artifacts.
 */
import type { replayGovernanceState } from './replay-runtime';
type ReplayState = ReturnType<typeof replayGovernanceState>;
export interface HtmlReportInput {
    state: ReplayState;
    /**
     * Optional latest verify payload (the structural+governance envelope
     * emitted by `verify --json`). When provided, scope issues, runtime
     * capabilities, and the canonical replay checksum are surfaced.
     */
    verify?: Record<string, unknown> | null;
    generatedAt?: string;
}
/**
 * Render a self-contained HTML report. The returned string is ready to be
 * written to disk and opened in any browser. No external assets fetched.
 */
export declare function renderReplayHtmlReport(input: HtmlReportInput): string;
export {};
//# sourceMappingURL=replay-html-report.d.ts.map