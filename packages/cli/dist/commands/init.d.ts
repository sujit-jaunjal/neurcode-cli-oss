/**
 * Init Command - Multi-Tenancy Project Linker
 *
 * Binds a local folder to a specific Organization + Project on the backend.
 *
 * Flow:
 * 1. Auth check - ensure user is logged in
 * 2. Fetch user's organizations via API
 * 3. Interactive org selection
 * 4. Link to existing project or create new
 * 5. Save .neurcode/config.json with orgId + projectId
 * 6. Success summary
 */
interface InitOptions {
    orgId?: string;
    create?: string;
    projectId?: string;
    bindingAction?: 'keep' | 'relink' | 'cancel';
}
export declare function initCommand(options?: InitOptions): Promise<void>;
export {};
//# sourceMappingURL=init.d.ts.map