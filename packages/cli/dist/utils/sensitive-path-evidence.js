"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestsSensitiveChange = requestsSensitiveChange;
exports.shouldProtectSensitiveTaskPath = shouldProtectSensitiveTaskPath;
exports.classifySensitivePathFromBrain = classifySensitivePathFromBrain;
const brain_1 = require("@neurcode-ai/brain");
const node_path_1 = require("node:path");
const AUTH_SYMBOL = /(?:oauth|openid|oidc|authori[sz]ation|authentication|clientsecret|jwks?|jws|jwt|pkce|nonce|mtls|tokenendpoint|protectedresource|backchannelauthentication)/i;
const SECURITY_SYMBOL = /(?:nonrepudiation|insecure|credential|encryption|signature|certificate|keystore)/i;
const SENSITIVE_CHANGE_INTENT = /\b(?:auth(?:entication|orization)?|oauth|openid|oidc|credential|token|secret|security|session)\b/i;
function requestsSensitiveChange(intent) {
    return SENSITIVE_CHANGE_INTENT.test(intent);
}
function shouldProtectSensitiveTaskPath(input) {
    if (!input.sensitiveIntent)
        return false;
    if (input.directEvidenceProtected)
        return true;
    const planned = new Set(input.plannedPaths);
    // An explicitly auth/security-sensitive task cannot use missing symbol
    // evidence to prove its exact planned write harmless. This remains scoped to
    // the active intent; the same file under a non-sensitive task is unaffected.
    if (planned.has(input.filePath))
        return true;
    const directory = (0, node_path_1.dirname)(input.filePath).replace(/\\/g, '/');
    return input.plannedSensitivePaths.some((path) => (0, node_path_1.dirname)(path).replace(/\\/g, '/') === directory);
}
/** Bounded, source-free sensitive-path classification from immutable Brain rows. */
function classifySensitivePathFromBrain(repoRoot, filePath) {
    try {
        if (!(0, brain_1.readRepositoryGraphMetadata)(repoRoot)) {
            return { protected: false, kinds: [], reasonCodes: ['brain_sensitive_path_unavailable'], matchedSymbolCount: 0, sourceFree: true };
        }
        const nodes = new brain_1.SqliteRepositoryGraphStore().queryNodes(repoRoot, { path: filePath, limit: 500 });
        const names = nodes
            .flatMap((node) => [node.name, String(node.attributes?.target ?? '')])
            .filter((name) => typeof name === 'string' && name.length > 0);
        const authMatches = new Set(names.filter((name) => AUTH_SYMBOL.test(name)).map((name) => name.toLowerCase()));
        const securityMatches = new Set(names.filter((name) => SECURITY_SYMBOL.test(name)).map((name) => name.toLowerCase()));
        const strongAuthSurface = authMatches.size >= 2;
        const strongSecuritySurface = securityMatches.size >= 2;
        return {
            protected: strongAuthSurface || strongSecuritySurface,
            kinds: [strongAuthSurface ? 'auth' : null, strongSecuritySurface ? 'security' : null].filter((value) => value !== null),
            reasonCodes: [
                ...(strongAuthSurface ? ['brain_auth_symbol_surface'] : []),
                ...(strongSecuritySurface ? ['brain_security_symbol_surface'] : []),
            ],
            matchedSymbolCount: authMatches.size + securityMatches.size,
            sourceFree: true,
        };
    }
    catch {
        return { protected: false, kinds: [], reasonCodes: ['brain_sensitive_path_unavailable'], matchedSymbolCount: 0, sourceFree: true };
    }
}
//# sourceMappingURL=sensitive-path-evidence.js.map