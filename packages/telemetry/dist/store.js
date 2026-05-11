"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.telemetryEventsPath = telemetryEventsPath;
exports.appendGovernanceTelemetryEvent = appendGovernanceTelemetryEvent;
exports.appendVerifyCompletedFromCanonical = appendVerifyCompletedFromCanonical;
const fs_1 = require("fs");
const path_1 = require("path");
const contracts_1 = require("./contracts");
const harvest_verify_1 = require("./harvest-verify");
const stable_json_1 = require("./stable-json");
const REL_DIR = (0, path_1.join)('.neurcode', 'telemetry');
const EVENTS_FILE = 'governance-events.jsonl';
function telemetryEventsPath(repoRoot) {
    return (0, path_1.join)(repoRoot, REL_DIR, EVENTS_FILE);
}
/**
 * Append one telemetry line. Never throws — calibration must not break verify.
 */
function appendGovernanceTelemetryEvent(repoRoot, envelope) {
    try {
        const dir = (0, path_1.join)(repoRoot, REL_DIR);
        if (!(0, fs_1.existsSync)(dir)) {
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        }
        const line = (0, stable_json_1.stableStringify)({
            ...envelope,
            schemaVersion: contracts_1.GOVERNANCE_TELEMETRY_SCHEMA_VERSION,
        });
        (0, fs_1.appendFileSync)(telemetryEventsPath(repoRoot), `${line}\n`, 'utf8');
    }
    catch {
        // intentional swallow
    }
}
/**
 * Record verify completion from canonical CLI verify JSON (already normalized).
 */
function appendVerifyCompletedFromCanonical(repoRoot, canonical, runId) {
    const harvested = (0, harvest_verify_1.harvestGovernanceVerifyCompleted)(canonical);
    if (!harvested) {
        return;
    }
    const envelope = {
        schemaVersion: contracts_1.GOVERNANCE_TELEMETRY_SCHEMA_VERSION,
        emittedAt: new Date().toISOString(),
        eventType: 'governance.verify.completed',
        runId: runId ?? null,
        findingSetDigest: harvested.findingSetDigest,
        payload: harvested.payload,
    };
    appendGovernanceTelemetryEvent(repoRoot, envelope);
}
