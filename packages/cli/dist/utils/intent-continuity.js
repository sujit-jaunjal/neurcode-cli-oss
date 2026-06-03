"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyIntentContinuity = classifyIntentContinuity;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const MAX_SUMMARY_CHARS = 240;
const EXPLICIT_NEW_SESSION = [
    /^\s*(?:new|fresh|next)\s+(?:governed|implementation|demo|task)?\s*(?:goal|intent|task|session)\s*:/i,
    /\bstart\s+(?:a\s+)?(?:new|fresh)\s+(?:neurcode\s+)?(?:governed\s+)?(?:session|task|goal)\b/i,
    /\bbegin\s+(?:a\s+)?(?:new|fresh)\s+(?:governed\s+)?(?:session|task|goal)\b/i,
];
const APPROVAL_OR_CONFIRMATION_ONLY = [
    /^\s*(?:yes|yep|yeah|ok|okay|sure|sounds good|continue|proceed|go ahead|carry on|thanks)\s*[.!?]*\s*$/i,
    /^\s*(?:ok|okay|sure|yes|yeah|yep)\s+(?:continue|proceed|go ahead|carry on)\s*[.!?]*\s*$/i,
    /^\s*(?:approve|approved|approval granted|i approve)(?:\s+it)?\s*[.!?]*\s*$/i,
    /^\s*(?:what next|status|show status|summarize|summary)\s*[.!?]*\s*$/i,
];
const AMENDMENT_SIGNAL = [
    /\bre-?plan\b/i,
    /\bamend(?:\s+the)?\s+plan\b/i,
    /\bupdate(?:\s+the)?\s+plan\b/i,
    /\bchange(?:\s+the)?\s+plan\b/i,
    /\bexpand(?:\s+the)?\s+scope\b/i,
    /\bnarrow(?:\s+the)?\s+scope\b/i,
    /\b(?:also|additionally|now)\s+(?:update|modify|touch|include|cover|add|change|fix|refactor)\b/i,
    /\b(?:include|cover|add|modify|update|touch|edit|fix|refactor)\s+(?:also\s+)?(?:the\s+)?(?:file|path|module|area)?\b/i,
    /\b(?:drop|remove|exclude|skip|avoid|do not touch|don't touch)\b/i,
    /\binstead\b/i,
];
const REMOVAL_SIGNAL = /\b(?:drop|remove|exclude|skip|avoid|do not touch|don't touch)\b/i;
const PATH_ACTION_SIGNAL = /\b(?:add|also|change|cover|edit|fix|include|modify|refactor|touch|update)\b/i;
function hasAny(patterns, text) {
    return patterns.some((pattern) => pattern.test(text));
}
function stripSourceLikeText(text) {
    return text
        .replace(/```[\s\S]*?```/g, ' ')
        .split(/\r?\n/)
        .filter((line) => {
        const trimmed = line.trim();
        if (/^(?:diff --git |index [0-9a-f]{6,}|@@ |--- |\+\+\+ |Binary files )/.test(trimmed))
            return false;
        return !/^[+-](?!\s)/.test(trimmed);
    })
        .join(' ');
}
function summarizeIntent(text) {
    const compact = stripSourceLikeText(text)
        .replace(/\s+/g, ' ')
        .trim();
    if (compact.length <= MAX_SUMMARY_CHARS)
        return compact || 'Human updated the plan';
    return `${compact.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…`;
}
function normalizeTarget(token) {
    return token.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim();
}
function hasFileExtension(path) {
    const last = path.split('/').pop() || '';
    return /\.[A-Za-z0-9]{1,12}$/.test(last);
}
function splitTargets(text) {
    const extracted = (0, governance_runtime_1.extractExpectedTargetsFromText)(text);
    const files = [];
    const globs = [];
    for (const raw of extracted.expectedFiles) {
        const target = normalizeTarget(raw);
        if (!target)
            continue;
        if (hasFileExtension(target))
            files.push(target);
        else
            globs.push(`${target}/**`);
    }
    for (const raw of extracted.expectedGlobs) {
        const target = normalizeTarget(raw);
        if (target)
            globs.push(target);
    }
    return {
        files: Array.from(new Set(files)).sort(),
        globs: Array.from(new Set(globs)).sort(),
    };
}
function noteDecision(args) {
    return {
        action: 'record_operator_note',
        reason: args.reason,
        confidence: 'medium',
        detail: {
            activeSessionId: args.activeSession?.sessionId,
            selectedIntentSource: args.selected.source,
            operatorPrompt: args.selected.operatorPrompt,
            targetFiles: args.files,
            targetGlobs: args.globs,
            removalRequested: args.removalRequested,
            explicitNewSession: args.explicitNewSession,
            amendmentSignal: args.amendmentSignal,
        },
    };
}
function classifyIntentContinuity(rawPrompt, selected, activeSession) {
    const prompt = rawPrompt.trim();
    const goal = selected.goal.trim();
    const continuityText = goal || prompt;
    const targets = splitTargets(continuityText);
    const explicitNewSession = hasAny(EXPLICIT_NEW_SESSION, prompt);
    const amendmentSignal = hasAny(AMENDMENT_SIGNAL, continuityText);
    const removalRequested = REMOVAL_SIGNAL.test(continuityText);
    const hasTargets = targets.files.length + targets.globs.length > 0;
    if (!activeSession || activeSession.status !== 'active' || explicitNewSession) {
        return {
            action: 'start_new_session',
            reason: explicitNewSession
                ? 'Prompt explicitly asked for a new governed session.'
                : 'No active governed session exists.',
            confidence: explicitNewSession ? 'high' : 'medium',
            detail: {
                activeSessionId: activeSession?.sessionId,
                selectedIntentSource: selected.source,
                operatorPrompt: selected.operatorPrompt,
                targetFiles: targets.files,
                targetGlobs: targets.globs,
                removalRequested,
                explicitNewSession,
                amendmentSignal,
            },
        };
    }
    if (hasAny(APPROVAL_OR_CONFIRMATION_ONLY, continuityText)) {
        return noteDecision({
            activeSession,
            selected,
            files: targets.files,
            globs: targets.globs,
            explicitNewSession,
            amendmentSignal,
            removalRequested,
            reason: 'Prompt was confirmation/operator chatter, not a plan change.',
        });
    }
    if (amendmentSignal || (hasTargets && PATH_ACTION_SIGNAL.test(continuityText))) {
        const summary = summarizeIntent(continuityText);
        const addFiles = removalRequested ? [] : targets.files;
        const addGlobs = removalRequested ? [] : targets.globs;
        const removeFiles = removalRequested ? targets.files : [];
        const removeGlobs = removalRequested ? targets.globs : [];
        return {
            action: 'amend_active_plan',
            reason: removalRequested
                ? 'Human narrowed the active plan during the Claude Code session.'
                : 'Human updated the active plan during the Claude Code session.',
            confidence: amendmentSignal ? 'high' : 'medium',
            amendment: {
                sessionId: activeSession.sessionId,
                summary,
                addSteps: removalRequested ? [] : [summary],
                removeSteps: removalRequested ? [summary] : [],
                addExpectedFiles: addFiles,
                removeExpectedFiles: removeFiles,
                addExpectedGlobs: addGlobs,
                removeExpectedGlobs: removeGlobs,
                reason: removalRequested
                    ? 'human narrowed scope in a follow-up prompt'
                    : 'human amended scope in a follow-up prompt',
                source: 'manual',
                proposedBy: 'human',
                decidedBy: 'claude-user-prompt',
            },
            detail: {
                activeSessionId: activeSession.sessionId,
                selectedIntentSource: selected.source,
                operatorPrompt: selected.operatorPrompt,
                targetFiles: targets.files,
                targetGlobs: targets.globs,
                removalRequested,
                explicitNewSession,
                amendmentSignal,
            },
        };
    }
    return noteDecision({
        activeSession,
        selected,
        files: targets.files,
        globs: targets.globs,
        explicitNewSession,
        amendmentSignal,
        removalRequested,
        reason: 'Prompt did not contain a deterministic plan-change signal.',
    });
}
//# sourceMappingURL=intent-continuity.js.map