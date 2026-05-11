/**
 * Bootstrap Policy Command
 *
 * Generates deterministic, explainable starter enterprise policies
 * based on detected repo ecosystem.
 *
 * DESIGN PRINCIPLES:
 * - All templates are static and embedded — zero network, zero LLM
 * - All generated rules are deterministic and explainable
 * - No hallucinations, no probabilistic inference
 * - Output is always a valid .neurcode/policy.yml
 *
 * Ecosystem detection order:
 * 1. package.json → TypeScript/JavaScript
 * 2. requirements.txt / pyproject.toml / setup.py → Python
 * 3. go.mod → Go
 * 4. pom.xml / build.gradle → Java
 * 5. Dockerfile / docker-compose.yml → Container/infra
 * 6. Mixed (multiple ecosystems detected)
 * 7. Unknown (no ecosystem detected)
 */
export interface BootstrapPolicyOptions {
    force?: boolean;
    ecosystem?: string;
    profile?: string;
    json?: boolean;
}
export declare function bootstrapPolicyCommand(options?: BootstrapPolicyOptions): Promise<void>;
//# sourceMappingURL=bootstrap-policy.d.ts.map