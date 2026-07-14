import { type ActivationHostCapabilityProfile, type ActivationJourneyAgent } from './activation-journey';
import type { ManagedHostInstallationState, ManagedHostConfigIntegrity, ManagedHostTrustState } from './first-value-proof';
export declare const ENTERPRISE_POSTURE_REPORT_SCHEMA_VERSION: "neurcode.enterprise-posture-report.v1";
export declare const ENTERPRISE_TRUST_DECISION_SCHEMA_VERSION: "neurcode.enterprise-trust-decision.v1";
export declare const ENTERPRISE_ADMISSION_DECISION_SCHEMA_VERSION: "neurcode.enterprise-admission-decision.v1";
export declare const ENTERPRISE_TRUST_STATES: readonly ["not_enrolled", "enrolled_unobserved", "healthy", "degraded", "stale", "drifted", "incompatible", "unsupported", "revoked", "unknown"];
export type EnterpriseTrustState = (typeof ENTERPRISE_TRUST_STATES)[number];
export declare const ENTERPRISE_ROLLOUT_MODES: readonly ["observe", "warn", "enforce", "exempt"];
export type EnterpriseRolloutMode = (typeof ENTERPRISE_ROLLOUT_MODES)[number];
export type EnterpriseStaleBehavior = 'warn' | 'deny';
export type EnterpriseTrustReasonCode = 'installation_not_enrolled' | 'installation_never_observed' | 'installation_revoked' | 'evidence_signature_invalid' | 'evidence_receipt_unverified' | 'evidence_binding_invalid' | 'host_unsupported' | 'version_incompatible' | 'configuration_drift' | 'evidence_stale' | 'policy_assignment_mismatch' | 'host_installation_attention' | 'host_trust_unverified' | 'healthy_authenticated_evidence';
export type EnterpriseRemediationCode = 'run_trust_report' | 'reenroll_installation' | 'contact_organization_admin' | 'upgrade_cli' | 'repair_host_configuration' | 'select_supported_host' | 'refresh_policy_assignment' | 'verify_host_trust' | 'none';
export interface EnterprisePostureReport {
    schemaVersion: typeof ENTERPRISE_POSTURE_REPORT_SCHEMA_VERSION;
    organizationId: string;
    repositoryId: string;
    repositoryKey: string;
    installationId: string;
    host: ActivationJourneyAgent;
    adapter: string;
    cliVersion: string;
    runtimeVersion: string;
    contractsVersion: string;
    integrationVersion: string;
    policyVersion: string | null;
    observedAt: string;
    nonce: string;
    branchScopeHash: string | null;
    configFingerprint: string | null;
    configIntegrity: ManagedHostConfigIntegrity;
    hostTrustState: ManagedHostTrustState;
    installationState: ManagedHostInstallationState;
    lastGovernedOperationAt: string | null;
    lastSignedReceiptAt: string | null;
    signatureAlgorithm: 'hmac-sha256';
    signature: string;
}
export type EnterprisePostureUnsigned = Omit<EnterprisePostureReport, 'signature'>;
export declare function canonicalEnterprisePosturePayload(report: EnterprisePostureUnsigned): string;
export interface EnterpriseTrustFacts {
    enrolled: boolean;
    observedAt: string | null;
    revokedAt: string | null;
    signatureValid: boolean;
    receiptVerified: boolean;
    bindingValid: boolean;
    versionsCompatible: boolean;
    configIntegrity: ManagedHostConfigIntegrity | null;
    configFingerprintMatches: boolean | null;
    installationState: ManagedHostInstallationState | null;
    hostTrustState: ManagedHostTrustState | null;
    host: ActivationJourneyAgent | null;
    policyAssigned: boolean;
    policyVersionMatches: boolean;
    lastGovernedOperationAt: string | null;
    lastSignedReceiptAt: string | null;
    freshnessSeconds: number;
}
export interface EnterpriseTrustDecision {
    schemaVersion: typeof ENTERPRISE_TRUST_DECISION_SCHEMA_VERSION;
    state: EnterpriseTrustState;
    trusted: boolean;
    reasonCodes: EnterpriseTrustReasonCode[];
    remediationCodes: EnterpriseRemediationCode[];
    evidenceAt: string | null;
    evaluatedAt: string;
    ageSeconds: number | null;
    capability: ActivationHostCapabilityProfile | null;
    facts: EnterpriseTrustFacts;
}
export declare function evaluateEnterpriseTrust(facts: EnterpriseTrustFacts, options?: {
    now?: Date;
}): EnterpriseTrustDecision;
export interface EnterpriseRolloutScope {
    id: string;
    mode: EnterpriseRolloutMode;
    repositoryId?: string | null;
    host?: ActivationJourneyAgent | null;
    memberId?: string | null;
    active: boolean;
}
export interface EnterpriseRolloutException {
    id: string;
    repositoryId?: string | null;
    host?: ActivationJourneyAgent | null;
    memberId?: string | null;
    ownerUserId: string;
    reason: string;
    expiresAt: string;
    revokedAt?: string | null;
}
export interface EnterpriseEffectiveRollout {
    mode: EnterpriseRolloutMode;
    reasonCode: 'personal_workspace' | 'active_exception' | 'emergency_pause' | 'scheduled' | 'outside_cohort' | 'scope_override' | 'organization_default';
    scopeId: string | null;
    exceptionId: string | null;
}
export declare function resolveEnterpriseRollout(input: {
    isPersonal: boolean;
    defaultMode: EnterpriseRolloutMode;
    emergencyPaused: boolean;
    activationAt: string | null;
    rolloutPercentage: number;
    repositoryCohort: string[];
    scopes: EnterpriseRolloutScope[];
    exceptions: EnterpriseRolloutException[];
    repositoryId: string;
    host: ActivationJourneyAgent;
    memberId: string;
    installationId: string;
    now?: Date;
}): EnterpriseEffectiveRollout;
export type EnterpriseAdmissionOutcome = 'allow' | 'warn' | 'approval_required' | 'deny';
export interface EnterpriseAdmissionDecision {
    schemaVersion: typeof ENTERPRISE_ADMISSION_DECISION_SCHEMA_VERSION;
    outcome: EnterpriseAdmissionOutcome;
    reasonCodes: string[];
    trustState: EnterpriseTrustState;
    rolloutMode: EnterpriseRolloutMode;
    automaticHostInterception: boolean;
    limitation: string | null;
}
export declare function evaluateEnterpriseAdmission(input: {
    trust: EnterpriseTrustDecision;
    rollout: EnterpriseEffectiveRollout;
    staleBehavior: EnterpriseStaleBehavior;
    governanceDecision: EnterpriseAdmissionOutcome;
}): EnterpriseAdmissionDecision;
//# sourceMappingURL=enterprise-trust.d.ts.map