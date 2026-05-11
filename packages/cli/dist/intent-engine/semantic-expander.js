"use strict";
/**
 * Semantic Intent Expander (Phase 2)
 *
 * Calls an LLM exactly ONCE per unique intent to produce a structured
 * semantic expansion. The result is stored as a signed governance artifact
 * (HMAC-SHA256) so all subsequent enforcement runs against the same
 * deterministic stored result — never re-calling the LLM.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  TRUST MODEL                                                 │
 * │                                                              │
 * │  LLM is used for UNDERSTANDING (once, stored, signed).      │
 * │  All ENFORCEMENT decisions are deterministic (regex/AST).   │
 * │                                                              │
 * │  This mirrors how human architects write design docs:        │
 * │  judgment applied once → all reviews check the document.    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Provider support: any OpenAI-compatible HTTP endpoint.
 *   - OpenAI:    NEURCODE_OPENAI_API_KEY  (default)
 *   - Anthropic: NEURCODE_ANTHROPIC_API_KEY  (maps to their API)
 *   - Local:     NEURCODE_LLM_BASE_URL=http://localhost:11434/v1  (Ollama)
 *
 * Fallback: if no API key is configured, silently falls back to the
 * deterministic keyword parser — expansion still produced, marked
 * expansionMethod='keyword-fallback'.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandIntent = expandIntent;
exports.loadCachedExpansion = loadCachedExpansion;
exports.listCachedExpansions = listCachedExpansions;
exports.formatExpansionSummary = formatExpansionSummary;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const zod_1 = require("zod");
const parser_1 = require("./parser");
const artifact_signature_1 = require("../utils/artifact-signature");
// ── Schema ─────────────────────────────────────────────────────────────────────
/**
 * The structured output schema enforced on the LLM response.
 * Zod parses and strips any extra fields — if the LLM hallucinates
 * fields outside this schema they are silently dropped.
 */
