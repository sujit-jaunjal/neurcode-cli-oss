# Neurcode CLI Commands

This reference follows one canonical account-backed lifecycle:

`setup -> explicit workspace -> connect repo -> build Brain -> activate agent -> govern -> export evidence`

For a no-account local proof, use the separate fixture path:

```bash
npx -y @neurcode-ai/cli@latest pilot start --fixture --agent codex
```

The lifecycle separates five identities that must not blur together:

- authenticated user
- active workspace
- repo ownership context
- runtime/session state
- governance ownership boundary

## Core Runtime Workflow

```bash
npx -y @neurcode-ai/cli@latest setup --repo /path/to/repository --agent claude
neurcode doctor --runtime
neurcode status --json
neurcode runtime cloud-status --json
neurcode runtime reset-stale-cloud --json
neurcode report --runtime
neurcode demo rehearse
```

Primary first-run and resume command:

```bash
npx -y @neurcode-ai/cli@latest setup --repo <repository-path> --agent <claude|codex|cursor|vscode|copilot|action>
neurcode setup --repo <repository-path> --agent codex --status
neurcode setup --repo <repository-path> --agent codex --status --json
```

`setup` detects completed stages and prints exactly one next action. The older
`login`, `init`, `repo connect`, `onboard`, and `activate` surfaces remain
available as compatibility or advanced commands, not competing onboarding
flows.

Neurcode governs in-flow where the host exposes hooks, records source-free runtime evidence, and keeps CI/verify/remediation commands as compatibility/backstop surfaces.

See also: `neurcode agent guard start <agent>` for supervised non-Claude workflows, `neurcode admission export` for GitHub Action admission records, and `neurcode verify --ci` for compatibility CI checks.

## Runtime Command Reference

### `neurcode setup`

Start or resume account-backed setup for a real repository.

```bash
npx -y @neurcode-ai/cli@latest setup --repo <repository-path> --agent codex
neurcode setup --repo <repository-path> --agent codex --status
neurcode setup --repo <repository-path> --agent codex --status --json
```

Authentication is machine-wide and may begin outside a repository. Brain,
runtime, and agent setup are repository-scoped: pass `--repo` from an arbitrary
terminal, or omit it only when the current directory is already inside Git.
Explicit nested paths resolve to the Git root. An explicit non-Git directory is
rejected, and setup never creates `.neurcode` in the home directory by fallback.

The ordered stages are browser login, explicit personal or organization
workspace, repository ownership, local source-free Brain, and agent
integration. A stale organization target produces an error instead of silently
falling back to a personal workspace. Agent enforcement remains explicit:
Claude hard hooks only when healthy; cooperative/supervised evidence for Codex
and Cursor; host-dependent hooks for VS Code/Copilot; post-change advisory
routing for the Action.

### `neurcode activate <agent>`

Pair a repository with the Runtime Control Plane, refresh the governance profile, install supported agent hooks, and enable source-free runtime sync.

```bash
neurcode activate claude --connect <token>
neurcode activate copilot --connect <token>
neurcode doctor --runtime
```

### `neurcode agent guard start <agent>`

Start a governed session for hosts that need the universal runtime handshake and local supervisor.

```bash
neurcode agent walkthrough codex
neurcode agent bootstrap codex
neurcode agent guard start codex --goal "Add retry with backoff to export task"
neurcode agent guard status --json
neurcode agent guard finish --session-id <sessionId> --fail-on-unverified
neurcode agent report codex --session-id <sessionId>
```

### `neurcode agent bootstrap <agent>`

One-command setup for supervised agent pilots. It refreshes the repo governance profile, writes supported MCP config, and installs repo-native instructions for the selected agent.

```bash
neurcode agent bootstrap codex
neurcode agent bootstrap cursor
neurcode agent bootstrap generic-mcp
```

### `neurcode agent walkthrough <agent>`

Print the self-serve pilot loop from dashboard pairing through exact-path approval, guard finish, post-run report, and evidence record.

```bash
neurcode agent walkthrough codex
neurcode agent walkthrough cursor --safe-path src/tasks/export_task.ts --blocked-path src/billing/charge.ts
```

Use this command before a friendly pilot to confirm whether the checkout is dashboard-connected or local-only. Runtime Control Plane has the matching **Pilot readiness** checklist; both surfaces should agree on the same acceptance gates before an external walkthrough.

