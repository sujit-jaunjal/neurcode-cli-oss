"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIntegrationsCompatibilityReport = buildIntegrationsCompatibilityReport;
exports.collectIntegrationsVersionSources = collectIntegrationsVersionSources;
/**
 * Integrations Doctor builder (Iteration 8 — AI Tool Compatibility Layer).
 *
 * Aggregates, in one honest source-free report, what enforcement guarantee each
 * host tool (Claude Code, Cursor, Codex, VS Code, GitHub Action) supports, plus
 * the live version posture and the four setup commands (install / activate /
 * test / repair).
 *
 * Single source of truth for enforcement: the canonical Agent Runtime Adapter
 * capability registry (`listAgentRuntimeAdapterCapabilities` in
 * governance-runtime). This module NEVER re-authors enforcement prose — it maps
 * each tool to its adapter and copies `enforceable` / `advisoryOnly` verbatim,
 * deriving only a short one-line guarantee from `(enforcementLevel, mode)`.
 *
 * Single source of truth for versions: the Runtime Compatibility Manifest
 * (`getRuntimeCompatibilityManifest` in contracts), compared against
 * live-read repo manifests. The builder is pure and deterministic: every input
 * (versions, timestamp) is injected, so the authority gate can exercise version
 * skew and VSIX drift hermetically.
 *
 * Source-free by construction: tool ids, adapter ids, mode strings, versions,
 * statuses, reason codes, static `neurcode` command strings, and static
 * limitation strings — never paths-to-source, diffs, prompts, or source bodies.
 */
const fs_1 = require("fs");
const path_1 = require("path");
const governance_runtime_1 = require("@neurcode-ai/governance-runtime");
const contracts_1 = require("@neurcode-ai/contracts");
const TOOL_CATALOG = [
    {
        tool: 'claude-code',
        adapter: 'claude-code-hooks',
        displayName: 'Claude Code',
        setup: {
            install: 'neurcode activate claude --dir .',
            activate: null,
            test: 'neurcode doctor --runtime',
            repair: 'neurcode runtime repair',
        },
        knownWedges: [
            'Hooks activate automatically once installed; reload Claude Code if it was already open.',
            'Fails closed on a missing/stale runtime manifest or no in-scope session — run `neurcode runtime repair`, then start a governed session and retry.',
        ],
        versionComponents: ['cli'],
    },
    {
        tool: 'cursor',
        adapter: 'cursor-mcp',
        displayName: 'Cursor',
        setup: {
            install: 'neurcode cursor onboard',
            activate: 'neurcode cursor onboard --strict',
            test: 'neurcode agent doctor cursor',
            repair: 'neurcode runtime repair',
        },
        knownWedges: [
            'Cooperative mode: edits made without calling the runtime are detected by the supervisor, not denied by the host.',
            'MCP configuration may be repo-local or global depending on your Cursor setup.',
            'Mid-session profile drift can wedge the session — recover with `neurcode runtime repair` or `neurcode session reset-stale --force`.',
        ],
        versionComponents: ['cli'],
    },
    {
        tool: 'codex',
        adapter: 'codex-hooks',
        displayName: 'Codex',
        setup: {
            install: 'neurcode agent bootstrap codex',
            activate: 'neurcode agent walkthrough codex',
            test: 'neurcode agent doctor codex',
            repair: 'neurcode runtime repair',
        },
        knownWedges: [
            'Trusted project hooks can deny intercepted apply_patch, simple Bash, and MCP calls before write.',
            'Codex documents hooks as a guardrail, not a complete enforcement boundary; unified execution and equivalent tool paths may bypass it.',
            'Use `/hooks` to review and trust the project hook. Disabled or untrusted hooks provide no automatic interception.',
        ],
        versionComponents: ['cli'],
    },
    {
        tool: 'vscode',
        adapter: 'vscode-extension',
        displayName: 'VS Code companion',
        setup: {
            install: 'code --install-extension neurcode-governance.vsix',
            activate: 'neurcode daemon',
            test: 'neurcode doctor --runtime',
            repair: 'neurcode runtime repair',
        },
        knownWedges: [
            'Companion is observe-only: it surfaces live state and source-free evidence but does not hard-deny editor writes.',
            'The extension package version and the newest committed VSIX can drift (release candidate not yet packaged).',
            'For pre-write enforcement, pair the companion with Claude Code or Copilot hooks.',
        ],
        versionComponents: ['cli', 'vscode-extension'],
    },
    {
        tool: 'github-action',
        adapter: 'github-action',
        displayName: 'GitHub Action',
        setup: {
            install: null,
            activate: null,
            test: 'neurcode admission doctor',
            repair: 'neurcode session export-admission --explain',
        },
        knownWedges: [
            'Advisory only: the Action cannot govern work before the pull request exists.',
            'Self-attested admission records are review context unless backend receipt metadata is attached and verified.',
            'Add the published Action workflow (.github/workflows/neurcode.yml) from the dashboard/docs — no CLI installs it.',
        ],
        versionComponents: ['cli', 'github-action'],
    },
];
function parseVersion(value) {
    if (!value)
        return null;
    const trimmed = value.trim().replace(/^v/, '');
    if (!trimmed)
        return null;
    const [corePart, prePart] = trimmed.split('-', 2);
    const core = corePart.split('.').map((n) => Number.parseInt(n, 10));
    if (core.some((n) => Number.isNaN(n)))
        return null;
    const prerelease = prePart ? prePart.split('.') : [];
    return { core, prerelease };
}
/** Returns -1 / 0 / 1, or null when either side is unparseable. */
function compareVersions(a, b) {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb)
        return null;
    const len = Math.max(pa.core.length, pb.core.length);
    for (let i = 0; i < len; i++) {
        const x = pa.core[i] ?? 0;
        const y = pb.core[i] ?? 0;
        if (x !== y)
            return x < y ? -1 : 1;
    }
    // Equal core: a version WITH a prerelease ranks below one without (semver).
    if (pa.prerelease.length === 0 && pb.prerelease.length === 0)
        return 0;
    if (pa.prerelease.length === 0)
        return 1;
    if (pb.prerelease.length === 0)
        return -1;
    const plen = Math.max(pa.prerelease.length, pb.prerelease.length);
    for (let i = 0; i < plen; i++) {
        const x = pa.prerelease[i];
        const y = pb.prerelease[i];
        if (x === undefined)
            return -1;
        if (y === undefined)
            return 1;
        const xn = Number.parseInt(x, 10);
        const yn = Number.parseInt(y, 10);
        const bothNum = !Number.isNaN(xn) && !Number.isNaN(yn);
        if (bothNum) {
            if (xn !== yn)
                return xn < yn ? -1 : 1;
        }
        else if (x !== y) {
            return x < y ? -1 : 1;
        }
    }
    return 0;
}
/* --------------------------------------------------------------------------
 * Enforcement summary — grounded verbatim in the canonical capability registry
 * ------------------------------------------------------------------------ */
