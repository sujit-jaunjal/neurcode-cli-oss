"use strict";
/**
 * Neurcode Project Root Resolution
 *
 * Enterprise UX requirement: users should be able to run Neurcode CLI commands
 * from any subdirectory inside a linked project and still use the same
 * `.neurcode/` state, caches, and context.
 *
 * Strategy:
 * - Walk up from the current working directory and pick the nearest ancestor
 *   that contains `.neurcode/config.json` (linked project marker).
 * - Also treat legacy `neurcode.config.json` as a marker for older setups.
 * - If the current directory is inside a git repository, do not search above
 *   that repository root. This prevents accidental cross-repo leakage.
 * - Cross-repo root overrides are denied by default, but can be explicitly
 *   allowed via `.neurcode/repo-links.json` (`neurcode repo link ...`).
 * - If nothing is found, fall back to the starting directory.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveNeurcodeProjectRootWithTrace = resolveNeurcodeProjectRootWithTrace;
exports.resolveNeurcodeProjectRoot = resolveNeurcodeProjectRoot;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const repo_links_1 = require("./repo-links");
function canonicalizePath(pathValue) {
    try {
        return (0, fs_1.realpathSync)(pathValue);
    }
    catch {
        return (0, path_1.resolve)(pathValue);
    }
}
function getGitRoot(startDir) {
    try {
        const output = (0, child_process_1.execSync)('git rev-parse --show-toplevel', {
            cwd: startDir,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return output ? canonicalizePath(output) : null;
    }
    catch {
        return null;
    }
}
function isPathWithin(parent, candidate) {
    const rel = (0, path_1.relative)(parent, candidate);
    return rel === '' || (!rel.startsWith('..') && !(0, path_1.isAbsolute)(rel));
}
function findNearestRepoLinksRoot(startDir, boundary) {
    let dir = startDir;
    while (true) {
        const linksPath = (0, path_1.join)(dir, '.neurcode', 'repo-links.json');
        if ((0, fs_1.existsSync)(linksPath)) {
            return dir;
        }
        if (boundary && dir === boundary)
            break;
        const parent = (0, path_1.dirname)(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}
function loadLinkedReposForRoot(root) {
    if (!root)
        return [];
    const linksPath = (0, path_1.join)(root, '.neurcode', 'repo-links.json');
    if (!(0, fs_1.existsSync)(linksPath))
        return [];
    return (0, repo_links_1.loadRepoLinks)(root);
}
function finalizeTrace(input) {
    const linkedRepoRoot = input.linkedRepoRoot && (0, fs_1.existsSync)((0, path_1.join)(input.linkedRepoRoot, '.neurcode', 'repo-links.json'))
        ? input.linkedRepoRoot
        : (0, fs_1.existsSync)((0, path_1.join)(input.projectRoot, '.neurcode', 'repo-links.json'))
            ? input.projectRoot
            : null;
    const linkedRepos = linkedRepoRoot ? loadLinkedReposForRoot(linkedRepoRoot) : [];
    return {
        startDir: input.startDir,
        projectRoot: input.projectRoot,
        gitRoot: input.gitRoot,
        overrideRequested: input.overrideRequested,
        overrideResolved: input.overrideResolved,
        overrideStatus: input.overrideStatus,
        overrideBlockedReason: input.overrideBlockedReason,
        linkedRepoRoot,
        linkedRepos,
        linkedRepoOverrideUsed: input.linkedRepoOverrideUsed,
    };
}
function resolveNeurcodeProjectRootWithTrace(startDir = process.cwd()) {
    const resolvedStart = canonicalizePath(startDir);
    const gitRoot = getGitRoot(resolvedStart);
    const homeDir = canonicalizePath(process.env.HOME || process.env.USERPROFILE || resolvedStart);
    let overrideRequested = null;
    let overrideResolved = null;
    let overrideStatus = 'none';
    let overrideBlockedReason;
    let linkedRepoRoot = null;
    let linkedRepoOverrideUsed = false;
    const override = process.env.NEURCODE_PROJECT_ROOT || process.env.NEURCODE_ROOT;
    if (override && override.trim()) {
        overrideRequested = override.trim();
        const overridePath = canonicalizePath(override.trim());
        overrideResolved = overridePath;
        if (gitRoot &&
            !isPathWithin(gitRoot, overridePath) &&
            process.env.NEURCODE_ALLOW_CROSS_REPO_ROOT !== '1') {
            const linksRoot = findNearestRepoLinksRoot(resolvedStart, gitRoot) || gitRoot;
            const explicitlyLinked = linksRoot
                ? (0, repo_links_1.isRepoPathExplicitlyLinked)(linksRoot, overridePath)
                : false;
            linkedRepoRoot = linksRoot;
            if (explicitlyLinked) {
                overrideStatus = 'allowed';
                linkedRepoOverrideUsed = true;
                return finalizeTrace({
                    startDir: resolvedStart,
                    projectRoot: overridePath,
                    gitRoot,
                    overrideRequested,
                    overrideResolved,
                    overrideStatus,
                    linkedRepoRoot,
                    linkedRepoOverrideUsed,
                });
            }
            // Ignore invalid cross-repo override and continue with normal root resolution.
            overrideStatus = 'blocked_cross_repo';
            overrideBlockedReason = `Cross-repo override blocked: ${overridePath}`;
        }
        else {
            overrideStatus = 'allowed';
            return finalizeTrace({
                startDir: resolvedStart,
                projectRoot: overridePath,
                gitRoot,
                overrideRequested,
                overrideResolved,
                overrideStatus,
                linkedRepoRoot,
                linkedRepoOverrideUsed,
            });
        }
    }
    let dir = resolvedStart;
    const boundary = gitRoot || null;
    while (true) {
        const neurcodeConfig = (0, path_1.join)(dir, '.neurcode', 'config.json');
        if ((0, fs_1.existsSync)(neurcodeConfig)) {
            if (dir === homeDir &&
                dir !== resolvedStart &&
                process.env.NEURCODE_ALLOW_HOME_ROOT !== '1') {
                return finalizeTrace({
                    startDir: resolvedStart,
                    projectRoot: resolvedStart,
                    gitRoot,
                    overrideRequested,
                    overrideResolved,
                    overrideStatus: 'blocked_home_guard',
                    overrideBlockedReason: 'Home directory scope was blocked by default guard.',
                    linkedRepoRoot,
                    linkedRepoOverrideUsed,
                });
            }
            return finalizeTrace({
                startDir: resolvedStart,
                projectRoot: dir,
                gitRoot,
                overrideRequested,
                overrideResolved,
                overrideStatus,
                overrideBlockedReason,
                linkedRepoRoot,
                linkedRepoOverrideUsed,
            });
        }
        const legacyLocalConfig = (0, path_1.join)(dir, 'neurcode.config.json');
        if ((0, fs_1.existsSync)(legacyLocalConfig)) {
            if (dir === homeDir &&
                dir !== resolvedStart &&
                process.env.NEURCODE_ALLOW_HOME_ROOT !== '1') {
                return finalizeTrace({
                    startDir: resolvedStart,
                    projectRoot: resolvedStart,
                    gitRoot,
                    overrideRequested,
                    overrideResolved,
                    overrideStatus: 'blocked_home_guard',
                    overrideBlockedReason: 'Home directory scope was blocked by default guard.',
                    linkedRepoRoot,
                    linkedRepoOverrideUsed,
                });
            }
            return finalizeTrace({
                startDir: resolvedStart,
                projectRoot: dir,
                gitRoot,
                overrideRequested,
                overrideResolved,
                overrideStatus,
                overrideBlockedReason,
                linkedRepoRoot,
                linkedRepoOverrideUsed,
            });
        }
        if (boundary && dir === boundary)
            break;
        const parent = (0, path_1.dirname)(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return finalizeTrace({
        startDir: resolvedStart,
        // A new repository has no .neurcode/config.json yet. In that case the Git
        // root is still the only safe project boundary. Falling back to the nested
        // invocation directory used to create fragmented state under src/ or an
        // IDE subfolder during first setup.
        projectRoot: gitRoot || resolvedStart,
        gitRoot,
        overrideRequested,
        overrideResolved,
        overrideStatus,
        overrideBlockedReason,
        linkedRepoRoot,
        linkedRepoOverrideUsed,
    });
}
function resolveNeurcodeProjectRoot(startDir = process.cwd()) {
    return resolveNeurcodeProjectRootWithTrace(startDir).projectRoot;
}
//# sourceMappingURL=project-root.js.map