const SemanticExpansionResponseSchema = zod_1.z.object({
    semanticDescription: zod_1.z.string().max(500),
    domains: zod_1.z.array(zod_1.z.string()).max(10),
    affectedLayerHints: zod_1.z.array(zod_1.z.string()).max(12),
    expectedFilePatterns: zod_1.z.array(zod_1.z.string()).max(15),
    policyApplicability: zod_1.z.array(zod_1.z.string()).max(12),
    riskLevel: zod_1.z.enum(['low', 'medium', 'high', 'critical']),
    riskRationale: zod_1.z.string().max(300),
    semanticKeywords: zod_1.z.array(zod_1.z.string()).max(30),
});
// ── Constants ──────────────────────────────────────────────────────────────────
const EXPANSIONS_DIR = 'intent-expansions';
const NEURCODE_DIR = '.neurcode';
const LLM_TIMEOUT_MS = 20_000;
const MAX_INTENT_LEN = 2000;
// ── Helpers ────────────────────────────────────────────────────────────────────
function sha256Hex(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function normalizeIntent(raw) {
    return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}
function intentHash(raw) {
    return sha256Hex(normalizeIntent(raw));
}
function expansionDir(cwd) {
    return (0, path_1.join)(cwd, NEURCODE_DIR, EXPANSIONS_DIR);
}
function expansionFilePath(cwd, hash) {
    return (0, path_1.join)(expansionDir(cwd), `${hash}.json`);
}
function resolveLLMConfig() {
    const openaiKey = process.env.NEURCODE_OPENAI_API_KEY
        || process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.NEURCODE_ANTHROPIC_API_KEY
        || process.env.ANTHROPIC_API_KEY;
    const customBaseUrl = process.env.NEURCODE_LLM_BASE_URL;
    const customKey = process.env.NEURCODE_LLM_API_KEY;
    const model = process.env.NEURCODE_INTENT_MODEL || 'gpt-4o-mini';
    if (customBaseUrl && customKey) {
        return { baseUrl: customBaseUrl.replace(/\/$/, ''), apiKey: customKey, model, provider: 'generic' };
    }
    if (openaiKey) {
        return {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: openaiKey,
            model: process.env.NEURCODE_INTENT_MODEL || 'gpt-4o-mini',
            provider: 'openai',
        };
    }
    if (anthropicKey) {
        // Anthropic has its own API format — we use the messages endpoint
        return {
            baseUrl: 'https://api.anthropic.com',
            apiKey: anthropicKey,
            model: process.env.NEURCODE_INTENT_MODEL || 'claude-3-haiku-20240307',
            provider: 'anthropic',
        };
    }
    return null;
}
const SYSTEM_PROMPT = `You are a code governance assistant. Analyze the developer intent and return ONLY valid JSON.
No markdown, no explanation, no code blocks — pure JSON object only.

The JSON must match this schema exactly:
{
  "semanticDescription": "1-2 sentences describing what this change does and why",
  "domains": ["array of affected code domains: auth|api|database|payment|security|ui|notification|file|testing|infrastructure|cache|queue|background-job|monitoring|config"],
  "affectedLayerHints": ["which architectural layers are touched: middleware|route-handler|service|repository|model|migration|component|hook|util|config|test|infra"],
  "expectedFilePatterns": ["glob patterns for files likely to be touched: e.g. **/middleware/*.ts, **/routes/**.ts"],
  "policyApplicability": ["policy IDs that must be checked: validate-input|handle-errors|require-auth|rate-limiting|no-hardcoded-secrets|secure-cookies|no-sql-injection|audit-logs|idempotency|file-type-validation"],
  "riskLevel": "low|medium|high|critical",
  "riskRationale": "1 sentence explaining the risk level",
  "semanticKeywords": ["enriched keyword set for file retrieval — include synonyms, related terms, file/function name hints"]
}`;
function buildUserMessage(intent) {
    const truncated = intent.slice(0, MAX_INTENT_LEN);
    return `Developer intent: "${truncated}"

Analyze this intent and produce the governance expansion JSON.`;
}
async function callOpenAICompatible(config, intent) {
    const { request: httpsRequest } = await Promise.resolve().then(() => __importStar(require('https')));
    const { request: httpRequest } = await Promise.resolve().then(() => __importStar(require('http')));
    const body = JSON.stringify({
        model: config.model,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserMessage(intent) },
        ],
        temperature: 0, // deterministic output
        max_tokens: 800,
        response_format: { type: 'json_object' },
    });
    const url = new URL(`${config.baseUrl}/chat/completions`);
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Length': Buffer.byteLength(body).toString(),
    };
    if (config.provider === 'openai') {
        headers['OpenAI-Beta'] = 'assistants=v1';
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('LLM call timed out')), LLM_TIMEOUT_MS);
        const req = requestFn({
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => {
                clearTimeout(timer);
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error?.message) {
                        reject(new Error(`LLM API error: ${parsed.error.message}`));
                        return;
                    }
                    const content = parsed.choices?.[0]?.message?.content;
                    if (!content) {
                        reject(new Error('LLM returned empty content'));
                        return;
                    }
                    const jsonContent = JSON.parse(content);
                    const validated = SemanticExpansionResponseSchema.parse(jsonContent);
                    resolve(validated);
                }
                catch (err) {
                    reject(err instanceof Error ? err : new Error(String(err)));
                }
            });
        });
        req.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        req.write(body);
        req.end();
    });
}
async function callAnthropicAPI(config, intent) {
    const { request: httpsRequest } = await Promise.resolve().then(() => __importStar(require('https')));
    const body = JSON.stringify({
        model: config.model,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [
            { role: 'user', content: buildUserMessage(intent) },
        ],
    });
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body).toString(),
    };
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Anthropic API timed out')), LLM_TIMEOUT_MS);
        const req = httpsRequest({
            hostname: 'api.anthropic.com',
            port: 443,
            path: '/v1/messages',
            method: 'POST',
            headers,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => {
                clearTimeout(timer);
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error?.message) {
                        reject(new Error(`Anthropic API error: ${parsed.error.message}`));
                        return;
                    }
                    const textBlock = parsed.content?.find((c) => c.type === 'text');
                    const content = textBlock?.text;
                    if (!content) {
                        reject(new Error('Anthropic returned empty content'));
                        return;
                    }
                    const jsonContent = JSON.parse(content);
                    const validated = SemanticExpansionResponseSchema.parse(jsonContent);
                    resolve(validated);
                }
                catch (err) {
                    reject(err instanceof Error ? err : new Error(String(err)));
                }
            });
        });
        req.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        req.write(body);
        req.end();
    });
}
// ── Keyword fallback ───────────────────────────────────────────────────────────
function buildKeywordFallback(intent) {
    const parsed = (0, parser_1.parseIntent)(intent);
    const domainToLayer = {
        auth: ['middleware', 'route-handler', 'service'],
        api: ['route-handler', 'middleware', 'service'],
        database: ['repository', 'model', 'migration'],
        payment: ['service', 'route-handler', 'config'],
        security: ['middleware', 'util', 'config'],
        ui: ['component', 'hook'],
        notification: ['service', 'queue'],
        file: ['service', 'util'],
        testing: ['test'],
    };
    const domainToPatterns = {
        auth: ['**/auth/**/*.ts', '**/middleware/auth*.ts'],
        api: ['**/routes/**/*.ts', '**/controllers/**/*.ts'],
        database: ['**/migrations/**', '**/models/**/*.ts'],
        payment: ['**/payment/**/*.ts', '**/billing/**/*.ts'],
        security: ['**/security/**/*.ts', '**/utils/sanitize*.ts'],
        ui: ['**/components/**/*.tsx', '**/pages/**/*.tsx'],
        notification: ['**/notification/**/*.ts'],
        file: ['**/upload/**/*.ts', '**/storage/**/*.ts'],
        testing: ['**/*.test.ts', '**/*.spec.ts'],
    };
    const layers = new Set();
    const patterns = new Set();
    for (const domain of parsed.domains) {
        for (const l of (domainToLayer[domain] ?? []))
            layers.add(l);
        for (const p of (domainToPatterns[domain] ?? []))
            patterns.add(p);
    }
    const lower = intent.toLowerCase();
    const riskLevel = parsed.domains.includes('security') || parsed.domains.includes('auth') ? 'high'
        : parsed.domains.includes('payment') || parsed.domains.includes('database') ? 'medium'
            : 'low';
    return {
        semanticDescription: `Keyword-analyzed intent touching domains: ${parsed.domains.join(', ') || 'general'}`,
        domains: parsed.domains,
        affectedLayerHints: Array.from(layers),
        expectedFilePatterns: Array.from(patterns),
        policyApplicability: parsed.criticalRules,
        riskLevel,
        riskRationale: `Based on keyword analysis of domains: ${parsed.domains.join(', ') || 'undetected'}`,
        semanticKeywords: [
            ...lower.split(/\W+/).filter((t) => t.length > 3),
            ...parsed.domains,
            ...parsed.expectedPatterns,
        ].slice(0, 30),
    };
}
/**
 * Expands an intent into a rich semantic governance artifact.
 *
 * Call flow:
 *  1. Check cache (.neurcode/intent-expansions/{hash}.json)
 *  2. If fresh cached → return it (pure deterministic path)
 *  3. If no cache and LLM available → call LLM once, sign, store, return
 *  4. If no cache and no LLM → keyword fallback, sign, store, return
 *
 * The returned artifact is always HMAC-signed if a signing key is configured.
 * Callers must treat this artifact as the authoritative intent record.
 */