/**
 * Derive a short, honest one-line guarantee from the registry's
 * `(enforcementLevel, compatibilityMode)`. This is a deterministic projection
 * of canonical fields — NOT independent marketing prose. The authority gate
 * asserts no non-`hard_pre_write_enforcement` tool gets a "hard deny" guarantee.
 */
function deriveGuarantee(capability) {
    switch (capability.compatibilityMode) {
        case 'hard_pre_write_enforcement':
            return 'Hard pre-write deny when hooks are installed and a governed session is active.';
        case 'cooperative_check':
            return 'Cooperative pre-write checks when the agent calls the runtime — no host-level hard deny.';
        case 'supervisor_diff_watch':
            return 'Cooperative pre-write checks plus a supervisor/diff-watch backstop — no host-level hard deny.';
        case 'evidence_only':
            return capability.enforcementLevel === 'post_change_backstop'
                ? 'Post-PR advisory verification — cannot govern before the pull request exists.'
                : 'Companion visibility and source-free evidence capture — no pre-write deny.';
        default:
            return 'Enforcement posture unknown — fail closed.';
    }
}
function enforcementSummary(capability) {
    return {
        level: capability.enforcementLevel,
        controlLevel: capability.controlLevel,
        mode: capability.compatibilityMode,
        automatic: capability.automatic,
        guarantee: deriveGuarantee(capability),
        enforceable: [...capability.enforceable],
        advisoryOnly: [...capability.advisoryOnly],
    };
}
function readManifestPins() {
    const manifest = (0, contracts_1.getRuntimeCompatibilityManifest)();
    const current = manifest.validatedTriplets.find((t) => t.channel === 'current');
    const floor = manifest.validatedTriplets.find((t) => t.channel === 'support-floor');
    return {
        currentCli: current?.versions.cli ?? null,
        floorCli: floor?.versions.cli ?? null,
        currentAction: current?.versions.action ?? null,
        floorAction: floor?.versions.action ?? null,
        manifestVersion: manifest.manifestVersion,
    };
}
function cliVersionCheck(observed, pins) {
    const expected = pins.currentCli;
    if (!observed) {
        return {
            component: 'cli',
            observed: null,
            expected,
            status: 'unknown',
            detail: 'Could not determine the local CLI version.',
        };
    }
    const vsFloor = compareVersions(observed, pins.floorCli);
    if (vsFloor !== null && vsFloor < 0) {
        return {
            component: 'cli',
            observed,
            expected,
            status: 'behind_floor',
            detail: `CLI ${observed} is below the supported floor ${pins.floorCli}; upgrade the local CLI.`,
        };
    }
    const vsCurrent = compareVersions(observed, expected);
    if (vsCurrent !== null && vsCurrent > 0) {
        return {
            component: 'cli',
            observed,
            expected,
            status: 'ahead_of_validated',
            detail: `CLI ${observed} runs ahead of the last validated triplet ${expected} (additive-only; supported).`,
        };
    }
    return {
        component: 'cli',
        observed,
        expected,
        status: 'ok',
        detail: `CLI ${observed} is within the validated compatibility range.`,
    };
}
function actionVersionCheck(observed, pins) {
    const expected = pins.currentAction;
    if (!observed) {
        return {
            component: 'github-action',
            observed: null,
            expected,
            status: 'unknown',
            detail: 'Could not determine the GitHub Action bundle version.',
        };
    }
    const vsFloor = compareVersions(observed, pins.floorAction);
    if (vsFloor !== null && vsFloor < 0) {
        return {
            component: 'github-action',
            observed,
            expected,
            status: 'behind_floor',
            detail: `Action ${observed} is below the supported floor ${pins.floorAction}.`,
        };
    }
    const vsCurrent = compareVersions(observed, expected);
    if (vsCurrent !== null && vsCurrent > 0) {
        return {
            component: 'github-action',
            observed,
            expected,
            status: 'ahead_of_validated',
            detail: `Action ${observed} runs ahead of the validated triplet ${expected} (additive-only).`,
        };
    }
    return {
        component: 'github-action',
        observed,
        expected,
        status: 'ok',
        detail: `Action ${observed} matches the validated triplet.`,
    };
}
function vscodeVsixCheck(extensionVersion, newestVsix) {
    if (!extensionVersion) {
        return {
            component: 'vscode-vsix',
            observed: newestVsix,
            expected: null,
            status: 'unknown',
            detail: 'Could not determine the VS Code extension package version.',
        };
    }
    if (!newestVsix) {
        return {
            component: 'vscode-vsix',
            observed: null,
            expected: extensionVersion,
            status: 'mismatch',
            detail: `Extension package.json is ${extensionVersion} but no packaged .vsix was found.`,
        };
    }
    const cmp = compareVersions(extensionVersion, newestVsix);
    if (cmp === 0) {
        return {
            component: 'vscode-vsix',
            observed: newestVsix,
            expected: extensionVersion,
            status: 'ok',
            detail: `Newest committed VSIX ${newestVsix} matches the extension package version.`,
        };
    }
    return {
        component: 'vscode-vsix',
        observed: newestVsix,
        expected: extensionVersion,
        status: 'mismatch',
        detail: `Extension package.json is ${extensionVersion} but the newest committed VSIX is ${newestVsix} (release candidate not yet packaged).`,
    };
}
/* --------------------------------------------------------------------------
 * Status roll-up
 * ------------------------------------------------------------------------ */
