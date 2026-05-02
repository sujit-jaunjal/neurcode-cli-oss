"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixCommand = fixCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const cli_json_1 = require("../utils/cli-json");
const contracts_1 = require("@neurcode-ai/contracts");
const context_engine_1 = require("../context-engine");
const patch_engine_1 = require("../patch-engine");
const chalk = (0, cli_json_1.loadChalk)();
const MAX_SUGGESTIONS = 10;
// Minimum context-engine score for a target file to be trusted.
const MIN_TARGET_SCORE = 3;
// ---------------------------------------------------------------------------
// Reason templates (req 4) — policy-keyed, no runtime string assembly
// ---------------------------------------------------------------------------
const REASON_TEMPLATES = {
    layering: 'UI layer should not directly access database',
    validation: 'Input must be validated before request handling',
    scope: 'Changes must stay within planned scope to prevent drift',
    default: 'This change violates project architecture guidelines',
};
// ---------------------------------------------------------------------------
// Targeted suggestion helpers
// ---------------------------------------------------------------------------
function buildRepairIntent(issue, policy) {
    const combined = `${issue} ${policy}`.toLowerCase();
    // Violations with no useful cross-file redirect target
    if (combined.includes('todo') || combined.includes('fixme'))
        return null;
    if (policy === 'scope_guard' || combined.includes('scope'))
        return null;
    if (policy === 'verify_runtime')
        return null;
    if (combined.includes('db') || combined.includes('database') ||
        combined.includes('query') || combined.includes('sql') ||
        combined.includes('data access') || combined.includes('direct access') ||
        policy.includes('layer') || policy.includes('db') || policy.includes('layering')) {
        return 'service layer database repository core';
    }
    if (combined.includes('validation') || combined.includes('validate') ||
        combined.includes('input') || policy.includes('validation')) {
        return 'validation schema middleware validator';
    }
    if (combined.includes('auth') || combined.includes('authentication') ||
        combined.includes('token') || combined.includes('jwt') ||
        policy.includes('auth')) {
        return 'authentication middleware guard auth';
    }
    return issue;
}
function getModulePrefix(filePath) {
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts.slice(0, 2).join('/');
}
/**
 * Find the best target file for a repair intent.
 *
 * Applies:
 *  - Same-module boost: +2 to candidates sharing a module prefix with any
 *    previously selected target (drives coherence across violations).
 *  - Safety threshold: only returns a result when adjusted score >= MIN_TARGET_SCORE.
 */
