"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_PLAN_SCHEMA_VERSION = void 0;
exports.extractExpectedTargetsFromText = extractExpectedTargetsFromText;
exports.parsePlanSteps = parsePlanSteps;
exports.planImpliesSupportWork = planImpliesSupportWork;
exports.isTestOrUtilityPath = isTestOrUtilityPath;
exports.evaluatePlanCoherence = evaluatePlanCoherence;
exports.extractAgentPlan = extractAgentPlan;
exports.sanitizeAgentPlan = sanitizeAgentPlan;
exports.sanitizePlanCoherence = sanitizePlanCoherence;
const micromatch_1 = __importDefault(require("micromatch"));
exports.AGENT_PLAN_SCHEMA_VERSION = 1;
function normalizeRepoPath(pathValue) {
    return pathValue.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function uniqueNonEmpty(values) {
    const out = [];
    const seen = new Set();
    for (const raw of values) {
        const value = (raw ?? '').trim();
        if (!value || seen.has(value)) {
            continue;
        }
        seen.add(value);
        out.push(value);
    }
    return out;
}
function stripSourceLikePlanText(text) {
    const withoutFencedCode = text.replace(/```[\s\S]*?```/g, '\n');
    return withoutFencedCode
        .split(/\r?\n/)
        .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return true;
        }
        if (/^(?:diff --git |index [0-9a-f]{6,}|@@ |--- |\+\+\+ |Binary files )/.test(trimmed)) {
            return false;
        }
        return !/^[+-](?!\s)/.test(trimmed);
    })
        .join('\n');
}
const GLOB_CHARS = /[*?{}\[\]!]/;
function looksLikeGlob(token) {
    return GLOB_CHARS.test(token);
}
/**
 * Heuristic file-path detector. Matches tokens that look like repo paths:
 * either they contain a directory separator, or they end in a common source
 * file extension. Deliberately conservative to avoid capturing prose.
 */
