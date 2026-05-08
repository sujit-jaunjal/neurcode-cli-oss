"use strict";
// Deterministic detection + classification rules for remediation patch generation.
// Each detector returns the 0-based line index of the first match, or null.
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyViolation = classifyViolation;
exports.detectPattern = detectPattern;
const CLASSIFICATION_RULES = [
    {
        kind: 'missing_validation',
        keywords: ['missing_validation', 'missing validation', 'request validation', 'input validation', 'validate req.body', 'validate request'],
    },
    {
        kind: 'missing_auth_middleware',
        keywords: ['missing auth middleware', 'missing authentication middleware', 'auth middleware missing', 'unauthenticated route'],
    },
    {
        kind: 'missing_role_checks',
        keywords: ['missing role checks', 'missing role check', 'authorization missing', 'missing rbac', 'role guard'],
    },
    {
        kind: 'unsafe_jwt_usage',
        keywords: ['unsafe jwt', 'jwt misuse', 'weak jwt', 'jwt without safeguards'],
    },
    {
        kind: 'missing_token_expiry',
        keywords: ['missing token expiry', 'token expiry missing', 'jwt expiry missing', 'missing expiresin'],
    },
    {
        kind: 'unsafe_secret_exposure',
        keywords: ['unsafe secret exposure', 'secret exposure', 'secret leak', 'token leak', 'credential leak'],
    },
    {
        kind: 'insecure_cookie_configuration',
        keywords: ['insecure cookie', 'cookie insecure', 'missing httponly', 'missing secure cookie'],
    },
    {
        kind: 'missing_csrf_protection',
        keywords: ['missing csrf', 'csrf protection missing'],
    },
    {
        kind: 'missing_rate_limiting',
        keywords: ['missing rate limiting', 'rate limit missing', 'no rate limit'],
    },
    {
        kind: 'missing_try_catch',
        keywords: ['missing try/catch', 'missing try catch', 'unhandled exception path'],
    },
    {
        kind: 'missing_timeout_handling',
        keywords: ['missing timeout', 'timeout handling missing', 'no timeout'],
    },
    {
        kind: 'unsafe_fetch_without_retries',
        keywords: ['fetch without retries', 'missing retry', 'no retries for fetch'],
    },
    {
        kind: 'missing_idempotency_keys',
        keywords: ['missing idempotency key', 'idempotency missing'],
    },
    {
        kind: 'unsafe_webhook_verification',
        keywords: ['unsafe webhook verification', 'webhook verification missing', 'unverified webhook'],
    },
    {
        kind: 'unsafe_serialization',
        keywords: ['unsafe serialization', 'serialize unsafely', 'json stringify unsafe'],
    },
    {
        kind: 'missing_transaction_wrappers',
        keywords: ['missing transaction', 'transaction wrapper missing', 'no transaction wrapper'],
    },
    {
        kind: 'unsafe_sql_string_concatenation',
        keywords: ['unsafe sql string concatenation', 'sql string concat', 'raw sql concat'],
    },
    {
        kind: 'unsafe_file_uploads',
        keywords: ['unsafe file upload', 'file upload unsafe'],
    },
    {
        kind: 'missing_mime_validation',
        keywords: ['missing mime validation', 'mime validation missing'],
    },
    {
        kind: 'missing_size_limits',
        keywords: ['missing size limits', 'upload size limit missing'],
    },
    {
        kind: 'unsafe_path_traversal_usage',
        keywords: ['path traversal', 'unsafe path usage'],
    },
    {
        kind: 'dangerous_useeffect_cleanup',
        keywords: ['dangerous useeffect cleanup', 'useeffect cleanup missing', 'unsafe useeffect cleanup'],
    },
    {
        kind: 'missing_abort_controller_cleanup',
        keywords: ['abort controller cleanup missing', 'missing abort controller cleanup'],
    },
    {
        kind: 'unsafe_inner_html_usage',
        keywords: ['unsafe innerhtml', 'dangerous innerhtml', 'innerhtml usage'],
    },
    {
        kind: 'unhandled_promise_chains',
        keywords: ['unhandled promise', 'promise chain unhandled'],
    },
    {
        kind: 'unsafe_websocket_lifecycle',
        keywords: ['unsafe websocket lifecycle', 'websocket lifecycle missing cleanup'],
    },
    {
        kind: 'missing_audit_logs',
        keywords: ['missing audit logs', 'audit log missing'],
    },
    {
        kind: 'unsafe_sensitive_logging',
        keywords: ['unsafe sensitive logging', 'sensitive logging', 'logs secret', 'logs token'],
    },
    {
        kind: 'missing_error_boundaries',
        keywords: ['missing error boundaries', 'error boundary missing'],
    },
    {
        kind: 'missing_tracing_wrappers',
        keywords: ['missing tracing wrappers', 'tracing wrapper missing', 'missing tracing'],
    },
    {
        kind: 'deprecated_package_migration_mappings',
        keywords: ['deprecated package migration', 'deprecated package mapping', 'migration mapping deprecated'],
    },
    {
        kind: 'unsafe_env_usage',
        keywords: ['unsafe env usage', 'unsafe environment variable usage', 'process.env unsafe'],
    },
    {
        kind: 'dangerous_hardcoded_credentials',
        keywords: ['hardcoded credentials', 'hardcoded password', 'hardcoded secret', 'hardcoded token'],
    },
];
const DB_ACCESS_PATTERNS = [
    /\bdb\s*\.\s*query\s*\(/,
    /\bdb\s*\.\s*execute\s*\(/,
    /\bdb\s*\.\s*run\s*\(/,
    /\bdb\s*\.\s*find\b/,
    /\bdb\s*\.\s*findOne\s*\(/,
    /\bprisma\s*\.\s*\w+\s*\.\s*find/,
    /\bprisma\s*\.\s*\w+\s*\.\s*create\s*\(/,
    /\bprisma\s*\.\s*\w+\s*\.\s*update\s*\(/,
    /\bprisma\s*\.\s*\w+\s*\.\s*delete\s*\(/,
    /\bnew\s+Pool\s*\(/,
    /\bknex\s*\(/,
];
const VALIDATION_PATTERNS = [
    /\.validate\s*\(/,
    /schema\.parse\s*\(/,
    /\bJoi\s*\./,
    /\byup\s*\./,
    /\bzod\s*\./,
    /\bajv\s*\.\s*compile/,
];
const REQ_HANDLER_RE = /\b(?:req|request)\s*,\s*(?:res|response|reply)\b/;
const REQ_INPUT_RE = /\b(?:req|request)\.(?:body|params|query)\b/;
const TODO_FIXME_RE = /\/\/\s*(?:TODO|FIXME)\b/;
const ROUTE_WITHOUT_AUTH_RE = /\b(?:app|router)\.(?:get|post|put|patch|delete)\s*\(\s*[^,]+\s*,\s*(?:(?!requireAuth|authMiddleware|authenticate|withAuth).)*\b(?:async\s+)?\(?\s*(?:req|request)\s*,\s*(?:res|response|reply)/i;
const ROUTE_WITHOUT_RATE_LIMIT_RE = /\b(?:app|router)\.(?:get|post|put|patch|delete)\s*\(\s*[^,]+\s*,\s*(?:(?!rateLimit|rateLimiter|throttle).)*\b(?:async\s+)?\(?\s*(?:req|request)\s*,\s*(?:res|response|reply)/i;
const JWT_SIGN_NO_EXPIRY_RE = /\bjwt\.sign\s*\((?:(?!expiresIn).)*\)/i;
const INNER_HTML_RE = /\.innerHTML\s*=/;
const SENSITIVE_LOG_RE = /\bconsole\.(?:log|info|warn|error)\s*\([^\n]*(?:authorization|password|secret|token|apiKey|api_key)[^\n]*\)/i;
const SQL_STRING_CONCAT_RE = /\b(?:query|execute|run)\s*\((?:\s*`[^`]*\$\{|[^\n]*\+[^\n]*)/i;
const HARDCODED_SECRET_RE = /\b(?:password|secret|token|api[_-]?key)\b\s*[:=]\s*['"`][^'"`]+['"`]/i;
const FETCH_WITHOUT_TIMEOUT_RE = /\bfetch\s*\((?![^\n]*signal:)/;
const ROUTE_WITHOUT_TRY_CATCH_RE = /\b(?:async\s+)?\(?\s*(?:req|request)\s*,\s*(?:res|response|reply)\s*\)?\s*=>\s*\{/;
const MISSING_AUDIT_LOG_RE = /\b(?:create|update|delete|remove|transfer|refund|charge)\b/i;
const UNSAFE_ENV_USAGE_RE = /\bprocess\.env\.[A-Z0-9_]+\b/;
const GENERIC_LINE_MATCHERS = {
    missing_role_checks: [/\b(?:req|request)\.user\b/i],
    unsafe_jwt_usage: [/\bjwt\.(?:sign|verify)\s*\(/i],
    unsafe_secret_exposure: [HARDCODED_SECRET_RE],
    insecure_cookie_configuration: [/\b(?:res|response)\.cookie\s*\(/i],
    missing_csrf_protection: [/\b(?:app|router)\.(?:post|put|patch|delete)\s*\(/i],
    missing_timeout_handling: [FETCH_WITHOUT_TIMEOUT_RE],
    unsafe_fetch_without_retries: [/\bfetch\s*\(/i],
    missing_idempotency_keys: [/\b(?:charge|payment|checkout|order|transaction)\b/i],
    unsafe_webhook_verification: [/\bwebhook\b/i],
    unsafe_serialization: [/\bJSON\.stringify\s*\(/],
    missing_transaction_wrappers: [/\b(?:create|update|delete)\b/i],
    unsafe_file_uploads: [/\b(?:multer|upload|req\.files|req\.file)\b/i],
    missing_mime_validation: [/\b(?:multer|upload|req\.files|req\.file)\b/i],
    missing_size_limits: [/\b(?:multer|upload|req\.files|req\.file)\b/i],
    unsafe_path_traversal_usage: [/\b(?:path\.join|path\.resolve|fs\.(?:readFile|writeFile|createReadStream|createWriteStream))\b/i],
    dangerous_useeffect_cleanup: [/\buseEffect\s*\(\s*\(\s*\)\s*=>\s*\{/],
    missing_abort_controller_cleanup: [/\bAbortController\s*\(/],
    unhandled_promise_chains: [/\b\.then\s*\(/],
    unsafe_websocket_lifecycle: [/\bnew\s+WebSocket\s*\(/],
    missing_error_boundaries: [/\bReact\.(?:Suspense|Fragment)\b|<Route\b/i],
    missing_tracing_wrappers: [/\b(?:handle|process|execute|run)\b/i],
    deprecated_package_migration_mappings: [/\bdeprecated\b|\bmigration\b/i],
    unsafe_env_usage: [UNSAFE_ENV_USAGE_RE],
    dangerous_hardcoded_credentials: [HARDCODED_SECRET_RE],
};
function isCommentLine(line) {
    const trimmed = line.trimStart();
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}
function findLineByRegex(lines, patterns) {
    for (let i = 0; i < lines.length; i += 1) {
        if (isCommentLine(lines[i]))
            continue;
        if (patterns.some((re) => re.test(lines[i])))
            return i;
    }
    return null;
}
function findDbAccessLine(lines) {
    return findLineByRegex(lines, DB_ACCESS_PATTERNS);
}
function findMissingValidationLine(lines) {
    let handlerStartIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
        if (REQ_HANDLER_RE.test(lines[i])) {
            handlerStartIndex = i;
        }
        if (handlerStartIndex !== -1 && REQ_INPUT_RE.test(lines[i])) {
            const searchFrom = Math.max(handlerStartIndex, i - 30);
            const priorLines = lines.slice(searchFrom, i);
            const hasValidation = priorLines.some((l) => VALIDATION_PATTERNS.some((re) => re.test(l)));
            if (!hasValidation)
                return i;
        }
    }
    return null;
}
function findTodoLine(lines) {
    return findLineByRegex(lines, [TODO_FIXME_RE]);
}
function findMissingAuthMiddlewareLine(lines) {
    return findLineByRegex(lines, [ROUTE_WITHOUT_AUTH_RE]);
}
function findMissingRateLimitingLine(lines) {
    return findLineByRegex(lines, [ROUTE_WITHOUT_RATE_LIMIT_RE]);
}
function findMissingTokenExpiryLine(lines) {
    return findLineByRegex(lines, [JWT_SIGN_NO_EXPIRY_RE]);
}
function findUnsafeInnerHtmlLine(lines) {
    return findLineByRegex(lines, [INNER_HTML_RE]);
}
function findUnsafeSensitiveLoggingLine(lines) {
    return findLineByRegex(lines, [SENSITIVE_LOG_RE]);
}
function findUnsafeSqlStringConcatLine(lines) {
    return findLineByRegex(lines, [SQL_STRING_CONCAT_RE]);
}
function findMissingTryCatchLine(lines) {
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!ROUTE_WITHOUT_TRY_CATCH_RE.test(line))
            continue;
        const end = Math.min(lines.length - 1, i + 40);
        const blockSlice = lines.slice(i, end + 1).join('\n');
        if (blockSlice.includes('await ') && !blockSlice.includes('try {')) {
            return i;
        }
    }
    return null;
}
function findMissingAuditLogLine(lines) {
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (isCommentLine(line))
            continue;
        if (!MISSING_AUDIT_LOG_RE.test(line))
            continue;
        const contextStart = Math.max(0, i - 6);
        const context = lines.slice(contextStart, i + 1).join('\n');
        if (!/audit|logger|telemetry|trace/i.test(context)) {
            return i;
        }
    }
    return null;
}
function classifyViolation(issue, policy) {
    const combined = `${issue} ${policy}`.toLowerCase();
    if (combined.includes('todo') || combined.includes('fixme'))
        return 'todo_fixme';
    if (combined.includes('db')
        || combined.includes('database')
        || combined.includes('query')
        || combined.includes('data access')
        || combined.includes('direct access')
        || combined.includes('layering')
        || combined.includes('layer')) {
        return 'db_in_ui';
    }
    for (const rule of CLASSIFICATION_RULES) {
        if (rule.keywords.some((keyword) => combined.includes(keyword))) {
            return rule.kind;
        }
    }
    return null;
}
function detectPattern(content, kind) {
    const lines = content.split('\n');
    switch (kind) {
        case 'db_in_ui':
            return findDbAccessLine(lines);
        case 'missing_validation':
            return findMissingValidationLine(lines);
        case 'todo_fixme':
            return findTodoLine(lines);
        case 'missing_auth_middleware':
            return findMissingAuthMiddlewareLine(lines);
        case 'missing_rate_limiting':
            return findMissingRateLimitingLine(lines);
        case 'missing_token_expiry':
            return findMissingTokenExpiryLine(lines);
        case 'unsafe_inner_html_usage':
            return findUnsafeInnerHtmlLine(lines);
        case 'unsafe_sensitive_logging':
            return findUnsafeSensitiveLoggingLine(lines);
        case 'unsafe_sql_string_concatenation':
            return findUnsafeSqlStringConcatLine(lines);
        case 'missing_try_catch':
            return findMissingTryCatchLine(lines);
        case 'missing_audit_logs':
            return findMissingAuditLogLine(lines);
        default: {
            const patterns = GENERIC_LINE_MATCHERS[kind];
            if (!patterns || patterns.length === 0)
                return null;
            return findLineByRegex(lines, patterns);
        }
    }
}
//# sourceMappingURL=patterns.js.map