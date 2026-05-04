"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAiDebtBudgetConfig = resolveAiDebtBudgetConfig;
exports.evaluateAiDebtBudget = evaluateAiDebtBudget;
const fs_1 = require("fs");
const path_1 = require("path");
const TODO_FIXME_PATTERN = /\b(?:TODO|FIXME)\b/i;
const CONSOLE_LOG_PATTERN = /\bconsole\.log\s*\(/;
const ANY_TYPE_PATTERN = /(:\s*any\b|<\s*any\s*>|\bArray<any>\b|\bPromise<any>\b)/i;
// Architectural pattern detection
const DB_IMPORT_PATTERN = /import\s+.*from\s+['"][^'"]*\/(db|database|prisma|knex|sequelize|drizzle)[^'"]*['"]/i;
const DB_CALL_PATTERN = /\b(db|prisma|knex|sequelize|drizzle|pool|client)\s*\.\s*(query|execute|findMany|findOne|findFirst|findUnique|create|update|delete|upsert|raw|select|insert)\s*\(/;
const UI_PATH_PATTERN = /(\/|^)(components?|pages?|views?|screens?|containers?|app|ui)[/\\]|\.tsx$/i;
const VALIDATION_PATTERN = /\b(zod|joi|yup|valibot|ajv|class-validator|express-validator|validate|sanitize|schema\.parse|\.validate\()\b/i;
const REQ_BODY_PATTERN = /\breq\.body\b/;
const API_PATH_PATTERN = /(\/|^)(routes?|controllers?|handlers?|api|endpoints?)[/\\]/i;
const DEFAULT_THRESHOLDS = {
    maxAddedTodoFixme: 0,
    maxAddedConsoleLogs: 0,
    maxAddedAnyTypes: 0,
    maxLargeFilesTouched: 1,
    largeFileDeltaLines: 350,
    maxBloatFiles: 0,
};
function parseInteger(value, fallback, min = 0, max = 10_000) {
    if (!value || !value.trim()) {
        return fallback;
    }
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.floor(parsed)));
}
function normalizeMode(value, fallback) {
    if (!value || !value.trim()) {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'off')
        return 'off';
    if (normalized === 'advisory')
        return 'advisory';
    if (normalized === 'enforce')
        return 'enforce';
    return fallback;
}
function readFileBudgetConfig(projectRoot) {
    const configuredPath = process.env.NEURCODE_AI_DEBT_BUDGET_PATH?.trim();
    const budgetPath = configuredPath ? (0, path_1.join)(projectRoot, configuredPath) : (0, path_1.join)(projectRoot, '.neurcode', 'ai-debt-budget.json');
    if (!(0, fs_1.existsSync)(budgetPath)) {
        return {};
    }
    try {
        const raw = (0, fs_1.readFileSync)(budgetPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }
        return parsed;
    }
    catch {
        return {};
    }
}
function mergeThresholds(base, patch) {
    if (!patch)
        return base;
    return {
        maxAddedTodoFixme: typeof patch.maxAddedTodoFixme === 'number'
            ? Math.max(0, Math.floor(patch.maxAddedTodoFixme))
            : base.maxAddedTodoFixme,
        maxAddedConsoleLogs: typeof patch.maxAddedConsoleLogs === 'number'
            ? Math.max(0, Math.floor(patch.maxAddedConsoleLogs))
            : base.maxAddedConsoleLogs,
        maxAddedAnyTypes: typeof patch.maxAddedAnyTypes === 'number'
            ? Math.max(0, Math.floor(patch.maxAddedAnyTypes))
            : base.maxAddedAnyTypes,
        maxLargeFilesTouched: typeof patch.maxLargeFilesTouched === 'number'
            ? Math.max(0, Math.floor(patch.maxLargeFilesTouched))
            : base.maxLargeFilesTouched,
        largeFileDeltaLines: typeof patch.largeFileDeltaLines === 'number'
            ? Math.max(1, Math.floor(patch.largeFileDeltaLines))
            : base.largeFileDeltaLines,
        maxBloatFiles: typeof patch.maxBloatFiles === 'number'
            ? Math.max(0, Math.floor(patch.maxBloatFiles))
            : base.maxBloatFiles,
    };
}
function resolveSourceTag(fileConfigPresent, envOverridesApplied) {
    if (fileConfigPresent && envOverridesApplied)
        return 'file+env';
    if (fileConfigPresent)
        return 'file';
    if (envOverridesApplied)
        return 'env';
    return 'defaults';
}
function resolveAiDebtBudgetConfig(projectRoot, options) {
    const strictDefault = options?.strictDefault === true;
    const defaultMode = strictDefault ? 'enforce' : 'advisory';
    const fileConfig = readFileBudgetConfig(projectRoot);
    const fileConfigPresent = Boolean(fileConfig.mode || fileConfig.thresholds);
    const modeFromFile = normalizeMode(fileConfig.mode, defaultMode);
    const thresholdsFromFile = mergeThresholds(DEFAULT_THRESHOLDS, fileConfig.thresholds);
    const modeFromEnv = normalizeMode(process.env.NEURCODE_AI_DEBT_MODE, modeFromFile);
    const envThresholds = {
        maxAddedTodoFixme: parseInteger(process.env.NEURCODE_AI_DEBT_MAX_ADDED_TODO_FIXME, thresholdsFromFile.maxAddedTodoFixme),
        maxAddedConsoleLogs: parseInteger(process.env.NEURCODE_AI_DEBT_MAX_ADDED_CONSOLE_LOGS, thresholdsFromFile.maxAddedConsoleLogs),
        maxAddedAnyTypes: parseInteger(process.env.NEURCODE_AI_DEBT_MAX_ADDED_ANY_TYPES, thresholdsFromFile.maxAddedAnyTypes),
        maxLargeFilesTouched: parseInteger(process.env.NEURCODE_AI_DEBT_MAX_LARGE_FILES_TOUCHED, thresholdsFromFile.maxLargeFilesTouched),
        largeFileDeltaLines: parseInteger(process.env.NEURCODE_AI_DEBT_LARGE_FILE_DELTA_LINES, thresholdsFromFile.largeFileDeltaLines, 1),
        maxBloatFiles: parseInteger(process.env.NEURCODE_AI_DEBT_MAX_BLOAT_FILES, thresholdsFromFile.maxBloatFiles),
    };
    const envOverridesApplied = [
        process.env.NEURCODE_AI_DEBT_MODE,
        process.env.NEURCODE_AI_DEBT_MAX_ADDED_TODO_FIXME,
        process.env.NEURCODE_AI_DEBT_MAX_ADDED_CONSOLE_LOGS,
        process.env.NEURCODE_AI_DEBT_MAX_ADDED_ANY_TYPES,
        process.env.NEURCODE_AI_DEBT_MAX_LARGE_FILES_TOUCHED,
        process.env.NEURCODE_AI_DEBT_LARGE_FILE_DELTA_LINES,
        process.env.NEURCODE_AI_DEBT_MAX_BLOAT_FILES,
    ].some((value) => typeof value === 'string' && value.trim().length > 0);
    return {
        mode: modeFromEnv,
        thresholds: mergeThresholds(thresholdsFromFile, envThresholds),
        source: resolveSourceTag(fileConfigPresent, envOverridesApplied),
    };
}
function buildMetrics(diffFiles, bloatCount, thresholds) {
    let addedTodoFixme = 0;
    let addedConsoleLogs = 0;
    let addedAnyTypes = 0;
    let largeFilesTouched = 0;
    const todoFixmeFiles = [];
    const consoleLogFiles = [];
    const anyTypeFiles = [];
    const largeFiles = [];
    for (const file of diffFiles) {
        const filePath = file.path || 'unknown';
        const fileDelta = Math.max(0, Number(file.addedLines || 0)) + Math.max(0, Number(file.removedLines || 0));
        if (fileDelta >= thresholds.largeFileDeltaLines) {
            largeFilesTouched += 1;
            largeFiles.push(filePath);
        }
        let fileTodo = false;
        let fileConsole = false;
        let fileAny = false;
        for (const hunk of file.hunks || []) {
            for (const line of hunk.lines || []) {
                if (line.type !== 'added') {
                    continue;
                }
                const content = String(line.content || '');
                if (TODO_FIXME_PATTERN.test(content)) {
                    addedTodoFixme += 1;
                    fileTodo = true;
                }
                if (CONSOLE_LOG_PATTERN.test(content)) {
                    addedConsoleLogs += 1;
                    fileConsole = true;
                }
                if (ANY_TYPE_PATTERN.test(content)) {
                    addedAnyTypes += 1;
                    fileAny = true;
                }
            }
        }
        if (fileTodo)
            todoFixmeFiles.push(filePath);
        if (fileConsole)
            consoleLogFiles.push(filePath);
        if (fileAny)
            anyTypeFiles.push(filePath);
    }
    return {
        addedTodoFixme,
        addedConsoleLogs,
        addedAnyTypes,
        largeFilesTouched,
        bloatFiles: Math.max(0, Math.floor(bloatCount)),
        todoFixmeFiles,
        consoleLogFiles,
        anyTypeFiles,
        largeFiles,
    };
}
function buildViolations(metrics, thresholds) {
    const violations = [];
    if (metrics.addedTodoFixme > thresholds.maxAddedTodoFixme) {
        violations.push({
            code: 'added_todo_fixme',
            metric: 'addedTodoFixme',
            observed: metrics.addedTodoFixme,
            budget: thresholds.maxAddedTodoFixme,
            message: `Added TODO/FIXME markers (${metrics.addedTodoFixme}) exceed budget (${thresholds.maxAddedTodoFixme}).`,
            files: metrics.todoFixmeFiles,
        });
    }
    if (metrics.addedConsoleLogs > thresholds.maxAddedConsoleLogs) {
        violations.push({
            code: 'added_console_logs',
            metric: 'addedConsoleLogs',
            observed: metrics.addedConsoleLogs,
            budget: thresholds.maxAddedConsoleLogs,
            message: `Added console.log statements (${metrics.addedConsoleLogs}) exceed budget (${thresholds.maxAddedConsoleLogs}).`,
            files: metrics.consoleLogFiles,
        });
    }
    if (metrics.addedAnyTypes > thresholds.maxAddedAnyTypes) {
        violations.push({
            code: 'added_any_types',
            metric: 'addedAnyTypes',
            observed: metrics.addedAnyTypes,
            budget: thresholds.maxAddedAnyTypes,
            message: `Added TypeScript any usages (${metrics.addedAnyTypes}) exceed budget (${thresholds.maxAddedAnyTypes}).`,
            files: metrics.anyTypeFiles,
        });
    }
    if (metrics.largeFilesTouched > thresholds.maxLargeFilesTouched) {
        violations.push({
            code: 'large_files_touched',
            metric: 'largeFilesTouched',
            observed: metrics.largeFilesTouched,
            budget: thresholds.maxLargeFilesTouched,
            message: `Large file churn (${metrics.largeFilesTouched} file(s) >= ${thresholds.largeFileDeltaLines} lines) ` +
                `exceeds budget (${thresholds.maxLargeFilesTouched}).`,
            files: metrics.largeFiles,
        });
    }
    if (metrics.bloatFiles > thresholds.maxBloatFiles) {
        violations.push({
            code: 'bloat_files',
            metric: 'bloatFiles',
            observed: metrics.bloatFiles,
            budget: thresholds.maxBloatFiles,
            message: `Out-of-contract files (${metrics.bloatFiles}) exceed budget (${thresholds.maxBloatFiles}).`,
        });
    }
    return violations;
}
function computeScore(metrics, thresholds) {
    const overTodo = Math.max(0, metrics.addedTodoFixme - thresholds.maxAddedTodoFixme);
    const overConsole = Math.max(0, metrics.addedConsoleLogs - thresholds.maxAddedConsoleLogs);
    const overAny = Math.max(0, metrics.addedAnyTypes - thresholds.maxAddedAnyTypes);
    const overLargeFiles = Math.max(0, metrics.largeFilesTouched - thresholds.maxLargeFilesTouched);
    const overBloat = Math.max(0, metrics.bloatFiles - thresholds.maxBloatFiles);
    const weightedPenalty = overTodo * 16 +
        overConsole * 14 +
        overAny * 14 +
        overLargeFiles * 10 +
        overBloat * 18;
    return Math.max(0, Math.min(100, 100 - weightedPenalty));
}
function detectArchitecturalViolations(diffFiles) {
    const dbInUiFiles = [];
    const missingValidationFiles = [];
    for (const file of diffFiles) {
        const filePath = String(file.path || '');
        const addedLines = (file.hunks || [])
            .flatMap((h) => h.lines || [])
            .filter((l) => l.type === 'added')
            .map((l) => String(l.content || ''));
        const addedText = addedLines.join('\n');
        // db_in_ui: UI component file that imports from or directly calls DB
        if (UI_PATH_PATTERN.test(filePath)) {
            if (DB_IMPORT_PATTERN.test(addedText) || DB_CALL_PATTERN.test(addedText)) {
                dbInUiFiles.push(filePath);
            }
        }
        // missing_validation: API handler file that reads req.body without any validation library
        if (API_PATH_PATTERN.test(filePath) || filePath.endsWith('.ts') || filePath.endsWith('.js')) {
            if (REQ_BODY_PATTERN.test(addedText) && !VALIDATION_PATTERN.test(addedText)) {
                missingValidationFiles.push(filePath);
            }
        }
    }
    const violations = [];
    if (dbInUiFiles.length > 0) {
        violations.push({
            code: 'db_in_ui',
            metric: 'architectural',
            observed: dbInUiFiles.length,
            budget: 0,
            message: `Direct database access in UI component (${dbInUiFiles.length} file${dbInUiFiles.length > 1 ? 's' : ''}). DB calls belong in the service/repository layer.`,
            files: [...new Set(dbInUiFiles)],
        });
    }
    if (missingValidationFiles.length > 0) {
        violations.push({
            code: 'missing_validation',
            metric: 'architectural',
            observed: missingValidationFiles.length,
            budget: 0,
            message: `API handler reads req.body without input validation (${missingValidationFiles.length} file${missingValidationFiles.length > 1 ? 's' : ''}). All inputs must be validated at the API boundary.`,
            files: [...new Set(missingValidationFiles)],
        });
    }
    return violations;
}
function evaluateAiDebtBudget(input) {
    const metrics = buildMetrics(input.diffFiles, input.bloatCount, input.config.thresholds);
    const violations = buildViolations(metrics, input.config.thresholds);
    const archViolations = detectArchitecturalViolations(input.diffFiles);
    const score = computeScore(metrics, input.config.thresholds);
    const allViolations = [...violations, ...archViolations];
    const pass = input.config.mode === 'off'
        ? true
        : input.config.mode === 'advisory'
            ? true
            : allViolations.length === 0;
    return {
        mode: input.config.mode,
        pass,
        score,
        metrics,
        thresholds: input.config.thresholds,
        violations: allViolations,
        source: input.config.source,
    };
}
//# sourceMappingURL=ai-debt-budget.js.map