function findTargetFile(sourceFile, repairIntent, graph, selectedTargets) {
    const scored = (0, context_engine_1.scoreFiles)(repairIntent, graph);
    const selectedPrefixes = new Set(selectedTargets.map(getModulePrefix));
    // Exclude source file; apply same-module boost
    const adjusted = scored
        .filter((s) => s.file !== sourceFile)
        .map((s) => ({
        file: s.file,
        score: s.score + (selectedPrefixes.has(getModulePrefix(s.file)) ? 2 : 0),
    }));
    adjusted.sort((a, b) => b.score - a.score);
    const best = adjusted.find((s) => s.score >= MIN_TARGET_SCORE);
    if (!best)
        return undefined;
    return { file: best.file, score: best.score };
}
function buildReason(issue, policy) {
    const policyLower = policy.toLowerCase();
    const combined = `${issue} ${policy}`.toLowerCase();
    // Policy-name takes precedence
    if (policyLower.includes('layer') || policyLower.includes('db') ||
        policyLower.includes('database') || policyLower.includes('layering')) {
        return REASON_TEMPLATES.layering;
    }
    if (policyLower.includes('validation') || policyLower.includes('validate') ||
        policyLower.includes('input_validation')) {
        return REASON_TEMPLATES.validation;
    }
    if (policyLower === 'scope_guard' || policyLower.includes('scope')) {
        return REASON_TEMPLATES.scope;
    }
    // Issue-text fallback
    if (combined.includes('db') || combined.includes('database') || combined.includes('query') || combined.includes('data access')) {
        return REASON_TEMPLATES.layering;
    }
    if (combined.includes('validation') || combined.includes('validate') || combined.includes('input')) {
        return REASON_TEMPLATES.validation;
    }
    return REASON_TEMPLATES.default;
}
function resolveConfidence(score) {
    if (score >= 6)
        return 'high';
    if (score >= MIN_TARGET_SCORE)
        return 'medium';
    return 'low';
}
function buildActionVerb(issue, policy) {
    const combined = `${issue} ${policy}`.toLowerCase();
    if (combined.includes('db') || combined.includes('database') || combined.includes('query') || combined.includes('sql')) {
        return 'Move DB query';
    }
    if (combined.includes('data access') || combined.includes('direct access') || policy.includes('layer') || policy.includes('layering')) {
        return 'Move data access logic';
    }
    if (combined.includes('validation') || combined.includes('validate')) {
        return 'Add input validation';
    }
    if (combined.includes('auth') || combined.includes('authentication')) {
        return 'Move authentication logic';
    }
    return 'Move logic';
}
// ---------------------------------------------------------------------------
// Legacy generic action (used as fallback suggestedAction text)
// ---------------------------------------------------------------------------
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
// ---------------------------------------------------------------------------
// Core suggestion builder
// ---------------------------------------------------------------------------
function resolveTargetForViolation(file, message, policy, graph, selectedTargets, 
// repairIntent → cached TargetResult for multi-violation coherence
targetHistory) {
    const repairIntent = buildRepairIntent(message, policy);
    if (!repairIntent) {
        // No cross-file redirect needed (TODO, scope, etc.) — action is clear.
        return { targetFile: undefined, reason: undefined, confidence: 'high', noStrongTarget: false };
    }
    const cached = targetHistory.get(repairIntent);
    let result;
    if (cached) {
        // Fresh candidate for this specific violation's source file
        const fresh = findTargetFile(file, repairIntent, graph, selectedTargets);
        // Within-1-point tolerance: prefer the cached target for consistency (req 7)
        if (fresh && Math.abs(fresh.score - cached.score) <= 1) {
            result = cached;
        }
        else {
            result = fresh ?? cached;
        }
    }
    else {
        result = findTargetFile(file, repairIntent, graph, selectedTargets);
        if (result) {
            targetHistory.set(repairIntent, result);
        }
    }
    if (!result) {
        return {
            targetFile: undefined,
            reason: undefined,
            confidence: 'low',
            noStrongTarget: true,
        };
    }
    selectedTargets.push(result.file);
    return {
        targetFile: result.file,
        reason: buildReason(message, policy),
        confidence: resolveConfidence(result.score),
        noStrongTarget: false,
    };
}
function buildSuggestions(verifyOutput, graph) {
    const suggestions = [];
    // Shared state for same-module boost and coherence across all violations
    const selectedTargets = [];
    const targetHistory = new Map();
    for (const violation of verifyOutput.violations) {
        if (suggestions.length >= MAX_SUGGESTIONS)
            break;
        let targetFile;
        let reason;
        let confidence = 'high';
        let noStrongTarget;
        if (graph) {
            const resolved = resolveTargetForViolation(violation.file, violation.message, violation.policy, graph, selectedTargets, targetHistory);
            targetFile = resolved.targetFile;
            reason = resolved.reason;
            confidence = resolved.confidence;
            noStrongTarget = resolved.noStrongTarget || undefined;
        }
        suggestions.push({
            file: violation.file,
            issue: violation.message,
            policy: violation.policy,
            suggestedAction: suggestAction(violation.file, violation.message, violation.policy, false),
            targetFile,
            reason,
            confidence,
            noStrongTarget,
            source: 'violation',
            priority: resolveViolationPriority(violation.severity),
        });
    }
    for (const warning of verifyOutput.warnings) {
        if (suggestions.length >= MAX_SUGGESTIONS)
            break;
        let targetFile;
        let reason;
        let confidence = 'high';
        let noStrongTarget;
        if (graph) {
            const resolved = resolveTargetForViolation(warning.file, warning.message, warning.policy, graph, selectedTargets, targetHistory);
            targetFile = resolved.targetFile;
            reason = resolved.reason;
            confidence = resolved.confidence;
            noStrongTarget = resolved.noStrongTarget || undefined;
        }
        suggestions.push({
            file: warning.file,
            issue: warning.message,
            policy: warning.policy,
            suggestedAction: suggestAction(warning.file, warning.message, warning.policy, false),
            targetFile,
            reason,
            confidence,
            noStrongTarget,
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
            confidence: 'high',
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
            confidence: 'medium',
            source: 'expedite',
            priority: 'WARNING',
        });
    }
    return dedupeSuggestions([...expediteSuggestions, ...suggestions]).slice(0, MAX_SUGGESTIONS);
}
// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
// ---------------------------------------------------------------------------
// Patch enrichment
// ---------------------------------------------------------------------------
function enrichSuggestionsWithPatches(suggestions, fileContents) {
    for (const suggestion of suggestions) {
        if (suggestion.file === 'unknown')
            continue;
        const content = fileContents[suggestion.file];
        if (!content)
            continue;
        const patch = (0, patch_engine_1.generatePatchForSuggestion)(suggestion, content);
        if (patch) {
            suggestion.patch = { file: patch.file, diff: patch.diff };
            suggestion.patchConfidence = patch.patchConfidence;
        }
    }
}
// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
function printTargetedAction(item) {
    const verb = buildActionVerb(item.issue, item.policy);
    console.log(`  → ${verb} from:`);
    console.log(`       ${item.file}`);
    console.log(`     To:`);
    console.log(`       ${item.targetFile}`);
    console.log(`     Reason:`);
    console.log(`       ${item.reason}`);
    console.log(`     Confidence:`);
    console.log(`       ${capitalize(item.confidence)}`);
}
function printFallbackAction(item) {
    console.log('  → No strong target file found.');
    console.log('     Suggested action:');
    console.log(`       ${item.suggestedAction}`);
    console.log('     Confidence:');
    console.log('       Low');
}
function printPatch(patch, confidence) {
    console.log('     Suggested patch (apply manually):');
    for (const line of patch.diff.split('\n')) {
        if (line.startsWith('---') || line.startsWith('+++')) {
            console.log(chalk.dim(`     ${line}`));
        }
        else if (line.startsWith('@@')) {
            console.log(chalk.cyan(`     ${line}`));
        }
        else if (line.startsWith('-')) {
            console.log(chalk.red(`     ${line}`));
        }
        else if (line.startsWith('+')) {
            console.log(chalk.green(`     ${line}`));
        }
        else {
            console.log(chalk.dim(`     ${line}`));
        }
    }
    if (confidence) {
        console.log(chalk.dim(`     Patch Confidence: ${capitalize(confidence)}`));
    }
    console.log(chalk.dim(`     Run: neurcode patch --file ${patch.file}`));
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
            if (item.targetFile && item.reason) {
                printTargetedAction(item);
            }
            else if (item.noStrongTarget) {
                printFallbackAction(item);
            }
            else {
                console.log(`  → ${item.suggestedAction}`);
            }
            if (item.patch?.diff) {
                printPatch(item.patch, item.patchConfidence);
            }
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
// ---------------------------------------------------------------------------
// Auto-fix
// ---------------------------------------------------------------------------
function isEligibleForAutoFix(suggestion) {
    // Patch must exist and have already passed the safety gate (isPatchSafe is
    // enforced during enrichSuggestionsWithPatches — no need to re-run it here).
    return !!(suggestion.patch?.diff) && suggestion.patchConfidence === 'high';
}
async function runAutoFix(suggestions, verifyArgs, json) {
    // Only talk about suggestions that have patches; skip everything else silently.
    const patchable = suggestions.filter((s) => !!s.patch?.diff);
    const results = [];
    for (const suggestion of patchable) {
        if (!isEligibleForAutoFix(suggestion)) {
            results.push({
                file: suggestion.file,
                status: 'skipped',
                reason: suggestion.patchConfidence ? `${suggestion.patchConfidence} confidence` : 'no patch',
            });
            continue;
        }
        const filePath = (0, path_1.resolve)(process.cwd(), suggestion.file);
        if (!(0, fs_1.existsSync)(filePath)) {
            results.push({ file: suggestion.file, status: 'skipped', reason: 'file not found' });
            continue;
        }
        let content;
        try {
            // Re-read from disk so sequential patches in the same run see prior writes.
            content = (0, fs_1.readFileSync)(filePath, 'utf-8');
        }
        catch {
            results.push({ file: suggestion.file, status: 'skipped', reason: 'could not read file' });
            continue;
        }
        // Apply the EXACT diff that was shown to the user — no re-generation.
        const updatedContent = (0, patch_engine_1.applyUnifiedDiff)(content, suggestion.patch.diff);
        if (updatedContent === null) {
            results.push({ file: suggestion.file, status: 'skipped', reason: 'patch mismatch' });
            continue;
        }
        try {
            (0, fs_1.writeFileSync)(filePath, updatedContent, 'utf-8');
            results.push({ file: suggestion.file, status: 'applied' });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'write failed';
            results.push({ file: suggestion.file, status: 'skipped', reason: msg });
        }
    }
    const applied = results.filter((r) => r.status === 'applied');
    const skipped = results.filter((r) => r.status === 'skipped');
    // Re-run verify only when something was actually changed.
    let verifyAfter;
    if (applied.length > 0) {
        const reRun = await (0, cli_json_1.runCliJson)(verifyArgs, { cwd: process.cwd() });
        if (reRun.payload) {
            try {
                const reOutput = (0, contracts_1.parseVerifyOutput)(reRun.payload, 'neurcode-auto-fix-verify');
                verifyAfter = {
                    exitCode: reRun.exitCode,
                    verdict: reOutput.verdict,
                    violations: reOutput.violations.length,
                };
            }
            catch {
                verifyAfter = { exitCode: reRun.exitCode, verdict: null, violations: -1 };
            }
        }
    }
    if (json) {
        console.log(JSON.stringify({
            success: true,
            applied: applied.length,
            skipped: skipped.length,
            files: results,
            verifyAfter,
            timestamp: new Date().toISOString(),
        }, null, 2));
        return;
    }
    // Human output
    if (applied.length === 0 && skipped.length === 0) {
        console.log(chalk.dim('\nNo patchable suggestions found for --apply-safe.'));
        console.log(chalk.dim('Run `neurcode fix` to see all issues.\n'));
        return;
    }
    if (applied.length > 0) {
        console.log(chalk.bold('\nAuto-fix applied:'));
        for (const r of applied) {
            console.log(chalk.green(`  ✔ Applied patch to ${r.file}`));
        }
    }
    if (skipped.length > 0) {
        console.log(chalk.bold('\nSkipped:'));
        for (const r of skipped) {
            console.log(chalk.dim(`  ✖ Skipped ${r.file}${r.reason ? ` (${r.reason})` : ''}`));
        }
    }
    if (verifyAfter) {
        const icon = verifyAfter.exitCode === 0 ? chalk.green('✔') : chalk.yellow('⚠');
        const label = verifyAfter.verdict ?? (verifyAfter.exitCode === 0 ? 'PASS' : 'FAIL');
        console.log(`\n${icon} Verify after auto-fix: ${chalk.bold(label)} — ${verifyAfter.violations} violation(s) remaining`);
    }
    console.log('');
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
        // Scan project once; scoring and patch generation reuse this data.
        let graph = null;
        let fileContents = {};
        try {
            const scan = (0, context_engine_1.scanProject)(process.cwd());
            graph = (0, context_engine_1.buildDependencyGraph)(scan);
            fileContents = scan.fileContents;
        }
        catch {
            // Non-fatal: fall back to generic suggestions without targeting or patches
        }
        const expediteModeUsed = payload.expediteMode === true || payload.expediteModeUsed === true;
        const expediteItems = extractExpediteItems(payload);
        let suggestions = buildSuggestions(verifyOutput, graph);
        suggestions = appendExpediteSuggestions(suggestions, expediteItems);
        enrichSuggestionsWithPatches(suggestions, fileContents);
        if (verifyRun.exitCode !== 0 && suggestions.length === 0) {
            suggestions = [
                {
                    file: 'unknown',
                    issue: 'Verification failed but no actionable items were present in the verify payload',
                    policy: 'verify_runtime',
                    suggestedAction: 'Re-run `neurcode verify --json` and inspect the emitted payload',
                    confidence: 'low',
                    source: 'warning',
                    priority: 'WARNING',
                },
            ];
        }
        if (verifyOutput.violations.length > 0 && suggestions.length === 0) {
            console.warn('Invariant violation: verify has issues but fix produced none');
        }
        if (options.applySafe) {
            await runAutoFix(suggestions, buildVerifyArgs(options), options.json ?? false);
            return;
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