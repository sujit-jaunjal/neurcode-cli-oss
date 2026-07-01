import { type GovernanceSession, type IntentRedactionReasonCode, type IntentSummaryV1 } from '@neurcode-ai/governance-runtime';
import { type RepoIntelligenceEvidence } from '@neurcode-ai/contracts';
export declare const RUNTIME_CLOUD_SESSION_SCHEMA_VERSION: "neurcode.runtime-cloud-session.v1";
export declare const RUNTIME_LIVE_SESSION_SCHEMA_VERSION: "neurcode.runtime-live-session.v3";
type UnknownRecord = Record<string, unknown>;
export declare function buildRuntimeIntentSummary(session: GovernanceSession, classification?: 'cloud_safe' | 'shareable'): IntentSummaryV1;
/**
 * Project a local `RepoIntelligenceEvidence` object into a source-free, depth-bounded form
 * safe to attach at the SESSION level of a cloud runtime payload. Returns null when the input
 * is not valid evidence or the bounded projection would still fail the cloud privacy gate —
 * in that case the session uploads WITHOUT repo-intelligence rather than failing the whole
 * upload (fail-safe: omit, never leak, never block other evidence).
 *
 * Source-freeness is structural (the producer already emits no source). This projection
 * additionally drops the deep `matchedFacts`/`related` arrays (depth 9+ even at session
 * level, and they carry path/symbol labels) and bounds every array/string. `graph.summary`
 * (languages, package/service names, counts) IS retained — it is depth-safe at session level
 * and powers the dashboard's language-coverage and graph-posture panels.
 */
export declare function projectRepoIntelligenceForCloud(value: unknown): RepoIntelligenceEvidence | null;
export declare function buildCloudSafeRuntimeSession(session: GovernanceSession): UnknownRecord;
export declare function projectRuntimePayloadForCloud(payload: UnknownRecord): UnknownRecord;
export declare function runtimePrivacySchemaVersions(): string[];
export declare function privacyReasonCodesFromError(error: unknown): IntentRedactionReasonCode[];
export {};
//# sourceMappingURL=runtime-privacy.d.ts.map