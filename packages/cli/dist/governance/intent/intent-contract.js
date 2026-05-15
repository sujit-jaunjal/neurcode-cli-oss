"use strict";
/**
 * Intent Contract — declarative architectural intent.
 *
 * Canonical path: `.neurcode/intent.json` (project-relative).
 *
 * The contract is the *human-authored* form. The loader validates it and
 * converts it into a typed `IntentGraph` for the drift engine.
 *
 * Canonical form is JSON for two reasons:
 *   1. Replay determinism — JSON parsing is locale-free and YAML has historical
 *      ambiguities ("yes" → bool, leading zeros, multiline). The contract is a
 *      replay-relevant artifact, so we lock it to JSON.
 *   2. Zero extra dependencies — adding a YAML parser to the CLI is unjustified
 *      for a configuration file the team writes once.
 *
 * Contract example:
 *
 *   {
 *     "schemaVersion": 1,
 *     "layers": [
 *       { "id": "controller", "glob": ["src/commands/**", "src/handlers/**"] },
 *       { "id": "service",    "glob": ["src/services/**"] },
 *       { "id": "persistence","glob": ["src/repositories/**", "src/db/**"] }
 *     ],
 *     "allowedEdges": [
 *       { "from": "controller", "to": "service" },
 *       { "from": "service",    "to": "persistence" }
 *     ],
 *     "forbiddenEdges": [
 *       { "from": "controller", "to": "persistence",
 *         "reason": "Controllers must access data via service layer" }
 *     ]
 *   }
 *
 * Intelligence classification: DETERMINISTIC.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTENT_CONTRACT_RELATIVE_PATH = exports.INTENT_CONTRACT_FILENAME = void 0;
exports.resolveIntentContractPath = resolveIntentContractPath;
exports.loadIntentContract = loadIntentContract;
exports.buildIntentGraphFromRaw = buildIntentGraphFromRaw;
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const intent_graph_1 = require("./intent-graph");
// ── Canonical artifact path ──────────────────────────────────────────────────
exports.INTENT_CONTRACT_FILENAME = 'intent.json';
exports.INTENT_CONTRACT_RELATIVE_PATH = `.neurcode/${exports.INTENT_CONTRACT_FILENAME}`;
// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Resolve the canonical contract path for a project. Does not check existence.
 */
function resolveIntentContractPath(projectRoot, override) {
    if (override) {
        return (0, path_1.resolve)(projectRoot, override);
    }
    return (0, path_1.join)(projectRoot, '.neurcode', exports.INTENT_CONTRACT_FILENAME);
}
/**
 * Load and validate the intent contract for a project.
 *
 * Behaviour:
 *   - If the file does not exist → `exists: false`, graph is empty, no errors.
 *   - If the file is malformed JSON → `exists: true`, graph is empty, `errors`
 *     contains the parser error.
 *   - If the schema is wrong → `exists: true`, graph is empty, `errors` lists
 *     every validation failure.
 *   - On success → `exists: true`, graph is populated, errors is empty.
 *
 * The loader never throws. Drift detection is opt-in; an unparseable contract
 * must not break verification.
 */
function loadIntentContract(projectRoot, override) {
    const contractPath = resolveIntentContractPath(projectRoot, override);
    if (!(0, fs_1.existsSync)(contractPath)) {
        return {
            path: contractPath,
            exists: false,
            graph: intent_graph_1.EMPTY_INTENT_GRAPH,
            errors: [],
            warnings: [],
        };
    }
    let raw;
    try {
        raw = (0, fs_1.readFileSync)(contractPath, 'utf8');
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            path: contractPath,
            exists: true,
            graph: intent_graph_1.EMPTY_INTENT_GRAPH,
            errors: [`failed to read intent contract: ${msg}`],
            warnings: [],
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            path: contractPath,
            exists: true,
            graph: intent_graph_1.EMPTY_INTENT_GRAPH,
            errors: [`invalid JSON in intent contract: ${msg}`],
            warnings: [],
        };
    }
    return validateAndBuildGraph(parsed, contractPath);
}
/**
 * Parse + validate a raw contract value (already-parsed JSON) and build the graph.
 * Exposed for tests so we don't need to touch the filesystem.
 */
