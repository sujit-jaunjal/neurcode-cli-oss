import type { Command } from 'commander';
import { type GovernanceRealityAssessment } from '@neurcode-ai/contracts';
import { type RuntimeCompanionSnapshot } from '../utils/runtime-companion';
interface LocalSession {
    sessionId?: string;
    status?: string;
    startedAt?: string;
    finishedAt?: string;
    replayHash?: string;
    events?: Array<{
        type?: string;
        ts?: string;
        filePath?: string;
        verdict?: string;
        decision?: string;
    }>;
}
export declare function deriveLocalGovernanceReality(repoRoot: string, snapshot: RuntimeCompanionSnapshot, sessions: LocalSession[]): GovernanceRealityAssessment;
export declare function realityCommand(program: Command): void;
export {};
//# sourceMappingURL=reality.d.ts.map