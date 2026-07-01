"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveLocalOperatorIdentity = deriveLocalOperatorIdentity;
const node_child_process_1 = require("node:child_process");
const node_os_1 = require("node:os");
/**
 * Derive a local operator actor string and approval assurance level.
 *
 * Priority (stops at first available signal):
 *  1. NEURCODE_OPERATOR env → local_asserted
 *  2. git user.name + user.email → local_derived
 *  3. OS username → local_derived
 *  4. fallback → 'unknown_local_actor' / 'unknown'
 */
function deriveLocalOperatorIdentity(repoRoot) {
    const envOperator = process.env['NEURCODE_OPERATOR']?.trim();
    if (envOperator)
        return { approvedBy: envOperator, assurance: 'local_asserted' };
    try {
        const cwd = repoRoot || process.cwd();
        const name = (0, node_child_process_1.execFileSync)('git', ['config', '--get', 'user.name'], { cwd, encoding: 'utf8', timeout: 3000 }).trim();
        const email = (0, node_child_process_1.execFileSync)('git', ['config', '--get', 'user.email'], { cwd, encoding: 'utf8', timeout: 3000 }).trim();
        if (name || email) {
            const actor = [name, email ? `<${email}>` : ''].filter(Boolean).join(' ');
            return { approvedBy: actor, assurance: 'local_derived' };
        }
    }
    catch { /* git unavailable or no config */ }
    try {
        const username = (0, node_os_1.userInfo)().username;
        if (username)
            return { approvedBy: username, assurance: 'local_derived' };
    }
    catch { /* ignore */ }
    return { approvedBy: 'unknown_local_actor', assurance: 'unknown' };
}
//# sourceMappingURL=operator-identity.js.map