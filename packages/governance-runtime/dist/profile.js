"use strict";
/**
 * Repo Governance Profile — V0 composer.
 *
 * Derives a deterministic, metadata-only profile from:
 *   - the repo file tree (paths only, no content)
 *   - CODEOWNERS content (optional)
 *   - manifest content snippets (package.json / pyproject.toml / etc.)
 *
 * No source files are read. No network calls. Same inputs → same profileHash.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_REPO_SYMBOL_DUPLICATE_MODE = exports.DEFAULT_RUNTIME_LOCAL_MODE = exports.DEFAULT_PLAN_CONTROL_MODE = exports.DEFAULT_PLAN_COHERENCE_MODE = void 0;
exports.ownersForPath = ownersForPath;
exports.buildRepoGovernanceProfile = buildRepoGovernanceProfile;
exports.checkFileBoundary = checkFileBoundary;
const node_crypto_1 = require("node:crypto");
const micromatch_1 = __importDefault(require("micromatch"));
const architecture_obligations_1 = require("./architecture-obligations");
const runtime_safety_kernel_1 = require("./runtime-safety-kernel");
const architecture_graph_1 = require("./architecture-graph");
const repository_topology_1 = require("./repository-topology");
exports.DEFAULT_PLAN_COHERENCE_MODE = 'warn';
var runtime_safety_kernel_2 = require("./runtime-safety-kernel");
Object.defineProperty(exports, "DEFAULT_PLAN_CONTROL_MODE", { enumerable: true, get: function () { return runtime_safety_kernel_2.DEFAULT_PLAN_CONTROL_MODE; } });
exports.DEFAULT_RUNTIME_LOCAL_MODE = 'advisory';
exports.DEFAULT_REPO_SYMBOL_DUPLICATE_MODE = 'warn';
// ── Security token map ────────────────────────────────────────────────────────
//
// Conservative: tokens are matched WHOLE against path-segment parts only.
// A segment like "auth_service" splits into ["auth","service"] → "auth" matches.
// A segment like "tokenizer" splits into ["tokenizer"] → no token matches.
//
// Deliberately excluded (too noisy as filename stems):
//   session  — common across non-auth code (session_store, session_manager…)
//   token    — tokenizer, tokenize, access_token in non-auth paths
//   login    — login_form in UI code; not always a sensitive boundary
//   signin   — same reason as login
//   charge   — electrical charge, no-charge, surcharge
//   invoice  — document generation, not always payments
//
// These are still caught when they appear as DIRECTORY names or as part of
// a recognized sensitive directory prefix (e.g. src/auth/ → auth boundary).
const SENSITIVE_TOKENS = {
    // auth
    auth: 'auth',
    oauth: 'auth',
    oidc: 'auth',
    sso: 'auth',
    jwt: 'auth',
    // crypto
    crypto: 'crypto',
    cryptography: 'crypto',
    encryption: 'crypto',
    cipher: 'crypto',
    // secrets
    secret: 'secrets',
    secrets: 'secrets',
    credential: 'secrets',
    credentials: 'secrets',
    vault: 'secrets',
    keystore: 'secrets',
    // payments
    payment: 'payments',
    payments: 'payments',
    billing: 'payments',
    checkout: 'payments',
    stripe: 'payments',
    // migrations
    migration: 'migrations',
    migrations: 'migrations',
    alembic: 'migrations',
    flyway: 'migrations',
    // security
    security: 'security',
};
/**
 * Return the security tag for a raw path segment using CONSERVATIVE matching.
 *
 * Rules:
 *  1. Split the segment by [-_] separators (after stripping file extension).
 *  2. Require an EXACT match of a part against a known token.
 *  3. No substring/includes matching — "tokenizer" must not match "token".
 *
 * Examples:
 *   "auth"             → 'auth'   ✓  (exact)
 *   "auth_service"     → 'auth'   ✓  (split: ["auth","service"])
 *   "oauth2"           → null     ✓  (split: ["oauth2"] — no exact match; "oauth2"≠"oauth")
 *   "tokenizer.py"     → null     ✓  (split: ["tokenizer"] — no exact match)
 *   "session_manager"  → null     ✓  (split: ["session","manager"] — "session" not in map)
 *   "billing"          → 'payments' ✓
 *   "charge.py"        → null     ✓  (excluded from map)
 */
