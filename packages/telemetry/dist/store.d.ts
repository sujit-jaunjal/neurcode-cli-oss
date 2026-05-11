import type { GovernanceTelemetryEnvelope } from './contracts';
export declare function telemetryEventsPath(repoRoot: string): string;
/**
 * Append one telemetry line. Never throws — calibration must not break verify.
 */
export declare function appendGovernanceTelemetryEvent(repoRoot: string, envelope: GovernanceTelemetryEnvelope): void;
/**
 * Record verify completion from canonical CLI verify JSON (already normalized).
 */
export declare function appendVerifyCompletedFromCanonical(repoRoot: string, canonical: Record<string, unknown> | null, runId?: string | null): void;
