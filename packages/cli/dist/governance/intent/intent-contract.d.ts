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
import { type IntentGraph } from './intent-graph';
export declare const INTENT_CONTRACT_FILENAME = "intent.json";
export declare const INTENT_CONTRACT_RELATIVE_PATH = ".neurcode/intent.json";
export interface IntentContractLoadResult {
    /** Absolute path the loader probed. */
    path: string;
    /** True if a contract file exists at `path`. */
    exists: boolean;
    /** Parsed graph, or `EMPTY_INTENT_GRAPH` when absent / invalid. */
    graph: IntentGraph;
    /** Validation errors encountered while loading. Empty array on success. */
    errors: string[];
    /** Soft warnings — e.g. unknown fields, zero-glob layer. */
    warnings: string[];
}
/**
 * Resolve the canonical contract path for a project. Does not check existence.
 */
export declare function resolveIntentContractPath(projectRoot: string, override?: string): string;
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
export declare function loadIntentContract(projectRoot: string, override?: string): IntentContractLoadResult;
/**
 * Parse + validate a raw contract value (already-parsed JSON) and build the graph.
 * Exposed for tests so we don't need to touch the filesystem.
 */
export declare function buildIntentGraphFromRaw(raw: unknown): IntentContractLoadResult;
//# sourceMappingURL=intent-contract.d.ts.map