/**
 * Login Command
 *
 * Implements device flow authentication for CLI.
 * User runs `neurcode login` -> browser approval -> CLI saves a runtime credential
 */
export declare function loginCommand(options?: {
    orgId?: string;
    chooseWorkspace?: boolean;
}): Promise<void>;
//# sourceMappingURL=login.d.ts.map