import type { ProposedChangeEnvelope } from '@neurcode-ai/contracts';
import { type LocalRepoBrainSymbolFact } from './local-repo-brain';
export interface ProposedChangeAnalysis {
    envelope: ProposedChangeEnvelope;
    localSymbols: LocalRepoBrainSymbolFact[];
}
export declare function analyzeProposedChange(input: {
    repoRoot: string;
    filePath: string;
    proposedSource: string | null;
    sourceKind: 'write_content' | 'edit_new_string' | 'multi_edit_new_strings' | 'post_write_disk_read' | 'not_available';
    adapterId: string;
    timing: ProposedChangeEnvelope['host']['timing'];
    sessionId: string | null;
    planRevision: number | null;
    proposedChange?: unknown;
    operation?: ProposedChangeEnvelope['target']['operation'];
    previousPath?: string | null;
}): ProposedChangeAnalysis;
//# sourceMappingURL=proposed-change-analysis.d.ts.map