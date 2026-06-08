import { type PilotReadinessReport } from '../governance/pilot-readiness';
import { type GovernanceHealthReport } from './governance-health';
import { type CursorMcpAgentInspection } from './cursor-mcp-agent';
export declare const CURSOR_PILOT_READINESS_SCHEMA_VERSION: "neurcode.cursor-pilot-readiness.v1";
export interface CursorPilotReadinessReport {
    schemaVersion: typeof CURSOR_PILOT_READINESS_SCHEMA_VERSION;
    ready: boolean;
    repoRoot: string;
    blockers: string[];
    warnings: string[];
    repo: PilotReadinessReport;
    health: GovernanceHealthReport;
    mcp: CursorMcpAgentInspection;
}
export declare function runCursorPilotReadinessCheck(dir?: string): CursorPilotReadinessReport;
//# sourceMappingURL=cursor-pilot-readiness.d.ts.map