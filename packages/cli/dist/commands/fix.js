"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixCommand = fixCommand;
const cli_json_1 = require("../utils/cli-json");
const contracts_1 = require("@neurcode-ai/contracts");
const chalk = (0, cli_json_1.loadChalk)();
const MAX_SUGGESTIONS = 10;
function suggestAction(file, issue, policy, isScopeIssue) {
    const combined = `${issue} ${policy}`.toLowerCase();
    const withContextHint = (message) => `${message} (from current diff)`;
    const withStartBy = (message) => `Start by ${message}`;
    if (combined.includes('todo') || combined.includes('fixme') || combined.includes('todo_fixme')) {
        return withContextHint(withStartBy(`removing or resolving TODO/FIXME in ${file} before merge to avoid technical debt`));
    }
    if ((combined.includes('direct db access') || combined.includes('database access') || combined.includes('db access'))
        && (combined.includes('ui') || combined.includes('component') || combined.includes('frontend'))) {
        return withContextHint(withStartBy(`moving data access from ${file} into a service layer (e.g., src/core/...) to keep business logic out of UI`));
    }
    if (combined.includes('validation') || combined.includes('missing validation') || combined.includes('input')) {
        return withContextHint(withStartBy(`adding input validation in ${file} before request handling to prevent invalid data`));
    }
    if (isScopeIssue || combined.includes('scope')) {
        return withContextHint(withStartBy(`updating the plan or reverting changes in ${file} to reduce architectural drift`));
    }
    if (combined.includes('direct db access') || combined.includes('database access') || combined.includes('db access')) {
        return withContextHint(withStartBy(`moving direct database access from ${file} into a service layer to keep business logic out of UI`));
    }
    return withContextHint(withStartBy(`reviewing ${file} and aligning implementation with current project architecture`));
}
function asObjectRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
function extractExpediteItems(payload) {
    if (!payload)
        return [];
    const rawItems = payload.expediteItems;
    if (!Array.isArray(rawItems))
        return [];
    const items = [];
    for (const rawItem of rawItems) {
        const item = asObjectRecord(rawItem);
        if (!item)
            continue;
        const file = typeof item.file === 'string' && item.file.trim() ? item.file.trim() : 'unknown';
        const message = typeof item.message === 'string' && item.message.trim() ? item.message.trim() : 'Expedite follow-up required';
        const policy = typeof item.policy === 'string' && item.policy.trim() ? item.policy.trim() : 'expedite_followup';
        items.push({ file, message, policy });
    }
    return items;
}
function suggestExpediteAction(file, issue, policy) {
    const combined = `${issue} ${policy}`.toLowerCase();
    if (combined.includes('validation') || combined.includes('input')) {
        return `Minimal safe patch now: add a guard clause in ${file}. Follow-up: restore full validation rules in ${file}.`;
    }
    if (combined.includes('layer')
        || combined.includes('direct db access')
        || combined.includes('database access')
        || combined.includes('ui')
        || combined.includes('component')) {
        return `Minimal safe patch now: route logic through an existing helper in ${file}. Follow-up: move business/data logic to a proper service layer file.`;
    }
    if (combined.includes('scope') || combined.includes('outside intended scope')) {
        return `Minimal safe patch now: keep the change localized in ${file}. Follow-up: add ${file} to planned scope or refactor into an allowed file.`;
    }
    return `Minimal safe patch now: apply the smallest safe change in ${file}. Follow-up: clean up ${file} to restore full policy compliance.`;
}
function priorityRank(label) {
    if (label === 'CRITICAL')
        return 0;
    if (label === 'WARNING')
        return 1;
    return 2;
}
function resolveViolationPriority(severity) {
    if (severity === 'critical' || severity === 'high')
        return 'CRITICAL';
    return 'WARNING';
}
function dedupeSuggestions(suggestions) {
    const out = [];
    const seen = new Set();
    for (const suggestion of suggestions) {
        const key = `${suggestion.file.trim().toLowerCase()}|${suggestion.issue.trim().toLowerCase()}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(suggestion);
    }
    return out;
}
function buildSuggestions(verifyOutput) {
    const suggestions = [];
    for (const violation of verifyOutput.violations) {
        if (suggestions.length >= MAX_SUGGESTIONS)
            break;
        suggestions.push({
            file: violation.file,
            issue: violation.message,
            policy: violation.policy,
            suggestedAction: suggestAction(violation.file, violation.message, violation.policy, false),
            source: 'violation',
            priority: resolveViolationPriority(violation.severity),
        });
    }
    for (const warning of verifyOutput.warnings) {
        if (suggestions.length >= MAX_SUGGESTIONS)
            break;
        suggestions.push({
            file: warning.file,
            issue: warning.message,
            policy: warning.policy,
            suggestedAction: suggestAction(warning.file, warning.message, warning.policy, false),
            source: 'warning',
            priority: 'WARNING',
        });
    }
    for (const scopeIssue of verifyOutput.scopeIssues) {
        if (suggestions.length >= MAX_SUGGESTIONS)
            break;
        const message = scopeIssue.message || 'File modified outside approved scope';
        suggestions.push({
            file: scopeIssue.file,
            issue: message,
            policy: 'scope_guard',
            suggestedAction: suggestAction(scopeIssue.file, message, 'scope_guard', true),
            source: 'scope',
            priority: 'SCOPE',
        });
    }
    return dedupeSuggestions(suggestions).slice(0, MAX_SUGGESTIONS);
}
function appendExpediteSuggestions(suggestions, expediteItems) {
    if (expediteItems.length === 0)
        return suggestions;
    const expediteSuggestions = [];
    for (const item of expediteItems) {
        if (expediteSuggestions.length >= MAX_SUGGESTIONS)
            break;
        expediteSuggestions.push({
            file: item.file,
            issue: `[EXPEDITE] ${item.message}`,
            policy: item.policy,
            suggestedAction: suggestExpediteAction(item.file, item.message, item.policy),
            source: 'expedite',
            priority: 'WARNING',
        });
    }
    return dedupeSuggestions([...expediteSuggestions, ...suggestions]).slice(0, MAX_SUGGESTIONS);
}
function printFixPlan(suggestions, context) {
    console.log(chalk.bold('\nNeurcode Fix Plan (Prioritized)'));
    console.log(chalk.dim('Based on latest Neurcode verify results\n'));
    const uniqueFilesCount = new Set(suggestions.map((item) => item.file)).size;
    const criticalCount = suggestions.filter((item) => item.priority === 'CRITICAL').length;
    console.log(chalk.bold(`${suggestions.length} actionable items across ${uniqueFilesCount} files (${criticalCount} critical)`));
    console.log(chalk.dim('Based on latest verification snapshot\n'));
    console.log(chalk.dim('Based on full diff analysis of current changes\n'));
    if (context.verifyMessage.includes('Expedite Mode used')) {
        console.log(chalk.yellow('Expedite Mode used\n'));
    }
    if (suggestions.length === 0) {
        if (context.verifyFailed) {
            console.log(chalk.yellow('Verify failed, but no actionable items were derived from the current verify payload.'));
            console.log(chalk.yellow(`Verify exited with code ${context.verifyExitCode}.`));
            if (context.verifyMessage) {
                console.log(chalk.dim(`Details: ${context.verifyMessage}`));
            }
            console.log('');
            return;
        }
        console.log(chalk.green('No issues detected in current diff context.'));
        if (context.diffEmpty) {
            console.log(chalk.dim('Tip: Ensure changes are staged or run against a base branch.'));
        }
        console.log('');
        return;
    }
    if (context.verifyFailed) {
        console.log(chalk.yellow(`⚠️  Verify exited with code ${context.verifyExitCode}; showing best-effort fix plan from verify payload.`));
        if (context.verifyMessage) {
            console.log(chalk.dim(`   ${context.verifyMessage}`));
        }
        console.log('');
    }
    const byFile = new Map();
    for (const suggestion of suggestions) {
        const key = suggestion.file || 'unknown';
        const current = byFile.get(key) || [];
        current.push(suggestion);
        byFile.set(key, current);
    }
    const grouped = [...byFile.entries()].sort((left, right) => {
        const leftRank = Math.min(...left[1].map((item) => priorityRank(item.priority)));
        const rightRank = Math.min(...right[1].map((item) => priorityRank(item.priority)));
        return leftRank - rightRank;
    });
    const colorPriority = (priority) => {
        if (priority === 'CRITICAL')
            return chalk.red(`[${priority}]`);
        if (priority === 'WARNING')
            return chalk.yellow(`[${priority}]`);
        return chalk.cyan(`[${priority}]`);
    };
    for (let index = 0; index < grouped.length; index += 1) {
        const [file, items] = grouped[index];
        const filePriority = items.reduce((best, item) => (priorityRank(item.priority) < priorityRank(best) ? item.priority : best), 'SCOPE');
        const sortedItems = [...items].sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority));
        const issueLabel = sortedItems.length === 1 ? 'issue' : 'issues';
        console.log(`${colorPriority(filePriority)} ${chalk.cyan(file)} (${sortedItems.length} ${issueLabel})`);
        for (const item of sortedItems) {
            console.log(`* [${item.priority}] ${item.issue} (policy: ${item.policy})`);
            console.log(`  → ${item.suggestedAction}`);
            console.log('');
        }
        const showNextHint = index < 2 && index + 1 < grouped.length;
        if (showNextHint) {
            const nextFile = grouped[index + 1][0];
            console.log(chalk.dim(`Next: ${nextFile}\n`));
        }
    }
    console.log(chalk.bold('Fix highest priority issues first, then re-run `neurcode verify` to confirm resolution\n'));
}
function emitFixJson(payload) {
    (0, cli_json_1.emitJson)(payload);
}
function buildVerifyArgs(options) {
    const args = ['verify'];
    if (options.planId) {
        args.push('--plan-id', options.planId);
    }
    if (options.projectId) {
        args.push('--project-id', options.projectId);
    }
    if (options.policyOnly === true) {
        args.push('--policy-only');
    }
    if (options.staged === true) {
        args.push('--staged');
    }
    if (options.head === true) {
        args.push('--head');
    }
    if (options.base) {
        args.push('--base', options.base);
    }
    return args;
}
async function fixCommand(options) {
    try {
        const verifyRun = await (0, cli_json_1.runCliJson)(buildVerifyArgs(options), { cwd: process.cwd() });
        const payload = verifyRun.payload;
        if (!payload) {
            const message = 'Could not parse verify output. Run `neurcode verify --json` and retry.';
            if (options.json) {
                emitFixJson({
                    success: false,
                    message,
                    timestamp: new Date().toISOString(),
                    verifyExitCode: verifyRun.exitCode,
                    verdict: null,
                    violations: 0,
                    scopeIssues: 0,
                    suggestions: [],
                });
            }
            else {
                console.log(chalk.bold('\nNeurcode Fix Plan (Prioritized)'));
                console.log(chalk.dim('Based on latest Neurcode verify results\n'));
                console.log(chalk.red(`${message}\n`));
            }
            process.exit(1);
        }
        let verifyOutput;
        try {
            verifyOutput = (0, contracts_1.parseVerifyOutput)(payload, 'neurcode-fix-verify-output');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid verify payload';
            if (options.json) {
                emitFixJson({
                    success: false,
                    message: `Verify output does not match contract: ${message}`,
                    timestamp: new Date().toISOString(),
                    verifyExitCode: verifyRun.exitCode,
                    verdict: null,
                    violations: 0,
                    scopeIssues: 0,
                    suggestions: [],
                });
            }
            else {
                console.log(chalk.bold('\nNeurcode Fix Plan (Prioritized)'));
                console.log(chalk.dim('Based on latest Neurcode verify results\n'));
                console.log(chalk.red(`Verify output does not match contract: ${message}\n`));
            }
            process.exit(1);
            return;
        }
        const expediteModeUsed = payload.expediteMode === true || payload.expediteModeUsed === true;
        const expediteItems = extractExpediteItems(payload);
        let suggestions = buildSuggestions(verifyOutput);
        suggestions = appendExpediteSuggestions(suggestions, expediteItems);
        if (verifyRun.exitCode !== 0 && suggestions.length === 0) {
            suggestions = [
                {
                    file: 'unknown',
                    issue: 'Verification failed but no actionable items were present in the verify payload',
                    policy: 'verify_runtime',
                    suggestedAction: 'Re-run `neurcode verify --json` and inspect the emitted payload',
                    source: 'warning',
                    priority: 'WARNING',
                },
            ];
        }
        if (verifyOutput.violations.length > 0 && suggestions.length === 0) {
            console.warn('Invariant violation: verify has issues but fix produced none');
        }
        if (!options.json) {
            console.log(`Fix using verify payload: ${verifyOutput.violations.length} violations, ` +
                `${verifyOutput.warnings.length} warnings, ${verifyOutput.scopeIssues.length} scope issues`);
        }
        const verifyFailed = verifyRun.exitCode !== 0;
        const verifyMessage = verifyFailed
            ? `${verifyOutput.summary.totalViolations} violations, ${verifyOutput.summary.totalWarnings} warnings, ` +
                `${verifyOutput.summary.totalScopeIssues} scope issues`
            : '';
        const verifyMessageWithMode = expediteModeUsed
            ? `${verifyMessage}${verifyMessage ? ' | ' : ''}Expedite Mode used`
            : verifyMessage;
        const diffEmpty = verifyOutput.summary.totalFilesChanged === 0
            && verifyOutput.violations.length === 0
            && verifyOutput.warnings.length === 0
            && verifyOutput.scopeIssues.length === 0;
        if (options.json) {
            emitFixJson({
                success: true,
                message: suggestions.length > 0 ? 'Fix plan generated from latest verify result.' : 'No fix actions required.',
                timestamp: new Date().toISOString(),
                verifyExitCode: verifyRun.exitCode,
                verdict: verifyOutput.verdict,
                violations: verifyOutput.violations.length,
                scopeIssues: verifyOutput.scopeIssues.length,
                suggestions,
            });
            return;
        }
        printFixPlan(suggestions, {
            diffEmpty,
            verifyFailed,
            verifyExitCode: verifyRun.exitCode,
            verifyMessage: verifyMessageWithMode,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown fix command failure';
        if (options.json) {
            emitFixJson({
                success: false,
                message,
                timestamp: new Date().toISOString(),
                verifyExitCode: 1,
                verdict: null,
                violations: 0,
                scopeIssues: 0,
                suggestions: [],
            });
        }
        else {
            console.log(chalk.bold('\nNeurcode Fix Plan (Prioritized)'));
            console.log(chalk.dim('Based on latest Neurcode verify results\n'));
            console.log(chalk.red(`Failed to generate fix plan: ${message}\n`));
        }
        process.exit(1);
    }
}
//# sourceMappingURL=fix.js.map