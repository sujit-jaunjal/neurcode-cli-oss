# Neurcode CLI Commands

This reference now follows one canonical runtime lifecycle:

`connect repo -> activate agent -> govern session -> approve exact path -> export evidence`

The lifecycle separates five identities that must not blur together:

- authenticated user
- active workspace
- repo ownership context
- runtime/session state
- governance ownership boundary

## Core Runtime Workflow

```bash
npm install -g @neurcode-ai/cli@latest
neurcode login
neurcode init
neurcode activate claude --connect <token>
neurcode doctor --runtime
neurcode status --json
neurcode report --runtime
```

Primary loop:

`login -> init -> activate -> governed session -> exact approval -> evidence export`

Neurcode governs in-flow where the host exposes hooks, records source-free runtime evidence, and keeps CI/verify/remediation commands as compatibility/backstop surfaces.

See also: `neurcode agent guard start <agent>` for supervised non-Claude workflows, `neurcode admission export` for GitHub Action admission records, and `neurcode verify --ci` for compatibility CI checks.

## Runtime Command Reference

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
neurcode agent guard start codex --goal "Add retry with backoff to export task"
neurcode agent guard status --json
```

### `neurcode status`

Inspect active session scope, latest boundary event, approval grants, and sync health.

```bash
neurcode status
neurcode status --json
```

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
neurcode verify --staged                   # verify only staged changes
neurcode verify --base main                # verify against a specific base ref
neurcode verify --record                   # report results to Neurcode Cloud
neurcode verify --ci --json --evidence     # emit deterministic verification evidence artifact
neurcode verify --evidence-dir .neurcode/evidence
neurcode verify --compiled-policy neurcode.policy.compiled.json
```

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

### `neurcode daemon`

Start a local HTTP bridge on `http://localhost:4321` so the dashboard can run `verify`, `fix`, `patch`, and rollback actions without leaving the browser.

```bash
neurcode daemon
```

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

Connect or disconnect this machine/runtime. Login opens browser approval and stores the underlying credential in the local keyring. API keys are implementation detail for CI/manual environments, not the normal CLI workflow.

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

Bind the current repository to a personal or organization workspace. This creates the repo ownership context in `.neurcode/config.json` and determines the governance boundary used by later commands.

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