async function expandIntent(rawIntent, options) {
    const { cwd, forceRefresh = false, skipSigning = false } = options;
    const hash = intentHash(rawIntent);
    // ── 1. Cache hit ─────────────────────────────────────────────────────────
    if (!forceRefresh) {
        const cached = loadExpansion(cwd, hash);
        if (cached)
            return cached;
    }
    // ── 2. Attempt LLM call ───────────────────────────────────────────────────
    const llmConfig = resolveLLMConfig();
    let response = null;
    let modelUsed = null;
    let expansionMethod = 'keyword-fallback';
    if (llmConfig) {
        try {
            if (llmConfig.provider === 'anthropic') {
                response = await callAnthropicAPI(llmConfig, rawIntent);
            }
            else {
                response = await callOpenAICompatible(llmConfig, rawIntent);
            }
            modelUsed = llmConfig.model;
            expansionMethod = 'llm';
        }
        catch {
            // Silent fallback — governance must never block on LLM availability
            response = null;
        }
    }
    // ── 3. Keyword fallback if LLM unavailable or failed ─────────────────────
    if (!response) {
        response = buildKeywordFallback(rawIntent);
        expansionMethod = 'keyword-fallback';
        modelUsed = null;
    }
    // ── 4. Assemble artifact ──────────────────────────────────────────────────
    const parsedKeyword = (0, parser_1.parseIntent)(rawIntent);
    const expansion = {
        ...response,
        intentHash: hash,
        rawIntent,
        expansionMethod,
        modelUsed,
        expandedAt: new Date().toISOString(),
        parsedKeyword,
    };
    // ── 5. Sign the artifact ──────────────────────────────────────────────────
    let signed = expansion;
    if (!skipSigning) {
        const signingConfig = (0, artifact_signature_1.resolveGovernanceArtifactSigningConfigFromEnv)();
        signed = (0, artifact_signature_1.signGovernanceArtifact)(expansion, signingConfig);
    }
    // ── 6. Persist ────────────────────────────────────────────────────────────
    saveExpansion(cwd, hash, signed);
    return signed;
}
// ── Persistence helpers ────────────────────────────────────────────────────────
function loadExpansion(cwd, hash) {
    const path = expansionFilePath(cwd, hash);
    if (!(0, fs_1.existsSync)(path))
        return null;
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' ||
            parsed === null ||
            !parsed.intentHash) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function saveExpansion(cwd, hash, expansion) {
    try {
        const dir = expansionDir(cwd);
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        const path = expansionFilePath(cwd, hash);
        const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
        (0, fs_1.writeFileSync)(tmp, JSON.stringify(expansion, null, 2), 'utf-8');
        (0, fs_1.renameSync)(tmp, path);
    }
    catch {
        // Non-fatal: expansion persistence failure must never block plan/verify
    }
}
// ── Public load/verify helpers ────────────────────────────────────────────────
/**
 * Loads a cached expansion for an intent, or null if not found.
 * Used by verify/plan to retrieve the stored governance artifact.
 */