const PATH_LIKE = /^(?:[\w.@~-]+\/)*[\w.@~-]+\.[A-Za-z0-9]{1,8}$/;
const DIR_PATH_LIKE = /^(?:[\w.@~-]+\/)+[\w.@~*-]+$/;
function looksLikePath(token) {
    if (!token || token.length > 200) {
        return false;
    }
    if (looksLikeGlob(token)) {
        return false;
    }
    return PATH_LIKE.test(token) || DIR_PATH_LIKE.test(token);
}
/** Pull `inline code` spans out of markdown/plain text. */
function extractInlineCodeSpans(text) {
    const spans = [];
    const re = /`([^`]+)`/g;
    let match;
    while ((match = re.exec(text)) !== null) {
        spans.push(match[1].trim());
    }
    return spans;
}
/**
 * Extract expected file paths and globs from free-form plan text. We only look
 * at backtick code spans and whitespace-delimited tokens that pass strict
 * path/glob shape checks — never arbitrary words.
 */
function extractExpectedTargetsFromText(text) {
    const files = [];
    const globs = [];
    const considerToken = (rawToken) => {
        const token = rawToken
            .replace(/^[("'`<\[]+/, '')
            .replace(/[)"'`>\].,;:]+$/, '')
            .trim();
        if (!token) {
            return;
        }
        const normalized = normalizeRepoPath(token);
        if (!normalized) {
            return;
        }
        if (looksLikeGlob(normalized)) {
            // A glob still needs at least one path-ish segment to be meaningful.
            if (/[\w/]/.test(normalized.replace(GLOB_CHARS, ''))) {
                globs.push(normalized);
            }
            return;
        }
        if (looksLikePath(normalized)) {
            files.push(normalized);
        }
    };
    // Prefer code spans (highest signal), then fall back to all tokens.
    for (const span of extractInlineCodeSpans(text)) {
        for (const piece of span.split(/\s+/)) {
            considerToken(piece);
        }
    }
    for (const token of text.split(/\s+/)) {
        considerToken(token);
    }
    return {
        expectedFiles: uniqueNonEmpty(files),
        expectedGlobs: uniqueNonEmpty(globs),
    };
}
const STEP_LINE = /^\s*(?:\d+[.)]|[-*+]|\[[ xX]?\])\s+(.*\S)\s*$/;
const NUMBERED_STEP = /^\s*\d+[.)]\s+/;
const CHECKLIST_STEP = /^\s*(?:[-*+]|\[[ xX]?\])\s+/;
/** Parse ordered/checklist step lines out of a markdown-ish block. */
function parsePlanSteps(text) {
    const steps = [];
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(STEP_LINE);
        if (match) {
            const step = match[1]
                .replace(/^\[[ xX]?\]\s*/, '')
                .trim();
            if (step) {
                steps.push(step);
            }
        }
    }
    return steps;
}
function hasPlanStructure(text) {
    let stepCount = 0;
    for (const line of text.split(/\r?\n/)) {
        if (NUMBERED_STEP.test(line) || CHECKLIST_STEP.test(line)) {
            stepCount += 1;
            if (stepCount >= 2) {
                return true;
            }
        }
    }
    return false;
}
const SUPPORT_KEYWORDS = [
    'test',
    'tests',
    'testing',
    'spec',
    'fixture',
    'mock',
    'util',
    'utils',
    'utility',
    'helper',
    'helpers',
    'refactor',
    'type',
    'types',
    'typing',
    'docs',
    'documentation',
    'comment',
    'config',
    'lint',
    'format',
];
const SUPPORT_KEYWORD_RE = new RegExp(`\\b(?:${SUPPORT_KEYWORDS.join('|')})\\b`, 'i');
/** Does the plan text imply legitimate supporting work (tests/utils/refactor)? */
function planImpliesSupportWork(plan) {
    if (!plan) {
        return false;
    }
    const haystack = [plan.summary, ...plan.steps, ...plan.constraints].join('\n');
    return SUPPORT_KEYWORD_RE.test(haystack);
}
const TEST_OR_UTILITY_GLOBS = [
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/test/**',
    '**/tests/**',
    '**/*.d.ts',
    '**/utils/**',
    '**/util/**',
    '**/helpers/**',
    '**/helper/**',
    '**/fixtures/**',
    '**/__fixtures__/**',
];
/** Is this path a conventional test or utility/support file? */
function isTestOrUtilityPath(filePath) {
    const normalized = normalizeRepoPath(filePath);
    if (!normalized) {
        return false;
    }
    return micromatch_1.default.isMatch(normalized, TEST_OR_UTILITY_GLOBS, { dot: true });
}
function matchPathAgainstGlobs(filePath, globs) {
    if (globs.length === 0) {
        return [];
    }
    const normalized = normalizeRepoPath(filePath);
    return globs.filter((glob) => {
        const normalizedGlob = normalizeRepoPath(glob);
        if (!normalizedGlob) {
            return false;
        }
        return micromatch_1.default.isMatch(normalized, normalizedGlob, { dot: true });
    });
}
function clampScore(score) {
    if (!Number.isFinite(score)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}
/**
 * Deterministically grade an edit against the agent's plan.
 *
 * Verdict precedence:
 *  1. No agent plan captured           -> unknown
 *  2. Path matches expectedFiles/globs -> planned
 *  3. Path is intent-support/test/util AND plan implies support work -> implied
 *  4. Otherwise                        -> unplanned
 *
 * NOTE: this is advisory in V1. Boundary/approval blocks always override this
 * verdict at the call sites; an `unplanned` verdict alone must not block.
 */
function evaluatePlanCoherence(input) {
    const { agentPlan, filePath } = input;
    const normalizedPath = normalizeRepoPath(filePath || '');
    if (!agentPlan) {
        return {
            verdict: 'unknown',
            score: 0,
            matchedPlanItems: [],
            reasons: ['No agent plan captured for this session; plan coherence is unknown.'],
        };
    }
    if (!normalizedPath) {
        return {
            verdict: 'unknown',
            score: 0,
            matchedPlanItems: [],
            reasons: ['No file path provided; plan coherence is unknown.'],
        };
    }
    const reasons = [];
    const matchedPlanItems = [];
    // (2) Direct plan match: exact expected file or expected glob.
    const expectedFiles = (agentPlan.expectedFiles || []).map(normalizeRepoPath);
    if (expectedFiles.includes(normalizedPath)) {
        matchedPlanItems.push(normalizedPath);
        reasons.push(`Path matches a file the plan expected to touch (${normalizedPath}).`);
        return {
            verdict: 'planned',
            score: 100,
            matchedPlanItems: uniqueNonEmpty(matchedPlanItems),
            reasons,
        };
    }
    const matchedGlobs = matchPathAgainstGlobs(normalizedPath, agentPlan.expectedGlobs || []);
    if (matchedGlobs.length > 0) {
        matchedPlanItems.push(...matchedGlobs);
        reasons.push(`Path matches an expected plan glob (${matchedGlobs.join(', ')}).`);
        return {
            verdict: 'planned',
            score: 90,
            matchedPlanItems: uniqueNonEmpty(matchedPlanItems),
            reasons,
        };
    }
    // (3) Implied support work: intent-support path or test/utility file, AND the
    // plan acknowledges support work somewhere.
    const intentMatches = matchPathAgainstGlobs(normalizedPath, input.intentSupportGlobs || []);
    const isSupportPath = intentMatches.length > 0 || isTestOrUtilityPath(normalizedPath);
    const planSupports = typeof input.planImpliesSupportWork === 'boolean'
        ? input.planImpliesSupportWork
        : planImpliesSupportWork(agentPlan);
    if (isSupportPath && planSupports) {
        if (intentMatches.length > 0) {
            matchedPlanItems.push(...intentMatches);
            reasons.push(`Path falls under intent-support scope (${intentMatches.join(', ')}).`);
        }
        if (isTestOrUtilityPath(normalizedPath)) {
            reasons.push('Path is a test/utility file consistent with the plan’s supporting work.');
        }
        return {
            verdict: 'implied',
            score: 65,
            matchedPlanItems: uniqueNonEmpty(matchedPlanItems),
            reasons,
        };
    }
    // (4) Neither plan nor intent justify this edit.
    if (isSupportPath && !planSupports) {
        reasons.push('Path looks like support work, but the plan never mentioned supporting work.');
    }
    else {
        reasons.push('Path matches neither the plan’s expected targets nor intent-support scope.');
    }
    return {
        verdict: 'unplanned',
        score: clampScore(isSupportPath ? 35 : 15),
        matchedPlanItems: [],
        reasons,
    };
}
// ---------------------------------------------------------------------------
// Plan extraction from Claude Code hook payloads
// ---------------------------------------------------------------------------
function asString(value) {
    return typeof value === 'string' && value.trim() ? value : undefined;
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
/**
 * Locate plan-bearing text inside a Claude Code hook payload, ranked by signal.
 * Returns undefined when the payload only carries a user prompt (or nothing).
 *
 * High-signal sources, in priority order:
 *   1. PreToolUse / ExitPlanMode -> tool_input.plan  (the agent's actual plan)
 *   2. PreToolUse / TodoWrite    -> tool_input.todos  (the agent's task list)
 *   3. An explicit `plan` field (string or { summary/steps })
 *   4. An assistant message / transcript turn containing plan structure
 *
 * The `prompt` / `user_prompt` field is treated as *user intent* and is never,
 * on its own, promoted to an agent plan.
 */
function findPlanText(payload) {
    const toolName = asString(payload.tool_name) ||
        asString(payload.toolName) ||
        asString(asRecord(payload.tool)?.name);
    const toolInput = asRecord(payload.tool_input) ||
        asRecord(payload.toolInput) ||
        asRecord(payload.input);
    // (1) ExitPlanMode carries the agent's plan verbatim.
    if (toolInput && /exitplanmode/i.test(toolName || '')) {
        const plan = asString(toolInput.plan);
        if (plan) {
            return { text: plan, source: 'claude_prompt', structured: true };
        }
    }
    // (2) TodoWrite carries an ordered task list.
    if (toolInput && /todowrite/i.test(toolName || '')) {
        const todos = Array.isArray(toolInput.todos) ? toolInput.todos : undefined;
        if (todos && todos.length > 0) {
            const steps = todos
                .map((todo) => asString(asRecord(todo)?.content) || asString(asRecord(todo)?.activeForm))
                .filter((value) => Boolean(value));
            if (steps.length > 0) {
                return {
                    text: steps.join('\n'),
                    source: 'claude_prompt',
                    structured: true,
                    steps,
                };
            }
        }
    }
    // (3) An explicit plan field (used by manual/MCP callers).
    const planField = payload.plan;
    if (typeof planField === 'string') {
        const trimmed = planField.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsed = asRecord(JSON.parse(trimmed));
                if (parsed) {
                    const summary = asString(parsed.summary) || '';
                    const steps = Array.isArray(parsed.steps)
                        ? parsed.steps.map((step) => asString(step)).filter((value) => Boolean(value))
                        : [];
                    if (summary || steps.length > 0) {
                        return {
                            text: [summary, ...steps].join('\n'),
                            source: 'mcp',
                            structured: true,
                            steps: steps.length > 0 ? steps : undefined,
                        };
                    }
                }
            }
            catch {
                // Fall through to plain-string plan handling.
            }
        }
    }
    const planString = asString(planField);
    if (planString) {
        return { text: planString, source: 'claude_prompt', structured: true };
    }
    const planRecord = asRecord(planField);
    if (planRecord) {
        const summary = asString(planRecord.summary) || '';
        const steps = Array.isArray(planRecord.steps)
            ? planRecord.steps.map((s) => asString(s)).filter((v) => Boolean(v))
            : [];
        if (summary || steps.length > 0) {
            return {
                text: [summary, ...steps].join('\n'),
                source: 'claude_prompt',
                structured: true,
                steps: steps.length > 0 ? steps : undefined,
            };
        }
    }
    // (4) Assistant message / transcript with plan structure.
    const assistantCandidates = [
        asString(payload.assistant_message),
        asString(payload.assistantMessage),
        asString(asRecord(payload.message)?.content),
        asString(payload.message),
        asString(payload.transcript),
    ].filter((v) => Boolean(v));
    for (const candidate of assistantCandidates) {
        if (hasPlanStructure(candidate)) {
            return { text: candidate, source: 'claude_prompt', structured: false };
        }
    }
    return undefined;
}
function firstSentence(text, max = 200) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (!collapsed) {
        return '';
    }
    const stop = collapsed.search(/[.!?](?:\s|$)/);
    const sentence = stop >= 0 ? collapsed.slice(0, stop + 1) : collapsed;
    return sentence.length > max ? `${sentence.slice(0, max - 1).trim()}…` : sentence;
}
function deriveConfidence(args) {
    const hasTargets = args.expectedFiles.length + args.expectedGlobs.length > 0;
    if (args.structured && (hasTargets || args.steps.length >= 2)) {
        return 'high';
    }
    if (args.structured || (args.steps.length >= 2 && hasTargets)) {
        return 'medium';
    }
    return 'low';
}
/**
 * Deterministically extract an {@link AgentPlan} from a Claude Code hook
 * payload. Returns null when no plan is present — callers must treat a null
 * result as "no plan", never as a failure.
 *
 * This function never throws: any malformed payload yields null.
 */