For a fresh repo without obvious `billing`, `auth`, `db`, `migrations`, or security-sensitive directories, CODEOWNERS may produce ownership facts without producing an approval-required boundary. Add `.neurcode/governance.json` with `approvalRequiredGlobs` and `sensitiveGlobs`, then rerun `neurcode agent bootstrap <agent>` or start with `--force-profile` before testing exact-path approvals.

### `neurcode agent report <agent>`

Summarize a completed governed agent run. This is the post-run answer for a pilot evaluator: whether the guard was clean, how many boundary denials were contained, whether open blocks remain, and which source-free record hashes were produced.

```bash
neurcode agent report codex --session-id <sessionId>
neurcode agent report cursor --latest --json
```

Key statuses:

- `pilot_ready`: the guarded cooperative-agent run finished cleanly with no unverified writes or open blocks.
- `governed_review_ready`: the governed approval / denial trail completed and replay evidence exists, but a human should review the contained sensitive activity.
- `attention_needed`: an open block, failed guard posture, or unverified write remains.

### `neurcode status`

Inspect active session scope, latest boundary event, approval grants, and sync health.

```bash
neurcode status
neurcode status --json
```

### `neurcode session plan`

View and negotiate the active runtime plan. See [Plan negotiation](./plan-negotiation.md) for the full flow.

```bash
neurcode session plan              # view the active plan: summary, scope, revision, mode, freeze state
neurcode session plan mode         # explain observe / advise / enforce_after_freeze
neurcode session plan freeze       # freeze the plan — enforce_after_freeze starts blocking drift
neurcode session plan unfreeze     # reopen the plan for planning (suspends plan-drift blocking)
neurcode session plan view --json  # machine-readable plan view
```

Plan mode is a repo policy (`planMode` in `.neurcode/governance.json`); freeze/unfreeze are per-session actions. Credential/secret writes are blocked locally in every mode, regardless of freeze state. Amend the plan with `neurcode session replan`; approve a one-off exact path with `neurcode session approve --path <file>`.

### `neurcode session end`

End a local governance session or a true cloud session without mixing their identities.

```bash
neurcode session end
neurcode session end --session-id <local-or-cloud-session-id>
neurcode session end --session-id <local-session-id> --local --json
```

An explicit local governance ID is finished locally before cloud APIs are considered, preserving its replay hash and AI Change Record. With no arguments, exactly one active local session is finished automatically. If multiple local sessions exist and stdin is noninteractive, the command exits quickly with candidate IDs and exact `--session-id` commands instead of prompting.

### Profile-drift recovery

Cached-profile freshness and active-session compatibility are separate:

```text
profile status: fresh
session compatibility: incompatible
action: session_restart_required
```

When a profile changes and no human decision is pending, the next implementation prompt finishes the stale session with replay-valid recovery evidence and starts a new session from the current profile. Exact approvals and waivers are not carried forward.

If an exact approval, risky plan amendment, or other human decision is unresolved, automatic recovery fails closed and creates no second session. Run exactly:

```bash
neurcode session reset-stale --force
```

`--force` abandons unresolved operator state. `neurcode activate --force` or a profile refresh alone is not sufficient because the active session contract remains incompatible.

### `neurcode runtime cloud-status`

Read the dashboard-visible runtime state for a paired repository without mutating sessions or approvals. This is the agent-safe way to prove whether the Runtime Control Plane can see the active session, blocked approval path, local live transport, and bulk evidence ingestion posture.

```bash
neurcode runtime cloud-status
neurcode runtime cloud-status --json
neurcode runtime cloud-status --session-id <sessionId> --json
```

This command is read-only. It does not approve, deny, retry, upload source, or change session state.

### `neurcode runtime reset-stale-cloud`

Finish a stale dashboard-visible live session and revoke pending exact-path approvals for that session. This is an operator cleanup command for demo and production hygiene when an agent session stopped before its final hook could close the live pointer.

```bash
neurcode runtime reset-stale-cloud
neurcode runtime reset-stale-cloud --session-id <sessionId> --json
neurcode runtime reset-stale-cloud --reason "Operator closed stale rehearsal session"
```

By default, the backend refuses to finish a session that is not stale yet. Use `--force` only when an operator intentionally closes an active session. The command is source-free: it sends session id, repo key, reason, and operator metadata, never source code.

### `neurcode report --runtime`

Summarize runtime sessions, blocked edits, approvals, owners, and replay records.

