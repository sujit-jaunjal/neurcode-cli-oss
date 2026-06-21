"use strict";
/**
 * Repo Brain Impact Intelligence (V1) — deterministic + advisory change-impact
 * analysis over the source-free local repo brain.
 *
 * Given a changed file (or set of changed files) this module answers the
 * question an engineering manager actually asks about an AI change *before or
 * after* it lands: what does this touch, who owns it, what is sensitive, who
 * imports it, is it a hub, where are the nearby tests/docs, is the helper
 * duplicated elsewhere, and what should a reviewer ask?
 *
 * Hard rules (shared with utils/local-repo-brain.ts and utils/guided-eval.ts):
 *   - Source-free: only relative paths, symbol *names*, counts, owner tokens,
 *     sensitive-kind labels, and hashes are read or emitted. Never source code,
 *     diff hunks, or file bodies.
 *   - Honest labelling: every finding is tagged `deterministic` (a compiled
 *     path / CODEOWNERS / static-import-graph fact) or `advisory` (a heuristic
 *     reuse / proximity / reviewer-question signal). We never present an
 *     advisory signal as a deterministic guarantee.
 *
 * The engine is pure (no I/O) — {@link computeRepoBrainImpact} takes an artifact
 * (or null) and the changed paths. {@link buildRepoBrainImpactForRepo} is the
 * thin I/O wrapper that reads (or builds) the brain and then computes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HIGH_FAN_IN_THRESHOLD = exports.IMPACT_SUMMARY_SCHEMA_VERSION = exports.REPO_BRAIN_IMPACT_SCHEMA_VERSION = void 0;
exports.normalizeImpactPath = normalizeImpactPath;
exports.classifyImpactFileRole = classifyImpactFileRole;
exports.matchesCodeownersPattern = matchesCodeownersPattern;
exports.computeRepoBrainImpact = computeRepoBrainImpact;
exports.summarizeImpact = summarizeImpact;
exports.buildRepoBrainImpactForRepo = buildRepoBrainImpactForRepo;
exports.renderRepoBrainImpactText = renderRepoBrainImpactText;
const local_repo_brain_1 = require("./local-repo-brain");
exports.REPO_BRAIN_IMPACT_SCHEMA_VERSION = 'neurcode.repo-brain-impact.v1';
exports.IMPACT_SUMMARY_SCHEMA_VERSION = 'neurcode.impact-summary.v1';
/** A file imported by enough other files to be a structural hub. */
exports.HIGH_FAN_IN_THRESHOLD = 5;
// ── Path + classification helpers (deterministic) ─────────────────────────────
function normalizeImpactPath(value, projectRoot) {
    let p = String(value || '').trim().replace(/\\/g, '/');
    if (projectRoot) {
        const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
        if (p.startsWith(`${root}/`))
            p = p.slice(root.length + 1);
    }
    return p.replace(/^\.\//, '').replace(/^\/+/, '');
}
const TEST_PATTERNS = [/\/__tests__\//, /(^|\/)tests?\//, /\.test\.[cm]?[jt]sx?$/, /\.spec\.[cm]?[jt]sx?$/, /_test\.(py|go)$/, /(^|\/)test_[^/]+\.py$/];
const DOCS_PATTERNS = [/(^|\/)docs?\//, /\.mdx?$/, /(^|\/)readme/i, /(^|\/)changelog/i, /(^|\/)license/i];
const DATA_PATTERNS = [/\.(json|ya?ml|toml|csv|sql)$/];
function dirOf(path) {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? '' : path.slice(0, idx);
}
function baseName(path) {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? path : path.slice(idx + 1);
}
function stripExt(name) {
    const idx = name.indexOf('.');
    return idx === -1 ? name : name.slice(0, idx);
}
/**
 * Deterministically classify a file's role from its path + sensitive kinds.
 * Order matters: test > runtime_governance > config > docs > generated > data.
 */
function classifyImpactFileRole(path, opts = {}) {
    const lower = path.toLowerCase();
    const kinds = opts.sensitiveKinds ?? (0, local_repo_brain_1.sensitiveKindsFor)(path);
    if (TEST_PATTERNS.some((p) => p.test(lower)))
        return 'test';
    if (kinds.includes('runtime_governance'))
        return 'runtime_governance';
    if (DOCS_PATTERNS.some((p) => p.test(lower)))
        return 'docs';
    if (kinds.includes('configuration') || kinds.includes('dependency') || kinds.includes('workflow'))
        return 'config';
    if (opts.generated)
        return 'generated';
    if (/\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|rb|rs)$/.test(lower))
        return 'source';
    if (DATA_PATTERNS.some((p) => p.test(lower)))
        return 'data';
    return 'unknown';
}
// ── CODEOWNERS matching (deterministic, last-match-wins) ───────────────────────
/**
 * Faithful subset of gitignore/CODEOWNERS glob semantics, sufficient for the
 * common enterprise patterns: `src/billing/`, `*.py`, `/.github/workflows/`,
 * `packages/cli/`, `docs/*`, `apps/web/**`, and exact file paths.
 */
function matchesCodeownersPattern(filePath, pattern) {
    let p = String(pattern || '').trim();
    if (!p)
        return false;
    const anchored = p.startsWith('/');
    if (anchored)
        p = p.slice(1);
    const dirOnly = p.endsWith('/');
    if (dirOnly)
        p = p.replace(/\/+$/, '');
    if (!p)
        return false;
    const hasGlob = /[*?]/.test(p);
    if (!hasGlob) {
        // Bare path or directory: matches that path or anything beneath it.
        if (filePath === p)
            return !dirOnly; // a trailing-slash pattern only matches things *under* the dir
        return filePath === p || filePath.startsWith(`${p}/`);
    }
    let body = '';
    for (let i = 0; i < p.length; i += 1) {
        const c = p[i];
        if (c === '*') {
            if (p[i + 1] === '*') {
                body += '.*';
                i += 1;
                if (p[i + 1] === '/')
                    i += 1;
            }
            else {
                body += '[^/]*';
            }
        }
        else if (c === '?') {
            body += '[^/]';
        }
        else if ('+.^$()[]{}|\\'.includes(c)) {
            body += `\\${c}`;
        }
        else {
            body += c;
        }
    }
    const prefix = anchored || p.includes('/') ? '^' : '(^|/)';
    const suffix = dirOnly ? '/' : '(/|$)';
    try {
        return new RegExp(`${prefix}${body}${suffix}`).test(dirOnly ? `${filePath}/` : filePath);
    }
    catch {
        return false;
    }
}
// ── Core computation ──────────────────────────────────────────────────────────
const EMPTY_ROLE_COUNTS = () => ({
    source: 0,
    test: 0,
    docs: 0,
    config: 0,
    runtime_governance: 0,
    generated: 0,
    data: 0,
    unknown: 0,
});
const DETERMINISTIC_LABELS = [
    'changed-file classification (path, language, module, sensitive kind)',
    'CODEOWNERS owner routing (last-match-wins)',
    'sensitive surfaces (path heuristics encoded in the index)',
    'static relative-import consumers (fan-in)',
    'static relative-import dependencies (fan-out)',
    'high fan-out / hub status (import graph)',
];
const ADVISORY_LABELS = [
    'reuse / duplicate-helper findings (same-name or fingerprint resemblance)',
    'nearby tests / docs / config by directory proximity',
    'recommended reviewer questions',
];
function reuseWhyFlagged(input) {
    const symbol = input.symbolName ? `"${input.symbolName}"` : 'a source-free declaration fingerprint';
    const basis = input.kind === 'fingerprint_reuse'
        ? 'has a similar source-free token fingerprint'
        : 'uses the same declaration name';
    return `${symbol} ${basis} across ${input.files.length} file(s); reasons: ${input.reasonCodes.join(', ') || 'same-name/fingerprint resemblance'}.`;
}
function reuseCheckNext(confidence) {
    if (confidence === 'high') {
        return 'Compare callers, inputs, side effects, and ownership before extracting a shared helper.';
    }
    if (confidence === 'medium') {
        return 'Check whether the repeated name represents the same behavior before treating it as reusable.';
    }
    return 'Treat as a light review prompt only; same names can represent unrelated behavior.';
}
function buildImpactRadius(input) {
    const affectedRoles = Array.from(new Set([...input.changedFiles.map((f) => f.role), ...input.allConsumers.map((c) => c.role)])).sort();
    const configImpact = {
        configuration: input.changedFiles.filter((f) => f.sensitiveKinds.includes('configuration')).map((f) => f.path),
        workflow: input.changedFiles.filter((f) => f.sensitiveKinds.includes('workflow')).map((f) => f.path),
        dependency: input.changedFiles.filter((f) => f.sensitiveKinds.includes('dependency')).map((f) => f.path),
        runtimeGovernance: input.changedFiles.filter((f) => f.sensitiveKinds.includes('runtime_governance')).map((f) => f.path),
    };
    const reasons = [];
    if (input.sensitiveKinds.length)
        reasons.push(`Sensitive surface(s): ${input.sensitiveKinds.join(', ')}`);
    if (input.routeTo.length)
        reasons.push(`CODEOWNERS route: ${input.routeTo.join(', ')}`);
    if (input.allConsumers.length)
        reasons.push(`${input.allConsumers.length} static importer(s) depend on the changed set`);
    if (input.isHighFanOut)
        reasons.push('High fan-in / hub signal is present');
    if (configImpact.workflow.length)
        reasons.push('CI/workflow configuration is touched');
    if (configImpact.dependency.length)
        reasons.push('Dependency manifest or lockfile is touched');
    if (configImpact.runtimeGovernance.length)
        reasons.push('Runtime governance surface is touched');
    if (input.likelyTests.length === 0 && input.changedFiles.some((f) => f.role === 'source')) {
        reasons.push('No likely tests were found for changed source files');
    }
    if (reasons.length === 0)
        reasons.push('No elevated structural signal was found in the source-free brain');
    const high = input.sensitiveKinds.length > 0 ||
        input.isHighFanOut ||
        configImpact.workflow.length > 0 ||
        configImpact.dependency.length > 0 ||
        configImpact.runtimeGovernance.length > 0;
    const medium = high || input.routeTo.length > 0 || input.allConsumers.length > 0 || input.likelyTests.length === 0;
    const riskLevel = high ? 'high' : medium ? 'medium' : 'low';
    const whyThisMatters = riskLevel === 'high'
        ? 'Reviewers should check owner authority, blast radius, rollout, and tests before merge.'
        : riskLevel === 'medium'
            ? 'Reviewers should check routed owners, importers, and likely tests before merge.'
            : 'The structural map suggests low blast radius, but reviewers should still verify behavior.';
    return {
        riskLevel,
        reasons,
        deterministic: {
            consumerCount: input.allConsumers.length,
            affectedRoles,
            reviewerOwners: input.routeTo,
            sensitiveKinds: input.sensitiveKinds,
            configImpact,
        },
        advisory: {
            likelyTests: input.likelyTests.slice(0, 12),
            whyThisMatters,
        },
    };
}
function computeRepoBrainImpact(artifact, requestedPaths, options = {}) {
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const maxConsumers = Math.max(1, options.maxConsumers ?? 40);
    const maxDependencies = Math.max(1, options.maxDependencies ?? 40);
    const maxReviewQuestions = Math.max(1, options.maxReviewQuestions ?? 10);
    const changedPaths = Array.from(new Set(requestedPaths.map((p) => normalizeImpactPath(p)).filter(Boolean))).sort();
    const changedSet = new Set(changedPaths);
    const brainStatus = options.brainStatus ?? (artifact ? 'found' : 'missing');
    const recoveryCommand = 'neurcode brain index';
    // ── changed-file classification ─────────────────────────────────────────────
    const fileByPath = new Map((artifact?.files ?? []).map((f) => [f.path, f]));
    const changedFiles = changedPaths.map((path) => {
        const file = fileByPath.get(path);
        if (file) {
            return {
                path,
                indexed: true,
                role: classifyImpactFileRole(path, { generated: file.generated, sensitiveKinds: file.sensitiveKinds }),
                language: file.language,
                module: file.module,
                sensitiveKinds: file.sensitiveKinds,
                symbolCount: file.symbolCount,
                importCount: file.importCount,
                generated: file.generated,
            };
        }
        const sensitiveKinds = (0, local_repo_brain_1.sensitiveKindsFor)(path);
        return {
            path,
            indexed: false,
            role: classifyImpactFileRole(path, { sensitiveKinds }),
            language: null,
            module: null,
            sensitiveKinds,
            symbolCount: null,
            importCount: null,
            generated: false,
        };
    });
    // ── owners (deterministic, last-match-wins) ─────────────────────────────────
    const boundaries = artifact?.ownerBoundaries ?? [];
    // effectiveOwnerByPath: the owners of the *last* matching boundary for each path.
    const effectiveOwnerByPath = new Map();
    for (const path of changedPaths) {
        for (const boundary of boundaries) {
            if (matchesCodeownersPattern(path, boundary.pattern)) {
                effectiveOwnerByPath.set(path, { pattern: boundary.pattern, owners: boundary.owners });
            }
        }
    }
    const matchAccumulator = new Map();
    for (const path of changedPaths) {
        for (const boundary of boundaries) {
            if (!matchesCodeownersPattern(path, boundary.pattern))
                continue;
            const key = `${boundary.pattern}|${boundary.owners.join(',')}`;
            const existing = matchAccumulator.get(key);
            const effective = effectiveOwnerByPath.get(path)?.pattern === boundary.pattern;
            if (existing) {
                if (!existing.matchedPaths.includes(path))
                    existing.matchedPaths.push(path);
                existing.effective = existing.effective || effective;
            }
            else {
                matchAccumulator.set(key, {
                    pattern: boundary.pattern,
                    owners: boundary.owners,
                    matchedPaths: [path],
                    effective,
                });
            }
        }
    }
    const ownerMatches = [...matchAccumulator.values()].sort((a, b) => Number(b.effective) - Number(a.effective) || a.pattern.localeCompare(b.pattern));
    const routeTo = Array.from(new Set([...effectiveOwnerByPath.values()].flatMap((e) => e.owners))).sort();
    const ownerStatus = (artifact?.summary.ownerBoundaryStatus ?? 'not_found') === 'found' && ownerMatches.length > 0
        ? 'found'
        : 'not_found';
    // ── sensitive surfaces (deterministic) ──────────────────────────────────────
    const sensitiveSurfaces = changedFiles
        .filter((f) => f.sensitiveKinds.length > 0)
        .map((f) => ({ path: f.path, kinds: f.sensitiveKinds }));
    const sensitiveKinds = Array.from(new Set(sensitiveSurfaces.flatMap((s) => s.kinds))).sort();
    // ── consumers (deterministic fan-in via resolved relative imports) ──────────
    const imports = artifact?.imports ?? [];
    const consumerMap = new Map();
    for (const edge of imports) {
        if (!edge.resolvedFile || !changedSet.has(edge.resolvedFile))
            continue;
        if (changedSet.has(edge.fromFile))
            continue; // a changed file importing another changed file is noise here
        const entry = consumerMap.get(edge.fromFile) ?? { edgeCount: 0, imports: new Set() };
        entry.edgeCount += 1;
        entry.imports.add(edge.resolvedFile);
        consumerMap.set(edge.fromFile, entry);
    }
    const allConsumers = [...consumerMap.entries()]
        .map(([path, entry]) => ({
        path,
        role: classifyImpactFileRole(path, { sensitiveKinds: fileByPath.get(path)?.sensitiveKinds }),
        edgeCount: entry.edgeCount,
        imports: [...entry.imports].sort().slice(0, 4),
    }))
        .sort((a, b) => b.edgeCount - a.edgeCount || a.path.localeCompare(b.path));
    const byRole = EMPTY_ROLE_COUNTS();
    for (const consumer of allConsumers)
        byRole[consumer.role] += 1;
    const direct = allConsumers.slice(0, maxConsumers);
    // ── dependencies (deterministic fan-out from the changed files) ─────────────
    const internalDepMap = new Map();
    const externalPackages = new Set();
    for (const edge of imports) {
        if (!changedSet.has(edge.fromFile))
            continue;
        if (edge.resolvedFile && !changedSet.has(edge.resolvedFile)) {
            internalDepMap.set(edge.resolvedFile, {
                target: edge.target,
                resolvedFile: edge.resolvedFile,
                external: false,
            });
        }
        else if (!edge.resolvedFile && edge.targetKind === 'package') {
            externalPackages.add(edge.target);
        }
    }
    const internalDeps = [...internalDepMap.values()].sort((a, b) => (a.resolvedFile ?? '').localeCompare(b.resolvedFile ?? ''));
    // ── high fan-out / hubs (deterministic) ─────────────────────────────────────
    const hotspotByPath = new Map((artifact?.hotspots ?? []).map((h) => [h.file, h]));
    const hotspots = changedPaths
        .map((path) => hotspotByPath.get(path))
        .filter((h) => Boolean(h))
        .map((h) => ({
        path: h.file,
        score: h.score,
        fanIn: h.importFanIn,
        fanOut: h.importFanOut,
        reasons: h.reasons,
        isHub: h.importFanIn >= exports.HIGH_FAN_IN_THRESHOLD,
    }))
        .sort((a, b) => b.score - a.score);
    const isHighFanOut = hotspots.some((h) => h.isHub) || allConsumers.length >= exports.HIGH_FAN_IN_THRESHOLD;
    // ── nearby tests / docs / config / runtime (advisory proximity) ─────────────
    const changedDirs = new Set(changedPaths.map(dirOf));
    const changedBaseNames = new Set(changedPaths.map((p) => stripExt(baseName(p)).toLowerCase()));
    const nearby = { tests: new Set(), docs: new Set(), config: new Set(), runtime: new Set() };
    for (const file of artifact?.files ?? []) {
        if (changedSet.has(file.path))
            continue;
        const sameDir = changedDirs.has(dirOf(file.path));
        const sameBase = changedBaseNames.has(stripExt(baseName(file.path)).toLowerCase());
        const role = classifyImpactFileRole(file.path, { generated: file.generated, sensitiveKinds: file.sensitiveKinds });
        // Tests: match by base name (foo.ts → foo.test.ts), not raw directory proximity —
        // a flat utils/ directory otherwise reports every sibling test as "nearby" (noise).
        if (role === 'test' && sameBase)
            nearby.tests.add(file.path);
        else if (role === 'docs' && sameDir)
            nearby.docs.add(file.path);
        else if (role === 'config' && sameDir)
            nearby.config.add(file.path);
        else if (role === 'runtime_governance' && sameDir)
            nearby.runtime.add(file.path);
    }
    const nearbyOut = {
        label: 'advisory',
        tests: [...nearby.tests].sort().slice(0, 12),
        docs: [...nearby.docs].sort().slice(0, 12),
        config: [...nearby.config].sort().slice(0, 12),
        runtime: [...nearby.runtime].sort().slice(0, 12),
    };
    // ── reuse / duplicate-helper advisories (advisory) ──────────────────────────
    const reuseAdvisories = (artifact?.reuseFindings ?? [])
        .filter((r) => r.files.some((f) => changedSet.has(f)))
        .slice(0, 12)
        .map((r) => ({
        symbolName: r.symbolName,
        kind: r.kind,
        severity: r.severity,
        confidence: r.confidence,
        files: r.files.slice(0, 8),
        reasonCodes: r.reasonCodes,
        whyFlagged: reuseWhyFlagged(r),
        checkNext: reuseCheckNext(r.confidence),
        semanticEquivalenceClaimed: false,
    }));
    // ── reviewer routing + questions ────────────────────────────────────────────
    const reviewFirst = Array.from(new Set([
        ...sensitiveSurfaces.map((s) => s.path),
        ...hotspots.filter((h) => h.isHub).map((h) => h.path),
        ...changedFiles.filter((f) => f.role === 'runtime_governance').map((f) => f.path),
    ])).sort();
    const likelyTests = Array.from(new Set([
        ...nearbyOut.tests,
        ...allConsumers.filter((c) => c.role === 'test').map((c) => c.path),
    ])).sort();
    const impactRadius = buildImpactRadius({
        changedFiles,
        routeTo,
        sensitiveKinds,
        allConsumers,
        isHighFanOut,
        hotspots,
        likelyTests,
    });
    const reviewQuestions = buildReviewQuestions({
        changedFiles,
        routeTo,
        sensitiveSurfaces,
        hotspots,
        consumers: allConsumers,
        nearbyTests: likelyTests,
        reuseAdvisories,
    }).slice(0, maxReviewQuestions);
    // ── proves / does not prove ─────────────────────────────────────────────────
    const proves = [
        `Classifies ${changedFiles.length} changed path(s) by language, module, and sensitive surface from the indexed brain.`,
        ownerStatus === 'found'
            ? `Routes CODEOWNERS ownership for the changed paths (${routeTo.join(', ') || 'no owners'}), last-match-wins.`
            : 'Reports that no CODEOWNERS boundary matched the changed paths (or none is indexed).',
        `Lists the ${allConsumers.length} file(s) that statically import the changed set via resolved relative imports (fan-in).`,
        `Lists the changed set's own resolved relative dependencies (${internalDeps.length} internal, ${externalPackages.size} external package target(s)).`,
    ];
    const doesNotProve = [
        'It does not prove the change is correct, safe, or free of regressions — these are structural facts, not a code review.',
        'Import edges are static and relative-only: dynamic imports, reflection, framework wiring, and cross-package (bare-specifier) references are NOT captured, so the consumer list can be incomplete.',
        'Reuse / duplicate-helper findings are advisory name/fingerprint resemblance and can be false positives — they do not prove the logic is actually shareable.',
        'Nearby tests/docs are directory-proximity hints, not proven coverage of the changed code.',
    ];
    const limitations = [
        'V1 is deterministic and source-free: no code bodies, diffs, or prompts are read or emitted.',
        'Symbol-level intelligence covers TS/JS/Python; other languages are classified at file/module granularity.',
        'CODEOWNERS matching implements a faithful subset of gitignore globbing (`*`, `**`, `?`, directory and exact patterns).',
        artifact ? `Brain artifact ${artifact.artifactHash.slice(0, 12)} indexed ${artifact.summary.filesIndexed} files.` : 'No brain artifact was available; run `neurcode brain index` for a full map.',
    ];
    return {
        schemaVersion: exports.REPO_BRAIN_IMPACT_SCHEMA_VERSION,
        generatedAt,
        brain: {
            status: brainStatus,
            artifactHash: artifact?.artifactHash ?? null,
            generatedAt: artifact?.generatedAt ?? null,
            filesIndexed: artifact?.summary.filesIndexed ?? null,
            ownerBoundaryStatus: artifact?.summary.ownerBoundaryStatus ?? null,
            recoveryCommand,
        },
        requestedPaths: changedPaths,
        changedFiles,
        owners: { label: 'deterministic', status: ownerStatus, matches: ownerMatches, routeTo },
        sensitiveSurfaces: { label: 'deterministic', surfaces: sensitiveSurfaces, kinds: sensitiveKinds },
        consumers: {
            label: 'deterministic',
            direct,
            total: allConsumers.length,
            truncated: allConsumers.length > direct.length,
            byRole,
        },
        dependencies: {
            label: 'deterministic',
            internal: internalDeps.slice(0, maxDependencies),
            externalPackages: [...externalPackages].sort(),
            truncated: internalDeps.length > maxDependencies,
        },
        highFanOut: { label: 'deterministic', hotspots, isHighFanOut },
        impactRadius,
        nearby: nearbyOut,
        reuse: { label: 'advisory', advisories: reuseAdvisories },
        reviewRouting: { owners: routeTo, reviewFirst },
        reviewQuestions,
        labels: { deterministic: DETERMINISTIC_LABELS, advisory: ADVISORY_LABELS },
        proves,
        doesNotProve,
        limitations,
    };
}
// ── Reviewer questions (advisory, derived deterministically from facts) ────────
const SENSITIVE_QUESTION = {
    auth: 'preserve every authentication/authorization check and not widen access',
    billing: 'remain idempotent and not double-charge, drop, or mis-attribute money',
    database: 'stay backward-compatible with existing rows and avoid a breaking schema change',
    migration: 'be reversible and safe to run against production data',
    workflow: 'keep CI/CD gates intact and not weaken required checks',
    secret: 'avoid logging, committing, or widening exposure of any secret',
    dependency: 'pin compatible versions and not pull in a breaking or unvetted dependency',
    configuration: 'be safe across every environment and not flip a production default',
    runtime_governance: 'preserve the runtime governance contract (fail-closed, owner boundaries, approval scope)',
};
function buildReviewQuestions(input) {
    const questions = [];
    if (input.routeTo.length > 0) {
        questions.push({
            category: 'owners',
            question: `Have the code owners (${input.routeTo.join(', ')}) reviewed or approved this change?`,
            rationale: 'CODEOWNERS routes review authority for the changed paths to these owners.',
        });
    }
    for (const surface of input.sensitiveSurfaces) {
        for (const kind of surface.kinds) {
            const expectation = SENSITIVE_QUESTION[kind];
            if (!expectation)
                continue;
            questions.push({
                category: 'sensitive',
                question: `${surface.path} is a ${kind} surface — does the change ${expectation}?`,
                rationale: `Path heuristics flagged a ${kind} surface; these changes carry outsized blast radius.`,
            });
        }
    }
    const hubs = input.hotspots.filter((h) => h.isHub);
    for (const hub of hubs) {
        questions.push({
            category: 'fanout',
            question: `${hub.path} is imported by ${hub.fanIn} file(s) — does the change preserve its public contract and signatures?`,
            rationale: 'High fan-in means a contract change here ripples to every importer.',
        });
    }
    if (hubs.length === 0 && input.consumers.length >= exports.HIGH_FAN_IN_THRESHOLD) {
        questions.push({
            category: 'fanout',
            question: `${input.consumers.length} file(s) import the changed set — were their call sites checked for breakage?`,
            rationale: 'Several static importers depend on the changed files.',
        });
    }
    for (const reuse of input.reuseAdvisories) {
        if (!reuse.symbolName)
            continue;
        questions.push({
            category: 'reuse',
            question: `A "${reuse.symbolName}" declaration also appears in ${reuse.files.filter((f) => !f.includes(reuse.symbolName ?? '')).slice(0, 3).join(', ') || reuse.files.slice(0, 3).join(', ')} — should this be shared instead of duplicated?`,
            rationale: `Advisory reuse signal (${reuse.confidence} confidence) — verify before assuming it is a true duplicate.`,
        });
    }
    // Tests that cover the change = nearby (base-name) tests PLUS test files that
    // statically import the changed set. Considering importers avoids the false
    // "no tests found" when a test already exercises the code.
    const testConsumers = input.consumers.filter((c) => c.role === 'test').map((c) => c.path);
    const knownTests = Array.from(new Set([...input.nearbyTests, ...testConsumers]));
    if (knownTests.length > 0) {
        questions.push({
            category: 'tests',
            question: `Were the tests covering this code (${knownTests.slice(0, 3).join(', ')}${knownTests.length > 3 ? ', …' : ''}) updated and run for this change?`,
            rationale: 'These test files import the changed code or sit beside it, so they most likely exercise the affected behavior.',
        });
    }
    else if (input.changedFiles.some((f) => f.role === 'source')) {
        questions.push({
            category: 'tests',
            question: 'No tests were found that import or sit beside the changed source files — should test coverage be added?',
            rationale: 'The brain found no test files by import edge, directory proximity, or matching base name.',
        });
    }
    if (input.changedFiles.some((f) => f.role === 'config')) {
        questions.push({
            category: 'config',
            question: 'This touches configuration or dependencies — does it need a coordinated rollout, version bump, or migration note?',
            rationale: 'Config/dependency changes often need out-of-band coordination beyond a code review.',
        });
    }
    if (questions.length === 0) {
        questions.push({
            category: 'general',
            question: 'No owners, sensitive surfaces, hubs, or nearby tests were detected — is this change as low-risk as the structural map suggests?',
            rationale: 'The brain found no elevated-risk structural signal; confirm nothing is missing from the index.',
        });
    }
    return questions;
}
// ── Compact summary projection (P1/P2/P3) ─────────────────────────────────────
function summarizeImpact(report) {
    const changedSymbols = report.changedFiles.reduce((sum, f) => sum + (f.symbolCount ?? 0), 0);
    return {
        schemaVersion: exports.IMPACT_SUMMARY_SCHEMA_VERSION,
        generatedAt: report.generatedAt,
        brainStatus: report.brain.status,
        artifactHash: report.brain.artifactHash,
        counts: {
            changedFiles: report.changedFiles.length,
            indexedChangedFiles: report.changedFiles.filter((f) => f.indexed).length,
            directConsumers: report.consumers.total,
            changedSymbols,
            sensitiveSurfaces: report.sensitiveSurfaces.surfaces.length,
            internalDependencies: report.dependencies.internal.length,
            externalPackages: report.dependencies.externalPackages.length,
            owners: report.owners.routeTo.length,
        },
        changedFiles: report.changedFiles.map((f) => ({
            path: f.path,
            role: f.role,
            module: f.module,
            sensitiveKinds: f.sensitiveKinds,
        })),
        owners: report.owners.routeTo,
        sensitiveSurfaces: report.sensitiveSurfaces.surfaces,
        deterministic: {
            directConsumers: report.consumers.direct.slice(0, 8).map((c) => ({ path: c.path, role: c.role, edgeCount: c.edgeCount })),
            highFanOut: report.highFanOut.hotspots.filter((h) => h.isHub).map((h) => ({ path: h.path, fanIn: h.fanIn })),
            isHighFanOut: report.highFanOut.isHighFanOut,
        },
        advisory: {
            reuse: report.reuse.advisories.slice(0, 6).map((r) => ({
                symbolName: r.symbolName,
                confidence: r.confidence,
                files: r.files.slice(0, 4),
                whyFlagged: r.whyFlagged,
                checkNext: r.checkNext,
                semanticEquivalenceClaimed: r.semanticEquivalenceClaimed,
            })),
            nearbyTests: report.nearby.tests.slice(0, 6),
        },
        impactRadius: report.impactRadius,
        reviewRouting: report.reviewRouting,
        reviewQuestions: report.reviewQuestions.map((q) => q.question),
        proves: report.proves,
        doesNotProve: report.doesNotProve,
    };
}
/**
 * Read the local repo brain (building it once when missing if autoBuild) and
 * compute the impact report for the given changed paths.
 */
function buildRepoBrainImpactForRepo(projectRoot, requestedPaths, options = {}) {
    const autoBuild = options.autoBuild ?? true;
    let artifact = (0, local_repo_brain_1.readLocalRepoBrain)(projectRoot);
    let status = artifact ? 'found' : 'missing';
    if (!artifact && autoBuild) {
        artifact = (0, local_repo_brain_1.buildLocalRepoBrain)(projectRoot);
        (0, local_repo_brain_1.writeLocalRepoBrain)(projectRoot, artifact);
        status = 'built';
    }
    const normalized = requestedPaths.map((p) => normalizeImpactPath(p, projectRoot));
    return computeRepoBrainImpact(artifact, normalized, { ...options, brainStatus: status });
}
// ── Human-readable renderer (CLI text output) ─────────────────────────────────
function renderRepoBrainImpactText(report) {
    const lines = [];
    const det = '[deterministic]';
    const adv = '[advisory]';
    lines.push('Repo Brain — Change Impact');
    lines.push(`Brain: ${report.brain.status}${report.brain.artifactHash ? ` (${report.brain.artifactHash.slice(0, 12)})` : ''} · files indexed: ${report.brain.filesIndexed ?? 'n/a'}`);
    lines.push(`Changed paths: ${report.requestedPaths.length}`);
    lines.push('');
    lines.push('Changed files');
    for (const f of report.changedFiles) {
        const sens = f.sensitiveKinds.length ? ` · sensitive: ${f.sensitiveKinds.join(', ')}` : '';
        lines.push(`  - ${f.path} [${f.role}]${f.indexed ? '' : ' (not indexed)'} · ${f.language ?? 'n/a'} · module ${f.module ?? 'n/a'}${sens}`);
    }
    lines.push('');
    lines.push(`Owners ${det} — route to: ${report.owners.routeTo.join(', ') || 'none'}`);
    for (const m of report.owners.matches) {
        lines.push(`  - ${m.pattern} → ${m.owners.join(', ')}${m.effective ? ' (effective)' : ''}`);
    }
    if (report.owners.matches.length === 0)
        lines.push('  - no CODEOWNERS boundary matched');
    lines.push('');
    lines.push(`Sensitive surfaces ${det}: ${report.sensitiveSurfaces.kinds.join(', ') || 'none'}`);
    for (const s of report.sensitiveSurfaces.surfaces)
        lines.push(`  - ${s.path}: ${s.kinds.join(', ')}`);
    lines.push('');
    lines.push(`Import consumers (fan-in) ${det}: ${report.consumers.total} file(s)${report.consumers.truncated ? ' (truncated)' : ''}`);
    for (const c of report.consumers.direct.slice(0, 12))
        lines.push(`  - ${c.path} [${c.role}] · ${c.edgeCount} edge(s)`);
    if (report.consumers.total === 0)
        lines.push('  - none found via resolved relative imports');
    lines.push('');
    lines.push(`Dependencies (fan-out) ${det}: ${report.dependencies.internal.length} internal, ${report.dependencies.externalPackages.length} external`);
    for (const d of report.dependencies.internal.slice(0, 8))
        lines.push(`  - ${d.resolvedFile}`);
    if (report.dependencies.externalPackages.length)
        lines.push(`  - packages: ${report.dependencies.externalPackages.slice(0, 12).join(', ')}`);
    lines.push('');
    lines.push(`High fan-out / hubs ${det}: ${report.highFanOut.isHighFanOut ? 'yes' : 'no'}`);
    for (const h of report.highFanOut.hotspots)
        lines.push(`  - ${h.path}: fan-in ${h.fanIn}, fan-out ${h.fanOut}${h.isHub ? ' (hub)' : ''} · ${h.reasons.join(', ')}`);
    lines.push('');
    lines.push(`Impact radius ${det}/${adv}: ${report.impactRadius.riskLevel}`);
    for (const reason of report.impactRadius.reasons.slice(0, 6))
        lines.push(`  - ${reason}`);
    if (report.impactRadius.advisory.likelyTests.length) {
        lines.push(`  - likely tests ${adv}: ${report.impactRadius.advisory.likelyTests.join(', ')}`);
    }
    const configImpact = report.impactRadius.deterministic.configImpact;
    const configTouched = [
        ...configImpact.configuration,
        ...configImpact.workflow,
        ...configImpact.dependency,
        ...configImpact.runtimeGovernance,
    ];
    if (configTouched.length)
        lines.push(`  - config/workflow/dependency impact: ${configTouched.slice(0, 8).join(', ')}`);
    lines.push('');
    lines.push(`Nearby files ${adv}`);
    if (report.nearby.tests.length)
        lines.push(`  - tests: ${report.nearby.tests.join(', ')}`);
    if (report.nearby.docs.length)
        lines.push(`  - docs: ${report.nearby.docs.join(', ')}`);
    if (report.nearby.config.length)
        lines.push(`  - config: ${report.nearby.config.join(', ')}`);
    if (report.nearby.runtime.length)
        lines.push(`  - runtime: ${report.nearby.runtime.join(', ')}`);
    if (!report.nearby.tests.length && !report.nearby.docs.length && !report.nearby.config.length && !report.nearby.runtime.length) {
        lines.push('  - none found by directory proximity');
    }
    lines.push('');
    lines.push(`Reuse / duplicate-helper advisories ${adv}`);
    for (const r of report.reuse.advisories) {
        lines.push(`  - ${r.symbolName ?? r.kind} (${r.confidence}) across ${r.files.join(', ')}`);
        lines.push(`    why: ${r.whyFlagged}`);
        lines.push(`    check next: ${r.checkNext}`);
    }
    if (report.reuse.advisories.length === 0)
        lines.push('  - none touching the changed set');
    lines.push('');
    lines.push('Recommended reviewer questions');
    report.reviewQuestions.forEach((q, i) => lines.push(`  ${i + 1}. ${q.question}`));
    lines.push('');
    lines.push('What this proves');
    for (const p of report.proves)
        lines.push(`  - ${p}`);
    lines.push('');
    lines.push('What this does NOT prove');
    for (const p of report.doesNotProve)
        lines.push(`  - ${p}`);
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=repo-brain-impact.js.map