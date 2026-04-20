import type { GovernanceArtifactSignature } from './artifact-signature';
export interface ChangeContract {
    schemaVersion: 1;
    generatedAt: string;
    contractId: string;
    signature?: GovernanceArtifactSignature;
    planId: string;
    sessionId: string | null;
    projectId: string | null;
    intentHash: string;
    expectedFiles: string[];
    expectedFilesFingerprint: string;
    planFiles?: ChangeContractPlanFile[];
    expectedSymbols?: ChangeContractExpectedSymbol[];
    options?: ChangeContractOptions;
    policyLockFingerprint: string | null;
    compiledPolicyFingerprint: string | null;
}
export type ChangeContractPlanAction = 'CREATE' | 'MODIFY' | 'BLOCK';
export type ChangeContractDiffAction = 'add' | 'delete' | 'modify' | 'rename';
export type ChangeContractSymbolAction = 'CREATE' | 'MODIFY' | 'BLOCK';
export type ChangeContractSymbolType = 'function' | 'class' | 'interface' | 'type' | 'method' | 'const' | 'unknown';
export type ChangeContractDiffSymbolAction = 'add' | 'delete' | 'modify';
export interface ChangeContractPlanFile {
    path: string;
    action: ChangeContractPlanAction;
    reason?: string;
}
export interface ChangeContractExpectedSymbol {
    name: string;
    action: ChangeContractSymbolAction;
    type?: ChangeContractSymbolType;
    file?: string;
    reason?: string;
}
export interface ChangeContractOptions {
    /**
     * When enabled, files expected by the contract must be changed in the current diff.
     * This is opt-in to avoid breaking partial/iterative delivery workflows.
     */
    enforceExpectedFiles?: boolean;
    /**
     * When enabled, diff operations are validated against planned file actions.
     */
    enforceActionMatching?: boolean;
    /**
     * Allows rename operations to satisfy MODIFY expectations.
     * Defaults to true when action matching is enabled.
     */
    allowRenameForModify?: boolean;
    /**
     * When enabled, symbols expected by the contract must be present in changed symbol declarations.
     */
    enforceExpectedSymbols?: boolean;
    /**
     * When enabled, symbol-level operation matching is validated against expected symbol actions.
     */
    enforceSymbolActionMatching?: boolean;
}
export interface ReadChangeContractResult {
    path: string;
    exists: boolean;
    contract: ChangeContract | null;
    error?: string;
}
export interface ChangeContractViolation {
    code: 'CHANGE_CONTRACT_PLAN_MISMATCH' | 'CHANGE_CONTRACT_UNEXPECTED_FILE' | 'CHANGE_CONTRACT_MISSING_EXPECTED_FILE' | 'CHANGE_CONTRACT_BLOCKED_FILE_TOUCHED' | 'CHANGE_CONTRACT_ACTION_MISMATCH' | 'CHANGE_CONTRACT_MISSING_EXPECTED_SYMBOL' | 'CHANGE_CONTRACT_BLOCKED_SYMBOL_TOUCHED' | 'CHANGE_CONTRACT_SYMBOL_ACTION_MISMATCH' | 'CHANGE_CONTRACT_POLICY_LOCK_MISMATCH' | 'CHANGE_CONTRACT_COMPILED_POLICY_MISMATCH';
    message: string;
    file?: string;
    symbol?: string;
    symbolType?: string;
    expected?: string;
    actual?: string;
}
export interface ChangeContractEvaluation {
    valid: boolean;
    violations: ChangeContractViolation[];
    coverage: {
        expectedFiles: number;
        changedFiles: number;
        outOfContractFiles: number;
        missingExpectedFiles: number;
        blockedFilesTouched: number;
        actionMismatches: number;
        expectedSymbols: number;
        changedSymbols: number;
        missingExpectedSymbols: number;
        blockedSymbolsTouched: number;
        symbolActionMismatches: number;
    };
}
export declare function createChangeContract(input: {
    generatedAt?: string;
    planId: string;
    sessionId?: string | null;
    projectId?: string | null;
    intent: string;
    expectedFiles: string[];
    planFiles?: Array<{
        path: string;
        action: ChangeContractPlanAction;
        reason?: string;
    }>;
    expectedSymbols?: Array<{
        name: string;
        action: ChangeContractSymbolAction;
        type?: ChangeContractSymbolType;
        file?: string;
        reason?: string;
    }>;
    options?: ChangeContractOptions;
    policyLockFingerprint?: string | null;
    compiledPolicyFingerprint?: string | null;
}): ChangeContract;
export declare function resolveChangeContractPath(projectRoot: string, inputPath?: string): string;
export declare function writeChangeContract(projectRoot: string, contract: ChangeContract, outputPath?: string): string;
export declare function readChangeContract(projectRoot: string, inputPath?: string): ReadChangeContractResult;
export declare function evaluateChangeContract(contract: ChangeContract, input: {
    planId: string;
    changedFiles: string[];
    changedFileEntries?: Array<{
        path: string;
        changeType: ChangeContractDiffAction;
    }>;
    changedSymbols?: Array<{
        name: string;
        action: ChangeContractDiffSymbolAction;
        type?: ChangeContractSymbolType;
        file?: string;
    }>;
    policyLockFingerprint?: string | null;
    compiledPolicyFingerprint?: string | null;
}): ChangeContractEvaluation;
//# sourceMappingURL=change-contract.d.ts.map