function extractAgentPlan(payload, options = {}) {
    try {
        const record = asRecord(payload);
        if (!record) {
            return null;
        }
        const found = findPlanText(record);
        if (!found) {
            return null;
        }
        const safeText = stripSourceLikePlanText(found.text);
        const steps = found.steps && found.steps.length > 0
            ? uniqueNonEmpty(found.steps.map(stripSourceLikePlanText))
            : uniqueNonEmpty(parsePlanSteps(safeText));
        // Conservative: an unstructured assistant message must actually contain
        // multiple steps to qualify as a plan.
        if (!found.structured && steps.length < 2) {
            return null;
        }
        const { expectedFiles, expectedGlobs } = extractExpectedTargetsFromText(safeText);
        const summary = firstSentence(safeText) ||
            (steps.length > 0 ? steps[0] : '') ||
            'Agent plan';
        const constraints = extractLabeledLines(safeText, ['constraint', 'guardrail', 'must not', 'do not', 'never']);
        const risks = extractLabeledLines(safeText, ['risk', 'caveat', 'warning', 'danger']);
        const capturedAt = (options.now ?? new Date()).toISOString();
        return {
            schemaVersion: exports.AGENT_PLAN_SCHEMA_VERSION,
            summary,
            steps,
            expectedFiles,
            expectedGlobs,
            constraints,
            risks,
            capturedAt,
            source: options.source ?? found.source,
            confidence: deriveConfidence({
                structured: found.structured,
                steps,
                expectedFiles,
                expectedGlobs,
            }),
        };
    }
    catch {
        // Plan capture must never fail the hook.
        return null;
    }
}
function extractLabeledLines(text, labels) {
    const out = [];
    const labelRe = new RegExp(`\\b(?:${labels.join('|')})\\b`, 'i');
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.replace(STEP_LINE, '$1').trim();
        if (trimmed && labelRe.test(trimmed)) {
            out.push(trimmed);
        }
    }
    return uniqueNonEmpty(out);
}
/**
 * Source-free projection of an agent plan for live sync / evidence export.
 * Drops nothing sensitive (the model is already source-free) but enforces the
 * shape and trims away anything unexpected callers may have attached.
 */