const STATUS_RANK = {
    ready: 0,
    needs_attention: 1,
    not_ready: 2,
    not_evaluated: -1,
};
function worse(a, b) {
    return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}
function statusFromVersionChecks(checks) {
    let status = 'ready';
    const reasonCodes = [];
    for (const check of checks) {
        switch (check.status) {
            case 'behind_floor':
                status = worse(status, 'not_ready');
                reasonCodes.push(`${check.component}_below_floor`);
                break;
            case 'mismatch':
                status = worse(status, 'needs_attention');
                reasonCodes.push(`${check.component}_metadata_drift`);
                break;
            case 'unknown':
                status = worse(status, 'needs_attention');
                reasonCodes.push(`${check.component}_version_unknown`);
                break;
            case 'ahead_of_validated':
                reasonCodes.push(`${check.component}_ahead_of_validated`);
                break;
            case 'ok':
                reasonCodes.push(`${check.component}_version_ok`);
                break;
        }
    }
    return { status, reasonCodes };
}
/** A reason code naming the by-design enforcement posture (never a deficiency). */
function enforcementReasonCode(capability) {
    switch (capability.compatibilityMode) {
        case 'hard_pre_write_enforcement':
            return 'hard_deny_available';
        case 'cooperative_check':
        case 'supervisor_diff_watch':
            return 'cooperative_by_design';
        case 'evidence_only':
            return capability.enforcementLevel === 'post_change_backstop'
                ? 'advisory_by_design'
                : 'observe_only_by_design';
        default:
            return 'enforcement_unknown';
    }
}
/* --------------------------------------------------------------------------
 * Pure builder
 * ------------------------------------------------------------------------ */
