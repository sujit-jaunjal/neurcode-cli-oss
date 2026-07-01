import { type ActivationAgentTarget, type ActivationEventType, type ActivationStage, type ActivationTelemetryEvent } from '@neurcode-ai/contracts';
interface ActivationTelemetryStore {
    version: 1;
    anonymousInstallId: string;
    enabled: boolean;
    firstRunNoticeShown: boolean;
    queue: ActivationTelemetryEvent[];
    updatedAt: string;
}
export interface TrackActivationOptions {
    eventType: ActivationEventType;
    commandFamily?: string | null;
    agentTarget?: ActivationAgentTarget | null;
    stage?: ActivationStage | null;
    reasonCode?: string | null;
    success?: boolean | null;
    flush?: boolean;
}
export declare function activationTelemetryPath(): string;
export declare function activationTelemetryEnabled(): boolean;
export declare function setActivationTelemetryEnabled(enabled: boolean): void;
export declare function buildActivationTelemetryEvent(store: ActivationTelemetryStore, options: TrackActivationOptions): ActivationTelemetryEvent;
export declare function maybeShowActivationTelemetryNotice(): void;
export declare function trackActivationEvent(options: TrackActivationOptions): void;
export declare function flushActivationTelemetry(): Promise<{
    attempted: number;
    sent: number;
    remaining: number;
}>;
export declare function getActivationTelemetryStatus(): {
    enabled: boolean;
    envDisabled: boolean;
    anonymousInstallId: string;
    queueLength: number;
    path: string;
};
export {};
//# sourceMappingURL=activation-telemetry.d.ts.map