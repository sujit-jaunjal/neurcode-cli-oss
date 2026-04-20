import type { DiffFile } from '@neurcode-ai/diff-parser';
import type { ChangeContractDiffSymbolAction, ChangeContractSymbolType } from './change-contract';
export interface DiffSymbolChange {
    name: string;
    type: ChangeContractSymbolType;
    action: ChangeContractDiffSymbolAction;
    file: string;
}
export declare function extractDeclaredSymbolsFromDiff(diffFiles: DiffFile[]): DiffSymbolChange[];
//# sourceMappingURL=diff-symbols.d.ts.map