```bash
neurcode report --runtime
neurcode report --runtime --json
```

### `neurcode admission export`

Export the latest source-free runtime admission record for the GitHub Action compatibility path.

```bash
neurcode admission export
neurcode admission export --json
neurcode admission export <session-id> --receipt receipt.json
```

`--receipt` attaches a bounded backend receipt summary when you have already exported or downloaded a Neurcode runtime receipt. The admission artifact still stays source-free and includes receipt ID, key ID, replay hash, signature status, verification status, signed timestamp, and verifier hint only. Tampered receipt metadata is rejected instead of upgrading trust.

### `neurcode pilot export`

Generate a **source-free executive pilot evidence pack** after a pilot: a single packet you can share with an engineering manager, principal engineer, security reviewer, or procurement/IT without a live walkthrough. It aggregates facts the runtime control plane already persisted locally (`.neurcode/sessions/*.change-record.json`, `.neurcode/admission/*.json`, `.neurcode/pilot-metrics.json`).

```bash
neurcode pilot export                    # → .neurcode/pilot-evidence/{json,md,html}
neurcode pilot export --json             # print the pack JSON to stdout (no files)
neurcode pilot export --format markdown  # markdown | html | both (default both)
neurcode pilot export --out ./out-dir    # custom output directory
neurcode pilot export --days 30          # local metrics window (default 7)
```

The pack contains: pilot summary, per-session table (counts/ids/verdicts), blocked risk families, approvals (exact-path + neighbor-deny), plan drift, dependency changes (governed counts + git object hashes), evidence hashes, what-stayed-local, and limitations / completeness. It is source-free by construction — paths, owners, counts, verdicts, and hashes only, never source, diffs, prompts, intent prose, or secrets. Incomplete pilots are exported with an explicit `completeness: partial|empty` and a `missingArtifacts[]` list instead of failing. The `contentHash` is stable for the same input (the generation timestamp is excluded). See `docs/enterprise/implementation-notes/pilot-evidence-pack-v1.md`.

### `neurcode demo rehearse`

Print the canonical production demo rehearsal protocol: exact goal, safe edit path, approval-required probe path, neighboring-file isolation check, dashboard approval rules, and the operator reply to continue after approval.

```bash
neurcode demo rehearse
neurcode demo rehearse --json
```

## Compatibility Command Reference

### `neurcode start "<intent>"`

Declare what you are building and initialize `.neurcode/plan.json` with intent, expected file scope, and detected constraints.

```bash
neurcode start "Add JWT authentication with role checks"
```

Options:
- `--json` - output machine-readable onboarding metadata
- `--run-init` - run `neurcode init` immediately after showing the guide

### `neurcode verify`

Compatibility/backstop command: evaluate the current git diff against policy rules and plan scope. Returns blocking violations, advisory warnings, and scope drift.

```bash
neurcode verify
neurcode verify --ci                       # deterministic CI-safe verification mode
neurcode verify --policy-only              # policy checks only, no plan enforcement
neurcode verify --staged                   # staged changes only; excludes unstaged/untracked
neurcode verify --head                     # working tree vs HEAD, including untracked
neurcode verify --base main                # working tree vs base, including untracked
neurcode verify --record                   # report results to Neurcode Cloud
neurcode verify --ci --json --evidence     # emit deterministic verification evidence artifact
neurcode verify --evidence-dir .neurcode/evidence
neurcode verify --compiled-policy neurcode.policy.compiled.json
```

An empty selected context returns `not_evaluated` (exit 3), not PASS. JSON includes requested, analyzed, skipped, and unsupported counts plus coverage posture. `--local-only` remains an offline compatibility alias for the supported local policy + structural engine; new automation should prefer `--ci --policy-only` with an explicit diff selector.

### `neurcode policy duplicate-mode [off|warn|block]`

Inspect or set deterministic duplicate-symbol enforcement. The command reports the effective value and its source, writes durable configuration to `.neurcode/governance.json`, and preserves it during forced profile regeneration. Structural resemblance remains advisory and cannot trigger this block mode.

```bash
neurcode policy duplicate-mode
neurcode policy duplicate-mode block --json
```

### `neurcode governance validate | export | import | preview`

