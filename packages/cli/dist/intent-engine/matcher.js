"use strict";
/**
 * Intent–Code Matcher — compares a ParsedIntent against a FileMeta index and
 * returns:
 *
 *  IntentIssue[]                   — missing / misplaced / partial issues
 *  componentMap                    — component → files where it was detected
 *  componentQuality                — component → 'strong' | 'weak' quality signal
 *
 * No LLM calls.  All checks are deterministic keyword/pattern matching.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchIntentToCode = matchIntentToCode;
const COMPONENT_SIGNALS = {
    'input-validation': {
        strong: [
            /\b(zod|joi|yup|valibot|ajv|class-validator|express-validator)\b/i,
            /\.safeParse\s*\(|\.parse\s*\(req|schema\.validate\s*\(/i,
            /\bvalidateInput\s*\(/i,
        ],
        weak: [
            /\.validate\s*\(|\.sanitize\s*\(/i,
            /\bschema\s*=\s*\{|const\s+\w+Schema\b/i,
        ],
    },
    'token-generation': {
        strong: [
            /\bjwt\.sign\s*\(/i,
            /\bsignToken\b|\bsignJWT\b/i,
        ],
        weak: [
            /\bcreateToken\b|\bgenerateToken\b/i,
            /\bnew\s+\w*[Tt]oken\b/,
        ],
    },
    'token-expiry': {
        strong: [
            /\bexpiresIn\s*:\s*['"\d]/i,
            /\bexp\s*:\s*(Math\.floor|Date\.now|\d)/i,
        ],
        weak: [
            /\brefreshToken\b|\brotateToken\b/i,
            /\bttl\s*:/i,
        ],
    },
    'role-check': {
        strong: [
            /\b(hasRole|checkRole|requireRole|isAdmin|canAccess)\s*\(/i,
            /\brequirePermission\s*\(|rbac\b/i,
        ],
        weak: [
            /\brole\s*===\s*['"]|roles\.(includes|has)\s*\(/i,
            /\bpermission\b/i,
        ],
    },
    'middleware-protection': {
        strong: [
            /\bauthMiddleware\b|\bprotectRoute\b|\brequireAuth\b/i,
            /router\.(use|get|post|put|delete|patch)\s*\([^,)]+,\s*(auth|protect|verify|guard)/i,
        ],
        weak: [
            /\bPrivateRoute\b|\bRequireAuth\b|\bwithAuth\b/i,
            /middleware.*auth|auth.*middleware/i,
        ],
    },
    'password-hashing': {
        strong: [
            /\bbcrypt\.(hash|compare|genSalt)\s*\(/i,
            /\bargon2\.(hash|verify)\s*\(/i,
        ],
        weak: [
            /\bscrypt\b|\bpbkdf2\b/i,
            /\bhashPassword\s*\(|\bverifyPassword\s*\(/i,
        ],
    },
    'error-handling': {
        strong: [
            /\btry\s*\{[\s\S]{0,400}\}\s*catch\s*\(/,
            /next\s*\(\s*err|res\.(status|json)\s*\(\s*[45]\d\d/i,
        ],
        weak: [
            /\.catch\s*\(err|catch\s*\(\s*(e|error)\b/i,
            /\bHttpException\b|\bApiError\b|\bAppError\b/i,
        ],
    },
    'service-layer-separation': {
        strong: [
            /\bimport\s+.*from\s+['"][^'"]*\/(service|repository|repo)[^'"]*['"]/i,
            /\bnew\s+\w+(Service|Repository|Repo)\s*\(/i,
        ],
        weak: [
            /\b\w+(Service|Repository)\b/i,
        ],
    },
    'auth-middleware': {
        strong: [
            /app\.(use|get|post)\s*\([^,)]*,\s*(auth|verifyToken|protect)/i,
            /\bauthMiddleware\b|\bverifyToken\b/i,
        ],
        weak: [
            /middleware.*auth|auth.*middleware/i,
        ],
    },
    'response-schema': {
        strong: [
            /\bResponseSchema\b|\bApiResponse<|\bResponseDto\b/i,
            /z\.object\s*\(\s*\{.*\}\s*\)\.parse/i,
        ],
        weak: [
            /\bserialize\s*\(|\btoJSON\s*\(/i,
        ],
    },
    'idempotency': {
        strong: [
            /\bidempotencyKey\b|\bidempotency(-|_)key\b/i,
            /\bfindOrCreate\b/i,
        ],
        weak: [
            /\bupsert\b/i,
        ],
    },
    'webhook-verification': {
        strong: [
            /stripe\.webhooks\.constructEvent\s*\(/i,
            /\bverifyWebhookSignature\b/i,
            /\bhmac\b.*\bdigest\b|\bcreateHmac\b/i,
        ],
        weak: [
            /\bsignature\b.*verify|verify.*\bsignature\b/i,
            /\bwebhook.*secret\b/i,
        ],
    },
    'secure-data-handling': {
        strong: [
            /\bmask\s*\(|\bredact\s*\(/i,
            /\bencrypt\s*\(/i,
        ],
        weak: [
            /\bPCI\b|\btokeniz/i,
        ],
    },
    'transaction-handling': {
        strong: [
            /\b\$transaction\s*\(|\bwithTransaction\s*\(/i,
            /\bbeginTransaction\s*\(|\bcommit\s*\(\s*\)|\brollback\s*\(\s*\)/i,
        ],
        weak: [
            /\btransaction\b/i,
        ],
    },
    'migration-safety': {
        strong: [
            /\bdown\s*\(\s*(queryInterface|db|knex)\b/i,
            /exports\.down\s*=/i,
        ],
        weak: [
            /\bmigration\b|\bmigrate\b/i,
        ],
    },
    'connection-pooling': {
        strong: [
            /\bmaxConnections\b|\bpoolSize\b|\bpool\.max\b/i,
            /\bnew\s+Pool\s*\(/i,
        ],
        weak: [
            /\bpool\b/i,
        ],
    },
    'input-sanitization': {
        strong: [
            /\bDOMPurify\.sanitize\s*\(|\bsanitizeHtml\s*\(/i,
            /\bescapeHtml\s*\(|\bxss\s*\(/i,
        ],
        weak: [
            /\bsanitize\b/i,
        ],
    },
    'output-encoding': {
        strong: [
            /\bencodeURIComponent\s*\(|\bhtmlEncode\s*\(/i,
            /\bDOMPurify\.sanitize\s*\(/i,
        ],
        weak: [
            /\bescape\s*\(/i,
        ],
    },
    'secret-management': {
        strong: [
            /process\.env\.\w*(SECRET|KEY|TOKEN|PASSWORD)\b/i,
            /\bvault\b|\baws-secrets\b/i,
        ],
        weak: [
            /\bdotenv\b|\bconfig\.\w*(secret|key)\b/i,
        ],
    },
    'cors-policy': {
        strong: [
            /\bcors\s*\(\s*\{/i,
            /\bAccess-Control-Allow-Origin\b/,
        ],
        weak: [
            /\bcors\b/i,
        ],
    },
    'https-enforcement': {
        strong: [
            /\bforceHttps\b|\brequireHttps\b/i,
            /\bsecure\s*:\s*true\b/i,
        ],
        weak: [
            /\bhttps\b/i,
        ],
    },
    'recipient-validation': {
        strong: [
            /\bvalidateEmail\s*\(|\bisEmail\s*\(/i,
        ],
        weak: [
            /email.*valid|valid.*email/i,
        ],
    },
    'retry-logic': {
        strong: [
            /\bretry\s*\(|\bmaxRetries\b|\bexponentialBackoff\b/i,
        ],
        weak: [
            /\bretries\b/i,
        ],
    },
    'template-validation': {
        strong: [
            /\bHandlebars\.compile\s*\(|\bejs\.render\s*\(/i,
        ],
        weak: [
            /\btemplate\b.*\bvalidat|\bvalidat.*\btemplate/i,
        ],
    },
    'rate-limiting': {
        strong: [
            /\brateLimit\s*\(|\brate-limiter\b/i,
            /\bthrottler\b|\bthrottle\s*\(/i,
        ],
        weak: [
            /\brate.?limit\b/i,
        ],
    },
    'file-type-validation': {
        strong: [
            /\bmimetype\b.*\bvalidat|\bvalidat.*\bmimetype/i,
            /\ballowedMimeTypes\b|\bfileFilter\s*\(/i,
        ],
        weak: [
            /\bmimetype\b|\bfileType\b/i,
        ],
    },
    'size-limit-enforcement': {
        strong: [
            /\bmaxSize\s*:\s*\d|\bfileSizeLimit\s*:\s*\d/i,
            /fileSize\s*[><=]+\s*\d/i,
        ],
        weak: [
            /\bmaxSize\b|\bsizeLimit\b/i,
        ],
    },
    'filename-sanitization': {
        strong: [
            /\bpath\.basename\s*\(|\bpath\.extname\s*\(/i,
            /sanitize.*filename|filename.*sanitize/i,
        ],
        weak: [
            /\bfilename\b.*\bclean|\bclean.*\bfilename/i,
        ],
    },
    'access-control': {
        strong: [
            /\bcheckPermission\s*\(|\brequirePermission\s*\(/i,
            /\bforbidden\b|\bunauthorized\b/i,
        ],
        weak: [
            /\bauthorize\b|\bpermission\b/i,
        ],
    },
};
// ── Domain-presence guard signals ─────────────────────────────────────────────
const DOMAIN_PRESENCE_SIGNALS = {
    auth: [
        /\b(verify|validate|check)\w*(Token|JWT|Session|Auth)\b/i,
        /\bjwt\.(verify|sign|decode)\b/i,
        /\bbearerToken\b|\bauthorization\b/i,
        /\bpassport\./i,
        /middleware.*auth|auth.*middleware/i,
    ],
};
// ── Layer rules (misplaced logic) ─────────────────────────────────────────────
const LAYER_RULES = [
    {
        offendingLayer: 'ui',
        bannedDomains: ['database'],
        signal: /\b(prisma|db|knex|sequelize|pool)\s*\.\s*(query|findMany|findOne|create|execute)\b/i,
        message: (file) => `Database access found in UI component ${file} — DB calls belong in the service/repository layer`,
        rule: 'intent:db-in-ui',
    },
    {
        offendingLayer: 'ui',
        bannedDomains: ['auth'],
        signal: /\bjwt\.(sign|verify)\b|bcrypt\.(hash|compare)\b/i,
        message: (file) => `Auth/crypto logic found in UI component ${file} — cryptographic operations belong in the API/service layer`,
        rule: 'intent:auth-logic-in-ui',
    },
];
const MISSING_CHECKS = [
    {
        domain: 'auth', componentKey: 'input-validation', presentIn: 'api',
        message: 'Auth flow added but no input validation found in API handlers — all inputs must be validated at the boundary',
        severity: 'high', rule: 'intent:missing-input-validation',
    },
    {
        domain: 'auth', componentKey: 'role-check', presentIn: 'api',
        message: 'JWT/token auth added but no role-based access checks found — RBAC enforcement appears missing',
        severity: 'medium', rule: 'intent:missing-role-checks',
    },
    {
        domain: 'auth', componentKey: 'token-expiry', presentIn: 'any',
        message: 'Token issuance found but no expiry / refresh-token logic detected — tokens without expiry are a security risk',
        severity: 'high', rule: 'intent:missing-token-expiry',
    },
    {
        domain: 'api', componentKey: 'input-validation', presentIn: 'api',
        message: 'API endpoints modified but no request validation library usage found — req.body must be validated',
        severity: 'high', rule: 'intent:missing-api-validation',
    },
    {
        domain: 'api', componentKey: 'error-handling', presentIn: 'api',
        message: 'API handlers added without consistent error handling — unhandled rejections will expose stack traces',
        severity: 'medium', rule: 'intent:missing-error-handling',
    },
    {
        domain: 'payment', componentKey: 'idempotency', presentIn: 'any',
        message: 'Payment logic added but no idempotency key handling found — duplicate charges possible without idempotency',
        severity: 'high', rule: 'intent:missing-payment-idempotency',
    },
    {
        domain: 'payment', componentKey: 'webhook-verification', presentIn: 'any',
        message: 'Payment webhook handling added but signature verification not found — unverified webhooks allow spoofing',
        severity: 'high', rule: 'intent:missing-webhook-verification',
    },
];
// ── Domain component lists (mirrors requirements.ts without circular import) ──
const DOMAIN_COMPONENTS = {
    auth: ['input-validation', 'token-generation', 'token-expiry', 'role-check', 'middleware-protection', 'password-hashing'],
    api: ['input-validation', 'error-handling', 'service-layer-separation', 'auth-middleware', 'response-schema'],
    payment: ['input-validation', 'idempotency', 'webhook-verification', 'error-handling', 'secure-data-handling'],
    database: ['transaction-handling', 'migration-safety', 'connection-pooling', 'input-sanitization'],
    security: ['input-sanitization', 'output-encoding', 'secret-management', 'cors-policy', 'https-enforcement'],
    notification: ['recipient-validation', 'retry-logic', 'template-validation', 'rate-limiting'],
    file: ['file-type-validation', 'size-limit-enforcement', 'filename-sanitization', 'access-control'],
};
// Components whose detection should be limited to api-layer file content
const API_SCOPED_COMPONENTS = new Set([
    'error-handling', 'service-layer-separation', 'auth-middleware', 'response-schema',
]);
// ── Core helpers ──────────────────────────────────────────────────────────────
function filesOfLayer(index, layer) {
    return [...index.values()].filter((m) => m.layer === layer);
}
function allAddedContent(files) {
    return files.map((f) => f.addedContent).join('\n');
}
// ── Component detection (file-level) ─────────────────────────────────────────
/**
 * For each component key: scan every file in the index and record which files
 * contain a strong or weak signal.  Returns the component→files map and a
 * quality level per detected component.
 */
