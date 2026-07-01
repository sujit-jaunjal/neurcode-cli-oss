"use strict";
/**
 * Runtime Safety Kernel V1 — enterprise runtime governance for AI coding agents.
 *
 * Neurcode is a runtime control plane, not a generic AppSec scanner. This module
 * classifies agent write attempts against sensitive runtime boundaries using
 * source-free, evidence-backed reason codes. Deterministic path rules are
 * separated from bounded inference and advisory signals.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_SAFETY_POLICY_ACTION_FIELDS = exports.PLAN_CONTROL_MODES = exports.RUNTIME_SAFETY_ENFORCEMENT_ACTIONS = exports.ENTERPRISE_RUNTIME_SAFETY_V1_POLICY = exports.DEFAULT_PLAN_CONTROL_MODE = exports.ENTERPRISE_RUNTIME_SAFETY_V1_PROFILE_ID = exports.RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION = void 0;
exports.classifyRuntimeSafetySurface = classifyRuntimeSafetySurface;
exports.evaluateNeighborContainment = evaluateNeighborContainment;
exports.evaluateCredentialPreWrite = evaluateCredentialPreWrite;
exports.classifyDependencyManifestChange = classifyDependencyManifestChange;
exports.resolvePolicyActionForFamily = resolvePolicyActionForFamily;
exports.resolvePolicyActionForClassification = resolvePolicyActionForClassification;
exports.evaluatePlanControlMode = evaluatePlanControlMode;
exports.resolveRuntimeSafetyEnforcement = resolveRuntimeSafetyEnforcement;
exports.buildRuntimeSafetySessionEvidence = buildRuntimeSafetySessionEvidence;
exports.normalizePlanControlMode = normalizePlanControlMode;
exports.describePlanControlMode = describePlanControlMode;
exports.validateRuntimeSafetyPolicyProfile = validateRuntimeSafetyPolicyProfile;
exports.parseRuntimeSafetyPolicyProfile = parseRuntimeSafetyPolicyProfile;
const node_crypto_1 = require("node:crypto");
const micromatch_1 = __importDefault(require("micromatch"));
const intent_privacy_1 = require("./intent-privacy");
exports.RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION = 'neurcode.runtime-safety-kernel.v1';
exports.ENTERPRISE_RUNTIME_SAFETY_V1_PROFILE_ID = 'enterprise_runtime_safety_v1';
exports.DEFAULT_PLAN_CONTROL_MODE = 'advise';
function normPath(path) {
    return path.replace(/\\/g, '/').replace(/^\.\//, '');
}
function basename(needle) {
    return (path) => path === needle || path.endsWith(`/${needle}`);
}
function suffix(needle) {
    const rootName = needle.startsWith('/') ? needle.slice(1) : needle;
    return (path) => path === rootName || path.endsWith(needle);
}
function suffixAny(needles) {
    return (path) => needles.some((needle) => suffix(needle)(path));
}
function segment(needle) {
    const fragment = `/${needle}/`;
    return (path) => path === needle || path.startsWith(`${needle}/`) || path.includes(fragment);
}
function regex(pattern) {
    return (path) => pattern.test(path);
}
// ── Network boundary (Iteration 11) ───────────────────────────────────────────
// Folded into `infra_deploy_boundary` (no new RuntimeSafetyFamily); the
// AppSec-adjacent runtime-risk doctor surfaces a `network_boundary` SUB-LABEL.
// These are deterministic, low-false-positive path heuristics over reverse-proxy
// / CORS / k8s-network / firewall config — NOT traffic or packet analysis.
// Anchored to whole filenames, whole path SEGMENTS, or `*.yaml` stems so that
// look-alikes (scores.ts, record.ts, corsair.ts, progress.yaml, network-util.ts)
// never match.
const NETWORK_PROXY_FILE_RE = /(^|\/)(nginx(\.[A-Za-z0-9._-]+)?\.conf|haproxy\.cfg|envoy\.ya?ml|traefik\.ya?ml)$/;
const NETWORK_SEGMENT_RE = /(^|\/)(nginx|cors|firewall|ingress|network-policy|networkpolicy|security-group|security_group)\//;
const NETWORK_CORS_FILE_RE = /(^|\/)cors(\.[A-Za-z0-9-]+)*\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java)$/;
const NETWORK_MANIFEST_RE = /(^|\/)[^/]*(network[-_]?policy|ingress|firewall|security[-_]?group)[^/]*\.(ya?ml|tf)$/;
function matchesNetworkBoundary(path) {
    return (NETWORK_PROXY_FILE_RE.test(path) ||
        NETWORK_SEGMENT_RE.test(path) ||
        NETWORK_CORS_FILE_RE.test(path) ||
        NETWORK_MANIFEST_RE.test(path));
}
// ── Crypto / session (Iteration 11) ───────────────────────────────────────────
// Crypto code/logic is approval-gated under the existing `auth_rbac_boundary`
// family (approval_required) — NOT a hard credential block, to avoid over-
// blocking ordinary cryptographic code. Raw key STORES (keyring/keystore
// directories) extend `credential_or_secret` (block), consistent with the
// existing `secrets/` rule and the profile `crypto` tag mapping. `session` is
// already covered by the auth rules above; the doctor groups all of these under
// a `crypto_session` sub-label. Exact-stem / whole-segment anchors keep
// look-alikes (cryptocurrency.ts, decipher.ts, description.ts) from matching.
const CRYPTO_DIR_RE = /(^|\/)(crypto|cryptography|cipher|ciphers|encryption|signing|kms)\//;
const CRYPTO_FILE_RE = /(^|\/)(crypto|cipher|encryption|signing|encryptor|decryptor)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java)$/;
function matchesCryptoSurface(path) {
    return CRYPTO_DIR_RE.test(path) || CRYPTO_FILE_RE.test(path);
}
const PATH_RULES = Object.freeze([
    { family: 'credential_or_secret', reasonId: 'cred.env-file', reason: 'Environment variable file.', test: regex(/(^|\/)\.env(\.[A-Za-z0-9._-]+)?$/) },
    { family: 'credential_or_secret', reasonId: 'cred.key-material', reason: 'Key/credential material path.', test: regex(/\.(pem|key|crt|p12|pfx|jks|keystore)$/) },
    { family: 'credential_or_secret', reasonId: 'cred.secrets-dir', reason: 'Secrets directory.', test: regex(/(^|\/)(secrets?|credentials?)\//) },
    { family: 'credential_or_secret', reasonId: 'cred.crypto-store', reason: 'Key material store (keyring/keystore).', test: regex(/(^|\/)(keyring|keystore)\//) },
    { family: 'auth_rbac_boundary', reasonId: 'auth.segment', reason: 'Auth/IAM/RBAC surface.', test: regex(/(^|\/)(auth|iam|rbac|permissions?|oauth|session|middleware)\//) },
    { family: 'auth_rbac_boundary', reasonId: 'auth.filename', reason: 'Auth-related filename stem.', test: regex(/(^|\/)(auth|rbac|permission|oauth|session)[^/]*\.(ts|js|py|go|java|rb)$/) },
    { family: 'auth_rbac_boundary', reasonId: 'auth.crypto', reason: 'Crypto/session implementation surface.', test: matchesCryptoSurface },
    { family: 'migration_data_boundary', reasonId: 'migration.dir', reason: 'Database migration directory.', test: regex(/(^|\/)(migrations|db\/migrations|alembic|schema\/migrations)\//) },
    { family: 'migration_data_boundary', reasonId: 'migration.file', reason: 'Migration file suffix.', test: regex(/(^|\/)[^/]*migration[^/]*\.(sql|py|ts|js)$/) },
    { family: 'infra_deploy_boundary', reasonId: 'infra.ci', reason: 'CI/CD workflow.', test: regex(/^\.github\/workflows\//) },
    { family: 'infra_deploy_boundary', reasonId: 'infra.docker', reason: 'Container/deployment manifest.', test: regex(/(^|\/)Dockerfile(\.[A-Za-z0-9._-]+)?$|(^|\/)docker-compose(\.[A-Za-z0-9._-]+)?\.ya?ml$/) },
    { family: 'infra_deploy_boundary', reasonId: 'infra.terraform', reason: 'Infrastructure-as-code.', test: regex(/(^|\/)(terraform|infra\/terraform|k8s|kubernetes|helm|charts)\//) },
    { family: 'infra_deploy_boundary', reasonId: 'infra.deploy-config', reason: 'Deployment config.', test: basename('serverless.yml') },
    { family: 'infra_deploy_boundary', reasonId: 'infra.network', reason: 'Network boundary config (reverse proxy / CORS / k8s network / firewall).', test: matchesNetworkBoundary },
    { family: 'dependency_supply_chain', reasonId: 'dep.npm', reason: 'Node package manifest.', test: basename('package.json') },
    { family: 'dependency_supply_chain', reasonId: 'dep.lock-npm', reason: 'npm lockfile.', test: basename('package-lock.json') },
    { family: 'dependency_supply_chain', reasonId: 'dep.lock-pnpm', reason: 'pnpm lockfile.', test: basename('pnpm-lock.yaml') },
    { family: 'dependency_supply_chain', reasonId: 'dep.lock-yarn', reason: 'yarn lockfile.', test: basename('yarn.lock') },
    { family: 'dependency_supply_chain', reasonId: 'dep.python', reason: 'Python dependency manifest.', test: regex(/(^|\/)requirements(\/[^/]+)?\.(txt|in)$|^requirements(\/[^/]+)?\.(txt|in)$/) },
    { family: 'dependency_supply_chain', reasonId: 'dep.pyproject', reason: 'Python project manifest.', test: basename('pyproject.toml') },
    { family: 'dependency_supply_chain', reasonId: 'dep.pipfile', reason: 'Pipenv manifest.', test: basename('Pipfile') },
    { family: 'dependency_supply_chain', reasonId: 'dep.go-mod', reason: 'Go module manifest.', test: basename('go.mod') },
    { family: 'dependency_supply_chain', reasonId: 'dep.go-sum', reason: 'Go module checksum lockfile.', test: basename('go.sum') },
    { family: 'dependency_supply_chain', reasonId: 'dep.maven', reason: 'Maven project manifest.', test: basename('pom.xml') },
    { family: 'dependency_supply_chain', reasonId: 'dep.gradle', reason: 'Gradle build script.', test: suffixAny(['/build.gradle', '/build.gradle.kts', '/settings.gradle', '/settings.gradle.kts']) },
    { family: 'dependency_supply_chain', reasonId: 'dep.cargo', reason: 'Rust crate manifest.', test: basename('Cargo.toml') },
    { family: 'sensitive_surface', reasonId: 'surface.billing', reason: 'Billing/payment surface.', test: regex(/(^|\/)(billing|payments?|stripe|checkout)\//) },
    { family: 'sensitive_surface', reasonId: 'surface.gateway', reason: 'API gateway/middleware security.', test: regex(/(^|\/)(gateway|api-gateway|security-headers?)\//) },
    { family: 'sensitive_surface', reasonId: 'surface.prod-config', reason: 'Production config path.', test: regex(/(^|\/)(config\/prod|production|prod\.ya?ml$)/) },
    { family: 'sensitive_surface', reasonId: 'surface.generated', reason: 'Generated output (advisory unless crossing protected surface).', test: regex(/(^|\/)(dist|build|out|__generated__|generated|gen|node_modules)\//) },
    { family: 'test_or_verification_gap', reasonId: 'test.missing-pattern', reason: 'Production path without paired test directory signal.', test: regex(/(^|\/)src\/[^/]+\/[^/]+\.(ts|js|py)$/) },
]);
const AUTH_TOKEN_RE = /\b(auth|rbac|permission|oauth|session|token|jwt|middleware)\b/i;
const MIGRATION_TOKEN_RE = /\b(migration|schema|alembic)\b/i;
const BILLING_TOKEN_RE = /\b(billing|payment|stripe|charge|refund)\b/i;
function reason(code, family, truthTier, message) {
    return { code, family, truthTier, message };
}
function matchesGlobList(filePath, globs) {
    return globs.some((g) => micromatch_1.default.isMatch(filePath, g, { dot: true, matchBase: true }) ||
        filePath.startsWith(g.replace('/**', '').replace('/*', '') + '/') ||
        filePath === g.replace('/**', '').replace('/*', ''));
}
function matchesLiteralApprovedPath(filePath, approvedPath) {
    return normPath(filePath) === normPath(approvedPath);
}
function pathRulesFor(filePath) {
    const normalised = normPath(filePath);
    const codes = [];
    for (const rule of PATH_RULES) {
        if (rule.test(normalised)) {
            codes.push(reason(rule.reasonId, rule.family, 'deterministic_fact', rule.reason));
        }
    }
    return codes;
}
function heuristicSignals(filePath) {
    const normalised = normPath(filePath);
    const segments = normalised.split('/');
    const codes = [];
    for (const segment of segments) {
        const stem = segment.replace(/\.[^.]+$/, '');
        if (AUTH_TOKEN_RE.test(stem)) {
            codes.push(reason('heuristic.auth-stem', 'auth_rbac_boundary', 'bounded_inference', 'Path segment suggests auth/RBAC surface.'));
        }
        if (MIGRATION_TOKEN_RE.test(stem)) {
            codes.push(reason('heuristic.migration-stem', 'migration_data_boundary', 'bounded_inference', 'Path segment suggests migration/schema surface.'));
        }
        if (BILLING_TOKEN_RE.test(stem)) {
            codes.push(reason('heuristic.billing-stem', 'sensitive_surface', 'bounded_inference', 'Path segment suggests billing/payment surface.'));
        }
    }
    return codes;
}
function bucketReasonCodes(codes) {
    const byFamily = new Map();
    for (const code of codes) {
        const list = byFamily.get(code.family) ?? [];
        list.push(code);
        byFamily.set(code.family, list);
    }
    return [...byFamily.entries()].map(([family, familyCodes]) => {
        const hasDeterministic = familyCodes.some((c) => c.truthTier === 'deterministic_fact');
        const truthTier = hasDeterministic
            ? 'deterministic_fact'
            : familyCodes.some((c) => c.truthTier === 'bounded_inference')
                ? 'bounded_inference'
                : 'advisory';
        return {
            family,
            reasonCodes: familyCodes,
            truthTier,
            confidence: hasDeterministic ? 'high' : truthTier === 'bounded_inference' ? 'medium' : 'low',
            enforcementEligible: truthTier !== 'advisory' || family === 'sensitive_surface',
            deterministic: hasDeterministic,
        };
    });
}
function classifyRuntimeSafetySurface(input) {
    const filePath = normPath(input.filePath);
    const pathCodes = pathRulesFor(filePath);
    const heuristicCodes = heuristicSignals(filePath);
    const profileCodes = [];
    for (const boundary of input.sensitiveBoundaries ?? []) {
        if (matchesGlobList(filePath, [boundary.glob])) {
            const family = boundary.tag === 'auth' || boundary.tag === 'security'
                ? 'auth_rbac_boundary'
                : boundary.tag === 'migrations'
                    ? 'migration_data_boundary'
                    : boundary.tag === 'payments'
                        ? 'sensitive_surface'
                        : boundary.tag === 'secrets' || boundary.tag === 'crypto'
                            ? 'credential_or_secret'
                            : 'sensitive_surface';
            profileCodes.push(reason(`profile.${boundary.tag}`, family, 'deterministic_fact', `Profile sensitive boundary: ${boundary.glob}`));
        }
    }
    if ((input.approvalRequiredGlobs ?? []).some((g) => matchesGlobList(filePath, [g]))) {
        profileCodes.push(reason('profile.approval-required', 'approval_required_boundary', 'deterministic_fact', 'Path matches approval-required governance glob.'));
    }
    const allowedGlobs = input.allowedGlobs ?? [];
    const inDeclaredScope = allowedGlobs.length === 0
        ? true
        : matchesGlobList(filePath, allowedGlobs);
    const approvedPaths = input.approvedPaths ?? [];
    const hasLiteralExactApproval = approvedPaths.some((ap) => matchesLiteralApprovedPath(filePath, ap));
    const hasExactApproval = approvedPaths.some((ap) => filePath === normPath(ap) ||
        matchesGlobList(filePath, [ap]));
    const isApprovalRequired = profileCodes.some((c) => c.family === 'approval_required_boundary')
        || (input.approvalRequiredGlobs ?? []).some((g) => matchesGlobList(filePath, [g]));
    const allCodes = [...pathCodes, ...heuristicCodes, ...profileCodes];
    const classifications = bucketReasonCodes(allCodes);
    const primaryFamily = classifications.sort((a, b) => {
        const priority = [
            'credential_or_secret',
            'approval_required_boundary',
            'auth_rbac_boundary',
            'migration_data_boundary',
            'infra_deploy_boundary',
            'dependency_supply_chain',
            'sensitive_surface',
            'plan_drift',
            'test_or_verification_gap',
            'runtime_scope',
        ];
        return priority.indexOf(a.family) - priority.indexOf(b.family);
    })[0]?.family ?? null;
    return {
        schemaVersion: exports.RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION,
        filePath,
        classifications,
        primaryFamily,
        inDeclaredScope,
        isApprovalRequired,
        hasExactApproval,
        hasLiteralExactApproval,
        neighborContainmentHolds: true,
    };
}
function evaluateNeighborContainment(approvedPath, candidatePath) {
    const approved = normPath(approvedPath);
    const candidate = normPath(candidatePath);
    if (approved === candidate) {
        return { holds: true, approvedPath: approved, deniedNeighbor: candidate };
    }
    const approvedDir = approved.includes('/') ? approved.slice(0, approved.lastIndexOf('/')) : '';
    const candidateDir = candidate.includes('/') ? candidate.slice(0, candidate.lastIndexOf('/')) : '';
    const sibling = approvedDir === candidateDir &&
        approved !== candidate;
    return {
        holds: !sibling || !matchesGlobList(candidate, [approved]),
        approvedPath: approved,
        deniedNeighbor: candidate,
    };
}
function evaluateCredentialPreWrite(input) {
    const filePath = normPath(input.filePath);
    const policyAction = input.policyAction ?? 'block';
    const content = typeof input.proposedContent === 'string' ? input.proposedContent : '';
    const pathDetection = (0, intent_privacy_1.detectCredentialText)(filePath, 10_000);
    const contentDetection = content ? (0, intent_privacy_1.detectCredentialText)(content, 100_000) : { detected: false, reasonCodes: [], scannedCharacters: 0, truncated: false };
    const envFile = /(^|\/)\.env(\.[A-Za-z0-9._-]+)?$/.test(filePath);
    const secretFamilies = [...new Set([
            ...pathDetection.reasonCodes,
            ...contentDetection.reasonCodes,
            ...(envFile ? ['credential_shaped_path'] : []),
        ])];
    const detected = secretFamilies.length > 0;
    const matchCount = secretFamilies.length;
    const contentFingerprint = detected && content
        ? (0, node_crypto_1.createHash)('sha256').update(content.slice(0, 512)).digest('hex').slice(0, 16)
        : null;
    const evidence = {
        schemaVersion: exports.RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION,
        filePath,
        detected,
        secretFamilies,
        redactionReason: detected ? 'credential_pre_write_guard' : 'none',
        localOnly: true,
        contentStored: false,
        matchCount,
        contentFingerprint,
    };
    if (!detected) {
        return { action: 'allow', evidence, message: 'No credential-shaped content detected.' };
    }
    // Credential/secret writes are blocked locally in every plan mode. A detected
    // secret is NEVER allowed or merely warned, even if a caller passes a weakened
    // policyAction — 'allow'/'warn' are floored to 'block'. (approval_required is
    // preserved for callers that deliberately route a secret through human approval.)
    const action = policyAction === 'approval_required' ? 'approval_required' : 'block';
    const message = action === 'block'
        ? `Credential-shaped content blocked locally for ${filePath}. Secret values are never stored or uploaded.`
        : action === 'approval_required'
            ? `Credential-shaped write to ${filePath} requires explicit approval.`
            : `Credential-shaped content detected in ${filePath} (advisory).`;
    return { action, evidence, message };
}
function parseJsonObject(text) {
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function dependencyNamesFromManifest(filePath, content) {
    const normalised = normPath(filePath);
    const result = new Map();
    if (basename('package.json')(normalised)) {
        const json = parseJsonObject(content);
        const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
        for (const section of sections) {
            const deps = json?.[section];
            if (deps && typeof deps === 'object' && !Array.isArray(deps)) {
                for (const [name, version] of Object.entries(deps)) {
                    if (typeof version === 'string')
                        result.set(name, version);
                }
            }
        }
        const scripts = json?.scripts;
        if (scripts && typeof scripts === 'object') {
            for (const [name, body] of Object.entries(scripts)) {
                if (typeof body === 'string')
                    result.set(`script:${name}`, body.slice(0, 80));
            }
        }
        return result;
    }
    if (basename('pyproject.toml')(normalised) || /requirements.*\.(txt|in)$/.test(normalised)) {
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*(==|>=|<=|~=|!=)?\s*([^\s#]+)?/);
            if (match?.[1])
                result.set(match[1], match[3] ?? '*');
        }
    }
    return result;
}
function manifestKind(filePath) {
    const p = normPath(filePath);
    if (basename('package.json')(p) || basename('package-lock.json')(p))
        return 'npm';
    if (basename('pnpm-lock.yaml')(p))
        return 'pnpm';
    if (basename('yarn.lock')(p))
        return 'yarn';
    if (basename('pyproject.toml')(p) || /requirements.*\.(txt|in)$/.test(p) || basename('Pipfile')(p))
        return 'python';
    if (basename('Cargo.toml')(p))
        return 'cargo';
    if (basename('go.mod')(p))
        return 'go';
    return 'other';
}
function classifyDependencyManifestChange(input) {
    const filePath = normPath(input.filePath);
    const policyAction = input.policyAction ?? 'approval_required';
    const previous = typeof input.previousContent === 'string' ? input.previousContent : '';
    const proposed = typeof input.proposedContent === 'string' ? input.proposedContent : '';
    const kind = manifestKind(filePath);
    const isLockfile = /lock\.(json|yaml)$|yarn\.lock$|poetry\.lock$/.test(filePath);
    const before = dependencyNamesFromManifest(filePath, previous);
    const after = dependencyNamesFromManifest(filePath, proposed);
    const addedPackages = [];
    const removedPackages = [];
    const changedVersions = [];
    const changeKinds = new Set();
    const scriptRiskSignals = [];
    for (const [name, version] of after.entries()) {
        if (!before.has(name)) {
            addedPackages.push(name);
            changeKinds.add(name.startsWith('script:') ? 'script_lifecycle_risk' : 'new_dependency');
            if (name.startsWith('script:') && /(curl|wget|bash -c|rm -rf|eval)/i.test(version)) {
                scriptRiskSignals.push(name);
            }
        }
        else if (before.get(name) !== version) {
            changedVersions.push({ name, from: before.get(name) ?? null, to: version });
            const from = before.get(name) ?? '';
            if (name.startsWith('script:')) {
                changeKinds.add('script_lifecycle_risk');
                if (/(curl|wget|bash -c|rm -rf|eval)/i.test(version)) {
                    scriptRiskSignals.push(name);
                }
            }
            else {
                changeKinds.add(from.localeCompare(version) > 0 ? 'version_downgrade' : 'version_upgrade');
            }
        }
    }
    for (const name of before.keys()) {
        if (!after.has(name)) {
            removedPackages.push(name);
            changeKinds.add('manifest_metadata_change');
        }
    }
    if (isLockfile && changeKinds.size === 0 && previous !== proposed) {
        changeKinds.add('lockfile_only_drift');
    }
    if (/\.npmrc$|\.yarnrc|pnpm-workspace\.yaml$/.test(filePath)) {
        changeKinds.add('package_manager_config_change');
    }
    if (changeKinds.size === 0 && previous !== proposed) {
        changeKinds.add('manifest_metadata_change');
    }
    const evidence = {
        schemaVersion: exports.RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION,
        filePath,
        manifestKind: kind,
        changeKinds: [...changeKinds],
        addedPackages: addedPackages.sort(),
        removedPackages: removedPackages.sort(),
        changedVersions,
        scriptRiskSignals,
        truthTier: 'deterministic_fact',
    };
    const hasChange = changeKinds.size > 0;
    if (!hasChange) {
        return {
            action: 'allow',
            evidence,
            message: `No dependency supply-chain change detected for ${filePath}.`,
        };
    }
    const action = scriptRiskSignals.length > 0
        ? 'block'
        : policyAction;
    const message = `AI attempted to change supply-chain surface ${filePath}; ` +
        `${action === 'allow' ? 'allowed' : action === 'warn' ? 'warn' : action === 'approval_required' ? 'approval required' : 'blocked'} ` +
        `because ${[...changeKinds].join(', ') || 'manifest drift'}.`;
    return { action, evidence, message };
}
exports.ENTERPRISE_RUNTIME_SAFETY_V1_POLICY = Object.freeze({
    id: exports.ENTERPRISE_RUNTIME_SAFETY_V1_PROFILE_ID,
    schemaVersion: exports.RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION,
    credentialWrites: 'block',
    authRbac: 'approval_required',
    migrations: 'approval_required',
    dependencyManifests: 'approval_required',
    infraDeploy: 'approval_required',
    sensitiveSurfaces: 'approval_required',
    generatedFiles: 'warn',
    ordinaryFeatureFiles: 'allow',
    planMode: 'advise',
});
function resolvePolicyActionForFamily(family, policy) {
    switch (family) {
        case 'credential_or_secret':
            return policy.credentialWrites;
        case 'auth_rbac_boundary':
            return policy.authRbac;
        case 'migration_data_boundary':
            return policy.migrations;
        case 'dependency_supply_chain':
            return policy.dependencyManifests;
        case 'infra_deploy_boundary':
            return policy.infraDeploy;
        case 'sensitive_surface':
            return policy.sensitiveSurfaces;
        case 'approval_required_boundary':
            return 'approval_required';
        case 'plan_drift':
            return 'block';
        case 'test_or_verification_gap':
            return 'warn';
        case 'runtime_scope':
            return policy.ordinaryFeatureFiles;
        default:
            return policy.ordinaryFeatureFiles;
    }
}
function resolvePolicyActionForClassification(classification, policy) {
    if (classification.primaryFamily === 'sensitive_surface') {
        const surfaceCodes = classification.classifications
            .filter((item) => item.family === 'sensitive_surface')
            .flatMap((item) => item.reasonCodes.map((code) => code.code));
        if (surfaceCodes.length > 0 && surfaceCodes.every((code) => code === 'surface.generated')) {
            return policy.generatedFiles;
        }
    }
    return resolvePolicyActionForFamily(classification.primaryFamily, policy);
}
function evaluatePlanControlMode(input) {
    const { planMode, phase, classification, policy } = input;
    const planFiles = (input.planFiles ?? []).map(normPath);
    const family = classification.primaryFamily;
    const policyAction = resolvePolicyActionForClassification(classification, policy);
    if (planMode === 'observe') {
        return {
            action: 'allow',
            families: family ? [family] : [],
            reasonCodes: ['plan_mode.observe'],
            message: 'Plan mode observe: recording source-free evidence without blocking.',
            remediationCommand: null,
        };
    }
    if (planMode === 'advise' && phase === 'planning') {
        if (policyAction === 'allow') {
            return {
                action: 'allow',
                families: family ? [family] : [],
                reasonCodes: ['plan_mode.advise.planning'],
                message: 'Plan mode advise (planning): no sensitive enforcement signal.',
                remediationCommand: null,
            };
        }
        return {
            action: 'warn',
            families: family ? [family] : [],
            reasonCodes: ['plan_mode.advise.sensitive_surface'],
            message: `Plan mode advise: sensitive surface ${classification.filePath} detected during planning. ` +
                'Implementation may require approval after freeze.',
            remediationCommand: 'neurcode session replan --add-file <path>',
        };
    }
    if (planMode === 'enforce_after_freeze' && phase === 'planning') {
        return {
            action: 'allow',
            families: family ? [family] : [],
            reasonCodes: ['plan_mode.enforce_after_freeze.planning'],
            message: 'Plan mode enforce_after_freeze: planning phase records scope without blocking.',
            remediationCommand: null,
        };
    }
    if (planMode === 'enforce_after_freeze' && phase === 'implementation' && planFiles.length > 0) {
        const inPlan = planFiles.includes(classification.filePath);
        if (!inPlan) {
            return {
                action: 'block',
                families: ['plan_drift', ...(family ? [family] : [])],
                reasonCodes: ['plan_drift.outside_frozen_plan'],
                message: `Plan drift: ${classification.filePath} is outside the frozen implementation plan. ` +
                    'Amend the plan or approve the exact path.',
                remediationCommand: `neurcode session replan --add-file ${classification.filePath}`,
            };
        }
    }
    if (classification.isApprovalRequired && !classification.hasExactApproval) {
        return {
            action: 'approval_required',
            families: ['approval_required_boundary', ...(family ? [family] : [])],
            reasonCodes: ['approval_required_boundary.exact_path'],
            message: `Approval required for ${classification.filePath}. ` +
                'Exact-path approval does not broaden to sibling files.',
            remediationCommand: `neurcode session approve --path ${classification.filePath}`,
        };
    }
    // A policy-driven approval_required for the exact file the operator already
    // approved resolves to allow — exact-path approval is the designed mechanism
    // to authorize a specific sensitive change (it never broadens to siblings).
    // Hard blocks are floored earlier and are unaffected.
    if (policyAction === 'approval_required' && classification.hasLiteralExactApproval) {
        return {
            action: 'allow',
            families: family ? [family] : [],
            reasonCodes: ['approval_required_boundary.exact_path_approved'],
            message: `Exact-path approval satisfied runtime safety policy ${policy.id} for ${classification.filePath}.`,
            remediationCommand: null,
        };
    }
    return {
        action: policyAction,
        families: family ? [family] : [],
        reasonCodes: classification.classifications.flatMap((c) => c.reasonCodes.map((r) => r.code)),
        message: `Runtime safety policy ${policy.id} resolved ${policyAction} for ${classification.filePath}.`,
        remediationCommand: policyAction === 'approval_required'
            ? `neurcode session approve --path ${classification.filePath}`
            : null,
    };
}
function resolveRuntimeSafetyEnforcement(input) {
    const results = [];
    if (input.credential?.action && input.credential.action !== 'allow') {
        results.push({
            action: input.credential.action,
            families: ['credential_or_secret'],
            reasonCodes: input.credential.evidence.secretFamilies,
            message: input.credential.message,
            remediationCommand: input.credential.action === 'approval_required'
                ? `neurcode session approve --path ${input.classification.filePath}`
                : null,
        });
    }
    if (input.dependency?.action && input.dependency.action !== 'allow') {
        // A dependency-manifest change that only needs approval (not a hard block
        // from a risky lifecycle script) is cleared by an explicit exact-path
        // approval, matching every other approval_required boundary. Without this
        // the advertised remedy (`neurcode session approve --path <manifest>`) is a
        // no-op and a governed developer editing package.json hits an unrecoverable
        // approval — a first-value dead end. Hard blocks stay un-clearable.
        const dependencyApprovalCleared = input.dependency.action === 'approval_required' && input.classification.hasLiteralExactApproval;
        if (!dependencyApprovalCleared) {
            results.push({
                action: input.dependency.action,
                families: ['dependency_supply_chain'],
                reasonCodes: input.dependency.evidence.changeKinds,
                message: input.dependency.message,
                remediationCommand: `neurcode session approve --path ${input.classification.filePath}`,
            });
        }
    }
    const planResult = evaluatePlanControlMode({
        planMode: input.policy.planMode,
        phase: input.phase,
        classification: input.classification,
        policy: input.policy,
        planFiles: input.planFiles,
    });
    results.push(planResult);
    const severity = {
        allow: 0,
        warn: 1,
        approval_required: 2,
        block: 3,
    };
    const winner = results.sort((a, b) => severity[b.action] - severity[a.action])[0];
    return winner ?? planResult;
}
function buildRuntimeSafetySessionEvidence(input) {
    const sensitiveSurfacesAttempted = [...new Set(input.events
            .filter((e) => e.classification.primaryFamily && e.classification.primaryFamily !== 'runtime_scope')
            .map((e) => e.classification.filePath))].sort();
    const pathsBlocked = [...new Set(input.events
            .filter((e) => e.enforcement.action === 'block')
            .map((e) => e.classification.filePath))].sort();
    const pathsApproved = [...new Set((input.approvedPaths ?? []).map(normPath))].sort();
    return {
        schemaVersion: exports.RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION,
        policyId: input.policy.id,
        planMode: input.policy.planMode,
        phase: input.phase,
        sourceUploaded: false,
        sensitiveSurfacesAttempted,
        pathsBlocked,
        pathsApproved,
        neighborContainmentProof: input.neighborProofs ?? [],
        dependencyChangesGoverned: input.events.filter((e) => e.dependency && e.dependency.evidence.changeKinds.length > 0).length,
        credentialBlocksLocal: input.events.filter((e) => e.credential?.action === 'block').length,
        planDriftDetected: input.events.some((e) => e.enforcement.families.includes('plan_drift')),
        verificationGapNoted: input.events.some((e) => e.classification.primaryFamily === 'test_or_verification_gap'),
        classifications: input.events.map((e) => ({
            filePath: e.classification.filePath,
            family: e.classification.primaryFamily ?? 'runtime_scope',
            reasonCodes: e.enforcement.reasonCodes,
            truthTier: e.classification.classifications[0]?.truthTier ?? 'advisory',
            action: e.enforcement.action,
        })),
    };
}
function normalizePlanControlMode(value) {
    if (value === 'observe' || value === 'advise' || value === 'enforce_after_freeze')
        return value;
    return exports.DEFAULT_PLAN_CONTROL_MODE;
}
/**
 * Plain-language description of a {@link PlanControlMode}. This is the single
 * source of truth for honest plan-mode copy across CLI help, MCP tool output,
 * and docs — it mirrors exactly what {@link evaluatePlanControlMode} does, so
 * the words never drift from the behavior.
 *
 * Honesty notes baked into the copy:
 *  - Credential/secret writes are blocked locally in every mode (the credential
 *    guard is independent of plan phase), so each mode says so.
 *  - "Block" language is reserved for `enforce_after_freeze` after a freeze;
 *    `advise` escalates to exact-path approval, not a hard block, on sensitive
 *    surfaces.
 */
