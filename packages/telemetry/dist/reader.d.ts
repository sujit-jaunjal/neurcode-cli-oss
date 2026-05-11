import type { GovernanceTelemetryEnvelope } from './contracts';
/**
 * Load all telemetry envelopes from the local JSONL store (newest lines last).
 */
export declare function readGovernanceTelemetryEvents(repoRoot: string): GovernanceTelemetryEnvelope[];
