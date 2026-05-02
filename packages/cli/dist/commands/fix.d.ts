interface FixOptions {
    planId?: string;
    projectId?: string;
    policyOnly?: boolean;
    staged?: boolean;
    head?: boolean;
    base?: string;
    json?: boolean;
    applySafe?: boolean;
}
export declare function fixCommand(options: FixOptions): Promise<void>;
export {};
//# sourceMappingURL=fix.d.ts.map