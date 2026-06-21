export declare const INTENT_SUMMARY_SCHEMA_VERSION: "neurcode.intent-summary.v1";
export declare const INTENT_PRIVACY_POLICY_VERSION: "neurcode.intent-privacy.v1";
export type IntentActorType = 'human' | 'agent' | 'system' | 'unknown';
export type IntentScopeMode = 'explicit' | 'inferred' | 'ambiguous' | 'unknown';
export type IntentProvenanceSource = 'session_start' | 'agent_plan' | 'plan_amendment' | 'user_decision' | 'launcher_handshake' | 'session_continuation' | 'legacy_projection' | 'unknown';
export type IntentProvenanceClassification = 'local_private' | 'cloud_safe' | 'shareable';
export type IntentRedactionReasonCode = 'authorization_header' | 'api_token' | 'password_assignment' | 'private_key_marker' | 'credential_shaped_path' | 'control_character' | 'absolute_path' | 'path_traversal' | 'unsafe_path' | 'string_truncated' | 'array_truncated' | 'object_truncated' | 'depth_exceeded' | 'legacy_raw_intent' | 'legacy_raw_plan' | 'legacy_raw_message' | 'forbidden_field' | 'unbounded_string' | 'unbounded_array' | 'unbounded_object' | 'invalid_schema';
export interface IntentSummaryV1 {
    schemaVersion: typeof INTENT_SUMMARY_SCHEMA_VERSION;
    policyVersion: typeof INTENT_PRIVACY_POLICY_VERSION;
    intentHash: string;
    categories: string[];
    domains: string[];
    paths: string[];
    planRevision: number | null;
    scopeMode: IntentScopeMode;
    ruleIds: string[];
    counts: {
        characters: number;
        lines: number;
        paths: number;
        planSteps: number;
        events: number;
    };
    actorType: IntentActorType;
    createdAt: string | null;
    updatedAt: string | null;
    redaction: {
        status: 'none' | 'redacted' | 'truncated' | 'redacted_and_truncated' | 'unavailable';
        reasonCodes: IntentRedactionReasonCode[];
    };
    provenance: {
        classification: IntentProvenanceClassification;
        source: IntentProvenanceSource;
    };
    contentAvailable: false;
}
export interface LocalPrivateText {
    value: string;
    redacted: boolean;
    truncated: boolean;
    reasonCodes: IntentRedactionReasonCode[];
    originalLength: number;
}
export interface PrivacyValidationIssue {
    fieldPath: string;
    reasonCode: IntentRedactionReasonCode;
}
export interface CredentialDetection {
    detected: boolean;
    reasonCodes: IntentRedactionReasonCode[];
    scannedCharacters: number;
    truncated: boolean;
}
export interface SanitizeRepoRelativePathOptions {
    allowGlobs?: boolean;
    requireGlob?: boolean;
}
export declare function detectCredentialText(value: unknown, maxLength?: number): CredentialDetection;
export declare function normalizeIntentContent(value: unknown): string;
export declare function canonicalIntentHash(value: unknown): string;
export declare function sanitizeRepoRelativePath(value: unknown): {
    path: string | null;
    reasonCodes: IntentRedactionReasonCode[];
};
export declare function sanitizeRepoRelativePath(value: unknown, options: SanitizeRepoRelativePathOptions): {
    path: string | null;
    reasonCodes: IntentRedactionReasonCode[];
};
export declare function sanitizeLocalPrivateText(value: unknown, maxLength?: number): LocalPrivateText;
export declare function buildIntentSummary(input: {
    content?: unknown;
    categories?: unknown[];
    domains?: unknown[];
    paths?: unknown[];
    planRevision?: unknown;
    scopeMode?: unknown;
    ruleIds?: unknown[];
    planSteps?: unknown;
    events?: unknown;
    actorType?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    redactionReasonCodes?: IntentRedactionReasonCode[];
    provenanceClassification?: IntentProvenanceClassification;
    provenanceSource?: IntentProvenanceSource;
}): IntentSummaryV1;
export declare function isIntentSummaryV1(value: unknown): value is IntentSummaryV1;
export declare function validatePrivacySafeCloudPayload(value: unknown): {
    ok: boolean;
    issues: PrivacyValidationIssue[];
};
export declare function assertPrivacySafeCloudPayload(value: unknown): void;
//# sourceMappingURL=intent-privacy.d.ts.map