"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProjectContext = buildProjectContext;
exports.buildPlanContext = buildPlanContext;
exports.buildPolicyContext = buildPolicyContext;
exports.buildInjectedContext = buildInjectedContext;
exports.buildGovernedPrompt = buildGovernedPrompt;
const fs_1 = require("fs");
const path_1 = require("path");
const change_contract_1 = require("../utils/change-contract");
const policy_compiler_1 = require("../utils/policy-compiler");
const policy_packs_1 = require("../utils/policy-packs");
const plan_sync_1 = require("../utils/plan-sync");
const state_1 = require("../utils/state");
const proximity_1 = require("./proximity");
const DEFAULT_MAX_TREE_ENTRIES = 80;
const DEFAULT_MAX_TREE_DEPTH = 3;
const IGNORED_TREE_DIRS = new Set([
    '.git',
    '.neurcode',
    '.next',
    '.turbo',
    '.cache',
    'node_modules',
    'dist',
    'build',
    'coverage',
]);
const IGNORED_TREE_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.map',
    '.log',
    '.lock',
]);
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function isEnabledFlag(value) {
    if (!value)
        return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
function isStrictScopeModeEnabled(userPrompt) {
    if (isEnabledFlag(process.env.NEURCODE_MCP_STRICT_SCOPE)) {
        return true;
    }
    return /\bstrict(\s|-)?(scope|mode)\b|\b--strict-scope\b/i.test(userPrompt);
}
function isUrgencyDetected(userPrompt) {
    if (isEnabledFlag(process.env.NEURCODE_MCP_EXPEDITE_MODE)) {
        return true;
    }
    return /\bhotfix\b|\burgent\b|\bprod\s*down\b|\bincident\b|\b--expedite\b/i.test(userPrompt);
}
function chooseScopeExtensionOption(userPrompt, requestedOutOfScopeFiles) {
    const normalized = userPrompt.toLowerCase();
    const newFeatureSignals = [
        'add new',
        'create',
        'new endpoint',
        'new feature',
        'introduce',
        'build',
        'implement feature',
    ];
    const maintenanceSignals = [
        'fix',
        'bug',
        'patch',
        'hotfix',
        'refactor',
        'cleanup',
        'optimize',
        'rename',
        'adjust',
        'update existing',
    ];
    const hasNewFeatureSignal = newFeatureSignals.some((signal) => normalized.includes(signal));
    const hasMaintenanceSignal = maintenanceSignals.some((signal) => normalized.includes(signal));
    if (hasNewFeatureSignal || requestedOutOfScopeFiles.length > 1) {
        return {
            option: 1,
            explanation: 'new-feature intent detected; scope extension is the safer path',
        };
    }
    if (hasMaintenanceSignal && !hasNewFeatureSignal) {
        return {
            option: 2,
            explanation: 'maintenance/refactor intent detected; staying in allowed scope is preferred',
        };
    }
    return {
        option: 1,
        explanation: 'requested change likely needs planned scope expansion',
    };
}
function toTreeLine(depth, label) {
    return `${'  '.repeat(Math.max(0, depth))}- ${label}`;
}
function buildProjectContext(projectRoot, options) {
    const maxEntries = Number.isFinite(options?.maxEntries)
        ? Math.max(10, Math.floor(options?.maxEntries))
        : DEFAULT_MAX_TREE_ENTRIES;
    const maxDepth = Number.isFinite(options?.maxDepth)
        ? Math.max(1, Math.floor(options?.maxDepth))
        : DEFAULT_MAX_TREE_DEPTH;
    const treeLines = [];
    let scannedEntries = 0;
    let truncated = false;
    const walk = (currentPath, depth) => {
        if (depth > maxDepth || truncated)
            return;
        let entries = [];
        try {
            entries = (0, fs_1.readdirSync)(currentPath).map((name) => {
                const absolutePath = (0, path_1.join)(currentPath, name);
                let isDirectory = false;
                try {
                    const stat = (0, fs_1.lstatSync)(absolutePath);
                    if (stat.isSymbolicLink()) {
                        return { name, isDirectory: false, absolutePath: '' };
                    }
                    isDirectory = stat.isDirectory();
                }
                catch {
                    return { name, isDirectory: false, absolutePath: '' };
                }
                return { name, isDirectory, absolutePath };
            }).filter((entry) => Boolean(entry.absolutePath));
        }
        catch {
            return;
        }
        entries.sort((left, right) => {
            if (left.isDirectory !== right.isDirectory) {
                return left.isDirectory ? -1 : 1;
            }
            return left.name.localeCompare(right.name);
        });
        for (const entry of entries) {
            if (truncated)
                break;
            if (!entry.name)
                continue;
            if (entry.name.startsWith('.') && !entry.name.startsWith('.env')) {
                continue;
            }
            if (IGNORED_TREE_DIRS.has(entry.name))
                continue;
            if (!entry.isDirectory) {
                const lowered = entry.name.toLowerCase();
                if ([...IGNORED_TREE_EXTENSIONS].some((ext) => lowered.endsWith(ext))) {
                    continue;
                }
            }
            scannedEntries += 1;
            if (scannedEntries > maxEntries) {
                truncated = true;
                break;
            }
            const relativePath = normalizeRepoPath((0, path_1.relative)(projectRoot, entry.absolutePath));
            if (!relativePath || relativePath.startsWith('..')) {
                continue;
            }
            if (entry.isDirectory) {
                treeLines.push(toTreeLine(depth, `${entry.name}/`));
                walk(entry.absolutePath, depth + 1);
            }
            else {
                treeLines.push(toTreeLine(depth, entry.name));
            }
        }
    };
    walk(projectRoot, 0);
    return {
        rootPath: projectRoot,
        treeLines: treeLines.slice(0, maxEntries),
        scannedEntries: Math.min(scannedEntries, maxEntries),
        maxEntries,
        maxDepth,
        truncated,
    };
}
function buildPlanContext(projectRoot, requestedPlanId) {
    const contractRead = (0, change_contract_1.readChangeContract)(projectRoot);
    const localPlan = (0, plan_sync_1.ensureLocalPlan)(projectRoot);
    const localExpectedFiles = localPlan.expectedFiles
        .map((file) => normalizeRepoPath(file))
        .filter((file) => file.length > 0)
        .slice(0, 50);
    const localIntent = localPlan.intent || null;
    const localConstraints = (localPlan.constraints || []).slice(0, 20);
    const requested = requestedPlanId?.trim() || null;
    const statePlanId = (0, state_1.getActivePlanId)();
    if (contractRead.contract) {
        const contract = contractRead.contract;
        const contractExpectedFiles = (contract.expectedFiles || [])
            .map((file) => normalizeRepoPath(file))
            .filter((file) => file.length > 0)
            .slice(0, 50);
        const expectedFiles = [...new Set([...contractExpectedFiles, ...localExpectedFiles])]
            .slice(0, 50);
        const blockedFiles = (contract.planFiles || [])
            .filter((file) => file.action === 'BLOCK')
            .map((file) => normalizeRepoPath(file.path))
            .filter((file) => file.length > 0)
            .slice(0, 25);
        const notes = [];
        if (requested && requested !== contract.planId) {
            notes.push(`Requested plan ID (${requested}) differs from local change contract plan ID (${contract.planId}).`);
        }
        if (expectedFiles.length === 0) {
            notes.push('Plan artifact present but expected file scope is empty.');
        }
        if (localExpectedFiles.length > 0) {
            notes.push(`Plan Sync loaded ${localExpectedFiles.length} local expected file(s) from .neurcode/plan.json.`);
        }
        return {
            available: true,
            source: 'change_contract',
            planId: requested || contract.planId || null,
            intent: localIntent,
            expectedFiles,
            constraints: localConstraints,
            blockedFiles,
            notes,
        };
    }
    if (requested || statePlanId) {
        const notes = ['Using plan ID from CLI state; no local change contract artifact was found.'];
        if (localExpectedFiles.length > 0) {
            notes.push(`Plan Sync loaded ${localExpectedFiles.length} local expected file(s) from .neurcode/plan.json.`);
        }
        return {
            available: true,
            source: 'state',
            planId: requested || statePlanId,
            intent: localIntent,
            expectedFiles: localExpectedFiles,
            constraints: localConstraints,
            blockedFiles: [],
            notes,
        };
    }
    if (localExpectedFiles.length > 0) {
        return {
            available: true,
            source: 'state',
            planId: 'local-plan-sync',
            intent: localIntent,
            expectedFiles: localExpectedFiles,
            constraints: localConstraints,
            blockedFiles: [],
            notes: ['Using local Plan Sync scope from .neurcode/plan.json.'],
        };
    }
    return {
        available: false,
        source: 'none',
        planId: null,
        intent: null,
        expectedFiles: [],
        constraints: [],
        blockedFiles: [],
        notes: ['No active plan context found in local artifacts.'],
    };
}
function buildPolicyContext(projectRoot) {
    const compiled = (0, policy_compiler_1.readCompiledPolicyArtifact)(projectRoot);
    const lock = (0, policy_packs_1.readPolicyLockFile)(projectRoot);
    const hasCompiled = Boolean(compiled.artifact);
    const hasLock = Boolean(lock.lock);
    const source = hasCompiled && hasLock
        ? 'compiled_policy+policy_lock'
        : hasCompiled
            ? 'compiled_policy'
            : hasLock
                ? 'policy_lock'
                : 'none';
    if (source === 'none') {
        return {
            available: false,
            source,
            policyPackId: null,
            policyPackVersion: null,
            effectiveRuleCount: null,
            deterministicRuleHints: [],
            customPolicyCount: null,
            notes: ['No compiled policy or policy lock file found.'],
        };
    }
    const policyPackId = compiled.artifact?.source.policyPack?.id
        || lock.lock?.policyPack?.id
        || null;
    const policyPackVersion = compiled.artifact?.source.policyPack?.version
        || lock.lock?.policyPack?.version
        || null;
    const effectiveRuleCount = compiled.artifact?.source.effectiveRuleCount
        || lock.lock?.effective.ruleCount
        || null;
    const customPolicyCount = lock.lock?.customPolicies.count
        ?? null;
    const deterministicRuleHints = [...new Set((compiled.artifact?.compilation.deterministicRules || [])
            .slice(0, 12)
            .map((rule) => rule.statement.trim())
            .filter((statement) => statement.length > 0))].slice(0, 8);
    const notes = [];
    if (compiled.error) {
        notes.push(`Compiled policy artifact parse issue: ${compiled.error}`);
    }
    if (lock.error) {
        notes.push(`Policy lock parse issue: ${lock.error}`);
    }
    return {
        available: true,
        source,
        policyPackId,
        policyPackVersion,
        effectiveRuleCount: typeof effectiveRuleCount === 'number' ? effectiveRuleCount : null,
        deterministicRuleHints,
        customPolicyCount: typeof customPolicyCount === 'number' ? customPolicyCount : null,
        notes,
    };
}
function buildInjectedContext(input) {
    const lines = [];
    const userPrompt = input.userPrompt || '';
    const requestedFiles = (0, proximity_1.extractRequestedFilePathsFromPrompt)(userPrompt, 3);
    const allowedFileSet = new Set(input.plan.expectedFiles.map((file) => normalizeRepoPath(file)));
    const requestedOutOfScopeFiles = requestedFiles.filter((file) => !allowedFileSet.has(normalizeRepoPath(file)));
    const primaryRequestedFile = requestedOutOfScopeFiles[0] || requestedFiles[0] || '';
    const closestAllowedFile = (0, proximity_1.findClosestAllowedFile)(primaryRequestedFile, input.plan.expectedFiles);
    const closestAllowedTarget = closestAllowedFile || 'an existing allowed file relevant to this feature';
    const strictScopeMode = isStrictScopeModeEnabled(userPrompt);
    const urgencyDetected = isUrgencyDetected(userPrompt);
    const hasOutOfScopeRequest = requestedOutOfScopeFiles.length > 0;
    const scopeRecommendation = chooseScopeExtensionOption(userPrompt, requestedOutOfScopeFiles);
    const recommendedOptionLine = scopeRecommendation.option === 1
        ? '* Option 1 — Add these files to plan scope and continue'
        : `* Option 2 — Implement inside existing allowed file (${closestAllowedTarget})`;
    const requestedScopeDelta = hasOutOfScopeRequest
        ? requestedOutOfScopeFiles.slice(0, 3)
        : ['<requested file path>'];
    const scopeDeltaText = requestedScopeDelta.join(', ');
    const scopeDeltaAlternative = `Add the following file(s) to plan scope: ${scopeDeltaText} OR implement change inside ${closestAllowedTarget}`;
    lines.push('Neurcode MCP v1 Governance Context');
    lines.push('');
    lines.push('Hard Constraints:');
    lines.push('- You MUST NOT modify files outside planned scope.');
    lines.push('- You MUST NOT violate policy rules (for example: layering, validation, and safety guardrails).');
    lines.push('- Only introduce new files if absolutely required.');
    lines.push('- For policy conflicts, you MUST refuse and explain the limitation.');
    lines.push('- For scope conflicts, follow Scope Enforcement mode (soft guidance by default; strict refusal only when strict mode is explicitly enabled).');
    if (urgencyDetected) {
        lines.push('- Urgency detected: use Expedite Mode guidance for controlled temporary relaxation of non-critical constraints.');
    }
    lines.push('');
    if (urgencyDetected) {
        lines.push('Expedite Mode Suggested:');
        lines.push('Options:');
        lines.push('1. Standard Mode (strict)');
        lines.push('2. Expedite Mode (temporary)');
        lines.push('Expedite Mode rules:');
        lines.push('- MUST NOT bypass authentication, authorization, or security checks.');
        lines.push('- MAY temporarily relax non-critical validations or layering if needed.');
        lines.push('- MUST keep changes minimal and localized.');
        lines.push('- MUST include follow-up tasks to restore full compliance.');
        lines.push('Next step: choose Option 2 only if this is a time-sensitive incident, then implement the minimal safe patch and add explicit follow-up tasks.');
        lines.push('');
    }
    lines.push('Scope Enforcement:');
    if (input.plan.expectedFiles.length > 0) {
        lines.push('- Allowed files (from plan):');
        for (const file of input.plan.expectedFiles.slice(0, 20)) {
            lines.push(`  - ${file}`);
        }
        if (input.plan.expectedFiles.length > 20) {
            lines.push(`  - ... and ${input.plan.expectedFiles.length - 20} more allowed file(s)`);
        }
        lines.push('- You MUST NOT modify files outside this allowed list.');
        if (hasOutOfScopeRequest) {
            lines.push('- Requested out-of-scope file(s) detected in current prompt:');
            requestedOutOfScopeFiles.slice(0, 3).forEach((file) => {
                lines.push(`  - ${file}`);
            });
            if (strictScopeMode) {
                lines.push('- Strict scope mode is enabled.');
                lines.push(`- You MUST refuse if the request requires out-of-scope files, and explain the limitation. Use Allowed Alternative like: "${scopeDeltaAlternative}".`);
            }
            else {
                lines.push('- Soft scope mode is enabled (guided scope expansion).');
                lines.push('- Do NOT auto-modify plan. Only suggest scope extension options.');
                lines.push('Scope Extension Suggested:');
                lines.push('Requested file(s):');
                requestedOutOfScopeFiles.slice(0, 3).forEach((file) => {
                    lines.push(`* ${file}`);
                });
                lines.push('Options:');
                lines.push('1. Add these files to plan scope and continue');
                lines.push(`2. Implement change inside existing allowed file (${closestAllowedTarget})`);
                lines.push('Recommended option:');
                lines.push(recommendedOptionLine);
                lines.push(`Reason: ${scopeRecommendation.explanation}.`);
            }
        }
        if (!hasOutOfScopeRequest) {
            lines.push('- No out-of-scope files detected in the current prompt.');
        }
    }
    else {
        lines.push('- Allowed files list is unavailable from local plan artifacts.');
        lines.push('- You MUST refuse scope expansion without explicit plan update, and explain the limitation.');
    }
    lines.push('');
    lines.push('Response Rules:');
    lines.push('- If request is valid:');
    lines.push('  - Generate only the required code.');
    lines.push('  - Do NOT include unnecessary explanations or commentary.');
    lines.push('- If request is out-of-scope:');
    lines.push('  - In soft scope mode:');
    lines.push('    - Do NOT generate out-of-scope code yet.');
    lines.push('    - Respond with Scope Extension Suggested block and wait for user choice.');
    lines.push('  - In strict scope mode:');
    lines.push('    - You MUST NOT generate any code.');
    lines.push('    - You MUST respond ONLY in the following format:');
    lines.push('      - Violation: <brief description>');
    lines.push('      - Reason: <constraint violated>');
    lines.push(`      - Allowed Alternative: <concrete next step with file path; e.g., "${scopeDeltaAlternative}">`);
    lines.push('    - Do NOT include any additional text, explanation, or code outside this format.');
    lines.push('- If request violates policy constraints (layering, validation, safety):');
    lines.push('  - You MUST NOT generate violating code.');
    lines.push('  - You MUST respond ONLY in the following format:');
    lines.push('    - Violation: <brief description>');
    lines.push('    - Reason: <constraint violated>');
    lines.push(`    - Allowed Alternative: <concrete next step with file path; e.g., "${scopeDeltaAlternative}">`);
    lines.push('  - Do NOT include any additional text, explanation, or code outside this format.');
    if (urgencyDetected) {
        lines.push('- If Expedite Mode is chosen for a non-critical policy issue:');
        lines.push('  - Propose a minimal safe temporary patch.');
        lines.push('  - Add explicit follow-up tasks to restore full compliance.');
        lines.push('  - Mark the response clearly as "Expedite Mode used".');
    }
    lines.push('');
    lines.push('Policy Enforcement Examples:');
    lines.push('- Direct DB in UI: Allowed Alternative: Move logic to a service file such as src/core/<service>.ts, then call it from UI.');
    lines.push(`- Out-of-scope file: Allowed Alternative: Add <requested file> to plan scope OR modify ${closestAllowedTarget}.`);
    lines.push(`- Missing validation: Allowed Alternative: Add input validation in ${closestAllowedTarget} before request handling.`);
    lines.push('');
    lines.push('Response Self-Check:');
    lines.push('- Before responding, verify that your output complies with all constraints above.');
    lines.push('');
    lines.push('Priority:');
    lines.push('1. Follow architecture plan');
    lines.push('2. Respect policies');
    lines.push('3. Minimize scope');
    lines.push('');
    lines.push('Allowed Actions:');
    lines.push('- Modify planned files.');
    lines.push('- Add minimal supporting code only when necessary to complete the requested change.');
    lines.push('');
    lines.push('Output Expectations:');
    lines.push('- Produce minimal, production-ready code.');
    lines.push('- Avoid overengineering.');
    lines.push('- Keep changes localized.');
    lines.push('');
    lines.push('Architecture Constraints:');
    if (input.plan.available) {
        lines.push(`- Active plan source: ${input.plan.source}`);
        if (input.plan.planId) {
            lines.push(`- Active plan ID: ${input.plan.planId}`);
        }
        if (input.plan.intent) {
            lines.push(`- Plan intent: ${input.plan.intent}`);
        }
        if (input.plan.constraints.length > 0) {
            lines.push('- Plan constraints:');
            for (const constraint of input.plan.constraints.slice(0, 8)) {
                lines.push(`  - ${constraint}`);
            }
        }
        if (input.plan.expectedFiles.length > 0) {
            lines.push('- Scope boundary: prefer changes only in planned files unless scope expansion is explicitly requested.');
            lines.push('- Planned files:');
            for (const file of input.plan.expectedFiles.slice(0, 12)) {
                lines.push(`  - ${file}`);
            }
            if (input.plan.expectedFiles.length > 12) {
                lines.push(`  - ... and ${input.plan.expectedFiles.length - 12} more planned file(s)`);
            }
        }
        else {
            lines.push('- Plan context found, but explicit planned files are unavailable. Keep changes tightly scoped.');
        }
        if (input.plan.blockedFiles.length > 0) {
            lines.push('- Blocked files from plan:');
            for (const file of input.plan.blockedFiles.slice(0, 8)) {
                lines.push(`  - ${file}`);
            }
        }
        for (const note of input.plan.notes) {
            lines.push(`- Note: ${note}`);
        }
    }
    else {
        lines.push('- No active plan artifact found. Avoid unrelated architectural changes.');
    }
    lines.push('');
    lines.push('Policy Hints:');
    if (input.policies.available) {
        lines.push(`- Policy source: ${input.policies.source}`);
        if (input.policies.policyPackId && input.policies.policyPackVersion) {
            lines.push(`- Active policy pack: ${input.policies.policyPackId}@${input.policies.policyPackVersion}`);
        }
        if (typeof input.policies.effectiveRuleCount === 'number') {
            lines.push(`- Effective policy rule count: ${input.policies.effectiveRuleCount}`);
        }
        if (typeof input.policies.customPolicyCount === 'number') {
            lines.push(`- Custom policy count: ${input.policies.customPolicyCount}`);
        }
        if (input.policies.deterministicRuleHints.length > 0) {
            lines.push('- Deterministic policy hints:');
            for (const hint of input.policies.deterministicRuleHints.slice(0, 6)) {
                lines.push(`  - ${hint}`);
            }
        }
        else {
            lines.push('- Deterministic policy hints are not available in local artifacts.');
        }
        for (const note of input.policies.notes) {
            lines.push(`- Note: ${note}`);
        }
    }
    else {
        lines.push('- No policy artifacts found. Follow standard repository conventions and avoid risky scope expansion.');
    }
    lines.push('');
    lines.push('Scope Boundaries:');
    lines.push('- Keep implementation focused on user intent and planned scope.');
    lines.push('- Avoid unrelated refactors unless explicitly requested.');
    if (input.plan.blockedFiles.length > 0) {
        lines.push('- Do not edit blocked plan files without explicit approval.');
    }
    lines.push('');
    lines.push(`Project Structure (depth ${input.projectContext.maxDepth}, max ${input.projectContext.maxEntries} entries):`);
    for (const line of input.projectContext.treeLines) {
        lines.push(line);
    }
    if (input.projectContext.treeLines.length === 0) {
        lines.push('- (project tree unavailable)');
    }
    if (input.projectContext.truncated) {
        lines.push(`- ... truncated after ${input.projectContext.maxEntries} entries`);
    }
    return lines.join('\n');
}
function buildGovernedPrompt(input) {
    const injectedContext = buildInjectedContext({
        userPrompt: input.userPrompt,
        plan: input.plan,
        policies: input.policies,
        projectContext: input.projectContext,
    });
    return [
        'You are implementing code in a Neurcode-governed repository.',
        'Use the governance context below before generating code.',
        '',
        '--- Governed Context ---',
        injectedContext,
        '',
        'You MUST implement the user request while strictly following the governance context above.',
        'If constraints conflict with the request, follow constraints and explain the limitation.',
        '',
        '--- User Prompt ---',
        input.userPrompt.trim(),
    ].join('\n');
}
//# sourceMappingURL=context-injector.js.map