function buildIntentGraphFromRaw(raw) {
    return validateAndBuildGraph(raw, '<inline>');
}
// ── Validation ───────────────────────────────────────────────────────────────
function validateAndBuildGraph(raw, sourcePath) {
    const errors = [];
    const warnings = [];
    if (raw === null || typeof raw !== 'object') {
        return {
            path: sourcePath,
            exists: true,
            graph: intent_graph_1.EMPTY_INTENT_GRAPH,
            errors: ['intent contract must be a JSON object'],
            warnings: [],
        };
    }
    const obj = raw;
    // Schema version
    const schemaVersion = obj.schemaVersion;
    if (schemaVersion !== intent_graph_1.INTENT_GRAPH_SCHEMA_VERSION) {
        errors.push(`unsupported schemaVersion: expected ${intent_graph_1.INTENT_GRAPH_SCHEMA_VERSION}, got ${JSON.stringify(schemaVersion)}`);
    }
    // Allowed top-level fields (anything else surfaces as a warning)
    const KNOWN_FIELDS = new Set([
        'schemaVersion',
        'layers',
        'modules',
        'trustBoundaries',
        'allowedEdges',
        'forbiddenEdges',
    ]);
    for (const key of Object.keys(obj)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(`unknown top-level field: ${key}`);
        }
    }
    const layers = validateLayers(obj.layers, errors);
    const modules = validateModules(obj.modules, errors);
    const trustBoundaries = validateTrustBoundaries(obj.trustBoundaries, errors);
    const allowedEdges = validateEdges('allowedEdges', obj.allowedEdges, errors, layers);
    const forbiddenEdges = validateEdges('forbiddenEdges', obj.forbiddenEdges, errors, layers);
    // Soft warnings on the resulting shape
    for (const layer of layers) {
        if (layer.glob.length === 0) {
            warnings.push(`layer "${layer.id}" has no glob patterns; nothing will be classified into it`);
        }
    }
    if (errors.length > 0) {
        return {
            path: sourcePath,
            exists: true,
            graph: intent_graph_1.EMPTY_INTENT_GRAPH,
            errors,
            warnings,
        };
    }
    const graph = {
        schemaVersion: intent_graph_1.INTENT_GRAPH_SCHEMA_VERSION,
        layers,
        modules,
        trustBoundaries,
        allowedEdges,
        forbiddenEdges,
        fingerprint: fingerprintGraph({
            layers,
            modules,
            trustBoundaries,
            allowedEdges,
            forbiddenEdges,
        }),
    };
    return {
        path: sourcePath,
        exists: true,
        graph,
        errors: [],
        warnings,
    };
}
function validateLayers(value, errors) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        errors.push('"layers" must be an array');
        return [];
    }
    const out = [];
    const seenIds = new Set();
    for (let i = 0; i < value.length; i += 1) {
        const layer = value[i];
        if (layer === null || typeof layer !== 'object') {
            errors.push(`layers[${i}] must be an object`);
            continue;
        }
        const rec = layer;
        const id = rec.id;
        if (typeof id !== 'string' || id.length === 0) {
            errors.push(`layers[${i}].id must be a non-empty string`);
            continue;
        }
        if (seenIds.has(id)) {
            errors.push(`layers[${i}].id "${id}" is a duplicate`);
            continue;
        }
        seenIds.add(id);
        const glob = rec.glob;
        if (!Array.isArray(glob) || !glob.every((g) => typeof g === 'string')) {
            errors.push(`layers[${i}].glob must be an array of strings`);
            continue;
        }
        const description = typeof rec.description === 'string' ? rec.description : undefined;
        out.push({ id, description, glob: glob });
    }
    return out;
}
function validateModules(value, errors) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        errors.push('"modules" must be an array');
        return [];
    }
    const out = [];
    const seenIds = new Set();
    for (let i = 0; i < value.length; i += 1) {
        const m = value[i];
        if (m === null || typeof m !== 'object') {
            errors.push(`modules[${i}] must be an object`);
            continue;
        }
        const rec = m;
        const id = rec.id;
        if (typeof id !== 'string' || id.length === 0) {
            errors.push(`modules[${i}].id must be a non-empty string`);
            continue;
        }
        if (seenIds.has(id)) {
            errors.push(`modules[${i}].id "${id}" is a duplicate`);
            continue;
        }
        seenIds.add(id);
        const glob = rec.glob;
        if (!Array.isArray(glob) || !glob.every((g) => typeof g === 'string')) {
            errors.push(`modules[${i}].glob must be an array of strings`);
            continue;
        }
        let entryGlob;
        if (rec.entryGlob !== undefined) {
            if (!Array.isArray(rec.entryGlob) || !rec.entryGlob.every((g) => typeof g === 'string')) {
                errors.push(`modules[${i}].entryGlob must be an array of strings`);
                continue;
            }
            entryGlob = rec.entryGlob;
        }
        const description = typeof rec.description === 'string' ? rec.description : undefined;
        out.push({ id, description, glob: glob, ...(entryGlob ? { entryGlob } : {}) });
    }
    return out;
}
function validateTrustBoundaries(value, errors) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        errors.push('"trustBoundaries" must be an array');
        return [];
    }
    const out = [];
    const seenIds = new Set();
    const VALID_RULES = new Set(['inbound_only', 'outbound_only', 'requires_review']);
    for (let i = 0; i < value.length; i += 1) {
        const tb = value[i];
        if (tb === null || typeof tb !== 'object') {
            errors.push(`trustBoundaries[${i}] must be an object`);
            continue;
        }
        const rec = tb;
        const id = rec.id;
        if (typeof id !== 'string' || id.length === 0) {
            errors.push(`trustBoundaries[${i}].id must be a non-empty string`);
            continue;
        }
        if (seenIds.has(id)) {
            errors.push(`trustBoundaries[${i}].id "${id}" is a duplicate`);
            continue;
        }
        seenIds.add(id);
        const description = rec.description;
        if (typeof description !== 'string' || description.length === 0) {
            errors.push(`trustBoundaries[${i}].description must be a non-empty string`);
            continue;
        }
        const insideGlob = rec.insideGlob;
        if (!Array.isArray(insideGlob) || !insideGlob.every((g) => typeof g === 'string')) {
            errors.push(`trustBoundaries[${i}].insideGlob must be an array of strings`);
            continue;
        }
        const edgeRule = rec.edgeRule;
        if (typeof edgeRule !== 'string' || !VALID_RULES.has(edgeRule)) {
            errors.push(`trustBoundaries[${i}].edgeRule must be one of: ${[...VALID_RULES].join(', ')}`);
            continue;
        }
        out.push({
            id,
            description,
            insideGlob: insideGlob,
            edgeRule: edgeRule,
        });
    }
    return out;
}
function validateEdges(fieldName, value, errors, layers) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        errors.push(`"${fieldName}" must be an array`);
        return [];
    }
    const knownLayerIds = new Set(layers.map((l) => l.id));
    const out = [];
    for (let i = 0; i < value.length; i += 1) {
        const e = value[i];
        if (e === null || typeof e !== 'object') {
            errors.push(`${fieldName}[${i}] must be an object`);
            continue;
        }
        const rec = e;
        const from = rec.from;
        const to = rec.to;
        if (typeof from !== 'string' || from.length === 0) {
            errors.push(`${fieldName}[${i}].from must be a non-empty string`);
            continue;
        }
        if (typeof to !== 'string' || to.length === 0) {
            errors.push(`${fieldName}[${i}].to must be a non-empty string`);
            continue;
        }
        if (!knownLayerIds.has(from)) {
            errors.push(`${fieldName}[${i}].from "${from}" references unknown layer`);
            continue;
        }
        if (!knownLayerIds.has(to)) {
            errors.push(`${fieldName}[${i}].to "${to}" references unknown layer`);
            continue;
        }
        const reason = typeof rec.reason === 'string' ? rec.reason : undefined;
        out.push({ from, to, ...(reason ? { reason } : {}) });
    }
    return out;
}
// ── Fingerprinting ───────────────────────────────────────────────────────────
/**
 * Produce a deterministic fingerprint of the contract contents.
 * Used in replay envelopes so runs can be tied back to a specific contract version.
 */
function fingerprintGraph(input) {
    // Canonicalise: stable key order, no insignificant whitespace.
    const canonical = canonicalStringify({
        layers: input.layers,
        modules: input.modules,
        trustBoundaries: input.trustBoundaries,
        allowedEdges: input.allowedEdges,
        forbiddenEdges: input.forbiddenEdges,
    });
    return `sha256:${(0, crypto_1.createHash)('sha256').update(canonical).digest('hex')}`;
}
/** JSON.stringify with deterministic key ordering. */
function canonicalStringify(value) {
    if (value === null)
        return 'null';
    if (typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(canonicalStringify).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`);
    return `{${parts.join(',')}}`;
}
//# sourceMappingURL=intent-contract.js.map