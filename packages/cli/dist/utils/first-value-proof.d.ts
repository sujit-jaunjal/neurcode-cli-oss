import { type FirstValueState } from '@neurcode-ai/contracts';
export interface FirstValueCliState extends FirstValueState {
    local: {
        cliInstalled: true;
        repoDetected: boolean;
        environment: {
            target: string;
            label: string;
            basis: string;
        };
        runtimeAdapterReady: boolean;
        apiReachable: boolean | null;
    };
}
export interface BuildFirstValueCliOptions {
    dir?: string;
    agent?: string;
}
export declare function buildFirstValueCliState(options?: BuildFirstValueCliOptions): Promise<FirstValueCliState>;
export declare function renderFirstValueStart(state: FirstValueCliState): string;
export declare function renderFirstValueReport(state: FirstValueCliState): string;
//# sourceMappingURL=first-value-proof.d.ts.map