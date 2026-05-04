/**
 * Domain Requirements Map — declares the set of components expected for each
 * implementation domain, their weights, and which ones are security-critical.
 *
 * Keep keys lowercase-kebab.  They are used as-is in user-facing output so
 * they should be readable without further transformation.
 */
export type ComponentKey = string;
export declare const DOMAIN_REQUIREMENTS: Record<string, ComponentKey[]>;
export declare const COMPONENT_WEIGHTS: Record<string, number>;
export declare const CRITICAL_COMPONENTS: Set<string>;
export declare function weightOf(key: ComponentKey): number;
export declare function isCritical(key: ComponentKey): boolean;
/**
 * Human-readable label for a component key, used in CLI output.
 */
export declare function labelForComponent(key: ComponentKey): string;
/**
 * Returns the requirements list for a domain, or [] if the domain is unknown.
 */
export declare function requirementsForDomain(domain: string): ComponentKey[];
//# sourceMappingURL=requirements.d.ts.map