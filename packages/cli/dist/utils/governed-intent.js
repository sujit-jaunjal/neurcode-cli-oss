"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectGovernedIntent = selectGovernedIntent;
exports.shouldStartGovernedSession = shouldStartGovernedSession;
const GOAL_LABEL = /^\s*(?:(?:new|fresh|next)\s+)?(?:governed|implementation|demo|task)\s+(?:goal|intent)\s*:\s*(.*)$/i;
const OPERATOR_PROMPT_MARKERS = [
    /\bfounder-demo rehearsal\b/i,
    /\bdo not (?:refactor|implement|push|change product code)\b/i,
    /^\s*steps\s*:/im,
    /^\s*deliver\s*:/im,
    /^\s*deliverables?\s*:/im,
    /\buse the real claude code\b/i,
    /\bonly rehearse\b/i,
    /\bi (?:can'?t|cannot) approve\b/i,
    /\bno approval request\b/i,
    /\bapproval request (?:is )?(?:not )?(?:visible|available)\b/i,
    /\bdashboard approval\b/i,
    /\bapprove via dashboard\b/i,
    /\bfinish (?:the )?(?:report|session)\b/i,
    /\bmark .* as (?:blocked|blocker)\b/i,
];
function cleanGoal(value) {
    return value
        .replace(/^```(?:text|md|markdown)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
}
function readFencedBlock(lines, startIndex) {
    const opener = lines[startIndex]?.trim();
    if (!opener || !/^```/.test(opener))
        return null;
    const out = [];
    for (let i = startIndex + 1; i < lines.length; i++) {
        if (/^```/.test(lines[i].trim()))
            break;
        out.push(lines[i]);
    }
    return cleanGoal(out.join('\n'));
}
function readNextGoalBlock(lines, startIndex) {
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim())
            continue;
        const fenced = readFencedBlock(lines, i);
        if (fenced)
            return fenced;
        if (/^\s*(?:\d+[.)]|[-*+]|\w[\w -]{0,32}:)\s/.test(line))
            return null;
        return cleanGoal(line);
    }
    return null;
}
function extractLabeledGoal(prompt) {
    const lines = prompt.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(GOAL_LABEL);
        if (!match)
            continue;
        const inline = cleanGoal(match[1] || '');
        if (inline && !/^```/.test(inline))
            return inline;
        const fencedSameLine = inline ? cleanGoal(inline) : null;
        if (fencedSameLine && !/^```/.test(fencedSameLine))
            return fencedSameLine;
        const next = readNextGoalBlock(lines, i + 1);
        if (next)
            return next;
    }
    return null;
}
function isOperatorPrompt(prompt) {
    if (prompt.length > 900)
        return true;
    if (prompt.split(/\r?\n/).length > 12)
        return true;
    return OPERATOR_PROMPT_MARKERS.some((marker) => marker.test(prompt));
}
function selectGovernedIntent(prompt) {
    const trimmed = prompt.trim();
    const operatorPrompt = isOperatorPrompt(trimmed);
    const labeled = extractLabeledGoal(trimmed);
    const warnings = [];
    if (labeled) {
        if (operatorPrompt) {
            warnings.push('operator prompt detected; using labeled governed goal for session scope');
        }
        return {
            goal: labeled,
            source: 'labeled_goal',
            operatorPrompt,
            warnings,
        };
    }
    if (operatorPrompt) {
        warnings.push('prompt looks like operator instructions, not a crisp implementation intent; add `Governed goal:` or `Demo goal:` to avoid noisy scope');
    }
    return {
        goal: trimmed,
        source: 'prompt',
        operatorPrompt,
        warnings,
    };
}
function shouldStartGovernedSession(selection) {
    return selection.source === 'labeled_goal' || !selection.operatorPrompt;
}
//# sourceMappingURL=governed-intent.js.map