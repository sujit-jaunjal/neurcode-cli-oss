/**
 * Domain Taxonomy — explicit architectural domain classification.
 * Includes positive keywords, negative examples, and exclusion rules
 * to prevent misclassification of resilience/infra patterns as security.
 */
export interface DomainDefinition {
    id: string;
    displayName: string;
    description: string;
    keywords: string[];
    /** Keywords that match this domain's tokens but belong to ANOTHER domain */
    negativeExamples: string[];
    /** If any of these terms appear, this domain CANNOT be the primary classification */
    exclusionTerms: string[];
    /** Other domain IDs that commonly co-occur with this one */
    relatedDomains: string[];
    /** Base risk level when this domain is the PRIMARY domain */
    baseRisk: 'low' | 'medium' | 'high' | 'critical';
}
export declare const ALL_DOMAINS: DomainDefinition[];
/**
 * Classify an intent string into domains.
 * Returns: { primary: string[], secondary: string[], confidence: number }
 *
 * Algorithm:
 * 1. Score each domain by counting keyword matches (case-insensitive)
 * 2. Apply exclusion rules — remove domains where exclusion terms dominate
 * 3. Primary domains: score >= 2 matches
 * 4. Secondary domains: score == 1 match, not excluded
 * 5. Confidence: 1.0 if clear winner, 0.7 if multiple tied domains, 0.5 if mostly secondary
 */
export declare function classifyDomains(intent: string): {
    primary: string[];
    secondary: string[];
    confidence: number;
};
/**
 * Get the effective risk level for a set of classified domains.
 * Returns the highest base risk among primary domains.
 */
export declare function getEffectiveRisk(primaryDomains: string[]): 'low' | 'medium' | 'high' | 'critical';
//# sourceMappingURL=domain-taxonomy.d.ts.map