function describePlanControlMode(mode) {
    switch (normalizePlanControlMode(mode)) {
        case 'observe':
            return {
                mode: 'observe',
                headline: 'Observe — record source-free evidence, never block your edits.',
                planningPhase: 'Every write is recorded as source-free evidence; nothing is blocked.',
                afterFreeze: 'Still records only. Plan drift is noted in evidence but never blocked. Credential/secret writes are still blocked locally.',
                enforcement: 'records_only',
            };
        case 'enforce_after_freeze':
            return {
                mode: 'enforce_after_freeze',
                headline: 'Enforce after freeze — shape the plan freely, then lock it.',
                planningPhase: 'Before you freeze, writes are recorded so you can shape scope freely (no plan-drift blocking).',
                afterFreeze: 'After you freeze, writes outside the frozen plan are blocked until you amend the plan or approve the exact path. Credential/secret writes are always blocked locally.',
                enforcement: 'blocks_after_freeze',
            };
        case 'advise':
        default:
            return {
                mode: 'advise',
                headline: 'Advise — warn on sensitive surfaces while planning, ask for exact-path approval after freeze.',
                planningPhase: 'Sensitive-surface writes warn during planning so you see them early; ordinary edits pass.',
                afterFreeze: 'After you freeze, sensitive surfaces require exact-path approval before they land. Credential/secret writes are always blocked locally.',
                enforcement: 'advisory',
            };
    }
}
/** Action vocabulary for runtime-safety policy fields. */
exports.RUNTIME_SAFETY_ENFORCEMENT_ACTIONS = Object.freeze([
    'allow',
    'warn',
    'approval_required',
    'block',
]);
/** Plan-control modes a policy may declare. */
exports.PLAN_CONTROL_MODES = Object.freeze([
    'observe',
    'advise',
    'enforce_after_freeze',
]);
/**
 * The per-family enforcement-action fields of a {@link RuntimeSafetyPolicyProfile}.
 * `credentialWrites` is included so the validator type-checks it like the rest,
 * but it is additionally pinned to `block` by the non-negotiable invariant below.
 */