Author and review the repo-local runtime policy in `.neurcode/governance.json` (boundary globs, plan mode, and the runtime-safety policy enums) without hand-editing raw JSON. These are the CLI side of the **Enterprise Policy Builder**: the dashboard *Runtime policy* page produces a source-free `neurcode.policy.runtime.v1` manifest that you apply here. These commands govern repo-local runtime safety and boundaries only — they do **not** touch cloud custom policies, CODEOWNERS, or structural `architectureObligations`.

Non-negotiable invariant: `runtimeSafetyPolicy.credentialWrites` is always `block` in every plan mode. The validator and importer hard-reject any other value (and never silently weaken it); credential/secret writes are blocked locally regardless of policy.

```bash
neurcode governance validate                     # validate .neurcode/governance.json; exit 1 on any error
neurcode governance validate --json              # machine-readable errors + credentialViolations
neurcode governance export --out policy.json     # emit a source-free neurcode.policy.runtime.v1 manifest
neurcode governance export                       # print the manifest JSON to stdout (pipe-friendly)
neurcode governance import policy.json           # validate a manifest, atomically merge it, refresh the profile
neurcode governance preview --json               # classify + resolve actions over fixed fixture paths
```

`validate` reads and fail-closed-validates the config (including `runtimeSafetyPolicy`), printing credential violations explicitly and exiting `1` on any error. `export` emits the portable, source-free manifest derived from the current config. `import` validates the manifest, atomically writes (`temp`+`rename`, mode `0600`) the merged config, re-validates, and refreshes the derived profile — a manifest with a weakened, unknown-enum, or malformed value is rejected and nothing is written. `preview` shows the resolved enforcement action per representative surface (`.env`, `src/auth/login.ts`, `migrations/001.sql`, `package.json`, `dist/x.js`, `src/feature/x.ts`) under the effective policy, so `.env` always resolves to `block`.

### `neurcode fix`

Convert verify findings into prioritized, file-level remediation guidance. Each suggestion includes a root cause, explanation, and a deterministic patch where possible.

```bash
neurcode fix
neurcode fix --ci                          # run fix against CI-safe verify mode
neurcode fix --apply-safe                  # auto-apply high-confidence patches
neurcode fix --json                        # machine-readable output
```

### `neurcode patch --file <path>`

Apply a deterministic fix to a specific file from `neurcode fix` suggestions. Patch application is transactional and emits a deterministic receipt for replay and audit.

```bash
neurcode patch --file src/auth/middleware.ts
neurcode patch --file src/auth/middleware.ts --json
neurcode patch --file src/auth/middleware.ts --preview-token <token>
neurcode patch --file src/auth/middleware.ts --rollback-receipt <receipt-id>
```

Patch JSON now includes:

- `status`: `applied`, `partial`, `rejected`, `stale_preview`, `rollback_applied`, `rollback_rejected`, or `rollback_stale`
- `validation`: deterministic patch safety report
- `receipt`: transaction metadata (`transactionId`, hashes, rollback/stale flags)
- `reverifyRequired`: whether a follow-up verify is required

### `neurcode daemon` (optional legacy bridge)

Start the older local HTTP dashboard/process bridge on
`http://localhost:4321`. It can expose `verify`, `fix`, `patch`, and rollback
operations to a compatible local dashboard.

```bash
neurcode daemon
```

The daemon is **not** required for setup, login, repository pairing, Brain
indexing, activation sync, or normal CLI/agent use. Run it only when a legacy
localhost dashboard or companion integration explicitly asks for it. It binds
to loopback by default; remote exposure must be a deliberate trusted-network
decision.

Daemon environment options:

- `NEURCODE_DAEMON_HOST` (default `127.0.0.1`)
- `NEURCODE_DAEMON_PORT` (default `4321`)
- `NEURCODE_DAEMON_ALLOW_REMOTE` (default `false`, set only for trusted internal networks)

Operational endpoints:

- `GET /health` - daemon capability + runtime summary
- `GET /ops/summary` - reliability counters (patch success, rollback stats, retries, lock visibility)

### `neurcode execute <type>`

Run deterministic actions with receipts, evidence linkage, and activity history.

```bash
neurcode execute verify --source cli
neurcode execute verify --source ci --ci --dedupe-window-ms 5000
neurcode execute apply-safe --source dashboard
neurcode execute patch --target src/auth/middleware.ts --source ci
neurcode execute intent-update --intent "Harden auth middleware scope"
```

Useful options:

