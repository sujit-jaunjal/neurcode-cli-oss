"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMinimalAdvisoryContractFromDiff = buildMinimalAdvisoryContractFromDiff;
const change_contract_1 = require("../../../utils/change-contract");
function toUnixPath(filePath) {
    return filePath.replace(/\\/g, '/');
}
function buildMinimalAdvisoryContractFromDiff(diffFiles, fallbackPlanId) {
    const expectedFiles = [...new Set(diffFiles.map(file => toUnixPath(file.path)).filter(Boolean))];
    const planFiles = expectedFiles.map(path => {
        const entry = diffFiles.find(file => toUnixPath(file.path) === path);
        const changeType = entry?.changeType;
        const action = changeType === 'add' ? 'CREATE' : 'MODIFY';
        return {
            path,
            action: action,
            reason: 'Auto-generated advisory baseline from current diff',
        };
    });
    return (0, change_contract_1.createChangeContract)({
        planId: fallbackPlanId,
        intent: 'Advisory baseline generated from current repository diff',
        expectedFiles,
        planFiles,
        options: {
            enforceExpectedFiles: false,
            enforceActionMatching: false,
            enforceExpectedSymbols: false,
            enforceSymbolActionMatching: false,
        },
    });
}
//# sourceMappingURL=advisory-mode-contract.js.map