function tagForSegment(rawSeg) {
    // Strip file extension, lowercase
    const stem = rawSeg.replace(/\.[^.]+$/, '').toLowerCase();
    // Split by separators; each part must exactly match a token
    const parts = stem.split(/[-_]/);
    for (const part of parts) {
        const tag = SENSITIVE_TOKENS[part];
        if (tag)
            return tag;
    }
    return null;
}
/**
 * Walk each segment of a path and return the first security tag found.
 * Checks directory segments first (they are higher-signal), then filename.
 */
function securityTagForPath(rawPath) {
    const segments = rawPath.split('/');
    for (const seg of segments) {
        const tag = tagForSegment(seg);
        if (tag)
            return tag;
    }
    return null;
}
function detectStack(paths, manifestContent) {
    const ext = {};
    for (const p of paths) {
        const m = p.match(/\.([a-z0-9]+)$/i);
        if (m)
            ext[m[1].toLowerCase()] = (ext[m[1].toLowerCase()] || 0) + 1;
    }
    const total = paths.length || 1;
    const tsCount = (ext['ts'] || 0) + (ext['tsx'] || 0);
    const jsCount = (ext['js'] || 0) + (ext['jsx'] || 0);
    const pyCount = ext['py'] || 0;
    const goCount = ext['go'] || 0;
    const rsCount = ext['rs'] || 0;
    const javaCount = (ext['java'] || 0) + (ext['kt'] || 0);
    let lang = 'unknown';
    let framework = 'generic';
    let confidence = 0.5;
    const dominant = Math.max(tsCount, jsCount, pyCount, goCount, rsCount, javaCount);
    if (dominant === 0) {
        return { primaryLanguage: 'unknown', frameworkEcosystem: 'generic', confidence: 0.2 };
    }
    if (dominant === tsCount || dominant === jsCount) {
        lang = tsCount > jsCount ? 'TypeScript' : 'JavaScript';
        confidence = Math.min(0.95, (tsCount + jsCount) / total + 0.4);
        if (manifestContent) {
            if (manifestContent.includes('"next"') || manifestContent.includes('"nextjs"'))
                framework = 'Next.js';
            else if (manifestContent.includes('"react"'))
                framework = 'React';
            else if (manifestContent.includes('"fastify"'))
                framework = 'Fastify';
            else if (manifestContent.includes('"express"'))
                framework = 'Express';
            else if (manifestContent.includes('"@nestjs'))
                framework = 'NestJS';
            else
                framework = 'Node.js';
        }
        else {
            framework = 'Node.js';
        }
    }
    else if (dominant === pyCount) {
        lang = 'Python';
        confidence = Math.min(0.95, pyCount / total + 0.4);
        if (manifestContent) {
            if (manifestContent.includes('fastapi') || manifestContent.includes('FastAPI'))
                framework = 'FastAPI';
            else if (manifestContent.includes('django'))
                framework = 'Django';
            else if (manifestContent.includes('flask'))
                framework = 'Flask';
            else if (manifestContent.includes('celery'))
                framework = 'Celery';
            else if (manifestContent.includes('airflow'))
                framework = 'Airflow';
            else
                framework = 'Python';
        }
        else {
            framework = 'Python';
        }
    }
    else if (dominant === goCount) {
        lang = 'Go';
        confidence = Math.min(0.95, goCount / total + 0.4);
        framework = 'Go';
    }
    else if (dominant === rsCount) {
        lang = 'Rust';
        confidence = Math.min(0.95, rsCount / total + 0.4);
        framework = 'Rust';
    }
    else if (dominant === javaCount) {
        lang = (ext['kt'] ?? 0) > (ext['java'] ?? 0) ? 'Kotlin' : 'Java';
        confidence = Math.min(0.95, javaCount / total + 0.4);
        framework = 'JVM';
    }
    return { primaryLanguage: lang, frameworkEcosystem: framework, confidence };
}
// ── CODEOWNERS parser ─────────────────────────────────────────────────────────
function parseCodeowners(content) {
    const rules = [];
    for (const raw of content.split('\n')) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line)
            continue;
        const parts = line.split(/\s+/);
        const glob = parts[0];
        const owners = parts.slice(1).filter((o) => o.startsWith('@') || o.includes('@'));
        if (glob && owners.length > 0)
            rules.push({ glob, owners });
    }
    return rules;
}
/** Return the owners for a path, applying GitHub CODEOWNERS semantics (last rule wins). */
function ownersForPath(path, rules) {
    let matched = [];
    for (const rule of rules) {
        let pattern = rule.glob.startsWith('/') ? rule.glob.slice(1) : rule.glob;
        if (pattern.endsWith('/'))
            pattern += '**';
        if (!pattern.includes('*')) {
            if (path === pattern || path.startsWith(pattern + '/')) {
                matched = rule.owners;
                continue;
            }
        }
        if (micromatch_1.default.isMatch(path, pattern, { dot: true, nocase: true })) {
            matched = rule.owners;
        }
    }
    return matched;
}
// ── Sensitive boundary extraction ────────────────────────────────────────────
function deriveSensitiveBoundaries(paths) {
    const seen = new Map();
    for (const p of paths) {
        const segments = p.split('/');
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const tag = tagForSegment(seg);
            if (!tag)
                continue;
            // Anchor to the directory containing the triggering segment.
            // If the triggering segment is the filename (last), use its parent directory.
            const isFilename = i === segments.length - 1 && seg.includes('.');
            const dirEnd = isFilename ? i : i + 1;
            const dir = segments.slice(0, dirEnd).join('/');
            const dirGlob = dir ? dir + '/**' : isFilename ? p : '**';
            if (!seen.has(dirGlob))
                seen.set(dirGlob, tag);
            break; // stop at the first (shallowest) match per path
        }
    }
    return Array.from(seen.entries())
        .map(([glob, tag]) => ({ glob, tag }))
        .sort((a, b) => a.glob.localeCompare(b.glob));
}
// ── Approval-required derivation ─────────────────────────────────────────────
//
// V0 rule: a path is approval-required when it is sensitive AND (owned OR
// is a migration). Sensitive-but-unowned paths are still sensitive (warn/block
// based on scope) but don't require the approval gate.
function deriveApprovalRequired(sensitive, ownership, paths) {
    const required = new Set();
    if (ownership.length === 0) {
        // No CODEOWNERS — all sensitive paths require approval (nobody to delegate to)
        for (const s of sensitive)
            required.add(s.glob);
    }
    else {
        for (const sb of sensitive) {
            const prefix = sb.glob.replace('/**', '');
            const underBoundary = paths.filter((p) => p.startsWith(prefix + '/') || p === prefix);
            const anyOwned = underBoundary.some((p) => ownersForPath(p, ownership).length > 0);
            if (anyOwned)
                required.add(sb.glob);
        }
    }
    // Migrations are always approval-required regardless of ownership
    for (const p of paths) {
        if (/migrat/i.test(p)) {
            const dir = p.split('/').slice(0, -1).join('/');
            if (dir)
                required.add(dir + '/**');
        }
    }
    return Array.from(required).sort();
}
// ── Unowned percentage ────────────────────────────────────────────────────────
function computeUnownedPercent(paths, ownership) {
    if (ownership.length === 0)
        return 100;
    const sourcePaths = paths.filter((p) => /\.(ts|tsx|js|jsx|py|go|rs|java|kt|rb|php|cs|cpp|c|h)$/.test(p));
    if (sourcePaths.length === 0)
        return 0;
    const unowned = sourcePaths.filter((p) => ownersForPath(p, ownership).length === 0);
    return Math.round((unowned.length / sourcePaths.length) * 100);
}
// ── Readiness ─────────────────────────────────────────────────────────────────
function computeReadiness(stack, ownership, sensitive, paths) {
    const reasons = [];
    let score = 0;
    score += Math.round(stack.confidence * 40);
    if (stack.confidence < 0.4)
        reasons.push('stack confidence low — add a manifest file');
    if (ownership.length > 0) {
        score += 30;
    }
    else {
        reasons.push('no CODEOWNERS — add one to enable ownership-based governance');
    }
    if (sensitive.length > 0) {
        score += 20;
    }
    else if (paths.length > 0) {
        reasons.push('no sensitive boundaries detected — profile may be incomplete for this repo');
    }
    if (paths.length >= 5)
        score += 10;
    else
        reasons.push('very few files found — run in a populated repo directory');
    const status = score >= 70 ? 'READY' : score >= 40 ? 'PARTIAL' : 'LOW';
    return { status, score: Math.min(100, score), reasons };
}
// ── Profile hash ──────────────────────────────────────────────────────────────
function computeProfileHash(paths, sensitive, ownership, runtimeConfig, architectureHash) {
    const canonical = JSON.stringify({
        paths: [...paths].sort(),
        sensitive: sensitive.map((s) => `${s.glob}:${s.tag}`).sort(),
        ownership: ownership.map((o) => `${o.glob}:${o.owners.sort().join(',')}`).sort(),
        runtimeConfig: canonicalRuntimeConfig(runtimeConfig),
        // Only present when a dependency graph was derived, so legacy
        // (no-imports) profiles keep a byte-identical canonical form + hash.
        ...(architectureHash ? { architecture: architectureHash } : {}),
    });
    return (0, node_crypto_1.createHash)('sha256').update(canonical).digest('hex').slice(0, 24);
}
function digestNullable(content) {
    if (content === null || content === undefined)
        return null;
    return (0, node_crypto_1.createHash)('sha256').update(content).digest('hex').slice(0, 24);
}
function normalizeGlobList(values) {
    if (!Array.isArray(values))
        return [];
    return Array.from(new Set(values
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim().replace(/^\.\//, '').replace(/\/+$/, ''))
        .filter(Boolean))).sort();
}
function normalizePlanCoherenceMode(value) {
    if (value === undefined || value === null || value === '') {
        return exports.DEFAULT_PLAN_COHERENCE_MODE;
    }
    return value === 'off' || value === 'warn' || value === 'block'
        ? value
        : exports.DEFAULT_PLAN_COHERENCE_MODE;
}
function normalizeRuntimeLocalMode(value) {
    if (value === undefined || value === null || value === '') {
        return exports.DEFAULT_RUNTIME_LOCAL_MODE;
    }
    return value === 'strict' || value === 'advisory' || value === 'paused'
        ? value
        : exports.DEFAULT_RUNTIME_LOCAL_MODE;
}
function normalizeRepoSymbolDuplicateMode(value) {
    if (value === undefined || value === null || value === '') {
        return exports.DEFAULT_REPO_SYMBOL_DUPLICATE_MODE;
    }
    return value === 'off' || value === 'warn' || value === 'block'
        ? value
        : exports.DEFAULT_REPO_SYMBOL_DUPLICATE_MODE;
}
function normalizeRuntimeConfig(input) {
    const runtimeSafetyPolicy = input?.runtimeSafetyPolicy
        ? (0, runtime_safety_kernel_1.parseRuntimeSafetyPolicyProfile)(input.runtimeSafetyPolicy)
        : undefined;
    return {
        approvalRequiredGlobs: normalizeGlobList(input?.approvalRequiredGlobs),
        sensitiveGlobs: normalizeGlobList(input?.sensitiveGlobs),
        safeSupportGlobs: normalizeGlobList(input?.safeSupportGlobs),
        ignoredGlobs: normalizeGlobList(input?.ignoredGlobs),
        planCoherence: normalizePlanCoherenceMode(input?.planCoherence),
        planMode: (0, runtime_safety_kernel_1.normalizePlanControlMode)(input?.planMode ?? runtimeSafetyPolicy?.planMode),
        ...(runtimeSafetyPolicy ? { runtimeSafetyPolicy } : {}),
        localMode: normalizeRuntimeLocalMode(input?.localMode),
        repoSymbolDuplicateMode: normalizeRepoSymbolDuplicateMode(input?.repoSymbolDuplicateMode),
        architectureObligations: (0, architecture_obligations_1.normalizeArchitectureObligationPolicy)(input?.architectureObligations),
    };
}
function canonicalRuntimeConfig(config) {
    const normalized = normalizeRuntimeConfig(config);
    return {
        approvalRequiredGlobs: normalized.approvalRequiredGlobs,
        sensitiveGlobs: normalized.sensitiveGlobs,
        safeSupportGlobs: normalized.safeSupportGlobs,
        ignoredGlobs: normalized.ignoredGlobs,
        ...(normalized.planCoherence && normalized.planCoherence !== exports.DEFAULT_PLAN_COHERENCE_MODE
            ? { planCoherence: normalized.planCoherence }
            : {}),
        ...(normalized.planMode && normalized.planMode !== runtime_safety_kernel_1.DEFAULT_PLAN_CONTROL_MODE
            ? { planMode: normalized.planMode }
            : {}),
        ...(normalized.runtimeSafetyPolicy
            ? { runtimeSafetyPolicy: normalized.runtimeSafetyPolicy }
            : {}),
        ...(normalized.localMode && normalized.localMode !== exports.DEFAULT_RUNTIME_LOCAL_MODE
            ? { localMode: normalized.localMode }
            : {}),
        ...(normalized.repoSymbolDuplicateMode && normalized.repoSymbolDuplicateMode !== exports.DEFAULT_REPO_SYMBOL_DUPLICATE_MODE
            ? { repoSymbolDuplicateMode: normalized.repoSymbolDuplicateMode }
            : {}),
        ...(normalized.architectureObligations
            && (normalized.architectureObligations.mode !== 'warn'
                || Object.keys(normalized.architectureObligations.ruleModes).length > 0)
            ? { architectureObligations: normalized.architectureObligations }
            : {}),
    };
}
function runtimeConfigDigest(config) {
    const canonical = canonicalRuntimeConfig(config);
    const hasEntries = Object.values(canonical).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
    if (!hasEntries)
        return null;
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 24);
}
function computeTopology(paths, codeownersContent, manifestContent, runtimeConfig, architectureHash) {
    const canonical = JSON.stringify({
        paths: [...paths].sort(),
        codeownersContent: codeownersContent ?? null,
        manifestContent: manifestContent ?? null,
        runtimeConfig: canonicalRuntimeConfig(runtimeConfig),
        // Conditional so legacy (no-imports) profiles keep the same topology hash;
        // when imports are supplied, changing the dependency graph invalidates it.
        ...(architectureHash ? { architecture: architectureHash } : {}),
    });
    return {
        hash: (0, node_crypto_1.createHash)('sha256').update(canonical).digest('hex').slice(0, 24),
        trackedFileCount: paths.length,
        codeownersHash: digestNullable(codeownersContent),
        manifestHash: digestNullable(manifestContent),
        governanceConfigHash: runtimeConfigDigest(runtimeConfig),
        ...(architectureHash ? { architectureHash } : {}),
    };
}
function mergeConfiguredSensitiveBoundaries(detected, config) {
    const byGlob = new Map();
    for (const boundary of detected)
        byGlob.set(boundary.glob, boundary);
    for (const glob of config.sensitiveGlobs) {
        if (!byGlob.has(glob))
            byGlob.set(glob, { glob, tag: 'custom' });
    }
    return Array.from(byGlob.values()).sort((a, b) => a.glob.localeCompare(b.glob));
}
function mergeConfiguredApprovalPaths(detected, config) {
    return Array.from(new Set([...detected, ...config.approvalRequiredGlobs])).sort();
}
// ── Main composer ─────────────────────────────────────────────────────────────
function buildRepoGovernanceProfile(input) {
    const { paths, codeownersContent, manifestContent, repoName, source } = input;
    const runtimeConfig = normalizeRuntimeConfig(input.runtimeConfig);
    const stack = detectStack(paths, manifestContent);
    const sensitiveBoundaries = mergeConfiguredSensitiveBoundaries(deriveSensitiveBoundaries(paths), runtimeConfig);
    const ownershipBoundaries = codeownersContent ? parseCodeowners(codeownersContent) : [];
    const approvalRequiredPaths = mergeConfiguredApprovalPaths(deriveApprovalRequired(sensitiveBoundaries, ownershipBoundaries, paths), runtimeConfig);
    const unownedPercent = computeUnownedPercent(paths, ownershipBoundaries);
    const readiness = computeReadiness(stack, ownershipBoundaries, sensitiveBoundaries, paths);
    // V2: derive the architecture dependency graph when import metadata is
    // supplied (source-free — only specifiers are passed in).
    const architecture = input.imports && input.imports.length > 0
        ? (0, architecture_graph_1.buildArchitectureGraph)({
            paths,
            ownershipBoundaries,
            sensitiveBoundaries,
            approvalRequiredGlobs: approvalRequiredPaths,
            imports: input.imports,
        })
        : undefined;
    const architectureHash = architecture?.architectureHash ?? null;
    const profileHash = computeProfileHash(paths, sensitiveBoundaries, ownershipBoundaries, runtimeConfig, architectureHash);
    const topology = computeTopology(paths, codeownersContent, manifestContent, runtimeConfig, architectureHash);
    const fallbackManifestPath = paths.find((pathValue) => /(^|\/)(package\.json|pyproject\.toml|setup\.py|setup\.cfg|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(?:\.kts)?|Gemfile|composer\.json|Package\.swift|pnpm-workspace\.yaml|lerna\.json|nx\.json|turbo\.json|rush\.json|workspace\.json)$/.test(pathValue));
    const topologyManifests = input.manifests && input.manifests.length > 0
        ? input.manifests
        : fallbackManifestPath
            ? [{ path: fallbackManifestPath, content: manifestContent }]
            : [];
    const repositoryTopology = (0, repository_topology_1.compileRepositoryTopology)({
        paths,
        manifests: topologyManifests,
        codeownersContent,
        protectedGlobs: [
            ...runtimeConfig.approvalRequiredGlobs,
            ...runtimeConfig.sensitiveGlobs,
        ],
        generatedEvidence: input.generatedEvidence,
        brain: input.brain,
        compiledAt: new Date().toISOString(),
    });
    topology.hash = architectureHash
        ? (0, node_crypto_1.createHash)('sha256')
            .update(JSON.stringify({
            repositoryTopology: repositoryTopology.artifactHash,
            architecture: architectureHash,
        }))
            .digest('hex')
            .slice(0, 24)
        : repositoryTopology.artifactHash;
    topology.trackedFileCount = repositoryTopology.trackedFileCount;
    const agentCompat = stack.confidence >= 0.5
        ? 'supported'
        : stack.primaryLanguage !== 'unknown'
            ? 'best-effort'
            : 'unsupported';
    return {
        schemaVersion: 1,
        repo: { name: repoName, source },
        topology,
        repositoryTopology,
        runtimeConfig,
        stack: {
            primaryLanguage: stack.primaryLanguage,
            frameworkEcosystem: stack.frameworkEcosystem,
            confidence: Math.round(stack.confidence * 100) / 100,
        },
        sensitiveBoundaries,
        ownershipBoundaries,
        approvalRequiredPaths,
        unownedPercent,
        agentCompatibility: { claudeCode: agentCompat },
        ...(architecture ? { architecture } : {}),
        profileHash,
        readiness,
        generatedAt: new Date().toISOString(),
    };
}
function checkFileBoundary(input) {
    const { filePath, allowedGlobs, ownershipRules, sensitiveGlobs, approvalRequiredGlobs, approvedPaths = [], approvalGrants = [], checkedAt, scopeMode = 'inferred', localMode = 'strict', } = input;
    // ── Scope check ──────────────────────────────────────────────────────────────
    const inScope = allowedGlobs.length === 0
        ? true
        : allowedGlobs.some((g) => micromatch_1.default.isMatch(filePath, g, { dot: true, matchBase: true }) ||
            filePath.startsWith(g.replace('/**', '').replace('/*', '') + '/') ||
            filePath === g.replace('/**', '').replace('/*', ''));
    const isSensitive = sensitiveGlobs.some((g) => matchesGlob(filePath, g));
    const isApprovalRequired = approvalRequiredGlobs.some((g) => matchesGlob(filePath, g));
    const owners = ownersForPath(filePath, ownershipRules);
    // ── Approval gate ────────────────────────────────────────────────────────────
    //
    // Approval-required paths ALWAYS block unless the session holds explicit approval.
    // When the path IS approved, treat it as effectively in-scope so the remainder
    // of the decision matrix can apply (sensitive warn / ok).
    const checkedAtMs = Date.parse(checkedAt || new Date().toISOString());
    const effectiveCheckedAtMs = Number.isFinite(checkedAtMs) ? checkedAtMs : Date.now();
    const activeGrantPaths = approvalGrants
        .filter((grant) => {
        if (!grant || typeof grant.path !== 'string' || !grant.path.trim())
            return false;
        if (grant.revokedAt)
            return false;
        if (!grant.expiresAt)
            return true;
        const expiresAtMs = Date.parse(grant.expiresAt);
        return Number.isFinite(expiresAtMs) && expiresAtMs > effectiveCheckedAtMs;
    })
        .map((grant) => grant.path);
    const candidateApprovedPaths = approvalGrants.length > 0 ? activeGrantPaths : approvedPaths;
    const expiredGrant = approvalGrants.find((grant) => {
        if (!grant || typeof grant.path !== 'string' || !grant.path.trim() || !grant.expiresAt || grant.revokedAt) {
            return false;
        }
        const expiresAtMs = Date.parse(grant.expiresAt);
        if (!Number.isFinite(expiresAtMs) || expiresAtMs > effectiveCheckedAtMs)
            return false;
        return (matchesGlob(filePath, grant.path) ||
            filePath.startsWith(grant.path.replace('/**', '').replace('/*', '') + '/') ||
            filePath === grant.path.replace('/**', '').replace('/*', ''));
    });
    // hasExplicitApproval is computed independently of isApprovalRequired so that
    // session approve can also unblock sensitive-but-not-approval-required paths.
    const hasExplicitApproval = candidateApprovedPaths.length > 0 &&
        candidateApprovedPaths.some((ap) => matchesGlob(filePath, ap) ||
            filePath.startsWith(ap.replace('/**', '').replace('/*', '') + '/') ||
            filePath === ap.replace('/**', '').replace('/*', ''));
    const isApproved = isApprovalRequired && hasExplicitApproval;
    if (isApprovalRequired && !isApproved) {
        const ownerNote = owners.length ? ` (owned by ${owners.join(', ')})` : '';
        const expiredNote = expiredGrant?.expiresAt ? ` Previous approval expired at ${expiredGrant.expiresAt}.` : '';
        return {
            verdict: 'block',
            inScope,
            isSensitive,
            isApprovalRequired,
            owners,
            message: `⏸ Neurcode: ${filePath} is in an approval-required boundary${ownerNote}. ` +
                `No approval on record for this session. ` +
                `Use neurcode_session_approve to approve this path, or narrow the task.` +
                expiredNote,
            options: ['narrow', 'replan'],
            blockType: 'approval_required_boundary',
            approvalContext: {
                blockedPath: filePath,
                approvalRequired: true,
                owners,
                // Suggest the exact file path as the tightest possible approval scope.
                // The human can approve a broader glob (e.g. src/billing/**) if they choose to.
                suggestedApprovalPath: filePath,
            },
        };
    }
    // When isApproved=true, the path is cleared to proceed — treat it as in-scope
    // for the remaining checks regardless of the allowedGlobs set.
    const effectivelyInScope = inScope || isApproved;
    // ── Scope violations (non-approval-required) ─────────────────────────────────
    if (!effectivelyInScope && owners.length > 0) {
        return {
            verdict: 'block',
            inScope,
            isSensitive,
            isApprovalRequired,
            owners,
            message: `⏸ Neurcode: ${filePath} is owned by ${owners.join(', ')} and outside the declared scope.`,
            options: ['narrow', 'replan'],
            blockType: 'scope_violation_or_task_expansion',
        };
    }
    if (!effectivelyInScope && isSensitive && !hasExplicitApproval) {
        const matchedGlob = sensitiveGlobs.find((g) => matchesGlob(filePath, g));
        return {
            verdict: 'block',
            inScope,
            isSensitive,
            isApprovalRequired,
            owners,
            message: `⏸ Neurcode: ${filePath} is a sensitive boundary (${matchedGlob}) and outside the declared scope.`,
            options: ['narrow', 'replan'],
            blockType: 'approval_required_boundary',
            approvalContext: {
                blockedPath: filePath,
                approvalRequired: true,
                owners,
                suggestedApprovalPath: filePath,
            },
        };
    }
    if (!effectivelyInScope) {
        const advisory = localMode === 'advisory'
            ? 'advisory mode'
            : localMode === 'paused'
                ? 'paused local hard-hook mode'
                : '';
        if (advisory) {
            return {
                verdict: 'warn',
                inScope,
                isSensitive,
                isApprovalRequired,
                owners,
                message: `⚠️ Neurcode: ${filePath} is outside the declared task scope. ` +
                    `Allowed in ${advisory}; record this as a task expansion and re-plan if it is intentional.`,
                options: ['continue', 'replan'],
                blockType: 'scope_violation_or_task_expansion',
            };
        }
        return {
            verdict: 'block',
            inScope,
            isSensitive,
            isApprovalRequired,
            owners,
            message: `⏸ Neurcode: ${filePath} is outside the declared scope for this task.`,
            options: ['narrow', 'replan'],
            blockType: 'scope_violation_or_task_expansion',
        };
    }
    // ── In-scope but sensitive — advisory warning ─────────────────────────────
    if (isSensitive) {
        const ownerNote = owners.length ? ` (owned by ${owners.join(', ')})` : '';
        return {
            verdict: 'warn',
            inScope,
            isSensitive,
            isApprovalRequired,
            owners,
            message: `⚠️ Neurcode: ${filePath} is sensitive${ownerNote}. Proceeding — recorded in session.`,
            options: ['continue'],
        };
    }
    // ── Clean pass ───────────────────────────────────────────────────────────────
    return {
        verdict: 'ok',
        inScope,
        isSensitive,
        isApprovalRequired,
        owners,
        message: '',
        options: ['continue'],
    };
}
function matchesGlob(filePath, glob) {
    const prefix = glob.replace('/**', '').replace('/*', '');
    if (filePath.startsWith(prefix + '/') || filePath === prefix)
        return true;
    return micromatch_1.default.isMatch(filePath, glob, { dot: true });
}
//# sourceMappingURL=profile.js.map