- `--ci` force CI-safe deterministic behavior (`--ci` propagation to verify/fix stages)
- `--evidence-dir <path>` override evidence artifact output directory
- `--dedupe-window-ms <ms>` suppress duplicate rapid-fire executions

### `neurcode control-plane`

Inspect and update centralized governance settings.

```bash
neurcode control-plane show
neurcode control-plane preview --patch '{"runtime":{"execution":{"duplicateSuppression":true}}}'
neurcode control-plane apply --patch-file ./control-plane.patch.json --reason "Enable CI hardening defaults"
```

Subcommands:

- `show` - current state + snapshot metadata
- `preview` - deterministic impact preview (no write)
- `apply` - apply patch, persist snapshot, emit activity update event

### `neurcode workspace`

Operate deterministic team governance across multiple repositories.

```bash
neurcode workspace list
neurcode workspace create --name "Platform Governance"
neurcode workspace activate <workspace-id>
neurcode workspace show --json
neurcode workspace add-repo <workspace-id> --name api --path services/api --service api
neurcode workspace execute verify --workspace <workspace-id> --ci
```

Subcommands:

- `list` - list workspace catalog and posture targets
- `show` - team posture snapshot with matrix/hotspots/activity
- `create` - create workspace definition
- `activate` - set active workspace pointer
- `add-repo` - add repository/service node into workspace topology
- `update` - deterministic definition patch update
- `execute` - workspace-scoped deterministic actions across repositories

### `neurcode executions`

Inspect activity history from `.neurcode/executions/`.

```bash
neurcode executions --limit 20
neurcode executions --id <execution-id> --json
```

### `neurcode replay`

Deterministically reconstruct change history from immutable artifacts.

```bash
neurcode replay --at "2026-05-01T10:00:00Z"
neurcode replay --at "2026-05-01T10:00:00Z" --workspace platform --events --json
neurcode replay execution <execution-id>
neurcode replay workspace <workspace-id> --at "2026-05-01T10:00:00Z"
neurcode replay timeline --from "2026-05-01T00:00:00Z" --to "2026-05-07T00:00:00Z" --limit 300
```

Useful options:

- `--json` machine-readable deterministic output
- `--export <path>` deterministic export artifact
- `--workspace <workspace-id>` workspace-scoped replay
- `--events` include runtime events in state replay

### `neurcode plan show`

Display the current local plan context (`intent`, `expectedFiles`, `lastUpdated`).

### `neurcode policy`

Manage policy packs and compiled policy artifacts.

```bash
neurcode policy install soc2
neurcode policy compile --intent "Do not use console.log"
neurcode policy list
```

### `neurcode login` / `neurcode logout`

Advanced/compatibility authentication surface. New users should run
`neurcode setup --agent <agent>`. Login opens browser approval, requires an
explicit target workspace, and stores the underlying credential in the local
keyring. API keys are an implementation detail for CI/manual environments, not
the normal CLI workflow.

```bash
neurcode login
neurcode login --org <workspace-id>
neurcode logout
neurcode whoami
```

Use `neurcode whoami` after login/init to inspect:

- authenticated user
- active workspace
- repo ownership context
- runtime/session state
- governance ownership boundary

### `neurcode init`

Advanced/compatibility repository-binding surface. `neurcode setup` invokes the
canonical repository stage. Direct `init` binds the current repository to a
personal or organization workspace, creates the repo ownership context in
`.neurcode/config.json`, and determines the governance boundary used by later
commands.

```bash
neurcode init
neurcode init --org <workspace-id>
neurcode init --org <workspace-id> --create "checkout-service"
neurcode init --org <workspace-id> --project-id <project-id>
```

The interactive flow asks which workspace owns this repository, then whether to link an existing project or create a new project ownership record.

## Advanced Commands

Supported but not required for the core workflow:

- `allow`, `apply`, `approve`
- `ask`, `audit`, `bootstrap`, `brain`
- `check`, `compat`, `config`, `contract`
- `doctor`, `feedback`, `guard`
- `map`
- `plan`, `plan-slo`, `prompt`
- `refactor`, `remediate`, `repo`, `revert`
- `security`, `session`, `ship`, `ship-runs`, `ship-resume`, `ship-attestation-verify`
- `simulate`, `watch`, `workspace`

For detailed flags, run:

```bash
neurcode --help
neurcode <command> --help
```

For legacy workflow context, see [Advanced / Legacy](./advanced-legacy.md).