function detectComponents(domains, index, effectiveApiFiles) {
    const componentMap = {};
    const componentQuality = {};
    const allFiles = [...index.values()];
    for (const domain of domains) {
        const keys = DOMAIN_COMPONENTS[domain] ?? [];
        for (const key of keys) {
            const signals = COMPONENT_SIGNALS[key];
            if (!signals)
                continue;
            const searchFiles = API_SCOPED_COMPONENTS.has(key) ? effectiveApiFiles : allFiles;
            const foundInFiles = [];
            let quality = 'weak';
            for (const file of searchFiles) {
                const content = file.addedContent;
                if (!content)
                    continue;
                const hasStrong = signals.strong.some((re) => re.test(content));
                const hasWeak = signals.weak.some((re) => re.test(content));
                if (hasStrong) {
                    foundInFiles.push(file.path);
                    quality = 'strong';
                }
                else if (hasWeak && !foundInFiles.includes(file.path)) {
                    foundInFiles.push(file.path);
                    // quality stays 'weak' unless strong found elsewhere
                }
            }
            if (foundInFiles.length > 0) {
                componentMap[key] = foundInFiles;
                componentQuality[key] = quality;
            }
        }
    }
    return { componentMap, componentQuality };
}
// ── Public API ────────────────────────────────────────────────────────────────
function matchIntentToCode(intent, index) {
    if (intent.domains.length === 0 || index.size === 0) {
        return { intentIssues: [], checkedDomains: [], componentMap: {}, componentQuality: {}, foundComponents: {} };
    }
    const issues = [];
    const domainSet = new Set(intent.domains);
    // ── 1. Misplaced logic ───────────────────────────────────────────────────
    for (const rule of LAYER_RULES) {
        if (!rule.bannedDomains.some((d) => domainSet.has(d)))
            continue;
        const uiFiles = filesOfLayer(index, 'ui');
        const offenders = uiFiles.filter((f) => rule.signal.test(f.addedContent));
        if (offenders.length > 0) {
            issues.push({
                type: 'misplaced',
                message: rule.message(offenders.map((f) => f.path).join(', ')),
                files: offenders.map((f) => f.path),
                severity: 'high',
                rule: rule.rule,
            });
        }
    }
    // ── 2. Content views ─────────────────────────────────────────────────────
    const apiFiles = filesOfLayer(index, 'api');
    const effectiveApiFiles = apiFiles.length > 0
        ? apiFiles
        : [...index.values()].filter((m) => /\bapi\b|\bauth\b|\broute\b|\bhandler\b|\bcontroller\b/i.test(m.path));
    const apiContent = allAddedContent(effectiveApiFiles);
    const allContent = allAddedContent([...index.values()]);
    const allPaths = [...index.keys()].map((p) => p.toLowerCase()).join(' ');
    const AUTH_PATH_SIGNAL = /\bauth\b|\blogin\b|\bsignup\b|\bregister\b|\btoken\b|\bjwt\b/i;
    // ── 3. Missing expected behavior ─────────────────────────────────────────
    for (const check of MISSING_CHECKS) {
        if (!domainSet.has(check.domain))
            continue;
        const searchContent = check.presentIn === 'api' ? apiContent : allContent;
        if (!searchContent.trim() && !allPaths)
            continue;
        const hasDomainCode = domainSet.has('auth')
            ? DOMAIN_PRESENCE_SIGNALS.auth.some((re) => re.test(allContent)) ||
                AUTH_PATH_SIGNAL.test(allPaths) ||
                AUTH_PATH_SIGNAL.test(allContent)
            : true;
        if (!hasDomainCode)
            continue;
        const componentSignals = COMPONENT_SIGNALS[check.componentKey];
        const allSignals = componentSignals
            ? [...componentSignals.strong, ...componentSignals.weak]
            : [];
        const isPresent = allSignals.length > 0
            ? allSignals.some((re) => re.test(searchContent))
            : false;
        if (!isPresent) {
            let issueFiles;
            if (check.presentIn === 'api') {
                issueFiles = effectiveApiFiles.map((f) => f.path);
            }
            else {
                const domainKeyRe = new RegExp(`\\b${check.domain}\\b`, 'i');
                const domainFiles = [...index.values()].filter((m) => domainKeyRe.test(m.path)).map((m) => m.path);
                issueFiles = domainFiles.length > 0 ? domainFiles : [...index.keys()];
            }
            issues.push({
                type: 'missing',
                message: check.message,
                files: issueFiles && issueFiles.length > 0 ? issueFiles : undefined,
                severity: check.severity,
                rule: check.rule,
            });
        }
    }
    // ── 4. Partial auth — login without token issuance ────────────────────────
    if (domainSet.has('auth')) {
        const hasLogin = /\b(login|signin|signIn|authenticate)\b/.test(allContent);
        const hasTokenIssue = /\bjwt\.sign\b|\bcreateToken\b|\bgenerateToken\b/.test(allContent);
        const hasPasswordCheck = /\bbcrypt\.compare\b|\bverifyPassword\b/.test(allContent);
        if (hasLogin && hasPasswordCheck && !hasTokenIssue) {
            issues.push({
                type: 'partial',
                message: 'Login flow with password verification found but no token issuance (jwt.sign / createToken) detected — authentication may be incomplete',
                severity: 'medium',
                rule: 'intent:partial-auth-no-token',
            });
        }
    }
    // ── 5. Component detection ────────────────────────────────────────────────
    const { componentMap, componentQuality } = detectComponents(intent.domains, index, effectiveApiFiles);
    // Build legacy foundComponents (domain → string[]) for backward compat
    const foundComponents = {};
    for (const domain of intent.domains) {
        foundComponents[domain] = (DOMAIN_COMPONENTS[domain] ?? []).filter((k) => k in componentMap);
    }
    // Downgrade quality: components with only weak signals → add to issues only
    // if quality is weak AND the component is present (don't double-flag as missing)
    for (const [key, quality] of Object.entries(componentQuality)) {
        if (quality === 'weak') {
            // Weak signal — component considered "found" but mark in quality map
            // (coverage.ts will reduce confidence for domains with many weak components)
        }
    }
    // De-duplicate issues by rule
    const seen = new Set();
    const deduped = issues.filter((issue) => {
        if (seen.has(issue.rule))
            return false;
        seen.add(issue.rule);
        return true;
    });
    return { intentIssues: deduped, checkedDomains: intent.domains, componentMap, componentQuality, foundComponents };
}
//# sourceMappingURL=matcher.js.map