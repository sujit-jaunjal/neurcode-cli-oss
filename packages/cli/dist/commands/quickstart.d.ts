/**
 * Quickstart Command
 *
 * Local-only governance sandbox. For the connected enterprise onboarding
 * lifecycle, use: neurcode login -> neurcode init -> neurcode start.
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