function buildIntegrationsCompatibilityReport(input) {
    const pins = readManifestPins();
    const capabilities = (0, governance_runtime_1.listAgentRuntimeAdapterCapabilities)();
    const capabilityById = new Map(capabilities.map((cap) => [cap.adapter, cap]));
    const cliCheck = cliVersionCheck(input.versions.cli, pins);
    const actionCheck = actionVersionCheck(input.versions.action, pins);
    const vsixCheck = vscodeVsixCheck(input.versions.vscodeExtension, input.versions.vscodeNewestVsix);
    const tools = TOOL_CATALOG.map((entry) => {
        const capability = capabilityById.get(entry.adapter);
        if (!capability) {
            // Fail closed: an unknown adapter is never represented as enforcing.
            return {
                tool: entry.tool,
                adapter: entry.adapter,
                displayName: entry.displayName,
                enforcement: {
                    level: 'observe_only',
                    controlLevel: 'unsupported_unknown',
                    mode: 'evidence_only',
                    automatic: false,
                    guarantee: 'Enforcement posture unknown — fail closed.',
                    enforceable: [],
                    advisoryOnly: ['host enforcement could not be resolved from the capability registry'],
                },
                status: 'not_ready',
                reasonCodes: ['adapter_capability_missing'],
                setup: entry.setup,
                versions: [],
                knownWedges: entry.knownWedges,
            };
        }
        const versions = [];
        if (entry.versionComponents.includes('cli'))
            versions.push(cliCheck);
        if (entry.versionComponents.includes('github-action'))
            versions.push(actionCheck);
        if (entry.versionComponents.includes('vscode-extension'))
            versions.push(vsixCheck);
        const { status, reasonCodes } = statusFromVersionChecks(versions);
        reasonCodes.push(enforcementReasonCode(capability));
        return {
            tool: entry.tool,
            adapter: entry.adapter,
            displayName: entry.displayName,
            enforcement: enforcementSummary(capability),
            status,
            reasonCodes,
            setup: entry.setup,
            versions,
            knownWedges: entry.knownWedges,
        };
    });
    const overallStatus = tools.reduce((acc, tool) => worse(acc, tool.status), 'ready');
    const notes = [
        'Enforcement guarantees differ by host tool. Only Claude Code and Copilot hooks provide hard pre-write deny; Cursor and Codex are cooperative; the VS Code companion is observe-only; the GitHub Action is post-PR advisory.',
        'Every enforcement label is derived from the canonical Agent Runtime Adapter capability registry, not marketing copy.',
        'This report is source-free: it carries versions, statuses, reason codes, and neurcode commands — never source, diffs, or prompts.',
    ];
    if (cliCheck.status === 'ahead_of_validated') {
        notes.push('The local CLI runs ahead of the last validated triplet (additive-only); upgrade the validated-triplet pin at the next release.');
    }
    return {
        schemaVersion: contracts_1.INTEGRATIONS_COMPATIBILITY_SCHEMA_VERSION,
        generatedAt: input.generatedAt,
        cliVersion: input.versions.cli ?? 'unknown',
        manifestVersion: pins.manifestVersion,
        compatibilityContractVersion: contracts_1.RUNTIME_COMPATIBILITY_CONTRACT_VERSION,
        overallStatus,
        tools,
        notes,
    };
}
/* --------------------------------------------------------------------------
 * Impure version-source collection (live repo manifest reads)
 * ------------------------------------------------------------------------ */
function readJsonVersion(path) {
    try {
        const pkg = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : null;
    }
    catch {
        return null;
    }
}
/** Highest semver parsed from `neurcode-governance-<version>.vsix` filenames. */
function newestVsixVersion(vscodeDir) {
    try {
        if (!(0, fs_1.existsSync)(vscodeDir))
            return null;
        let best = null;
        for (const name of (0, fs_1.readdirSync)(vscodeDir)) {
            const match = /^neurcode-governance-(\d+\.\d+\.\d+(?:-[\w.]+)?)\.vsix$/.exec(name);
            if (!match)
                continue;
            const version = match[1];
            if (best === null || (compareVersions(version, best) ?? 0) > 0)
                best = version;
        }
        return best;
    }
    catch {
        return null;
    }
}
/**
 * Read the live version sources from repo manifests. `repoRoot` is the monorepo
 * root; `cliVersion` is passed in (the running CLI's own version) so the report
 * reflects the actual engine, not a manifest guess.
 */
function collectIntegrationsVersionSources(repoRoot, cliVersion) {
    return {
        cli: cliVersion,
        action: readJsonVersion((0, path_1.join)(repoRoot, 'packages', 'action', 'package.json')),
        vscodeExtension: readJsonVersion((0, path_1.join)(repoRoot, 'packages', 'vscode', 'package.json')),
        vscodeNewestVsix: newestVsixVersion((0, path_1.join)(repoRoot, 'packages', 'vscode')),
    };
}
//# sourceMappingURL=integrations-doctor.js.map