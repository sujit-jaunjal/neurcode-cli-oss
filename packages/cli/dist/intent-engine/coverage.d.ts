/**
 * Coverage Computation — measures how complete an implementation is relative
 * to the requirements declared in requirements.ts.
 *
 * No side effects.  Pure functions only.
 */
import { type ComponentKey } from './requirements';
import type { ComponentQualityLevel } from './matcher';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type SystemStatus = 'SECURE' | 'AT RISK' | 'CRITICAL';
export interface DomainCoverage {
    domain: string;
    /** 0–1 fraction of required components that were detected. */
    coverage: number;
    /** Integer percentage (0–100), rounded. */
    coveragePct: number;
    total: number;
    found: number;
    /** Component keys that were NOT detected. */
    missing: ComponentKey[];
    /** Component keys that WERE detected. */
    foundList: ComponentKey[];
    confidence: ConfidenceLevel;
    /** Weighted coverage: Σweight(found)/Σweight(all), 0–1. */
    weightedCoverage: number;
    /** Critical components from this domain that are missing. */
    criticalMissing: ComponentKey[];
    status: SystemStatus;
}
export interface IntentSummary {
    /** Primary domain (first in the list, or best-coverage domain). */
    domain: string;
    coverage: number;
    coveragePct: number;
    confidence: ConfidenceLevel;
    missing: ComponentKey[];
    foundList: ComponentKey[];
    /** Per-domain breakdown when multiple domains are involved. */
    domains: DomainCoverage[];
    /** Overall weighted coverage across all domains, 0–1. */
    weightedCoverage: number;
    /** Aggregated system status across all domains. */
    status: SystemStatus;
    /** Critical components that are missing across all domains. */
    criticalMissing: ComponentKey[];
    /** Component key → file paths where each component was detected. */
    componentMap: Record<string, string[]>;
    /** Component key → quality level of detection signal. */
    componentQuality: Record<string, ComponentQualityLevel>;
}
export declare function computeWeightedCoverage(domain: string, foundComponents: string[]): {
    weightedScore: number;
    maxScore: number;
    coverage: number;
};
/**
 * Compute coverage for a single domain given the set of detected components.
 */
export declare function computeCoverage(domain: string, foundComponents: string[]): DomainCoverage;
/**
 * Build an IntentSummary from the per-domain foundComponents map.
 * When multiple domains are active the primary domain is the one with
 * the most requirements (most comprehensive), and overall coverage is
 * a weighted average.
 */
export declare function computeIntentSummary(checkedDomains: string[], foundComponents: Record<string, string[]>, componentMap?: Record<string, string[]>, componentQuality?: Record<string, ComponentQualityLevel>): IntentSummary | null;
export declare function formatCoverageBar(pct: number, width?: number): string;
export declare function formatComponentLabel(key: ComponentKey): string;
//# sourceMappingURL=coverage.d.ts.map