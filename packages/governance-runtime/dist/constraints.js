"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileDeterministicConstraints = compileDeterministicConstraints;
const PROHIBITIVE_PATTERN = /\b(no|do not|don't|without|avoid|ban|disallow|never|must not)\b/i;
const CONSTRAINT_TEMPLATES = [
    {
        id: 'no_useeffect',
        displayName: 'No useEffect',
        triggerTokens: ['useeffect'],
        pattern: /\buseEffect\s*\(/i,
        matchToken: 'useeffect',
    },
    {
        id: 'no_console_log',
        displayName: 'No console.log',
        triggerTokens: ['console.log', 'console log'],
        pattern: /\bconsole\.log\s*\(/i,
        matchToken: 'console.log',
    },
    {
        id: 'no_debugger',
        displayName: 'No debugger statements',
        triggerTokens: ['debugger'],
        pattern: /\bdebugger\b/i,
        matchToken: 'debugger',
    },
    {
        id: 'no_eval',
        displayName: 'No eval usage',
        triggerTokens: ['eval'],
        pattern: /\beval\s*\(/i,
        matchToken: 'eval',
    },
    {
        id: 'no_process_env',
        displayName: 'No process.env access',
        triggerTokens: ['process.env', 'process env'],
        pattern: /\bprocess\.env\b/i,
        matchToken: 'process.env',
    },
    {
        id: 'no_any_type',
        displayName: 'No any type',
        triggerTokens: [' any', 'type any', ': any', '<any>'],
        pattern: /(:\s*any\b|<\s*any\s*>|\bArray<any>\b|\bPromise<any>\b)/i,
        matchToken: 'any',
    },
    {
        id: 'no_todo_fixme',
        displayName: 'No TODO/FIXME markers',
        triggerTokens: ['todo', 'fixme'],
        pattern: /\b(TODO|FIXME)\b/i,
        matchToken: 'todo/fixme',
    },
    {
        id: 'no_network_calls',
        displayName: 'No network calls',
        triggerTokens: ['network call', 'network calls', 'http call', 'api call', 'external call'],
        pattern: /\b(fetch\s*\(|axios\.[a-z]+\s*\(|axios\s*\(|XMLHttpRequest\b|http\.request\s*\(|https\.request\s*\(|got\s*\(|superagent\s*\()/i,
        matchToken: 'network-call',
    },
    {
        id: 'no_child_process',
        displayName: 'No child_process execution',
        triggerTokens: ['child_process', 'shell command', 'exec(', 'spawn('],
        pattern: /\b(child_process|exec\s*\(|execFile\s*\(|spawn\s*\(|fork\s*\()/i,
        matchToken: 'child_process',
    },
    {
        id: 'no_innerhtml',
        displayName: 'No innerHTML / dangerouslySetInnerHTML',
        triggerTokens: ['innerhtml', 'dangerouslysetinnerhtml', 'dom injection'],
        pattern: /\b(innerHTML|dangerouslySetInnerHTML)\b/i,
        matchToken: 'innerHTML',
    },
];
function splitStatements(raw) {
    return raw
        .split(/[\n;]+/)
        .map((part) => part.trim())
        .filter(Boolean);
}
function normalizeStatement(statement) {
    return statement
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}
function normalizePathScopeToken(rawValue) {
    return rawValue
        .trim()
        .replace(/^[`'"]+|[`'"]+$/g, '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/\/{2,}/g, '/');
}
function looksLikePathScope(token) {
    if (!token)
        return false;
    if (/\s/.test(token))
        return false;
    if (token.includes('/'))
        return true;
    if (token.includes('*'))
        return true;
    return /\.[a-z0-9]{1,8}$/i.test(token);
}
function globLikeToRegex(pattern) {
    const escaped = pattern
        .split('*')
        .map((segment) => segment.replace(/[.+^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
    return new RegExp(`^${escaped}$`, 'i');
}
function compilePathPatterns(patterns) {
    return patterns
        .map((pattern) => {
        try {
            return globLikeToRegex(pattern);
        }
        catch {
            return null;
        }
    })
        .filter((item) => item instanceof RegExp);
}
function parsePathScopes(statement) {
    const includePatterns = new Set();
    const excludePatterns = new Set();
    const includeRegex = /\b(?:in|within|under|inside)\s+[`'"]?([A-Za-z0-9_./*?-]+)[`'"]?/gi;
    const excludeRegex = /\b(?:except|excluding|but\s+not\s+in|not\s+in)\s+[`'"]?([A-Za-z0-9_./*?-]+)[`'"]?/gi;
    for (const match of statement.matchAll(includeRegex)) {
        const candidate = normalizePathScopeToken(match[1] || '');
        if (looksLikePathScope(candidate)) {
            includePatterns.add(candidate);
        }
    }
    for (const match of statement.matchAll(excludeRegex)) {
        const candidate = normalizePathScopeToken(match[1] || '');
        if (looksLikePathScope(candidate)) {
            excludePatterns.add(candidate);
        }
    }
    return {
        includePatterns: [...includePatterns],
        excludePatterns: [...excludePatterns],
    };
}
function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
function buildProvenance(input) {
    const contributingGraphPaths = input.pathScopes.includePatterns.length > 0
        ? uniqueSorted(input.pathScopes.includePatterns)
        : ['<repo-scope>'];
    return {
        why: input.why,
        evidence: uniqueSorted(input.evidence),
        contributingGraphPaths,
        trustBoundaries: uniqueSorted(input.trustBoundaries),
    };
}
function applyPathScopes(rule, pathScopes) {
    const includePatterns = [...pathScopes.includePatterns];
    const excludePatterns = [...pathScopes.excludePatterns];
    return {
        ...rule,
        ...(includePatterns.length > 0
            ? {
                pathIncludePatterns: includePatterns,
                pathIncludes: compilePathPatterns(includePatterns),
            }
            : {}),
        ...(excludePatterns.length > 0
            ? {
                pathExcludePatterns: excludePatterns,
                pathExcludes: compilePathPatterns(excludePatterns),
            }
            : {}),
    };
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function parseInvocationLimitRule(statement, source, pathScopes) {
    const normalized = normalizeStatement(statement);
    const fnPatterns = [
        {
            regex: /\b([a-z_$][a-z0-9_$]*)\s+(?:function\s+)?(?:should\s+be\s+)?(?:invoked|called)\s+(?:only\s+)?(\d+)\s+times?\b/i,
            fnIndex: 1,
            countIndex: 2,
            comparator: 'max',
        },
        {
            regex: /\b([a-z_$][a-z0-9_$]*)\s+(?:function\s+)?(?:should\s+be\s+)?(?:invoked|called)\s+(?:at\s+most|no\s+more\s+than|maximum)\s+(\d+)\s+times?\b/i,
            fnIndex: 1,
            countIndex: 2,
            comparator: 'max',
        },
        {
            regex: /\b([a-z_$][a-z0-9_$]*)\s+(?:function\s+)?(?:should\s+be\s+)?(?:invoked|called)\s+(?:at\s+least|no\s+less\s+than|minimum)\s+(\d+)\s+times?\b/i,
            fnIndex: 1,
            countIndex: 2,
            comparator: 'min',
        },
        {
            regex: /\b([a-z_$][a-z0-9_$]*)\s+(?:function\s+)?(?:should\s+be\s+)?(?:invoked|called)\s+(?:exactly)\s+(\d+)\s+times?\b/i,
            fnIndex: 1,
            countIndex: 2,
            comparator: 'exact',
        },
        {
            regex: /\bonly\s+(\d+)\s+calls?\s+to\s+([a-z_$][a-z0-9_$]*)\b/i,
            fnIndex: 2,
            countIndex: 1,
            comparator: 'max',
        },
        {
            regex: /\bat\s+most\s+(\d+)\s+calls?\s+to\s+([a-z_$][a-z0-9_$]*)\b/i,
            fnIndex: 2,
            countIndex: 1,
            comparator: 'max',
        },
        {
            regex: /\bat\s+least\s+(\d+)\s+calls?\s+to\s+([a-z_$][a-z0-9_$]*)\b/i,
            fnIndex: 2,
            countIndex: 1,
            comparator: 'min',
        },
        {
            regex: /\bexactly\s+(\d+)\s+calls?\s+to\s+([a-z_$][a-z0-9_$]*)\b/i,
            fnIndex: 2,
            countIndex: 1,
            comparator: 'exact',
        },
    ];
    let fnName = null;
    let rawLimit = null;
    let comparator = 'max';
    for (const pattern of fnPatterns) {
        const match = normalized.match(pattern.regex);
        if (!match) {
            continue;
        }
        fnName = match[pattern.fnIndex] || null;
        rawLimit = match[pattern.countIndex] || null;
        comparator = pattern.comparator;
        break;
    }
    if (!fnName || !rawLimit) {
        return null;
    }
    const limit = Number(rawLimit);
    if (!Number.isFinite(limit) || limit < 0) {
        return null;
    }
    const repoScopeHint = /\b(across\s+(?:the\s+)?(?:repo|repository|codebase)|globally|in\s+the\s+entire\s+repo)\b/i.test(normalized);
    const displaySuffix = comparator === 'exact'
        ? `exactly ${limit}`
        : comparator === 'min'
            ? `at least ${limit}`
            : `at most ${limit}`;
    const minMatches = comparator === 'min' || comparator === 'exact' ? limit : undefined;
    const maxMatches = comparator === 'max' || comparator === 'exact' ? limit : undefined;
    return applyPathScopes({
        id: `${source}:${comparator}_invocations_${fnName.toLowerCase()}${repoScopeHint ? '_repo' : ''}`,
        source,
        statement,
        displayName: `${fnName}() invocation limit (${displaySuffix}${repoScopeHint ? ', repo-wide' : ''})`,
        pattern: new RegExp(`(?<!function\\s)\\b${escapeRegex(fnName)}\\s*\\(`, 'i'),
        matchToken: `${fnName}(`,
        ...(typeof minMatches === 'number' ? { minMatchesPerFile: minMatches } : {}),
        ...(typeof maxMatches === 'number' ? { maxMatchesPerFile: maxMatches } : {}),
        evaluationMode: 'full_file',
        evaluationScope: repoScopeHint ? 'repo' : 'file',
        provenance: buildProvenance({
            why: 'Statement imposes deterministic invocation cardinality limits.',
            evidence: [fnName, rawLimit, comparator, repoScopeHint ? 'repo-scope' : 'file-scope'],
            trustBoundaries: repoScopeHint ? ['cross-module'] : ['local-module'],
            pathScopes,
        }),
    }, pathScopes);
}
const EXPORTED_SIGNATURE_PATTERN = /\bexport\s+(?:async\s+)?function\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(|\bexport\s+const\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|\bexport\s+(?:interface|type)\s+[A-Za-z_$][A-Za-z0-9_$]*/i;
function parseSignatureDriftRule(statement, source, pathScopes) {
    const normalized = normalizeStatement(statement);
    const mentionsSignature = /\b(signature|contract|public api|api surface|exported api)\b/i.test(normalized);
    const mentionsChange = /\b(change|changed|modify|modified|drift|mutation|alter)\b/i.test(normalized);
    const prohibitive = PROHIBITIVE_PATTERN.test(normalized)
        || /\bkeep\b/i.test(normalized)
        || /\bpreserve\b/i.test(normalized);
    if (!mentionsSignature || !mentionsChange || !prohibitive) {
        return null;
    }
    return applyPathScopes({
        id: `${source}:no_api_signature_drift`,
        source,
        statement,
        displayName: 'No exported API signature drift',
        pattern: EXPORTED_SIGNATURE_PATTERN,
        matchToken: 'api-signature-drift',
        evaluationMode: 'signature_delta',
        evaluationScope: 'file',
        provenance: buildProvenance({
            why: 'Statement protects external API signature stability.',
            evidence: ['signature', 'public api', 'change/modify'],
            trustBoundaries: ['public-api', 'external-consumer'],
            pathScopes,
        }),
    }, pathScopes);
}
function parseBackwardCompatibilityRule(statement, source, pathScopes) {
    const normalized = normalizeStatement(statement);
    const mentionsCompatibility = /\b(backward compatibility|backwards compatibility|breaking change|non-breaking|existing consumers?)\b/i.test(normalized);
    if (!mentionsCompatibility) {
        return null;
    }
    return applyPathScopes({
        id: `${source}:backward_compatibility`,
        source,
        statement,
        displayName: 'Backward compatibility guard (public contract drift)',
        pattern: EXPORTED_SIGNATURE_PATTERN,
        matchToken: 'backward-compatibility',
        evaluationMode: 'signature_delta',
        evaluationScope: 'file',
        provenance: buildProvenance({
            why: 'Statement requires non-breaking compatibility guarantees for existing consumers.',
            evidence: ['backward compatibility', 'breaking change', 'existing consumers'],
            trustBoundaries: ['public-api', 'external-consumer'],
            pathScopes,
        }),
    }, pathScopes);
}
function parseAsyncOrderingRule(statement, source, pathScopes) {
    const normalized = normalizeStatement(statement);
    const mentionsOrdering = /\b(async ordering|message ordering|out of order|preserve order|ordered workflow|ordering guarantees?|fifo)\b/i.test(normalized);
    const mentionsParallelRisk = /\b(parallel|promise\.all|allsettled|race|fan-?out|parallelize)\b/i.test(normalized);
    if (!mentionsOrdering && !mentionsParallelRisk) {
        return null;
    }
    return applyPathScopes({
        id: `${source}:async_ordering`,
        source,
        statement,
        displayName: 'Async ordering guard (parallelization risk)',
        pattern: /\bPromise\.(?:all|allSettled|race|any)\s*\(|\bp-?map\s*\(|\bparallel(?:ize|Map)?\s*\(/i,
        matchToken: 'async-ordering',
        evaluationMode: 'added_lines',
        evaluationScope: 'file',
        provenance: buildProvenance({
            why: 'Statement flags async ordering sensitivity and blocks risky parallel fan-out patterns.',
            evidence: ['ordering', 'out of order', 'parallel execution'],
            trustBoundaries: ['async-workflow', 'downstream-capacity'],
            pathScopes,
        }),
    }, pathScopes);
}
function parseEventSchemaConsistencyRule(statement, source, pathScopes) {
    const normalized = normalizeStatement(statement);
    const mentionsEventSchema = /\b(event schema|event payload|event contract|subscriber|downstream event|schema evolution|required fields?)\b/i.test(normalized);
    if (!mentionsEventSchema) {
        return null;
    }
    return applyPathScopes({
        id: `${source}:event_schema_consistency`,
        source,
        statement,
        displayName: 'Event/schema consistency guard',
        pattern: /\b(?:interface|type)\s+[A-Za-z_$][A-Za-z0-9_$]*(?:Event|Payload|Message|Envelope)\b|\bevent[A-Za-z0-9_$]*\s*:\s*|\bschemaVersion\b/i,
        matchToken: 'event-schema-drift',
        evaluationMode: 'signature_delta',
        evaluationScope: 'file',
        provenance: buildProvenance({
            why: 'Statement requires event contract continuity for downstream consumers.',
            evidence: ['event schema', 'subscriber', 'required fields'],
            trustBoundaries: ['event-bus', 'external-subscriber'],
            pathScopes,
        }),
    }, pathScopes);
}
function parseMultiTenantIsolationRule(statement, source, pathScopes) {
    const normalized = normalizeStatement(statement);
    const mentionsTenantIsolation = /\b(multi-tenant|tenant isolation|cross-tenant|tenant boundaries?|tenant_id|tenant guard)\b/i.test(normalized);
    if (!mentionsTenantIsolation) {
        return null;
    }
    return applyPathScopes({
        id: `${source}:multi_tenant_isolation`,
        source,
        statement,
        displayName: 'Multi-tenant isolation guard',
        pattern: /\b(?:bypassTenant(?:Guard|Scope)?|ignoreTenant(?:Scope)?|crossTenant|allTenants|tenantScope\s*:\s*false|setTenantContext\s*\(\s*null\s*\)|withoutTenantScope)\b/i,
        matchToken: 'tenant-isolation',
        evaluationMode: 'full_file',
        evaluationScope: 'file',
        provenance: buildProvenance({
            why: 'Statement enforces tenant boundary safety and isolation constraints.',
            evidence: ['multi-tenant', 'tenant_id', 'cross-tenant'],
            trustBoundaries: ['tenant-boundary', 'data-access-layer'],
            pathScopes,
        }),
    }, pathScopes);
}
function parseCacheInvariantRule(statement, source, pathScopes) {
    const normalized = normalizeStatement(statement);
    const mentionsCache = /\b(cache invalidation|cache invariant|cache keys?|cache consistency|evict cache|clear(?:ing)? (?:shared )?cache|shared cache|invalidate .*cache)\b/i.test(normalized);
    if (!mentionsCache) {
        return null;
    }
    return applyPathScopes({
        id: `${source}:cache_invariant`,
        source,
        statement,
        displayName: 'Cache invariant guard (global invalidation risk)',
        pattern: /\b(?:cache\.(?:clear|reset)\s*\(\s*\)|invalidateAll\s*\(|flushAll\s*\(|redis\.flush(?:all|db)\s*\(|\bFLUSH(?:ALL|DB)\b)\b/i,
        matchToken: 'cache-invariant',
        evaluationMode: 'added_lines',
        evaluationScope: 'file',
        provenance: buildProvenance({
            why: 'Statement marks cache behavior as operationally sensitive and blocks global flush patterns.',
            evidence: ['cache invalidation', 'cache key', 'clear cache'],
            trustBoundaries: ['cache-layer', 'operational-safety'],
            pathScopes,
        }),
    }, pathScopes);
}
function parseIdempotencyRule(statement, source, pathScopes) {
    const normalized = normalizeStatement(statement);
    const mentionsIdempotency = /\b(idempotency|idempotent|retryable write|retries|exactly once|at-least-once)\b/i.test(normalized);
    if (!mentionsIdempotency) {
        return null;
    }
    return applyPathScopes({
        id: `${source}:idempotency`,
        source,
        statement,
        displayName: 'Idempotency expectation guard',
        pattern: /\b(?:idempotency[-_ ]key|x-idempotency-key|idempotencyKey|dedupe(?:Key|Id)?)\b/i,
        matchToken: 'idempotency-key',
        minMatchesPerFile: 1,
        evaluationMode: 'full_file',
        evaluationScope: 'repo',
        provenance: buildProvenance({
            why: 'Statement requires deterministic retry safety via idempotency markers.',
            evidence: ['idempotency', 'retryable write', 'exactly once'],
            trustBoundaries: ['api-edge', 'write-path'],
            pathScopes,
        }),
    }, pathScopes);
}
function parseMigrationSafetyRule(statement, source, pathScopes) {
    const normalized = normalizeStatement(statement);
    const mentionsMigration = /\b(migration safety|schema migration|destructive migration|drop column|drop table|truncate table|backfill safety)\b/i.test(normalized);
    if (!mentionsMigration) {
        return null;
    }
    return applyPathScopes({
        id: `${source}:migration_safety`,
        source,
        statement,
        displayName: 'Migration safety guard (destructive operation risk)',
        pattern: /\b(?:DROP\s+COLUMN|DROP\s+TABLE|TRUNCATE\s+TABLE|ALTER\s+TABLE\s+[A-Za-z0-9_`".]+\s+DROP\s+COLUMN|DELETE\s+FROM\s+[A-Za-z0-9_`".]+\s*;)\b/i,
        matchToken: 'destructive-migration',
        evaluationMode: 'added_lines',
        evaluationScope: 'file',
        provenance: buildProvenance({
            why: 'Statement requires non-destructive migration behavior for production safety.',
            evidence: ['migration safety', 'drop column', 'truncate table'],
            trustBoundaries: ['data-store', 'migration-pipeline'],
            pathScopes,
        }),
    }, pathScopes);
}
function statementMatchesTemplate(normalizedStatement, template) {
    return template.triggerTokens.some((token) => normalizedStatement.includes(token));
}
function createRule(template, source, statement, pathScopes) {
    return applyPathScopes({
        id: `${source}:${template.id}`,
        source,
        statement,
        displayName: template.displayName,
        pattern: template.pattern,
        matchToken: template.matchToken,
        provenance: buildProvenance({
            why: 'Statement matched deterministic constraint template.',
            evidence: template.triggerTokens,
            trustBoundaries: ['code-hygiene'],
            pathScopes,
        }),
    }, pathScopes);
}
function compileStatements(statements, source) {
    const rules = [];
    const unmatchedStatements = [];
    for (const rawStatement of statements) {
        const normalized = normalizeStatement(rawStatement);
        if (!normalized) {
            continue;
        }
        const pathScopes = parsePathScopes(rawStatement);
        const invocationLimitRule = parseInvocationLimitRule(rawStatement, source, pathScopes);
        if (invocationLimitRule) {
            rules.push(invocationLimitRule);
            continue;
        }
        const signatureDriftRule = parseSignatureDriftRule(rawStatement, source, pathScopes);
        if (signatureDriftRule) {
            rules.push(signatureDriftRule);
            continue;
        }
        const backwardCompatibilityRule = parseBackwardCompatibilityRule(rawStatement, source, pathScopes);
        if (backwardCompatibilityRule) {
            rules.push(backwardCompatibilityRule);
            continue;
        }
        const asyncOrderingRule = parseAsyncOrderingRule(rawStatement, source, pathScopes);
        if (asyncOrderingRule) {
            rules.push(asyncOrderingRule);
            continue;
        }
        const eventSchemaRule = parseEventSchemaConsistencyRule(rawStatement, source, pathScopes);
        if (eventSchemaRule) {
            rules.push(eventSchemaRule);
            continue;
        }
        const multiTenantRule = parseMultiTenantIsolationRule(rawStatement, source, pathScopes);
        if (multiTenantRule) {
            rules.push(multiTenantRule);
            continue;
        }
        const cacheInvariantRule = parseCacheInvariantRule(rawStatement, source, pathScopes);
        if (cacheInvariantRule) {
            rules.push(cacheInvariantRule);
            continue;
        }
        const idempotencyRule = parseIdempotencyRule(rawStatement, source, pathScopes);
        if (idempotencyRule) {
            rules.push(idempotencyRule);
            continue;
        }
        const migrationSafetyRule = parseMigrationSafetyRule(rawStatement, source, pathScopes);
        if (migrationSafetyRule) {
            rules.push(migrationSafetyRule);
            continue;
        }
        const requiresProhibitiveLanguage = source === 'intent';
        if (requiresProhibitiveLanguage && !PROHIBITIVE_PATTERN.test(normalized)) {
            continue;
        }
        const matches = CONSTRAINT_TEMPLATES.filter((template) => statementMatchesTemplate(normalized, template));
        if (matches.length === 0) {
            unmatchedStatements.push(rawStatement);
            continue;
        }
        for (const match of matches) {
            rules.push(createRule(match, source, rawStatement, pathScopes));
        }
    }
    return {
        rules,
        unmatchedStatements,
    };
}
function dedupeRules(rules) {
    const seen = new Set();
    const deduped = [];
    for (const rule of rules) {
        const key = [
            rule.id,
            rule.statement.toLowerCase(),
            rule.pathIncludePatterns?.join('|') || '',
            rule.pathExcludePatterns?.join('|') || '',
            typeof rule.minMatchesPerFile === 'number' ? String(rule.minMatchesPerFile) : '',
            typeof rule.maxMatchesPerFile === 'number' ? String(rule.maxMatchesPerFile) : '',
            rule.evaluationMode || '',
            rule.evaluationScope || '',
        ].join('::');
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(rule);
    }
    return deduped;
}
function compileDeterministicConstraints(input) {
    const intentStatements = splitStatements(input.intentConstraints || '');
    const policyStatements = (input.policyRules || [])
        .map((rule) => String(rule || '').trim())
        .filter(Boolean);
    const compiledIntent = compileStatements(intentStatements, 'intent');
    const compiledPolicy = compileStatements(policyStatements, 'policy');
    return {
        rules: dedupeRules([...compiledIntent.rules, ...compiledPolicy.rules]),
        unmatchedStatements: [...compiledIntent.unmatchedStatements, ...compiledPolicy.unmatchedStatements],
    };
}
//# sourceMappingURL=constraints.js.map