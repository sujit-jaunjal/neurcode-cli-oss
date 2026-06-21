"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTeamMemoryPath = normalizeTeamMemoryPath;
exports.isTeamMemoryOperationalArtifactPath = isTeamMemoryOperationalArtifactPath;
exports.isTeamMemoryProjectPath = isTeamMemoryProjectPath;
const NEURCODE_OPERATIONAL_ROOTS = new Set([
    '.neurcode',
    '.neurcode-admission',
    '.neurcode-ai-record',
    '.neurcode-cache',
    '.neurcode-evidence',
]);
const AGENT_CONFIGURATION_ROOTS = new Set([
    '.claude',
    '.codex',
    '.cursor',
    '.gemini',
]);
const AGENT_CONFIGURATION_FILES = new Set([
    '.cursorrules',
    '.github/copilot-instructions.md',
    'agents.md',
    'claude.md',
]);
const NEURCODE_GENERATED_EXPORTS = new Set([
    'neurcode-brain.json',
    'neurcode-brain.md',
]);
function normalizeTeamMemoryPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
}
function isTeamMemoryOperationalArtifactPath(value) {
    const normalized = normalizeTeamMemoryPath(value).toLowerCase();
    if (!normalized)
        return true;
    const [root] = normalized.split('/');
    if (NEURCODE_OPERATIONAL_ROOTS.has(root))
        return true;
    if (AGENT_CONFIGURATION_ROOTS.has(root))
        return true;
    if (AGENT_CONFIGURATION_FILES.has(normalized))
        return true;
    if (NEURCODE_GENERATED_EXPORTS.has(normalized))
        return true;
    return false;
}
function isTeamMemoryProjectPath(value) {
    return !isTeamMemoryOperationalArtifactPath(value);
}
//# sourceMappingURL=team-memory-path-hygiene.js.map