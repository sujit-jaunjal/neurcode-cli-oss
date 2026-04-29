"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLocalPlanPath = resolveLocalPlanPath;
exports.ensureLocalPlan = ensureLocalPlan;
exports.addExpectedFilesToLocalPlan = addExpectedFilesToLocalPlan;
exports.initializeLocalPlanFromIntent = initializeLocalPlanFromIntent;
const fs_1 = require("fs");
const path_1 = require("path");
const PLAN_DIRNAME = '.neurcode';
const PLAN_FILENAME = 'plan.json';
function nowIso() {
    return new Date().toISOString();
}
function normalizeText(value) {
    return value.replace(/\s+/g, ' ').trim();
}
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function dedupeValues(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        const normalized = normalizeText(value);
        if (!normalized)
            continue;
        const key = normalized.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(normalized);
    }
    return out;
}
function dedupePaths(paths) {
    const seen = new Set();
    const out = [];
    for (const path of paths) {
        const normalized = normalizeRepoPath(path);
        if (!normalized)
            continue;
        const key = normalized.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(normalized);
    }
    return out;
}
function coerceLocalPlan(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        const now = nowIso();
        return {
            intent: '',
            expectedFiles: [],
            constraints: [],
            createdAt: now,
            lastUpdated: now,
        };
    }
    const record = value;
    const intent = typeof record.intent === 'string' ? normalizeText(record.intent) : '';
    const expectedFilesRaw = Array.isArray(record.expectedFiles) ? record.expectedFiles : [];
    const expectedFiles = dedupePaths(expectedFilesRaw.filter((item) => typeof item === 'string'));
    const constraintsRaw = Array.isArray(record.constraints) ? record.constraints : [];
    const constraints = dedupeValues(constraintsRaw.filter((item) => typeof item === 'string'));
    const createdAt = typeof record.createdAt === 'string' && record.createdAt.trim().length > 0
        ? record.createdAt
        : typeof record.lastUpdated === 'string' && record.lastUpdated.trim().length > 0
            ? record.lastUpdated
            : nowIso();
    const lastUpdated = typeof record.lastUpdated === 'string' && record.lastUpdated.trim().length > 0
        ? record.lastUpdated
        : createdAt;
    return {
        intent,
        expectedFiles,
        constraints,
        createdAt,
        lastUpdated,
    };
}
function resolveLocalPlanPath(projectRoot) {
    return (0, path_1.join)(projectRoot, PLAN_DIRNAME, PLAN_FILENAME);
}
function writeLocalPlan(path, data) {
    (0, fs_1.writeFileSync)(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}
function ensureLocalPlan(projectRoot) {
    const planDir = (0, path_1.join)(projectRoot, PLAN_DIRNAME);
    const planPath = resolveLocalPlanPath(projectRoot);
    (0, fs_1.mkdirSync)(planDir, { recursive: true });
    if (!(0, fs_1.existsSync)(planPath)) {
        const now = nowIso();
        const freshPlan = {
            intent: '',
            expectedFiles: [],
            constraints: [],
            createdAt: now,
            lastUpdated: now,
        };
        writeLocalPlan(planPath, freshPlan);
        return {
            ...freshPlan,
            path: planPath,
            existed: false,
        };
    }
    try {
        const raw = (0, fs_1.readFileSync)(planPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const coerced = coerceLocalPlan(parsed);
        if (JSON.stringify(coerced) !== JSON.stringify(parsed)) {
            writeLocalPlan(planPath, coerced);
        }
        return {
            ...coerced,
            path: planPath,
            existed: true,
        };
    }
    catch {
        const now = nowIso();
        const repaired = {
            intent: '',
            expectedFiles: [],
            constraints: [],
            createdAt: now,
            lastUpdated: now,
        };
        writeLocalPlan(planPath, repaired);
        return {
            ...repaired,
            path: planPath,
            existed: true,
        };
    }
}
function addExpectedFilesToLocalPlan(projectRoot, files) {
    const plan = ensureLocalPlan(projectRoot);
    const incoming = dedupePaths(files);
    const existingSet = new Set(plan.expectedFiles.map((item) => item.toLowerCase()));
    const addedFiles = [];
    for (const file of incoming) {
        const key = file.toLowerCase();
        if (existingSet.has(key))
            continue;
        existingSet.add(key);
        addedFiles.push(file);
    }
    const shouldUpdateTimestamp = incoming.length > 0;
    const nextExpectedFiles = shouldUpdateTimestamp
        ? dedupePaths([...plan.expectedFiles, ...addedFiles])
        : plan.expectedFiles;
    const nextLastUpdated = shouldUpdateTimestamp ? nowIso() : plan.lastUpdated;
    const nextPlan = {
        intent: plan.intent,
        expectedFiles: nextExpectedFiles,
        constraints: plan.constraints,
        createdAt: plan.createdAt,
        lastUpdated: nextLastUpdated,
    };
    writeLocalPlan(plan.path, nextPlan);
    return {
        path: plan.path,
        addedFiles,
        expectedFiles: nextPlan.expectedFiles,
        intent: nextPlan.intent,
        constraints: nextPlan.constraints,
        createdAt: nextPlan.createdAt,
        lastUpdated: nextPlan.lastUpdated,
    };
}
const INTENT_HEURISTIC_RULES = [
    {
        id: 'auth',
        pattern: /\b(auth|authentication|authorization|jwt|token|login|rbac|role)\b/i,
        files: [
            'src/core/auth.ts',
            'src/core/auth-service.ts',
            'src/core/middleware/auth.ts',
            'src/api/auth.ts',
        ],
        constraints: [
            'Preserve authentication and authorization checks.',
            'Validate auth inputs before request handling.',
        ],
    },
    {
        id: 'api',
        pattern: /\b(api|endpoint|route|controller|backend|server)\b/i,
        files: [
            'src/core/api.ts',
            'src/core/routes.ts',
            'src/core/handlers.ts',
            'src/api/index.ts',
        ],
        constraints: [
            'Validate inputs at API boundaries.',
            'Keep endpoint changes localized to API/core layers.',
        ],
    },
    {
        id: 'ui',
        pattern: /\b(ui|frontend|component|react|page|screen)\b/i,
        files: [
            'src/ui/app.tsx',
            'src/ui/users.tsx',
            'src/ui/components/AuthForm.tsx',
            'src/ui/components/index.ts',
        ],
        constraints: [
            'Keep business logic out of UI components.',
            'Use core/service layers for data access.',
        ],
    },
];
const DEFAULT_INTENT_FILES = ['src/core/index.ts'];
const DEFAULT_INTENT_CONSTRAINTS = ['Keep changes scoped to planned files.'];
function buildIntentHeuristic(intent) {
    const normalizedIntent = normalizeText(intent);
    const detectedSignals = INTENT_HEURISTIC_RULES
        .filter((rule) => rule.pattern.test(normalizedIntent))
        .map((rule) => rule.id);
    const expectedFiles = dedupePaths(detectedSignals.length > 0
        ? INTENT_HEURISTIC_RULES
            .filter((rule) => detectedSignals.includes(rule.id))
            .flatMap((rule) => rule.files)
        : DEFAULT_INTENT_FILES).slice(0, 12);
    const constraints = dedupeValues([
        ...DEFAULT_INTENT_CONSTRAINTS,
        ...INTENT_HEURISTIC_RULES
            .filter((rule) => detectedSignals.includes(rule.id))
            .flatMap((rule) => rule.constraints),
    ]).slice(0, 8);
    return {
        detectedSignals,
        expectedFiles,
        constraints,
    };
}
function initializeLocalPlanFromIntent(projectRoot, intentInput) {
    const intent = normalizeText(intentInput);
    const plan = ensureLocalPlan(projectRoot);
    const heuristic = buildIntentHeuristic(intent);
    const now = nowIso();
    const nextPlan = {
        intent,
        expectedFiles: heuristic.expectedFiles,
        constraints: heuristic.constraints,
        createdAt: now,
        lastUpdated: now,
    };
    writeLocalPlan(plan.path, nextPlan);
    return {
        path: plan.path,
        intent: nextPlan.intent,
        detectedSignals: heuristic.detectedSignals,
        expectedFiles: nextPlan.expectedFiles,
        constraints: nextPlan.constraints,
        createdAt: nextPlan.createdAt,
        lastUpdated: nextPlan.lastUpdated,
    };
}
//# sourceMappingURL=plan-sync.js.map