exports.RUNTIME_SAFETY_POLICY_ACTION_FIELDS = Object.freeze([
    'credentialWrites',
    'authRbac',
    'migrations',
    'dependencyManifests',
    'infraDeploy',
    'sensitiveSurfaces',
    'generatedFiles',
    'ordinaryFeatureFiles',
]);
function isRuntimeSafetyEnforcementAction(value) {
    return typeof value === 'string' && exports.RUNTIME_SAFETY_ENFORCEMENT_ACTIONS.includes(value);
}
/**
 * Fail-closed validation for a partial runtime-safety policy override.
 *
 * Invariants:
 *  - Every action field must be one of allow|warn|approval_required|block.
 *  - `credentialWrites` MUST be `block` in every plan mode — credential/secret
 *    writes are blocked locally and cannot be weakened. Any other value is an
 *    error and is coerced back to `block`.
 *  - `planMode` must be observe|advise|enforce_after_freeze.
 *
 * The returned `policy` is always complete and safe: invalid fields keep the
 * enterprise default, so callers that ignore `errors` can never silently weaken
 * enforcement. Callers on validate/import paths MUST surface `errors` and reject.
 */
function validateRuntimeSafetyPolicyProfile(input) {
    const errors = [];
    const policy = { ...exports.ENTERPRISE_RUNTIME_SAFETY_V1_POLICY };
    if (input === undefined || input === null) {
        return { policy, errors };
    }
    if (typeof input !== 'object' || Array.isArray(input)) {
        errors.push('runtimeSafetyPolicy must be an object');
        return { policy, errors };
    }
    const record = input;
    for (const field of exports.RUNTIME_SAFETY_POLICY_ACTION_FIELDS) {
        const value = record[field];
        if (value === undefined)
            continue;
        if (!isRuntimeSafetyEnforcementAction(value)) {
            errors.push(`runtimeSafetyPolicy.${field} must be one of allow|warn|approval_required|block`);
            continue;
        }
        policy[field] = value;
    }
    // Non-negotiable invariant: credential/secret writes are blocked in every plan
    // mode. A valid-but-weakening value (e.g. 'allow', 'warn', 'approval_required')
    // is rejected and forced back to 'block'.
    if (record.credentialWrites !== undefined && record.credentialWrites !== 'block') {
        errors.push("runtimeSafetyPolicy.credentialWrites must be 'block' — credential/secret writes are blocked locally in every plan mode and cannot be weakened");
    }
    policy.credentialWrites = 'block';
    if (record.planMode !== undefined) {
        if (typeof record.planMode !== 'string' || !exports.PLAN_CONTROL_MODES.includes(record.planMode)) {
            errors.push('runtimeSafetyPolicy.planMode must be one of observe|advise|enforce_after_freeze');
        }
        else {
            policy.planMode = record.planMode;
        }
    }
    // id and schemaVersion are authoritative — never taken from input.
    policy.id = exports.ENTERPRISE_RUNTIME_SAFETY_V1_PROFILE_ID;
    policy.schemaVersion = exports.RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION;
    return { policy, errors };
}
function parseRuntimeSafetyPolicyProfile(input) {
    // Route through the fail-closed validator so a naive spread can never weaken
    // enforcement (especially credentialWrites). Errors are intentionally dropped
    // here: runtime callers receive the SAFE, coerced policy, while validate/import
    // paths call validateRuntimeSafetyPolicyProfile directly to surface and reject.
    return validateRuntimeSafetyPolicyProfile(input).policy;
}
//# sourceMappingURL=runtime-safety-kernel.js.map