function sanitizeAgentPlan(value) {
    const record = asRecord(value);
    if (!record) {
        return undefined;
    }
    const summary = asString(record.summary) || '';
    const steps = Array.isArray(record.steps)
        ? uniqueNonEmpty(record.steps.map((s) => asString(s) || ''))
        : [];
    if (!summary && steps.length === 0) {
        return undefined;
    }
    const source = ['claude_prompt', 'manual', 'mcp', 'unknown'].includes(record.source)
        ? record.source
        : 'unknown';
    const confidence = ['high', 'medium', 'low'].includes(record.confidence)
        ? record.confidence
        : 'low';
    const schemaVersion = typeof record.schemaVersion === 'number' ? record.schemaVersion : exports.AGENT_PLAN_SCHEMA_VERSION;
    return {
        schemaVersion,
        summary,
        steps,
        expectedFiles: Array.isArray(record.expectedFiles)
            ? uniqueNonEmpty(record.expectedFiles.map((s) => asString(s) || ''))
            : [],
        expectedGlobs: Array.isArray(record.expectedGlobs)
            ? uniqueNonEmpty(record.expectedGlobs.map((s) => asString(s) || ''))
            : [],
        constraints: Array.isArray(record.constraints)
            ? uniqueNonEmpty(record.constraints.map((s) => asString(s) || ''))
            : [],
        risks: Array.isArray(record.risks)
            ? uniqueNonEmpty(record.risks.map((s) => asString(s) || ''))
            : [],
        capturedAt: asString(record.capturedAt) || new Date().toISOString(),
        source,
        confidence,
    };
}
/** Sanitize a plan-coherence result coming back over the wire. */
function sanitizePlanCoherence(value) {
    const record = asRecord(value);
    if (!record) {
        return undefined;
    }
    const verdicts = ['planned', 'implied', 'unplanned', 'unknown'];
    const verdict = verdicts.includes(record.verdict)
        ? record.verdict
        : 'unknown';
    const score = typeof record.score === 'number' ? clampScore(record.score) : 0;
    return {
        verdict,
        score,
        matchedPlanItems: Array.isArray(record.matchedPlanItems)
            ? uniqueNonEmpty(record.matchedPlanItems.map((s) => asString(s) || ''))
            : [],
        reasons: Array.isArray(record.reasons)
            ? uniqueNonEmpty(record.reasons.map((s) => asString(s) || ''))
            : [],
    };
}
//# sourceMappingURL=agent-plan.js.map