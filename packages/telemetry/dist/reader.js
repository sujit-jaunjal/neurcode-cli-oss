"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readGovernanceTelemetryEvents = readGovernanceTelemetryEvents;
const fs_1 = require("fs");
const contracts_1 = require("./contracts");
const store_1 = require("./store");
function isRecord(x) {
    return typeof x === 'object' && x !== null && !Array.isArray(x);
}
/**
 * Load all telemetry envelopes from the local JSONL store (newest lines last).
 */
function readGovernanceTelemetryEvents(repoRoot) {
    const path = (0, store_1.telemetryEventsPath)(repoRoot);
    if (!(0, fs_1.existsSync)(path)) {
        return [];
    }
    let raw;
    try {
        raw = (0, fs_1.readFileSync)(path, 'utf8');
    }
    catch {
        return [];
    }
    const out = [];
    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t) {
            continue;
        }
        try {
            const parsed = JSON.parse(t);
            if (!isRecord(parsed)) {
                continue;
            }
            if (parsed.schemaVersion !== contracts_1.GOVERNANCE_TELEMETRY_SCHEMA_VERSION) {
                continue;
            }
            out.push(parsed);
        }
        catch {
            continue;
        }
    }
    return out;
}
