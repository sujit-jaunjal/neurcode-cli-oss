import { type GovernanceSession, type IntentRedactionReasonCode, type IntentSummaryV1 } from '@neurcode-ai/governance-runtime';
export declare const RUNTIME_CLOUD_SESSION_SCHEMA_VERSION: "neurcode.runtime-cloud-session.v1";
export declare const RUNTIME_LIVE_SESSION_SCHEMA_VERSION: "neurcode.runtime-live-session.v3";
type UnknownRecord = Record<string, unknown>;
export declare function buildRuntimeIntentSummary(session: GovernanceSession, classification?: 'cloud_safe' | 'shareable'): IntentSummaryV1;
export declare function buildCloudSafeRuntimeSession(session: GovernanceSession): UnknownRecord;
export declare function projectRuntimePayloadForCloud(payload: UnknownRecord): UnknownRecord;
export declare function runtimePrivacySchemaVersions(): string[];
export declare function privacyReasonCodesFromError(error: unknown): IntentRedactionReasonCode[];
export {};
//# sourceMappingURL=runtime-privacy.d.ts.map