function loadCachedExpansion(cwd, rawIntent) {
    return loadExpansion(cwd, intentHash(rawIntent));
}
/**
 * Lists all cached expansion hashes in this workspace.
 */
function listCachedExpansions(cwd) {
    const dir = expansionDir(cwd);
    if (!(0, fs_1.existsSync)(dir))
        return [];
    try {
        const { readdirSync } = require('fs');
        return readdirSync(dir)
            .filter((f) => f.endsWith('.json') && !f.includes('.tmp'))
            .map((f) => f.replace(/\.json$/, ''));
    }
    catch {
        return [];
    }
}
/**
 * Returns a human-readable summary of what the intent expander knows.
 * Useful for `neurcode intent show` command and audit reports.
 */
function formatExpansionSummary(exp) {
    const lines = [];
    lines.push(`Intent:       ${exp.rawIntent.slice(0, 120)}`);
    lines.push(`Hash:         ${exp.intentHash.slice(0, 16)}...`);
    lines.push(`Method:       ${exp.expansionMethod}${exp.modelUsed ? ` (${exp.modelUsed})` : ''}`);
    lines.push(`Risk:         ${exp.riskLevel.toUpperCase()} — ${exp.riskRationale}`);
    lines.push(`Domains:      ${exp.domains.join(', ') || '(none)'}`);
    lines.push(`Layers:       ${exp.affectedLayerHints.join(', ') || '(none)'}`);
    lines.push(`Policies:     ${exp.policyApplicability.join(', ') || '(none)'}`);
    lines.push(`File hints:   ${exp.expectedFilePatterns.join(', ') || '(none)'}`);
    lines.push(`Signed:       ${exp.signature ? `yes (keyId=${exp.signature.keyId ?? 'local'})` : 'no'}`);
    lines.push(`Expanded at:  ${exp.expandedAt}`);
    return lines.join('\n');
}
//# sourceMappingURL=semantic-expander.js.map