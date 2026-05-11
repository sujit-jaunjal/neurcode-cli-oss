"use strict";
/**
 * Bootstrap Policy Command
 *
 * Generates deterministic, explainable starter enterprise policies
 * based on detected repo ecosystem.
 *
 * DESIGN PRINCIPLES:
 * - All templates are static and embedded — zero network, zero LLM
 * - All generated rules are deterministic and explainable
 * - No hallucinations, no probabilistic inference
 * - Output is always a valid .neurcode/policy.yml
 *
 * Ecosystem detection order:
 * 1. package.json → TypeScript/JavaScript
 * 2. requirements.txt / pyproject.toml / setup.py → Python
 * 3. go.mod → Go
 * 4. pom.xml / build.gradle → Java
 * 5. Dockerfile / docker-compose.yml → Container/infra
 * 6. Mixed (multiple ecosystems detected)
 * 7. Unknown (no ecosystem detected)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapPolicyCommand = bootstrapPolicyCommand;
const fs_1 = require("fs");
const path_1 = require("path");
const chalk_1 = __importDefault(require("chalk"));
const project_root_1 = require("../utils/project-root");
// ── Ecosystem detection ────────────────────────────────────────────────────────
function detectEcosystem(projectRoot) {
    const has = (file) => (0, fs_1.existsSync)((0, path_1.join)(projectRoot, file));
    const signals = [];
    if (has('package.json'))
        signals.push('typescript');
    if (has('requirements.txt') || has('pyproject.toml') || has('setup.py') || has('Pipfile'))
        signals.push('python');
    if (has('go.mod'))
        signals.push('go');
    if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts'))
        signals.push('java');
    if (has('Dockerfile') || has('docker-compose.yml') || has('docker-compose.yaml') || has('terraform.tf'))
        signals.push('infra');
    if (signals.length === 0)
        return 'unknown';
    if (signals.length === 1)
        return signals[0];
    return 'mixed';
}
function detectProfile(projectRoot) {
    // Try to detect profile from directory names and common files
    const pathParts = projectRoot.toLowerCase().split('/');
    if (pathParts.some(p => ['auth', 'authentication', 'oauth', 'payment', 'billing', 'stripe'].includes(p))) {
        return 'auth-payment';
    }
    if (pathParts.some(p => ['queue', 'worker', 'workflow', 'task', 'celery', 'airflow', 'temporal'].includes(p))) {
        return 'queue-workflow';
    }
    if ((0, fs_1.existsSync)((0, path_1.join)(projectRoot, 'Dockerfile')) || (0, fs_1.existsSync)((0, path_1.join)(projectRoot, 'terraform'))) {
        return 'infra';
    }
    if ((0, fs_1.existsSync)((0, path_1.join)(projectRoot, 'src')) || (0, fs_1.existsSync)((0, path_1.join)(projectRoot, 'api'))) {
        return 'backend-service';
    }
    return 'general';
}
// ── Policy templates ──────────────────────────────────────────────────────────
const BASE_STRUCTURAL_RULES = `
  # ── Deterministic Structural Rules (always active) ─────────────────────────
  # These are AST-backed, reproducible, and enforce operational safety.

  - id: "SR001_NO_SWALLOWED_REJECTIONS"
    name: "No Swallowed Async Rejections"
    description: |
      Async exceptions caught and silently discarded create invisible production
      failures. Every caught exception must either be re-raised, logged, or
      converted to a structured error response.
    severity: BLOCKING
    scope: structural
    ruleIds: [SR001]

  - id: "SR002_ERROR_PROPAGATION"
    name: "Error Propagation Required"
    description: |
      Errors in critical paths must propagate to callers. Silent fallbacks
      in error handlers hide service degradation.
    severity: BLOCKING
    scope: structural
    ruleIds: [SR002]

  - id: "SR003_NO_TIMER_LEAKS"
    name: "No Timer/Resource Leaks"
    description: |
      setInterval and setTimeout calls must store references for cleanup.
      Leaked timers prevent graceful shutdown and accumulate memory.
    severity: BLOCKING
    scope: structural
    ruleIds: [SR003]
`;
const AUTH_PAYMENT_RULES = `
  # ── Auth/Payment Path Rules ─────────────────────────────────────────────────
  # High-trust paths require stricter enforcement.

  - id: "SR004_VALIDATE_EXTERNAL_INPUTS"
    name: "Validate All External Inputs"
    description: |
      All data from external sources (HTTP requests, message queues, webhooks)
      must be validated before use in business logic.
    severity: BLOCKING
    scope: structural
    ruleIds: [SR004]

  - id: "DS001_SAGA_CONSISTENCY"
    name: "Distributed Transaction Consistency"
    description: |
      Multi-step operations across services must implement compensating
      transactions or explicit rollback paths.
    severity: BLOCKING
    scope: structural
    ruleIds: [DS001]

  - id: "REQUIRE_AUDIT_TRAIL"
    name: "Audit Trail Required"
    description: |
      All auth and payment operations must produce an audit log entry.
      This is a governance requirement, not a suggestion.
    severity: BLOCKING
`;
const QUEUE_WORKFLOW_RULES = `
  # ── Queue/Workflow Rules ────────────────────────────────────────────────────

  - id: "SR010_NO_RETRY_STORMS"
    name: "No Unbounded Retry Storms"
    description: |
      Retry loops must implement exponential backoff with a maximum retry count.
      Unbounded retries cause cascading failures under load.
    severity: BLOCKING
    scope: structural
    ruleIds: [SR010]

  - id: "SR003_TIMER_CLEANUP"
    name: "Timer Cleanup in Workers"
    description: |
      Long-running workers must clean up timers on shutdown signal.
    severity: BLOCKING
    scope: structural
    ruleIds: [SR003]
`;
const INFRA_RULES = `
  # ── Infrastructure Rules ────────────────────────────────────────────────────

  - id: "NO_HARDCODED_SECRETS"
    name: "No Hardcoded Secrets"
    description: |
      Secrets, API keys, and credentials must not appear in infrastructure
      definitions. Use parameter stores or secret managers.
    severity: BLOCKING

  - id: "REQUIRE_RESOURCE_TAGGING"
    name: "Require Resource Tagging"
    description: |
      All infrastructure resources must include cost center and owner tags
      for governance and cost attribution.
    severity: ADVISORY
`;
function buildPolicyContent(ecosystem, profile) {
    const now = new Date().toISOString().slice(0, 10);
    let header = `# Neurcode Enterprise Policy
# Generated by neurcode bootstrap-policy on ${now}
# Ecosystem: ${ecosystem} | Profile: ${profile}
#
# IMPORTANT: These policies are deterministic and static.
# Every rule is explainable and reproducible.
# No AI inference affects these rules.
#
# After customizing, run: neurcode policy compile

name: "Enterprise ${profile.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Policy"
version: "1.0.0"
ecosystem: "${ecosystem}"
profile: "${profile}"
description: "Neurcode governance policy for ${ecosystem} ${profile} projects"

rules:
`;
    header += BASE_STRUCTURAL_RULES;
    if (profile === 'auth-payment') {
        header += AUTH_PAYMENT_RULES;
    }
    if (profile === 'queue-workflow') {
        header += QUEUE_WORKFLOW_RULES;
    }
    if (profile === 'infra') {
        header += INFRA_RULES;
    }
    // Python-specific additions
    if (ecosystem === 'python' || ecosystem === 'mixed') {
        header += `
  # ── Python-Specific Rules ──────────────────────────────────────────────────

  - id: "PY001_NO_BARE_EXCEPT"
    name: "No Bare Except"
    description: |
      Bare \`except:\` clauses catch SystemExit and KeyboardInterrupt.
      Always catch specific exception types.
    severity: BLOCKING

  - id: "PY003_ASYNC_SAFETY"
    name: "Async Safety"
    description: |
      Python async code must not mix blocking I/O calls into async contexts.
      Use asyncio-compatible libraries.
    severity: ADVISORY
`;
    }
    if (ecosystem === 'typescript' || ecosystem === 'mixed') {
        header += `
  # ── TypeScript/JavaScript-Specific Rules ────────────────────────────────────

  - id: "TS001_TYPED_BOUNDARIES"
    name: "Typed External Boundaries"
    description: |
      API request/response bodies must use typed interfaces, not \`any\`.
      Untyped boundaries create invisible contract violations.
    severity: ADVISORY

  - id: "SR004_NO_UNVALIDATED_REQ_BODY"
    name: "Validate Request Bodies"
    description: |
      Express/Fastify/Koa route handlers must validate req.body before use.
    severity: BLOCKING
    scope: structural
    ruleIds: [SR004]
`;
    }
    header += `
# ── Governance SLO ────────────────────────────────────────────────────────────
governance:
  maxBlockingFindingsAllowed: 0
  maxAdvisoryFindingsAllowed: 10
  replayChecksumRequired: true
  localOnlyModeAllowed: true
`;
    return header;
}
// ── Main command ──────────────────────────────────────────────────────────────
async function bootstrapPolicyCommand(options = {}) {
    const rootTrace = (0, project_root_1.resolveNeurcodeProjectRootWithTrace)(process.cwd());
    const projectRoot = rootTrace.projectRoot;
    const neurcodeDir = (0, path_1.join)(projectRoot, '.neurcode');
    const policyPath = (0, path_1.join)(neurcodeDir, 'policy.yml');
    const ecosystem = options.ecosystem ?? detectEcosystem(projectRoot);
    const profile = options.profile ?? detectProfile(projectRoot);
    const policyExists = (0, fs_1.existsSync)(policyPath);
    if (policyExists && !options.force) {
        if (options.json) {
            console.log(JSON.stringify({
                success: false,
                error: 'Policy file already exists. Use --force to overwrite.',
                path: policyPath,
                detected: { ecosystem, profile },
            }, null, 2));
        }
        else {
            console.log(chalk_1.default.yellow(`\n⚠️  Policy already exists at ${policyPath}`));
            console.log(chalk_1.default.dim('   Use --force to overwrite with a freshly generated policy.\n'));
        }
        return;
    }
    if (!(0, fs_1.existsSync)(neurcodeDir)) {
        const { mkdirSync } = await Promise.resolve().then(() => __importStar(require('fs')));
        mkdirSync(neurcodeDir, { recursive: true });
    }
    const policyContent = buildPolicyContent(ecosystem, profile);
    (0, fs_1.writeFileSync)(policyPath, policyContent, 'utf-8');
    if (options.json) {
        console.log(JSON.stringify({
            success: true,
            path: policyPath,
            detected: { ecosystem, profile },
            overwritten: policyExists,
        }, null, 2));
        return;
    }
    console.log(chalk_1.default.bold.green('\n✅ Enterprise policy generated\n'));
    console.log(chalk_1.default.bold.white('  Detected ecosystem:'), chalk_1.default.cyan(ecosystem));
    console.log(chalk_1.default.bold.white('  Detected profile:  '), chalk_1.default.cyan(profile));
    console.log(chalk_1.default.bold.white('  Written to:        '), chalk_1.default.dim(policyPath));
    console.log('');
    console.log(chalk_1.default.dim('  Policy type: static, deterministic, LLM-free'));
    console.log(chalk_1.default.dim('  All rules are explainable and reproducible.'));
    console.log('');
    console.log(chalk_1.default.bold.white('  Next steps:'));
    console.log(chalk_1.default.cyan('    1. Review .neurcode/policy.yml and adjust rules for your context'));
    console.log(chalk_1.default.cyan('    2. Run: neurcode policy compile'));
    console.log(chalk_1.default.cyan('    3. Run: neurcode verify --local-only'));
    console.log('');
}
//# sourceMappingURL=bootstrap-policy.js.map