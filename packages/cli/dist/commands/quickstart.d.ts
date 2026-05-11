/**
 * Quickstart Command
 *
 * Guided onboarding flow. Gets a new engineer to first deterministic finding
 * within 2 minutes. Zero interactive prompts. Zero network calls.
 *
 * What it does:
 * 1. Resolves project root (git repo required)
 * 2. Initializes .neurcode/ directory
 * 3. Writes starter policy if none exists
 * 4. Writes starter config skeleton if none exists
 * 5. Prints 5-step verify flow explanation
 * 6. Prints local-only mode explanation
 * 7. Recommends next commands
 */
export interface QuickstartOptions {
    json?: boolean;
    force?: boolean;
}
export declare function quickstartCommand(options?: QuickstartOptions): Promise<void>;
//# sourceMappingURL=quickstart.d.ts.map