import type { Command } from 'commander';
interface RuntimeReportOptions {
    runtime?: boolean;
    since?: string;
    format?: string;
    out?: string;
    dir?: string;
    json?: boolean;
}
export declare function runtimeReportCommand(options?: RuntimeReportOptions): void;
export declare function reportCommand(program: Command): void;
export {};
//# sourceMappingURL=runtime-report.d.ts.map