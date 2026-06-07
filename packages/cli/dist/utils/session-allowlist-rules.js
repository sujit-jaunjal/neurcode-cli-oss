"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRICT_CURSOR_RULES_MARKER = exports.SESSION_SCOPE_RULES_RELATIVE = void 0;
exports.buildSessionScopeRulesBody = buildSessionScopeRulesBody;
exports.writeSessionScopeRules = writeSessionScopeRules;
exports.refreshSessionScopeRules = refreshSessionScopeRules;
exports.writeStrictCursorRules = writeStrictCursorRules;
exports.listStrictOnboardArtifacts = listStrictOnboardArtifacts;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const v0_governance_1 = require("./v0-governance");
exports.SESSION_SCOPE_RULES_RELATIVE = '.cursor/rules/neurcode-session-scope.mdc';
exports.STRICT_CURSOR_RULES_MARKER = 'neurcode-enterprise-strict-mode';
function ensureParent(path) {
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(path, '..'), { recursive: true });
}
function planTargetLines(session) {
    const plan = session.contract.agentPlan;
    if (!plan)
        return [];
    const files = (plan.expectedFiles ?? []).slice(0, 20).map((path) => `- \`${path}\` (file)`);
    const globs = (plan.expectedGlobs ?? []).slice(0, 20).map((glob) => `- \`${glob}\` (glob)`);
    return [...files, ...globs];
}
function planApprovalObligationLines(session) {
    const obligations = session.contract.architectureObligations ?? [];
    return obligations
        .filter((item) => item.category === 'ownership' &&
        item.status === 'pending' &&
        item.requiredPath &&
        (item.triggeredBy ?? []).some((trigger) => trigger.startsWith('plan declares')))
        .slice(0, 20)
        .map((item) => (`- \`${item.requiredPath}\` — ${item.requiredEvidence[0] ?? 'Approve exact path before edit.'} ` +
        `(tool: \`neurcode_session_approve\`)`));
}
function buildSessionScopeRulesBody(session) {
    const globs = session.contract.allowedGlobs.slice(0, 50);
    const planLines = planTargetLines(session);
    const approvalLines = planApprovalObligationLines(session);
    return `---
description: Neurcode active session scope (auto-generated — do not edit manually)
globs:
  - "**/*"
alwaysApply: true
---

# Neurcode session scope (${session.sessionId})

**Goal:** ${session.contract.goal.trim() || '(none)'}

**Scope mode:** ${session.contract.scopeMode}

## In-scope path globs

${globs.length > 0 ? globs.map((glob) => `- \`${glob}\``).join('\n') : '- _(no allowed globs derived — approval-required boundaries still apply)_'}

${planLines.length > 0 ? `## Plan-declared targets\n\n${planLines.join('\n')}\n` : ''}${approvalLines.length > 0 ? `## Plan paths requiring approval before edit\n\nThese CODEOWNERS / approval-required paths are in your plan. Call \`neurcode_session_approve\` for each exact path before \`edit.before\`:\n\n${approvalLines.join('\n')}\n` : ''}
## Drift rule

Do **not** edit files outside the in-scope globs above without an explicit \`neurcode agent amend\` / replan.
Neighbor paths and approval-required boundaries remain blocked even when a nearby path was approved.
`;
}
function writeSessionScopeRules(input) {
    const filePath = (0, node_path_1.join)(input.repoRoot, exports.SESSION_SCOPE_RULES_RELATIVE);
    ensureParent(filePath);
    const body = buildSessionScopeRulesBody(input.session);
    (0, node_fs_1.writeFileSync)(filePath, body.endsWith('\n') ? body : `${body}\n`, 'utf8');
    return {
        ok: true,
        filePath,
        sessionId: input.session.sessionId,
        allowedGlobs: input.session.contract.allowedGlobs,
        message: `Wrote session scope rules to ${exports.SESSION_SCOPE_RULES_RELATIVE}.`,
    };
}
function refreshSessionScopeRules(input) {
    const repoRoot = (0, v0_governance_1.resolveRepoRoot)(input.dir || process.cwd());
    const session = input.sessionId
        ? (0, governance_runtime_1.loadSession)(repoRoot, input.sessionId)
        : (0, governance_runtime_1.loadActiveSession)(repoRoot);
    if (!session) {
        return {
            ok: false,
            filePath: (0, node_path_1.join)(repoRoot, exports.SESSION_SCOPE_RULES_RELATIVE),
            sessionId: null,
            allowedGlobs: [],
            message: 'No active governed session found. Start one with neurcode cursor onboard or agent guard start.',
        };
    }
    return writeSessionScopeRules({ repoRoot, session });
}
const STRICT_RULES_BODY = `
<!-- ${exports.STRICT_CURSOR_RULES_MARKER} -->

## Enterprise strict mode (mandatory)

- **Before EVERY proposed file write:** call \`neurcode_agent_edit_before\` (MCP \`edit.before\`) — no exceptions.
- **Before commit, push, or merge:** run \`neurcode cursor gate\` — exit **0** required for handoff; exit **2** means fix bypassed writes first.
- **Pre-commit and pre-push hooks** run the gate automatically. Emergency bypass only: \`NEURCODE_CURSOR_GATE_SKIP=1\` (audited).
- **Session scope:** obey \`.cursor/rules/neurcode-session-scope.mdc\`; replan before editing outside declared globs.
- **Finish:** \`neurcode agent guard finish --fail-on-unverified\` after gate is clean.

Cursor does **not** provide Claude-style hard pre-write deny — cooperative checks plus fail-closed handoff are the enterprise contract.
`.trim();
function writeStrictCursorRules(input) {
    const filePath = (0, node_path_1.join)(input.repoRoot, '.cursor', 'rules', 'neurcode.mdc');
    ensureParent(filePath);
    const existing = (0, node_fs_1.existsSync)(filePath) ? (0, node_fs_1.readFileSync)(filePath, 'utf8') : '';
    if (existing.includes(exports.STRICT_CURSOR_RULES_MARKER)) {
        return {
            ok: true,
            filePath,
            message: 'Strict enterprise rules already present in neurcode.mdc.',
        };
    }
    const merged = existing.trim()
        ? `${existing.trimEnd()}\n\n${STRICT_RULES_BODY}\n`
        : `${STRICT_RULES_BODY}\n`;
    (0, node_fs_1.writeFileSync)(filePath, merged, 'utf8');
    return {
        ok: true,
        filePath,
        message: 'Appended enterprise strict-mode rules to neurcode.mdc.',
    };
}
function listStrictOnboardArtifacts(repoRoot) {
    const artifacts = [
        '.cursor/mcp.json',
        '.cursor/rules/neurcode.mdc',
        exports.SESSION_SCOPE_RULES_RELATIVE,
        '.githooks/pre-commit',
        '.githooks/pre-push',
        '.neurcode/hooks/pre-commit',
        '.neurcode/hooks/pre-push',
    ];
    return artifacts.filter((relative) => (0, node_fs_1.existsSync)((0, node_path_1.join)(repoRoot, relative)));
}
//# sourceMappingURL=session-allowlist-rules.js.map